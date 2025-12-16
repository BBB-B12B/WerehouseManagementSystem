from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class Category(BaseModel):
    """ข้อมูลหมวดหมู่วัสดุสำหรับแคตตาล็อก."""

    id: str = Field(..., description="รหัสหมวดหมู่ (Firestore document id)")
    name: str = Field(..., min_length=1, description="ชื่อหมวดหมู่")
    parent_id: Optional[str] = Field(
        default=None, description="รหัสหมวดหมู่แม่ หากเป็นระดับรอง"
    )
    display_order: int = Field(default=0, description="ลำดับการแสดงผลใน UI")
    thumbnail_url: Optional[HttpUrl] = Field(default=None, description="รูปภาพตัวอย่าง")
    active: bool = Field(default=True, description="สถานะเปิดใช้งาน")


class Item(BaseModel):
    """ข้อมูล SKU ที่ให้ผู้ใช้เลือกในหน้าคลังวัสดุ."""

    id: str = Field(..., description="รหัสเอกสารหรือ SKU")
    sku: str = Field(..., description="รหัส SKU ภายใน")
    name: str = Field(..., description="ชื่อวัสดุ/อุปกรณ์")
    description: Optional[str] = Field(default=None, description="รายละเอียดเพิ่มเติม")
    category_id: str = Field(..., description="รหัสหมวดหมู่ที่สินค้าอยู่")
    unit: str = Field(..., description="หน่วยนับหลัก เช่น ชิ้น, กล่อง, ม้วน")
    stock_on_hand: int = Field(..., ge=0, description="จำนวนคงเหลือพร้อมจ่าย")
    stock_reserved: int = Field(default=0, ge=0, description="จำนวนที่ถูกจองไว้")
    image_url: Optional[HttpUrl] = Field(default=None, description="ลิงก์รูปภาพจาก Cloudflare R2")
    tags: list[str] = Field(default_factory=list, description="แท็กสำหรับค้นหา")
    location_hint: Optional[str] = Field(
        default=None, description="ข้อความแนะนำตำแหน่ง (optional สำหรับ requester)"
    )
    package_width_cm: Optional[float] = Field(
        default=None, ge=0, description="ความกว้างบรรจุภัณฑ์ (เซนติเมตร)"
    )
    package_depth_cm: Optional[float] = Field(
        default=None, ge=0, description="ความลึก/ยาวบรรจุภัณฑ์ (เซนติเมตร)"
    )
    package_height_cm: Optional[float] = Field(
        default=None, ge=0, description="ความสูงบรรจุภัณฑ์ (เซนติเมตร)"
    )
    package_volume_cm3: Optional[float] = Field(
        default=None, ge=0, description="ปริมาตรต่อหน่วย (ลูกบาศก์เซนติเมตร)"
    )

    @field_validator("stock_reserved")
    @classmethod
    def validate_reserved(cls, value: int, info):  # type: ignore[override]
        if "stock_on_hand" in info.data and value > info.data["stock_on_hand"]:
            raise ValueError("stock_reserved ต้องไม่มากกว่า stock_on_hand")
        return value


class ItemCreate(BaseModel):
    """ข้อมูลที่ใช้สร้างสินค้าใหม่เข้าระบบ."""

    sku: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: str = Field(..., min_length=1)
    unit: str = Field(..., min_length=1)
    stock_on_hand: int = Field(default=0, ge=0)
    stock_reserved: int = Field(default=0, ge=0)
    tags: list[str] = Field(default_factory=list)
    image_url: Optional[HttpUrl] = Field(default=None)
    location_hint: Optional[str] = Field(default=None, max_length=120)
    active: bool = Field(default=True)
    package_width_cm: Optional[float] = Field(default=None, ge=0)
    package_depth_cm: Optional[float] = Field(default=None, ge=0)
    package_height_cm: Optional[float] = Field(default=None, ge=0)
    package_volume_cm3: Optional[float] = Field(default=None, ge=0)

    @field_validator("stock_reserved")
    @classmethod
    def validate_reserved(cls, value: int, info):  # type: ignore[override]
        if value < 0:
            raise ValueError("stock_reserved ต้องไม่เป็นค่าติดลบ")
        if value > info.data.get("stock_on_hand", value):
            raise ValueError("stock_reserved ต้องไม่เกิน stock_on_hand")
        return value


class ItemUpdate(BaseModel):
    """ข้อมูลที่ใช้แก้ไขสินค้า."""

    sku: Optional[str] = Field(default=None, min_length=1)
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[str] = Field(default=None, min_length=1)
    unit: Optional[str] = Field(default=None, min_length=1)
    stock_on_hand: Optional[int] = Field(default=None, ge=0)
    stock_reserved: Optional[int] = Field(default=None, ge=0)
    tags: Optional[list[str]] = None
    image_url: Optional[HttpUrl] = None
    location_hint: Optional[str] = Field(default=None, max_length=120)
    active: Optional[bool] = None
    package_width_cm: Optional[float] = Field(default=None, ge=0)
    package_depth_cm: Optional[float] = Field(default=None, ge=0)
    package_height_cm: Optional[float] = Field(default=None, ge=0)
    package_volume_cm3: Optional[float] = Field(default=None, ge=0)

    @field_validator("stock_reserved")
    @classmethod
    def validate_reserved(cls, value: Optional[int], info):  # type: ignore[override]
        if value is None:
            return value
        stock_on_hand = info.data.get("stock_on_hand")
        if stock_on_hand is not None and value > stock_on_hand:
            raise ValueError("stock_reserved ต้องไม่เกิน stock_on_hand")
        return value


class CatalogSummary(BaseModel):
    """ใช้สรุปจำนวนหมวดหมู่และรายการในหน้าแรก."""

    total_categories: int = Field(..., ge=0)
    total_items: int = Field(..., ge=0)
    top_categories: list[Category] = Field(default_factory=list)
