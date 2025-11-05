from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, NonNegativeInt, PositiveInt, model_validator


class RequestStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    PICKING = "picking"
    LOADED = "loaded"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


from pydantic import HttpUrl


class Attachment(BaseModel):
    """ไฟล์แนบอ้างอิงไปยัง Cloudflare R2."""

    key: str = Field(..., description="คีย์ไฟล์ใน R2")
    file_name: str = Field(..., description="ชื่อไฟล์ที่ผู้ใช้เห็น")
    mime_type: str = Field(..., description="ชนิด MIME")
    size_bytes: NonNegativeInt = Field(default=0, description="ขนาดไฟล์ (ไบต์)")
    public_url: Optional[HttpUrl] = Field(default=None, description="ลิงก์เข้าถึงไฟล์แบบอ่านอย่างเดียว")


class RequestLineCreate(BaseModel):
    item_id: str = Field(..., description="รหัสสินค้า")
    quantity: PositiveInt = Field(..., description="จำนวนที่ต้องการ")
    note: Optional[str] = Field(default=None, max_length=280, description="หมายเหตุเพิ่มเติม")


class RequestCreate(BaseModel):
    requester_id: str = Field(..., description="รหัสผู้ร้องขอ")
    requester_name: str = Field(..., description="ชื่อผู้ร้องขอ")
    department: str = Field(..., description="หน่วยงาน/โครงการที่ต้องการใช้")
    required_date: date = Field(..., description="วันที่ต้องการรับของ")
    items: list[RequestLineCreate] = Field(..., min_length=1, description="รายการสินค้าในคำร้อง")
    note: Optional[str] = Field(default=None, max_length=500, description="หมายเหตุรวม")
    attachments: list[Attachment] = Field(default_factory=list, description="ไฟล์แนบ")

    @model_validator(mode="after")
    def validate_required_date(self) -> "RequestCreate":
        today = date.today()
        if self.required_date < today:
            raise ValueError("required_date ต้องไม่น้อยกว่าวันปัจจุบัน")
        return self


class RequestLine(BaseModel):
    id: str = Field(..., description="รหัสรายการย่อย (Firestore doc id)")
    item_id: str = Field(..., description="รหัสสินค้า")
    quantity_requested: PositiveInt = Field(..., description="จำนวนที่ร้องขอ")
    quantity_approved: NonNegativeInt = Field(default=0, description="จำนวนที่อนุมัติ")
    quantity_picked: NonNegativeInt = Field(default=0, description="จำนวนที่หยิบจริง")
    note: Optional[str] = Field(default=None)


class Request(BaseModel):
    id: str = Field(..., description="รหัสคำร้อง (Document ID)")
    requester_id: str
    requester_name: str
    department: str
    required_date: date
    status: RequestStatus
    items: list[RequestLine]
    attachments: list[Attachment] = Field(default_factory=list)
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RequestSummary(BaseModel):
    id: str
    requester_name: str
    department: str
    required_date: date
    status: RequestStatus
    total_items: int
