from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Protocol

from google.api_core import exceptions as google_exceptions
from google.cloud import firestore

from src.inventory.schemas.workflow import (
    CountStatus,
    WorkflowJob,
    WorkflowJobCreate,
    WorkflowJobUpdate,
    WorkflowLine,
    WorkflowLineCreate,
    WorkflowLineUpdate,
    WorkflowStep,
    WorkflowMovement,
    WorkflowMovementCreate,
)
from src.shared.config import get_settings
from src.shared.firebase.client import get_firestore_client


@dataclass
class WorkflowSettingsAdapter:
    collection: str
    document: str


class WorkflowRepositoryError(RuntimeError):
    """ข้อผิดพลาดระดับ repository สำหรับงาน workflow."""


class WorkflowBackendUnavailableError(WorkflowRepositoryError):
    """เกิดขึ้นเมื่อ Firestore ไม่พร้อมใช้งาน (เช่น DNS ล้มเหลว)."""


class WorkflowRepositoryProtocol(Protocol):
    def list_jobs(self, step: WorkflowStep) -> List[WorkflowJob]:
        ...

    def get_job(self, step: WorkflowStep, job_id: str) -> Optional[WorkflowJob]:
        ...

    def create_job(self, step: WorkflowStep, payload: WorkflowJobCreate) -> WorkflowJob:
        ...

    def update_job(self, step: WorkflowStep, job_id: str, payload: WorkflowJobUpdate) -> WorkflowJob:
        ...

    def delete_job(self, step: WorkflowStep, job_id: str) -> None:
        ...


