"\"\"\"สคีมาและ payload สำหรับธุรกรรมสต็อกผ่านการสแกน QR.\"\"\""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class MovementType(str, Enum):
    PUT_AWAY = "put_away"
    PICK = "pick"
    ADJUSTMENT = "adjustment"


class MovementReason(str, Enum):
    CYCLE_COUNT = "cycle_count"
    DAMAGE = "damage"
    TRANSFER = "transfer"
    REQUEST_FULFILLMENT = "request_fulfillment"
    RECEIVING = "receiving"


class QRTransactionPayload(BaseModel):
    transaction_type: MovementType = Field(..., alias="type")
    location_token: str = Field(..., description="โทเคนที่ได้จากการสแกน QR location")
    item_id: str = Field(..., description="รหัสสินค้า")
    quantity: int = Field(..., gt=0, description="จำนวนที่ต้องการปรับ")
    request_id: Optional[str] = Field(default=None, description="คำร้องที่เกี่ยวข้องถ้ามี")
    request_line_id: Optional[str] = Field(default=None, description="ไลน์คำร้องที่เกี่ยวข้อง")
    reason: Optional[MovementReason] = Field(default=MovementReason.REQUEST_FULFILLMENT)
    note: Optional[str] = Field(default=None, max_length=280)

    @field_validator("quantity")
    def validate_quantity(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("quantity ต้องมากกว่า 0")
        return value


class MovementRecord(BaseModel):
    id: str
    transaction_type: MovementType
    location_id: str
    item_id: str
    quantity: int
    reason: Optional[MovementReason] = None
    note: Optional[str] = None
    request_id: Optional[str] = None
    request_line_id: Optional[str] = None
    processed_at: datetime
    processed_by: str


class MovementResponse(BaseModel):
    balance_on_hand: int = Field(..., description="จำนวนคงเหลือหลังธุรกรรม")
    allocated: int = Field(..., description="จำนวนที่ถูกจองหลังธุรกรรม")
    record: MovementRecord
