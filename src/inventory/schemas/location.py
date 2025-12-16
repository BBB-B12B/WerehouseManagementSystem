"""สคีมาสำหรับข้อมูลคลังสินค้าและคิวหยิบ."""

from __future__ import annotations

from enum import Enum
from typing import Optional
from datetime import datetime

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


class StorageLocationBase(BaseModel):
    name: str = Field(..., max_length=120)
    building: Optional[str] = Field(default=None, max_length=120)
    zone: str = Field(..., max_length=20)
    aisle: Optional[str] = Field(default=None, max_length=20)
    rack: str = Field(..., max_length=20)
    level: str = Field(..., max_length=20)
    bin: Optional[str] = Field(default=None, max_length=20)
    code: str = Field(..., max_length=40, description="รหัสตำแหน่งสั้นๆ")
    capacity: int = Field(default=0, ge=0, description="ความจุรวม (ชิ้น)")
    note: Optional[str] = Field(default=None, max_length=500)
    width_cm: Optional[int] = Field(default=None, ge=0)
    depth_cm: Optional[int] = Field(default=None, ge=0)
    height_cm: Optional[int] = Field(default=None, ge=0)
    allowed_item_ids: list[str] = Field(
        default_factory=list,
        description="รายการ SKU/Item ID ที่อนุญาตให้เก็บในตำแหน่งนี้",
    )


class StorageLocationCreate(StorageLocationBase):
    pass


class StorageLocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    building: Optional[str] = Field(default=None, max_length=120)
    zone: Optional[str] = Field(default=None, max_length=20)
    aisle: Optional[str] = Field(default=None, max_length=20)
    rack: Optional[str] = Field(default=None, max_length=20)
    level: Optional[str] = Field(default=None, max_length=20)
    bin: Optional[str] = Field(default=None, max_length=20)
    code: Optional[str] = Field(default=None, max_length=40)
    capacity: Optional[int] = Field(default=None, ge=0)
    note: Optional[str] = Field(default=None, max_length=500)
    width_cm: Optional[int] = Field(default=None, ge=0)
    depth_cm: Optional[int] = Field(default=None, ge=0)
    height_cm: Optional[int] = Field(default=None, ge=0)
    allowed_item_ids: Optional[list[str]] = Field(
        default=None,
        description="รายการ SKU/Item ID ที่อนุญาต (ตั้งค่าใหม่เมื่อส่งค่า)",
    )


class StorageLocation(StorageLocationBase):
    id: str
    created_at: datetime
    updated_at: datetime
    used_volume_cm3: float = Field(default=0, ge=0, description="ปริมาตรที่ถูกใช้งาน (ลูกบาศก์เซนติเมตร)")
