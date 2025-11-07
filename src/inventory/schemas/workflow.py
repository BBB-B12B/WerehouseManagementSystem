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
            WorkflowStep.PUTAWAY: "SD",
            WorkflowStep.AUDIT: "SA",
        }[self]


CountStatus = Literal["pending", "matched", "mismatch"]


class WorkflowLineBase(BaseModel):
    item_id: str = Field(..., description="รหัสสินค้า")
    sku: str = Field(..., description="SKU")
    name: str = Field(..., description="ชื่อสินค้า")
    unit: str = Field(..., description="หน่วย")
    quantity_expected: PositiveInt = Field(..., description="จำนวนตามใบส่งของ")


class WorkflowLineCreate(WorkflowLineBase):
    """ข้อมูลสำหรับสร้างรายการในใบงานใหม่"""


class WorkflowLineUpdate(WorkflowLineBase):
    line_id: str = Field(..., description="รหัสรายการย่อย")
    count_status: CountStatus = Field(default="pending", description="สถานะการตรวจนับ")
    counted_quantity: Optional[NonNegativeInt] = Field(default=None, description="จำนวนที่ตรวจนับได้จริง")


class WorkflowLine(WorkflowLineBase):
    line_id: str
    count_status: CountStatus = "pending"
    counted_quantity: Optional[NonNegativeInt] = None


class WorkflowJobBase(BaseModel):
    lines: List[WorkflowLineCreate] = Field(..., min_length=1, description="รายการสินค้าในใบงาน")


class WorkflowJobCreate(WorkflowJobBase):
    """ข้อมูลสำหรับสร้างใบงานใหม่"""


class WorkflowJobUpdate(BaseModel):
    lines: List[WorkflowLineUpdate] = Field(..., min_length=1, description="รายการสินค้าอัปเดต")


class WorkflowJob(BaseModel):
    id: str
    display_code: str
    created_at: datetime
    updated_at: datetime
    lines: List[WorkflowLine]
