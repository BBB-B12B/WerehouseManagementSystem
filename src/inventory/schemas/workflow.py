from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional, Literal

from pydantic import BaseModel, Field, NonNegativeInt, PositiveInt


class WorkflowStep(str, Enum):
    RECEIVING = "receiving"
    COUNTING = "counting"
    PUTAWAY = "putaway"
    AUDIT = "audit"

    @property
    def prefix(self) -> str:
        return {
            WorkflowStep.RECEIVING: "RD",
            WorkflowStep.COUNTING: "CD",
            WorkflowStep.PUTAWAY: "PW",
            WorkflowStep.AUDIT: "SA",
        }[self]


CountStatus = Literal["pending", "matched", "mismatch"]
PutawayStatus = Literal["pending", "scheduled", "in_progress", "stored"]
WorkflowJobStatus = Literal["open", "in_progress", "completed", "cancelled"]


class WorkflowLineBase(BaseModel):
    item_id: str = Field(..., description="รหัสสินค้า")
    sku: str = Field(..., description="SKU")
    name: str = Field(..., description="ชื่อสินค้า")
    unit: str = Field(..., description="หน่วย")
    quantity_expected: PositiveInt = Field(..., description="จำนวนตามใบส่งของ")
    preferred_location_id: Optional[str] = Field(
        default=None, description="Location ที่ต้องการนำไปจัดเก็บ (ข้อมูลอ้างอิง)"
    )
    preferred_location_label: Optional[str] = Field(
        default=None, description="ชื่อ Location สำหรับแสดงผล"
    )
    putaway_quantity: Optional[NonNegativeInt] = Field(
        default=None, description="จำนวนที่วางแผนสำหรับการจัดเก็บ"
    )
    source_line_id: Optional[str] = Field(
        default=None, description="รหัส line ต้นทาง (สำหรับ Putaway เพื่ออ้างอิง RD line_id)"
    )
    package_volume_cm3: Optional[float] = Field(
        default=None,
        ge=0,
        description="ปริมาตรต่อหน่วย (ลูกบาศก์เซนติเมตร)",
    )


class WorkflowLineCreate(WorkflowLineBase):
    """ข้อมูลสำหรับสร้างรายการในใบงานใหม่"""


class WorkflowLineUpdate(WorkflowLineBase):
    line_id: str = Field(..., description="รหัสรายการย่อย")
    count_status: CountStatus = Field(default="pending", description="สถานะการตรวจนับ")
    counted_quantity: Optional[NonNegativeInt] = Field(default=None, description="จำนวนที่ตรวจนับได้จริง")
    putaway_status: PutawayStatus = Field(default="pending", description="สถานะการจัดเก็บ")
    putaway_job_ids: List[str] = Field(default_factory=list, description="รายการ Putaway Job ID ที่เกี่ยวข้อง")


class WorkflowLine(WorkflowLineBase):
    line_id: str
    count_status: CountStatus = "pending"
    counted_quantity: Optional[NonNegativeInt] = None
    putaway_status: PutawayStatus = "pending"
    putaway_job_ids: List[str] = Field(default_factory=list)


class WorkflowMovementBase(BaseModel):
    receiving_line_id: str = Field(..., description="รหัสไลน์จาก Receiving/Counting")
    location_id: str = Field(..., description="รหัส Location ที่จัดเก็บ")
    location_label: Optional[str] = Field(default=None, description="ชื่อ Location ที่แสดงผล")
    quantity: PositiveInt = Field(..., description="จำนวนที่จัดเก็บ")
    unit: str = Field(..., description="หน่วย")
    note: Optional[str] = Field(default=None, description="หมายเหตุเพิ่มเติม")
    item_name: Optional[str] = Field(default=None, description="ชื่อสินค้า ณ ตอนจัดเก็บ")
    sku: Optional[str] = Field(default=None, description="รหัส SKU ณ ตอนจัดเก็บ")
    evidence_urls: List[str] = Field(default_factory=list, description="รูปหลักฐานการจัดเก็บ")
    location_mismatch: bool = Field(default=False, description="จัดเก็บต่าง Location ที่กำหนดไว้หรือไม่")
    quantity_mismatch: bool = Field(default=False, description="จำนวนที่จัดเก็บไม่ตรงใบงานหรือไม่")
    volume_cm3: Optional[float] = Field(
        default=None,
        ge=0,
        description="ปริมาตรที่จัดเก็บ (ลูกบาศก์เซนติเมตร)",
    )


class WorkflowMovementCreate(WorkflowMovementBase):
    """ข้อมูล movement ที่ client ส่งขึ้นมา"""


class WorkflowMovement(WorkflowMovementBase):
    movement_id: str
    recorded_at: datetime


class WorkflowJobBase(BaseModel):
    lines: List[WorkflowLineCreate] = Field(..., min_length=1, description="รายการสินค้าในใบงาน")
    parent_receiving_job_id: Optional[str] = Field(
        default=None, description="ใบงานต้นทาง (RD) สำหรับ Putaway"
    )
    receiving_line_ids: List[str] = Field(
        default_factory=list,
        description="รายการ line_id ที่เกี่ยวข้องกับงานนี้ (ใช้กับ Putaway)",
    )
    status: WorkflowJobStatus = Field(default="open", description="สถานะของใบงาน")
    assignee: Optional[str] = Field(default=None, description="ผู้รับผิดชอบ")
    movements: List[WorkflowMovementCreate] = Field(
        default_factory=list, description="ข้อมูลการเคลื่อนย้าย (Putaway)"
    )


class WorkflowJobCreate(WorkflowJobBase):
    """ข้อมูลสำหรับสร้างใบงานใหม่"""


class WorkflowJobUpdate(BaseModel):
    lines: Optional[List[WorkflowLineUpdate]] = Field(
        default=None, description="รายการสินค้าอัปเดต (เว้นว่างหากไม่แก้ไข)"
    )
    status: Optional[WorkflowJobStatus] = Field(default=None, description="อัปเดตสถานะใบงาน")
    assignee: Optional[str] = Field(default=None, description="ผู้รับผิดชอบใหม่")
    receiving_line_ids: Optional[List[str]] = Field(
        default=None, description="ชุด line_id ใหม่ (สำหรับ Putaway เท่านั้น)"
    )
    parent_receiving_job_id: Optional[str] = Field(
        default=None, description="เปลี่ยนใบงานต้นทาง (สำหรับ Putaway เท่านั้น)"
    )
    movements: Optional[List[WorkflowMovement]] = Field(
        default=None,
        description="แทนที่/กำหนดข้อมูล movement ทั้งหมด (Putaway)",
    )


class WorkflowJob(BaseModel):
    id: str
    display_code: str
    created_at: datetime
    updated_at: datetime
    lines: List[WorkflowLine]
    parent_receiving_job_id: Optional[str] = None
    receiving_line_ids: List[str] = Field(default_factory=list)
    status: WorkflowJobStatus = "open"
    assignee: Optional[str] = None
    movements: List[WorkflowMovement] = Field(default_factory=list)
