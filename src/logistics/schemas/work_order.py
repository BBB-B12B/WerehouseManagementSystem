"\"\"\"สคีมาสำหรับใบงานจัดส่งและรายการหยิบขึ้นรถ.\"\"\""

from __future__ import annotations

from datetime import datetime, date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class WorkOrderStatus(str, Enum):
    PLANNED = "planned"
    LOADING = "loading"
    IN_TRANSIT = "in_transit"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkOrderTaskStatus(str, Enum):
    PENDING = "pending"
    LOADED = "loaded"
    DELIVERED = "delivered"


class WorkOrderTask(BaseModel):
    id: str
    request_id: str
    request_line_id: str
    item_id: str
    item_name: str
    quantity_planned: int
    quantity_loaded: int = 0
    status: WorkOrderTaskStatus = WorkOrderTaskStatus.PENDING


class WorkOrder(BaseModel):
    id: str
    route: str
    vehicle: str
    driver: str
    scheduled_date: date
    departure_time: str
    status: WorkOrderStatus
    tasks: list[WorkOrderTask] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WorkOrderCreate(BaseModel):
    route: str = Field(..., min_length=1)
    vehicle: str = Field(..., min_length=1)
    driver: str = Field(..., min_length=1)
    scheduled_date: date
    departure_time: str = Field(..., min_length=1)
    include_request_ids: Optional[list[str]] = None
