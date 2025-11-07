from __future__ import annotations

import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import List, Optional

from src.inventory.schemas.warehouse_map import MapArea, MapAreaCreate, WarehouseMap, WarehouseMapCreate, WarehouseMapUpdate
from src.inventory.services.warehouse_map_repository import (
    WarehouseMapRepository,
    extract_storage_key,
    generate_area_id,
    get_warehouse_map_repository,
)
from src.shared.storage.r2_client import CloudflareR2Client, get_r2_client


class WarehouseMapService:
    def __init__(self, repository: WarehouseMapRepository, storage_client: CloudflareR2Client | None = None) -> None:
        self._repository = repository
        self._storage = storage_client or get_r2_client()

    def list_maps(self) -> List[WarehouseMap]:
        return self._repository.list_maps()

    def get_map(self, map_id: str) -> WarehouseMap:
        warehouse_map = self._repository.get_map(map_id)
        if warehouse_map is None:
            raise ValueError("ไม่พบผังคลังสินค้าที่ต้องการ")
        return warehouse_map

    def create_map(self, payload: WarehouseMapCreate) -> WarehouseMap:
        now = datetime.now(timezone.utc)
        warehouse_map = WarehouseMap(
            id=_generate_map_id(),
            name=payload.name,
            image_url=payload.image_url,
            image_width=payload.image_width,
            image_height=payload.image_height,
            areas=_build_areas(payload.areas, payload.image_width, payload.image_height),
            created_at=now,
            updated_at=now,
        )
        return self._repository.create_map(warehouse_map)

    def update_map(self, map_id: str, payload: WarehouseMapUpdate) -> WarehouseMap:
        existing = self.get_map(map_id)

        updated = existing.model_copy()
        if payload.name is not None:
            updated.name = payload.name
        if payload.image_url is not None:
            updated.image_url = payload.image_url
        if payload.image_width is not None:
            updated.image_width = payload.image_width
        if payload.image_height is not None:
            updated.image_height = payload.image_height
        if payload.areas is not None:
            updated.areas = _build_areas(payload.areas, updated.image_width, updated.image_height)

        updated.updated_at = datetime.now(timezone.utc)

        old_key = extract_storage_key(existing.image_url)
        new_key = extract_storage_key(payload.image_url) if payload.image_url is not None else old_key

        result = self._repository.update_map(updated)
        if payload.image_url is not None and old_key and new_key and old_key != new_key:
            self._delete_object(old_key)
        return result

    def delete_map(self, map_id: str) -> None:
        existing = self.get_map(map_id)
        self._repository.delete_map(map_id)
        self._delete_object(extract_storage_key(existing.image_url))

    def _delete_object(self, key: Optional[str]) -> None:
        if not key:
            return
        try:
            self._storage.delete_object(key)
        except Exception:
            # Ignore deletion failures to avoid blocking map updates
            pass


def _build_areas(
    definitions: Optional[List[MapAreaCreate]] = None,
    image_width: Optional[int] = None,
    image_height: Optional[int] = None,
) -> List[MapArea]:
    if not definitions:
        return []
    areas: List[MapArea] = []
    for definition in definitions:
        area_id = definition.id or generate_area_id()
        normalized_points = _ensure_normalized_points(
            definition.points,
            image_width=image_width,
            image_height=image_height,
        )
        areas.append(
            MapArea(
                id=area_id,
                label=definition.label,
                location_id=definition.location_id,
                zone=definition.zone,
                allowed_item_ids=definition.allowed_item_ids or [],
                points=normalized_points,
            )
        )
    return areas


def _ensure_normalized_points(points: List[float], *, image_width: Optional[int], image_height: Optional[int]) -> List[float]:
    if not points:
        return []
    if image_width is None or image_width <= 0 or image_height is None or image_height <= 0:
        return [_clamp01(value) for value in points]

    any_over_one = any(value > 1 for value in points)
    normalized: List[float] = []
    for index in range(0, len(points), 2):
        x = points[index]
        y = points[index + 1]
        if any_over_one:
            x = x / image_width
            y = y / image_height
        normalized.append(_clamp01(x))
        normalized.append(_clamp01(y))
    return normalized


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, round(value, 6)))


def _generate_map_id() -> str:
    return uuid.uuid4().hex


@lru_cache
def get_warehouse_map_service() -> WarehouseMapService:
    return WarehouseMapService(repository=get_warehouse_map_repository())
