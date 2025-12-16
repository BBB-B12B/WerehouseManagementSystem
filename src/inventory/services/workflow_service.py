from __future__ import annotations

import uuid
from datetime import datetime, timezone
import logging
from functools import lru_cache
from typing import Dict, Iterable, List, Optional

from src.inventory.schemas.putaway import PutawayJobCreatePayload, PutawayJobUpdatePayload
from src.inventory.schemas.workflow import (
    WorkflowJob,
    WorkflowJobCreate,
    WorkflowJobUpdate,
    WorkflowLine,
    WorkflowLineCreate,
    WorkflowLineUpdate,
    WorkflowMovement,
    WorkflowStep,
)
from src.inventory.services.storage_location_repository import (
    FirestoreStorageLocationRepository,
    get_storage_location_repository,
)
from src.inventory.services.workflow_repository import WorkflowRepositoryProtocol, get_workflow_repository

logger = logging.getLogger(__name__)


class WorkflowJobNotFoundError(RuntimeError):
    """Raised when a referenced workflow job is missing."""


class WorkflowValidationError(ValueError):
    """Raised when payload violates workflow constraints."""


class WorkflowService:
    def __init__(
        self,
        repository: WorkflowRepositoryProtocol,
        location_repository: Optional[FirestoreStorageLocationRepository] = None,
    ) -> None:
        self._repository = repository
        self._location_repository = location_repository or get_storage_location_repository()

    def list_jobs(self, step: WorkflowStep) -> List[WorkflowJob]:
        return self._repository.list_jobs(step)

    def create_job(self, step: WorkflowStep, payload: WorkflowJobCreate) -> WorkflowJob:
        return self._repository.create_job(step, payload)

    def update_job(self, step: WorkflowStep, job_id: str, payload: WorkflowJobUpdate) -> WorkflowJob:
        if step == WorkflowStep.RECEIVING and payload.lines is not None:
            current_job = self._repository.get_job(step, job_id)
            if not current_job:
                raise WorkflowJobNotFoundError("ไม่พบใบงานรับสินค้า")
            if self._has_receiving_progress(current_job) and self._is_structural_receiving_edit(
                current_job,
                payload.lines,
            ):
                raise WorkflowValidationError("ไม่สามารถแก้ไขรายการในใบงานที่เริ่มตรวจนับหรือจัดเก็บแล้ว")
        return self._repository.update_job(step, job_id, payload)

    def delete_job(self, step: WorkflowStep, job_id: str) -> None:
        if step == WorkflowStep.RECEIVING:
            job = self._repository.get_job(step, job_id)
            if not job:
                raise WorkflowJobNotFoundError("ไม่พบใบงานรับสินค้า")
            if self._has_receiving_progress(job):
                raise WorkflowValidationError("ไม่สามารถยกเลิกใบงานที่เริ่มตรวจนับหรือจัดเก็บแล้ว")
        self._repository.delete_job(step, job_id)

    def create_putaway_job(self, payload: PutawayJobCreatePayload) -> WorkflowJob:
        receiving_job = self._repository.get_job(WorkflowStep.RECEIVING, payload.parent_receiving_job_id)
        if not receiving_job:
            raise WorkflowJobNotFoundError("ไม่พบใบงานรับสินค้าที่อ้างอิง")

        line_lookup = {line.line_id: line for line in receiving_job.lines}
        workflow_lines: List[WorkflowLineCreate] = []
        quantity_overrides: Dict[str, int] = {}

        for assignment in payload.line_assignments:
            source_line = line_lookup.get(assignment.receiving_line_id)
            if not source_line:
                raise WorkflowValidationError(f"ไม่พบรายการ {assignment.receiving_line_id}")

            max_quantity = source_line.counted_quantity or source_line.quantity_expected
            if assignment.quantity > max_quantity:
                raise WorkflowValidationError("จำนวนที่ต้องการจัดเก็บเกินกว่าที่ตรวจนับไว้")

            workflow_lines.append(
                WorkflowLineCreate(
                    item_id=source_line.item_id,
                    sku=source_line.sku,
                    name=source_line.name,
                    unit=source_line.unit,
                    quantity_expected=assignment.quantity,
                    preferred_location_id=assignment.preferred_location_id or source_line.preferred_location_id,
                    preferred_location_label=assignment.preferred_location_label
                    or source_line.preferred_location_label,
                    putaway_quantity=assignment.quantity,
                    source_line_id=source_line.line_id,
                )
            )
            quantity_overrides[assignment.receiving_line_id] = assignment.quantity

        job_payload = WorkflowJobCreate(
            lines=workflow_lines,
            parent_receiving_job_id=payload.parent_receiving_job_id,
            receiving_line_ids=list(quantity_overrides.keys()),
            status="open",
            assignee=payload.assignee,
        )
        job = self._repository.create_job(WorkflowStep.PUTAWAY, job_payload)

        overrides = self._build_receiving_overrides(receiving_job, job.id, {})
        for line in receiving_job.lines:
            if line.line_id not in job.receiving_line_ids:
                continue
            entry = overrides.setdefault(line.line_id, {})
            entry["putaway_job_ids"] = self._append_unique(line.putaway_job_ids, job.id)
        self._apply_receiving_line_overrides(receiving_job, overrides)
        return job

    def update_putaway_job(self, job_id: str, payload: PutawayJobUpdatePayload) -> WorkflowJob:
        job = self._repository.get_job(WorkflowStep.PUTAWAY, job_id)
        if not job:
            raise WorkflowJobNotFoundError("ไม่พบใบงานจัดเก็บที่ต้องการอัปเดต")

        receiving_job: WorkflowJob | None = None
        if job.parent_receiving_job_id:
            receiving_job = self._repository.get_job(WorkflowStep.RECEIVING, job.parent_receiving_job_id)

        new_movements = self._build_movements(job, payload)
        merged_movements = [*job.movements, *new_movements]
        movement_totals = self._aggregate_movement_totals(merged_movements)
        status = payload.status or job.status
        assignee = job.assignee if payload.assignee is None else payload.assignee

        updated_job = self._repository.update_job(
            WorkflowStep.PUTAWAY,
            job_id,
            WorkflowJobUpdate(
                movements=merged_movements,
                status=status,
                assignee=assignee,
            ),
        )

        if receiving_job:
            overrides = self._build_receiving_overrides(receiving_job, job_id, movement_totals)
            if status == "cancelled":
                for line in receiving_job.lines:
                    if line.line_id not in job.receiving_line_ids:
                        continue
                    remaining_ids = [jid for jid in line.putaway_job_ids if jid != job_id]
                    entry = overrides.setdefault(line.line_id, {})
                    entry["putaway_job_ids"] = remaining_ids
                    entry["putaway_status"] = "pending" if not remaining_ids else "scheduled"
            self._apply_receiving_line_overrides(receiving_job, overrides)
        if new_movements:
            self._apply_location_usage_adjustments(new_movements, sign=1)
        return updated_job

    def remove_putaway_movement(self, job_id: str, movement_id: str) -> WorkflowJob:
        job = self._repository.get_job(WorkflowStep.PUTAWAY, job_id)
        if not job:
            raise WorkflowJobNotFoundError("ไม่พบใบงานจัดเก็บที่ต้องการยกเลิก")
        target = next((movement for movement in job.movements if movement.movement_id == movement_id), None)
        if not target:
            raise WorkflowValidationError("ไม่พบการบันทึกการจัดเก็บที่ต้องการยกเลิก")

        remaining_movements = [movement for movement in job.movements if movement.movement_id != movement_id]
        movement_totals = self._aggregate_movement_totals(remaining_movements)
        status = self._determine_job_status_from_totals(job, movement_totals, remaining_movements)

        updated_job = self._repository.update_job(
            WorkflowStep.PUTAWAY,
            job_id,
            WorkflowJobUpdate(
                movements=remaining_movements,
                status=status,
            ),
        )

        if job.parent_receiving_job_id:
            receiving_job = self._repository.get_job(WorkflowStep.RECEIVING, job.parent_receiving_job_id)
            if receiving_job:
                overrides = self._build_receiving_overrides(receiving_job, job_id, movement_totals)
                self._apply_receiving_line_overrides(receiving_job, overrides)
        volume_to_revert = target.volume_cm3
        if volume_to_revert is None:
            source_line = next(
                (
                    line
                    for line in job.lines
                    if line.line_id == target.receiving_line_id
                    or line.source_line_id == target.receiving_line_id
                ),
                None,
            )
            volume_to_revert = self._calculate_movement_volume(source_line, target.quantity)
        if volume_to_revert:
            self._adjust_location_usage(target.location_id, -volume_to_revert)
        return updated_job

    def _build_movements(
        self,
        job: WorkflowJob,
        payload: PutawayJobUpdatePayload,
    ) -> List[WorkflowMovement]:
        if not payload.movements:
            return []

        now = datetime.now(timezone.utc)
        movements: List[WorkflowMovement] = []
        for movement in payload.movements:
            if movement.receiving_line_id not in job.receiving_line_ids:
                raise WorkflowValidationError("รายการ movement ไม่ตรงกับ Putaway Job")
            source_line = next(
                (
                    line
                    for line in job.lines
                    if line.line_id == movement.receiving_line_id
                    or (
                        line.source_line_id is not None
                        and line.source_line_id == movement.receiving_line_id
                    )
                ),
                None,
            )
            movements.append(
                WorkflowMovement(
                    movement_id=uuid.uuid4().hex,
                    receiving_line_id=movement.receiving_line_id,
                    location_id=movement.location_id,
                    location_label=movement.location_label,
                    quantity=movement.quantity,
                    unit=movement.unit,
                    note=movement.note,
                    recorded_at=now,
                    item_name=source_line.name if source_line else None,
                    sku=source_line.sku if source_line else None,
                    volume_cm3=self._calculate_movement_volume(source_line, movement.quantity),
                )
            )
        return movements

    def _apply_receiving_line_overrides(
        self,
        receiving_job: WorkflowJob,
        overrides: Dict[str, Dict[str, object]],
    ) -> None:
        if not overrides:
            return
        updated_lines: List[WorkflowLineUpdate] = []
        changed = False
        for line in receiving_job.lines:
            line_override = overrides.get(line.line_id)
            if not line_override:
                updated_lines.append(self._line_to_update(line))
                continue
            changed = True
            updated_lines.append(
                self._line_to_update(
                    line,
                    putaway_job_ids=line_override.get("putaway_job_ids", line.putaway_job_ids),
                    putaway_status=line_override.get("putaway_status", line.putaway_status),
                    putaway_quantity=line_override.get("putaway_quantity", line.putaway_quantity),
                    source_line_id=line.source_line_id,
                )
            )
        if changed:
            self._repository.update_job(
                WorkflowStep.RECEIVING,
                receiving_job.id,
                WorkflowJobUpdate(lines=updated_lines),
            )

    def _line_to_update(self, line: WorkflowLine, **overrides: object) -> WorkflowLineUpdate:
        putaway_status = overrides.get("putaway_status", line.putaway_status)
        if isinstance(putaway_status, str) and putaway_status not in {"pending", "scheduled", "in_progress", "stored"}:
            putaway_status = line.putaway_status

        return WorkflowLineUpdate(
            line_id=line.line_id,
            item_id=line.item_id,
            sku=line.sku,
            name=line.name,
            unit=line.unit,
            quantity_expected=line.quantity_expected,
            count_status=line.count_status,
            counted_quantity=line.counted_quantity,
            preferred_location_id=line.preferred_location_id,
            preferred_location_label=line.preferred_location_label,
            putaway_quantity=overrides.get("putaway_quantity", line.putaway_quantity),
            putaway_status=putaway_status or line.putaway_status,
            putaway_job_ids=overrides.get("putaway_job_ids", line.putaway_job_ids),
            source_line_id=line.source_line_id,
        )

    def _append_unique(self, values: List[str], new_value: str) -> List[str]:
        if new_value in values:
            return list(values)
        return [*values, new_value]

    def _aggregate_movement_totals(self, movements: List[WorkflowMovement]) -> Dict[str, int]:
        totals: Dict[str, int] = {}
        for movement in movements:
            totals[movement.receiving_line_id] = totals.get(movement.receiving_line_id, 0) + movement.quantity
        return totals

    def _has_receiving_progress(self, job: WorkflowJob) -> bool:
        for line in job.lines:
            counted_quantity = line.counted_quantity or 0
            if line.count_status != "pending":
                return True
            if counted_quantity > 0:
                return True
            if line.putaway_job_ids:
                return True
            if line.putaway_status and line.putaway_status != "pending":
                return True
        return False

    def _is_structural_receiving_edit(
        self,
        job: WorkflowJob,
        updates: List[WorkflowLineUpdate],
    ) -> bool:
        if not updates:
            return False
        existing_ids = {line.line_id for line in job.lines}
        update_ids = {line.line_id for line in updates}
        if existing_ids != update_ids:
            return True
        line_lookup = {line.line_id: line for line in job.lines}
        for update in updates:
            current = line_lookup.get(update.line_id)
            if not current:
                return True
            if (
                current.item_id != update.item_id
                or current.sku != update.sku
                or current.name != update.name
                or current.unit != update.unit
                or current.quantity_expected != update.quantity_expected
            ):
                return True
        return False

    def _determine_job_status_from_totals(
        self,
        job: WorkflowJob,
        totals: Dict[str, int],
        movements: List[WorkflowMovement],
    ) -> WorkflowJobStatus:
        if not movements:
            return "open"
        if self._are_totals_satisfied(job, totals):
            return "completed"
        return "in_progress"

    def _are_totals_satisfied(self, job: WorkflowJob, totals: Dict[str, int]) -> bool:
        for line in job.lines:
            source_id = line.source_line_id or line.line_id
            if totals.get(source_id, 0) < line.quantity_expected:
                return False
        return True

    def _build_receiving_overrides(
        self,
        receiving_job: WorkflowJob,
        job_id: str,
        totals: Dict[str, int],
    ) -> Dict[str, Dict[str, object]]:
        overrides: Dict[str, Dict[str, object]] = {}
        for line in receiving_job.lines:
            total = totals.get(line.line_id, 0)
            overrides[line.line_id] = {
                "putaway_quantity": total,
                "putaway_status": self._determine_line_status(line, job_id, total),
            }
        return overrides

    def _determine_line_status(self, line: WorkflowLine, job_id: str, total: int) -> PutawayStatus:
        if total >= line.quantity_expected and line.quantity_expected > 0:
            return "stored"
        if total > 0:
            return "in_progress"
        if job_id in line.putaway_job_ids:
            return "scheduled"
        return "pending"

    def _calculate_movement_volume(self, line: Optional[WorkflowLine], quantity: int) -> Optional[float]:
        if not line or not line.package_volume_cm3:
            return None
        if quantity <= 0:
            return None
        return round(float(line.package_volume_cm3) * quantity, 2)

    def _apply_location_usage_adjustments(
        self,
        movements: Iterable[WorkflowMovement],
        *,
        sign: int,
    ) -> None:
        for movement in movements:
            if not movement.location_id:
                continue
            volume = movement.volume_cm3
            if volume is None or volume <= 0:
                continue
            delta = volume if sign > 0 else -volume
            self._adjust_location_usage(movement.location_id, delta)

    def _adjust_location_usage(self, location_id: str, delta: float) -> None:
        if not location_id or not delta:
            return
        try:
            self._location_repository.adjust_used_volume(location_id, delta)
        except Exception:
            logger.warning("ปรับยอดปริมาตร location %s ไม่สำเร็จ", location_id, exc_info=True)


@lru_cache
def get_workflow_service() -> WorkflowService:
    return WorkflowService(
        repository=get_workflow_repository(),
        location_repository=get_storage_location_repository(),
    )
