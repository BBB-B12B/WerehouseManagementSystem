"""สคีมาสำหรับข้อมูลคลังสินค้าและคิวหยิบ."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class LocationType(str, Enum):
    PICK_FACE = "pick_face"
    RESERVE = "reserve"
    STAGING = "staging"


class InventoryLocation(BaseModel):
    id: str = Field(..., description="รหัสตำแหน่งจัดเก็บ")
    zone: str = Field(..., description="โซนหลักในคลัง")
    aisle: str = Field(..., description="เลขแถว")
    rack: str = Field(..., description="เลขชั้น/ชั้นวาง")
    bin_code: str = Field(..., description="รหัสช่องย่อย")
    type: LocationType = Field(default=LocationType.PICK_FACE)
    capacity: int = Field(default=0, ge=0, description="ความจุสูงสุด")
    qr_token: str = Field(..., description="โค้ดใช้สร้าง QR")
    comment: Optional[str] = Field(default=None, description="หมายเหตุเพิ่มเติม")


class InventoryBalance(BaseModel):
    item_id: str = Field(...)
    location_id: str = Field(...)
    lot_number: Optional[str] = Field(default=None)
    serial: Optional[str] = Field(default=None)
    on_hand: int = Field(..., ge=0)
    allocated: int = Field(default=0, ge=0)


class PickingQueueLine(BaseModel):
    request_id: str
    request_line_id: str
    item_id: str
    item_name: str
    sku: str
    quantity_needed: int
    quantity_allocated: int
    required_date: str
    location: InventoryLocation
    note: Optional[str] = None


class PickingQueueResponse(BaseModel):
    jobs: list[PickingQueueLine]
    total_jobs: int
