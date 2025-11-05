from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class MapAreaBase(BaseModel):
    label: Optional[str] = Field(default=None, max_length=120)
    location_id: Optional[str] = Field(default=None, max_length=120)
    zone: Optional[str] = Field(default=None, max_length=12)
    allowed_item_ids: List[str] = Field(
        default_factory=list, description="รายการรหัสสินค้าที่อนุญาตให้เก็บใน Location"
    )
    points: List[float] = Field(
        ..., min_length=6, description="ชุดพิกัด normalized x,y (0-1) ต่อเนื่อง"
    )

    @field_validator("allowed_item_ids", mode="before")
    @classmethod
    def _validate_allowed_item_ids(cls, value: Optional[List[str]]) -> List[str]:
        if not value:
            return []
        seen: set[str] = set()
        unique: List[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        return unique

    @field_validator("points")
    @classmethod
    def _validate_points(cls, points: List[float]) -> List[float]:
        if len(points) % 2 != 0:
            raise ValueError("points ต้องเป็นจำนวนคู่ (x,y)")
        return points


class MapAreaCreate(MapAreaBase):
    id: Optional[str] = Field(default=None, description="หากไม่ระบุระบบจะสร้างให้")


class MapArea(MapAreaBase):
    id: str


class WarehouseMapBase(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    image_url: Optional[str] = Field(default=None, description="ลิงก์หรือข้อมูลรูปผังคลัง")
    image_width: int = Field(..., gt=0)
    image_height: int = Field(..., gt=0)


class WarehouseMapCreate(WarehouseMapBase):
    areas: List[MapAreaCreate] = Field(default_factory=list)


class WarehouseMapUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    image_url: Optional[str] = Field(default=None)
    image_width: Optional[int] = Field(default=None, gt=0)
    image_height: Optional[int] = Field(default=None, gt=0)
    areas: Optional[List[MapAreaCreate]] = None


class WarehouseMap(WarehouseMapBase):
    id: str
    areas: List[MapArea] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
