from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, PositiveInt

from src.inventory.schemas.workflow import WorkflowJobStatus


class PutawayLineAssignment(BaseModel):
    receiving_line_id: str = Field(..., description="line_id จากใบงาน Receiving")
    quantity: PositiveInt = Field(..., description="จำนวนที่ต้องการจัดเก็บ")
    preferred_location_id: Optional[str] = Field(default=None, description="Location ที่ต้องการ")
    preferred_location_label: Optional[str] = Field(default=None, description="ชื่อ Location สำหรับแสดงผล")
    note: Optional[str] = Field(default=None, description="หมายเหตุสำหรับไลน์นี้")


class PutawayJobCreatePayload(BaseModel):
    parent_receiving_job_id: str = Field(..., min_length=1, description="ID ของใบงานรับสินค้าที่อ้างอิง")
    line_assignments: List[PutawayLineAssignment] = Field(
        ..., min_length=1, description="รายการไลน์ที่ต้องการสร้าง Putaway Job"
    )
    assignee: Optional[str] = Field(default=None, description="ผู้รับผิดชอบ")


class PutawayMovementPayload(BaseModel):
    receiving_line_id: str = Field(..., description="line_id ที่ทำการจัดเก็บ")
    location_id: str = Field(..., description="Location ที่จัดเก็บจริง")
    location_label: Optional[str] = Field(default=None, description="ชื่อ Location สำหรับแสดงผล")
    quantity: PositiveInt = Field(..., description="จำนวนที่จัดเก็บ")
    unit: str = Field(..., description="หน่วย")
    note: Optional[str] = Field(default=None, description="หมายเหตุสำหรับบันทึกนี้")


class PutawayJobUpdatePayload(BaseModel):
    status: Optional[WorkflowJobStatus] = Field(default=None, description="สถานะใหม่ของ Putaway Job")
    assignee: Optional[str] = Field(default=None, description="ผู้รับผิดชอบใหม่")
    movements: List[PutawayMovementPayload] = Field(
        default_factory=list, description="บันทึก movement ที่ต้องการเพิ่ม"
    )
