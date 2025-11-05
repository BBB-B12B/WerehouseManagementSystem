from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, status

from src.logistics.schemas.work_order import (
    WorkOrder,
    WorkOrderCreate,
    WorkOrderStatus,
    WorkOrderTask,
    WorkOrderTaskStatus,
)
from src.logistics.services.work_order_planner import WorkOrderPlanner, get_work_order_planner
from src.shared.auth import UserContext, require_roles


router = APIRouter(prefix="/logistics/work-orders", tags=["logistics"])


@router.get("", response_model=list[WorkOrder])
async def list_work_orders(
    _: UserContext = Depends(require_roles("logistics_lead", "admin")),
    planner: WorkOrderPlanner = Depends(get_work_order_planner),
) -> list[WorkOrder]:
    return planner.list_work_orders()


@router.get(
    "/{work_order_id}",
    response_model=WorkOrder,
)
async def get_work_order(
    work_order_id: str = Path(..., min_length=1),
    _: UserContext = Depends(require_roles("logistics_lead", "admin", "store_clerk")),
    planner: WorkOrderPlanner = Depends(get_work_order_planner),
) -> WorkOrder:
    work_order = planner.get_work_order(work_order_id)
    if not work_order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบใบงาน")
    return work_order


@router.post("", response_model=WorkOrder, status_code=status.HTTP_201_CREATED)
async def create_work_order(
    payload: WorkOrderCreate,
    _: UserContext = Depends(require_roles("logistics_lead", "admin")),
    planner: WorkOrderPlanner = Depends(get_work_order_planner),
) -> WorkOrder:
    return planner.create_work_order(payload)


@router.patch("/{work_order_id}/status", response_model=WorkOrder)
async def update_work_order_status(
    payload: dict[str, WorkOrderStatus],
    work_order_id: str = Path(..., min_length=1),
    _: UserContext = Depends(require_roles("logistics_lead", "admin")),
    planner: WorkOrderPlanner = Depends(get_work_order_planner),
) -> WorkOrder:
    status_value = payload.get("status")
    if status_value is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ต้องระบุ status")
    try:
        return planner.update_status(work_order_id, status_value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{work_order_id}/tasks/{task_id}", response_model=WorkOrderTask)
async def update_task_status(
    payload: dict[str, str],
    work_order_id: str = Path(..., min_length=1),
    task_id: str = Path(..., min_length=1),
    _: UserContext = Depends(require_roles("logistics_lead", "admin", "store_clerk")),
    planner: WorkOrderPlanner = Depends(get_work_order_planner),
) -> WorkOrderTask:
    status_raw = payload.get("status")
    quantity_loaded = payload.get("quantity_loaded")
    if not status_raw:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ต้องระบุ status")
    try:
        status_enum = WorkOrderTaskStatus(status_raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="สถานะไม่ถูกต้อง") from exc
    try:
        return planner.update_task_status(
            work_order_id,
            task_id,
            status_enum,
            quantity_loaded=int(quantity_loaded) if quantity_loaded is not None else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
