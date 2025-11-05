from __future__ import annotations

import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Dict, Optional

from src.logistics.schemas.work_order import (
    WorkOrder,
    WorkOrderCreate,
    WorkOrderStatus,
    WorkOrderTask,
    WorkOrderTaskStatus,
)
from src.requests.schemas.request import RequestStatus
from src.requests.services.repository import RequestRepository, get_request_repository


class WorkOrderPlanner:
    """รวมคำร้องเป็นใบงานและจัดการสถานะการขนส่ง."""

    def __init__(self, repository: RequestRepository) -> None:
        self._repository = repository
        self._work_orders: Dict[str, WorkOrder] = {}

    def list_work_orders(self) -> list[WorkOrder]:
        return list(self._work_orders.values())

    def get_work_order(self, work_order_id: str) -> Optional[WorkOrder]:
        return self._work_orders.get(work_order_id)

    def create_work_order(self, payload: WorkOrderCreate) -> WorkOrder:
        now = datetime.now(timezone.utc)
        order_id = uuid.uuid4().hex

        tasks = self._build_tasks(include_request_ids=payload.include_request_ids)

        work_order = WorkOrder(
            id=order_id,
            route=payload.route,
            vehicle=payload.vehicle,
            driver=payload.driver,
            scheduled_date=payload.scheduled_date,
            departure_time=payload.departure_time,
            status=WorkOrderStatus.PLANNED,
            tasks=tasks,
            created_at=now,
            updated_at=now,
        )
        self._work_orders[order_id] = work_order
        return work_order

    def update_status(self, work_order_id: str, status: WorkOrderStatus) -> WorkOrder:
        work_order = self._ensure_work_order(work_order_id)
        if not self._is_valid_transition(work_order.status, status):
            raise ValueError(f"ไม่สามารถเปลี่ยนสถานะจาก {work_order.status} ไป {status} ได้")
        work_order.status = status
        work_order.updated_at = datetime.now(timezone.utc)
        return work_order

    def update_task_status(
        self, work_order_id: str, task_id: str, status: WorkOrderTaskStatus, quantity_loaded: int | None = None
    ) -> WorkOrderTask:
        work_order = self._ensure_work_order(work_order_id)
        task = next((t for t in work_order.tasks if t.id == task_id), None)
        if not task:
            raise ValueError("ไม่พบงานย่อยในใบงาน")
        task.status = status
        if quantity_loaded is not None:
            if quantity_loaded > task.quantity_planned:
                raise ValueError("จำนวนโหลดต้องไม่เกินที่วางแผน")
            task.quantity_loaded = quantity_loaded
        work_order.updated_at = datetime.now(timezone.utc)
        return task

    def _build_tasks(self, include_request_ids: Optional[list[str]] = None) -> list[WorkOrderTask]:
        candidate_status = [RequestStatus.APPROVED, RequestStatus.PICKING]
        requests = self._repository.list_requests_by_status(candidate_status)
        tasks: list[WorkOrderTask] = []
        included = set(include_request_ids or [])
        for request in requests:
            if included and request.id not in included:
                continue
            for line in request.items:
                planned_qty = line.quantity_approved or line.quantity_requested
                tasks.append(
                    WorkOrderTask(
                        id=uuid.uuid4().hex,
                        request_id=request.id,
                        request_line_id=line.id,
                        item_id=line.item_id,
                        item_name=self._resolve_item_name(line.item_id),
                        quantity_planned=planned_qty,
                    )
                )
        return tasks

    def _resolve_item_name(self, item_id: str) -> str:
        items = self._repository.list_items()
        for item in items:
            if item.id == item_id:
                return item.name
        return item_id

    def _ensure_work_order(self, work_order_id: str) -> WorkOrder:
        work_order = self._work_orders.get(work_order_id)
        if not work_order:
            raise ValueError("ไม่พบใบงาน")
        return work_order

    def _is_valid_transition(self, current: WorkOrderStatus, target: WorkOrderStatus) -> bool:
        allowed = {
            WorkOrderStatus.PLANNED: {WorkOrderStatus.LOADING, WorkOrderStatus.CANCELLED},
            WorkOrderStatus.LOADING: {WorkOrderStatus.IN_TRANSIT, WorkOrderStatus.CANCELLED},
            WorkOrderStatus.IN_TRANSIT: {WorkOrderStatus.COMPLETED},
            WorkOrderStatus.COMPLETED: set(),
            WorkOrderStatus.CANCELLED: set(),
        }
        return target in allowed[current]


@lru_cache
def get_work_order_planner() -> WorkOrderPlanner:
    return WorkOrderPlanner(repository=get_request_repository())