class WorkflowRepository:
    def __init__(
        self,
        client: Optional[firestore.Client] = None,
        settings: Optional[WorkflowSettingsAdapter] = None,
    ) -> None:
        self._client = client or get_firestore_client()
        config = settings or WorkflowSettingsAdapter(
            collection=get_settings().workflow.root_collection,
            document=get_settings().workflow.root_document,
        )
        self._root_doc = self._client.collection(config.collection).document(config.document)

    def list_jobs(self, step: WorkflowStep) -> List[WorkflowJob]:
        try:
            docs = (
                self._root_doc.collection(step.value)
                .order_by("created_at", direction=firestore.Query.DESCENDING)
                .stream()
            )
            return [self._document_to_job(doc) for doc in docs]
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise WorkflowBackendUnavailableError("firestore_unavailable") from exc

    def get_job(self, step: WorkflowStep, job_id: str) -> Optional[WorkflowJob]:
        try:
            snapshot = self._root_doc.collection(step.value).document(job_id).get()
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise WorkflowBackendUnavailableError("firestore_unavailable") from exc
        if not snapshot.exists:
            return None
        return self._document_to_job(snapshot)

    def create_job(self, step: WorkflowStep, payload: WorkflowJobCreate) -> WorkflowJob:
        now = datetime.now(timezone.utc)
        job_id = uuid.uuid4().hex
        try:
            display_code = self._generate_display_code(step, now)
            lines = [self._build_line_from_create(line) for line in payload.lines]
            movements = [self._build_movement_from_create(movement) for movement in payload.movements]

            data = {
                "display_code": display_code,
                "created_at": now,
                "updated_at": now,
                "lines": [self._line_to_dict(line) for line in lines],
                "parent_receiving_job_id": payload.parent_receiving_job_id,
                "receiving_line_ids": payload.receiving_line_ids,
                "status": payload.status,
                "assignee": payload.assignee,
                "movements": [self._movement_to_dict(movement) for movement in movements],
            }

            doc_ref = self._root_doc.collection(step.value).document(job_id)
            doc_ref.set(data)
            return WorkflowJob(
                id=job_id,
                display_code=display_code,
                created_at=now,
                updated_at=now,
                lines=lines,
                parent_receiving_job_id=payload.parent_receiving_job_id,
                receiving_line_ids=payload.receiving_line_ids,
                status=payload.status,
                assignee=payload.assignee,
                movements=movements,
            )
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise WorkflowBackendUnavailableError("firestore_unavailable") from exc
        except ValueError as exc:
            if "The transaction has no transaction ID" in str(exc):
                raise WorkflowBackendUnavailableError("firestore_unavailable") from exc
            raise

    def update_job(self, step: WorkflowStep, job_id: str, payload: WorkflowJobUpdate) -> WorkflowJob:
        try:
            doc_ref = self._root_doc.collection(step.value).document(job_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                raise ValueError("ไม่พบใบงานที่ต้องการอัปเดต")

            existing = self._document_to_job(snapshot)
            now = datetime.now(timezone.utc)

            updated_lines = (
                [self._build_line_from_update(line) for line in payload.lines]
                if payload.lines is not None
                else existing.lines
            )
            updated_movements = payload.movements if payload.movements is not None else existing.movements
            updated_status = payload.status if payload.status is not None else existing.status
            updated_assignee = payload.assignee if payload.assignee is not None else existing.assignee
            receiving_line_ids = (
                payload.receiving_line_ids if payload.receiving_line_ids is not None else existing.receiving_line_ids
            )
            parent_receiving_job_id = (
                payload.parent_receiving_job_id
                if payload.parent_receiving_job_id is not None
                else existing.parent_receiving_job_id
            )

            doc_ref.set(
                {
                    "display_code": existing.display_code,
                    "created_at": existing.created_at,
                    "updated_at": now,
                    "lines": [self._line_to_dict(line) for line in updated_lines],
                    "parent_receiving_job_id": parent_receiving_job_id,
                    "receiving_line_ids": receiving_line_ids,
                    "status": updated_status,
                    "assignee": updated_assignee,
                    "movements": [self._movement_to_dict(movement) for movement in updated_movements],
                }
            )

            return WorkflowJob(
                id=existing.id,
                display_code=existing.display_code,
                created_at=existing.created_at,
                updated_at=now,
                lines=updated_lines,
                parent_receiving_job_id=parent_receiving_job_id,
                receiving_line_ids=receiving_line_ids,
                status=updated_status,
                assignee=updated_assignee,
                movements=updated_movements,
            )
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise WorkflowBackendUnavailableError("firestore_unavailable") from exc
        except ValueError as exc:
            if "The transaction has no transaction ID" in str(exc):
                raise WorkflowBackendUnavailableError("firestore_unavailable") from exc
            raise

    def delete_job(self, step: WorkflowStep, job_id: str) -> None:
        try:
            doc_ref = self._root_doc.collection(step.value).document(job_id)
            doc_ref.delete()
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise WorkflowBackendUnavailableError("firestore_unavailable") from exc

    def _build_line_from_create(self, line: WorkflowLineCreate) -> WorkflowLine:
        return WorkflowLine(
            line_id=line.source_line_id or uuid.uuid4().hex,
            item_id=line.item_id,
            sku=line.sku,
            name=line.name,
            unit=line.unit,
            quantity_expected=line.quantity_expected,
            count_status="pending",
            counted_quantity=None,
            preferred_location_id=line.preferred_location_id,
            preferred_location_label=line.preferred_location_label,
            putaway_quantity=line.putaway_quantity,
            putaway_status="pending",
            putaway_job_ids=[],
            source_line_id=line.source_line_id,
            package_volume_cm3=line.package_volume_cm3,
        )

    def _build_line_from_update(self, line: WorkflowLineUpdate) -> WorkflowLine:
        return WorkflowLine(
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
            putaway_quantity=line.putaway_quantity,
            putaway_status=line.putaway_status,
            putaway_job_ids=line.putaway_job_ids,
            source_line_id=line.source_line_id,
            package_volume_cm3=line.package_volume_cm3,
        )

    def _line_to_dict(self, line: WorkflowLine) -> Dict[str, object]:
        data: Dict[str, object] = {
            "line_id": line.line_id,
            "item_id": line.item_id,
            "sku": line.sku,
            "name": line.name,
            "unit": line.unit,
            "quantity_expected": line.quantity_expected,
            "count_status": line.count_status,
            "preferred_location_id": line.preferred_location_id,
            "preferred_location_label": line.preferred_location_label,
            "putaway_quantity": line.putaway_quantity,
            "putaway_status": line.putaway_status,
            "putaway_job_ids": list(line.putaway_job_ids),
            "source_line_id": line.source_line_id,
        }
        if line.counted_quantity is not None:
            data["counted_quantity"] = line.counted_quantity
        else:
            data["counted_quantity"] = None
        if line.package_volume_cm3 is not None:
            data["package_volume_cm3"] = line.package_volume_cm3
        else:
            data["package_volume_cm3"] = None
        return data

    def _document_to_job(self, snapshot: firestore.DocumentSnapshot) -> WorkflowJob:
        data = snapshot.to_dict() or {}
        lines_data = data.get("lines", [])
        lines = [
            WorkflowLine(
                line_id=str(entry.get("line_id", entry.get("source_line_id") or uuid.uuid4().hex)),
                item_id=str(entry.get("item_id", "")),
                sku=str(entry.get("sku", "")),
                name=str(entry.get("name", "")),
                unit=str(entry.get("unit", "")),
                quantity_expected=int(entry.get("quantity_expected", 0)),
                count_status=self._parse_status(entry.get("count_status")),
                counted_quantity=self._parse_optional_int(entry.get("counted_quantity")),
                preferred_location_id=entry.get("preferred_location_id"),
                preferred_location_label=entry.get("preferred_location_label"),
                putaway_quantity=self._parse_optional_int(entry.get("putaway_quantity")),
                putaway_status=self._parse_putaway_status(entry.get("putaway_status")),
                putaway_job_ids=list(entry.get("putaway_job_ids", [])),
                source_line_id=entry.get("source_line_id"),
                package_volume_cm3=self._parse_optional_float(entry.get("package_volume_cm3")),
            )
            for entry in lines_data
        ]
        created_at_raw = data.get("created_at")
        updated_at_raw = data.get("updated_at")
        created_at = self._normalize_datetime(created_at_raw)
        updated_at = self._normalize_datetime(updated_at_raw)
        return WorkflowJob(
            id=snapshot.id,
            display_code=str(data.get("display_code", snapshot.id)),
            created_at=created_at,
            updated_at=updated_at,
            lines=lines,
            parent_receiving_job_id=data.get("parent_receiving_job_id"),
            receiving_line_ids=list(data.get("receiving_line_ids", [])),
            status=str(data.get("status", "open")),
            assignee=data.get("assignee"),
            movements=[self._dict_to_movement(entry) for entry in data.get("movements", [])],
        )

    def _normalize_datetime(self, value: object) -> datetime:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        return datetime.now(timezone.utc)

    def _parse_status(self, value: object) -> CountStatus:
        if isinstance(value, str) and value in {"pending", "matched", "mismatch"}:
            return value  # type: ignore
        return "pending"

    def _parse_putaway_status(self, value: object) -> str:
        if isinstance(value, str) and value in {"pending", "scheduled", "in_progress", "stored"}:
            return value
        return "pending"

    def _parse_optional_int(self, value: object) -> Optional[int]:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _parse_optional_float(self, value: object) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _build_movement_from_create(self, movement: WorkflowMovementCreate) -> WorkflowMovement:
        return WorkflowMovement(
            movement_id=uuid.uuid4().hex,
            receiving_line_id=movement.receiving_line_id,
            location_id=movement.location_id,
            location_label=movement.location_label,
            quantity=movement.quantity,
            unit=movement.unit,
            note=movement.note,
            recorded_at=datetime.now(timezone.utc),
            evidence_urls=list(movement.evidence_urls),
            location_mismatch=movement.location_mismatch,
            quantity_mismatch=movement.quantity_mismatch,
            item_name=movement.item_name,
            sku=movement.sku,
            volume_cm3=movement.volume_cm3,
        )

    def _movement_to_dict(self, movement: WorkflowMovement) -> Dict[str, object]:
        return {
            "movement_id": movement.movement_id,
            "receiving_line_id": movement.receiving_line_id,
            "location_id": movement.location_id,
            "location_label": movement.location_label,
            "quantity": movement.quantity,
            "unit": movement.unit,
            "note": movement.note,
            "recorded_at": movement.recorded_at,
            "evidence_urls": movement.evidence_urls,
            "location_mismatch": movement.location_mismatch,
            "quantity_mismatch": movement.quantity_mismatch,
            "item_name": movement.item_name,
            "sku": movement.sku,
            "volume_cm3": movement.volume_cm3,
        }

    def _dict_to_movement(self, entry: Dict[str, object]) -> WorkflowMovement:
        recorded_at = entry.get("recorded_at")
        if isinstance(recorded_at, datetime):
            recorded_at_value = recorded_at if recorded_at.tzinfo else recorded_at.replace(tzinfo=timezone.utc)
        else:
            recorded_at_value = datetime.now(timezone.utc)
        return WorkflowMovement(
            movement_id=str(entry.get("movement_id", uuid.uuid4().hex)),
            receiving_line_id=str(entry.get("receiving_line_id", "")),
            location_id=str(entry.get("location_id", "")),
            location_label=entry.get("location_label"),
            quantity=int(entry.get("quantity", 0)),
            unit=str(entry.get("unit", "")),
            note=entry.get("note"),
            recorded_at=recorded_at_value,
            evidence_urls=list(entry.get("evidence_urls", [])),
            location_mismatch=bool(entry.get("location_mismatch", False)),
            quantity_mismatch=bool(entry.get("quantity_mismatch", False)),
            item_name=entry.get("item_name"),
            sku=entry.get("sku"),
            volume_cm3=self._parse_optional_float(entry.get("volume_cm3")),
        )

    def _generate_display_code(self, step: WorkflowStep, now: datetime) -> str:
        month = f"{now.month:02d}"
        year = f"{now.year % 100:02d}"
        period = f"{month}{year}"
        transaction = self._client.transaction()

        @firestore.transactional
        def _txn(tx: firestore.Transaction) -> int:
            snapshot = self._root_doc.get(transaction=tx)
            data = snapshot.to_dict() or {}
            counters = data.get("counters", {})
            step_counters: Dict[str, int] = counters.get(step.value, {}) or {}
            next_number = int(step_counters.get(period, 0)) + 1
            step_counters[period] = next_number
            counters[step.value] = step_counters
            tx.set(self._root_doc, {"counters": counters}, merge=True)
            return next_number

        try:
            sequence = _txn(transaction)
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise WorkflowBackendUnavailableError("firestore_unavailable") from exc
        return f"{step.prefix}-{period}-{sequence:03d}"


class InMemoryWorkflowRepository:
    """Repository สำหรับสภาพแวดล้อม local หรือ fallback เมื่อต่อ Firestore ไม่ได้."""

    def __init__(self) -> None:
        self._jobs: Dict[WorkflowStep, Dict[str, WorkflowJob]] = {step: {} for step in WorkflowStep}
        self._counters: Dict[WorkflowStep, Dict[str, int]] = {step: {} for step in WorkflowStep}

    def list_jobs(self, step: WorkflowStep) -> List[WorkflowJob]:
        jobs = list(self._jobs[step].values())
        return sorted(jobs, key=lambda job: job.created_at, reverse=True)

    def get_job(self, step: WorkflowStep, job_id: str) -> Optional[WorkflowJob]:
        return self._jobs[step].get(job_id)

    def create_job(self, step: WorkflowStep, payload: WorkflowJobCreate) -> WorkflowJob:
        now = datetime.now(timezone.utc)
        job_id = uuid.uuid4().hex
        display_code = self._generate_display_code(step, now)
        lines = [self._build_line_from_create(line) for line in payload.lines]
        job = WorkflowJob(id=job_id, display_code=display_code, created_at=now, updated_at=now, lines=lines)
        self._jobs[step][job_id] = job
        return job

    def update_job(self, step: WorkflowStep, job_id: str, payload: WorkflowJobUpdate) -> WorkflowJob:
        existing = self._jobs[step].get(job_id)
        if not existing:
            raise ValueError("ไม่พบใบงานที่ต้องการอัปเดต")
        now = datetime.now(timezone.utc)
        updated_lines = [self._build_line_from_update(line) for line in payload.lines]
        job = WorkflowJob(
            id=existing.id,
            display_code=existing.display_code,
            created_at=existing.created_at,
            updated_at=now,
            lines=updated_lines,
        )
        self._jobs[step][job_id] = job
        return job

    def delete_job(self, step: WorkflowStep, job_id: str) -> None:
        self._jobs[step].pop(job_id, None)

    def _build_line_from_create(self, line: WorkflowLineCreate) -> WorkflowLine:
        return WorkflowLine(
            line_id=uuid.uuid4().hex,
            item_id=line.item_id,
            sku=line.sku,
            name=line.name,
            unit=line.unit,
            quantity_expected=line.quantity_expected,
            count_status="pending",
            counted_quantity=None,
        )

    def _build_line_from_update(self, line: WorkflowLineUpdate) -> WorkflowLine:
        return WorkflowLine(
            line_id=line.line_id,
            item_id=line.item_id,
            sku=line.sku,
            name=line.name,
            unit=line.unit,
            quantity_expected=line.quantity_expected,
            count_status=line.count_status,
            counted_quantity=line.counted_quantity,
        )

    def _generate_display_code(self, step: WorkflowStep, now: datetime) -> str:
        month = f"{now.month:02d}"
        year = f"{now.year % 100:02d}"
        period = f"{month}{year}"
        step_counters = self._counters[step]
        next_number = step_counters.get(period, 0) + 1
        step_counters[period] = next_number
        return f"{step.prefix}-{period}-{next_number:03d}"


_DEFAULT_REPOSITORY: Optional[WorkflowRepositoryProtocol] = None
_LOGGER = logging.getLogger(__name__)


def get_workflow_repository() -> WorkflowRepositoryProtocol:
    """เลือก repository ให้เหมาะกับ environment และรองรับ fallback."""

    global _DEFAULT_REPOSITORY
    if _DEFAULT_REPOSITORY is not None:
        return _DEFAULT_REPOSITORY

    settings = get_settings()
    prefer_in_memory = settings.workflow.prefer_in_memory and settings.environment == "local"

    if prefer_in_memory:
        _DEFAULT_REPOSITORY = InMemoryWorkflowRepository()
        return _DEFAULT_REPOSITORY

    try:
        _DEFAULT_REPOSITORY = WorkflowRepository()
    except Exception as exc:  # pragma: no cover - เน้น fallback runtime
        _LOGGER.warning(
            "เชื่อมต่อ Firestore สำหรับ workflow ไม่สำเร็จ (%s) – ใช้คลังข้อมูลในหน่วยความจำแทนชั่วคราว",
            exc,
        )
        _DEFAULT_REPOSITORY = InMemoryWorkflowRepository()
    return _DEFAULT_REPOSITORY
