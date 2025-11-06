from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Protocol
from urllib.parse import urlparse

from google.cloud import firestore

from src.inventory.schemas.warehouse_map import MapArea, WarehouseMap
from src.shared.config import get_settings
from src.shared.firebase.client import get_firestore_client
from src.shared.storage.r2_client import CloudflareR2Client, get_r2_client


class WarehouseMapRepository(Protocol):
    def list_maps(self) -> List[WarehouseMap]:
        ...

    def get_map(self, map_id: str) -> Optional[WarehouseMap]:
        ...

    def create_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        ...

    def update_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        ...

    def delete_map(self, map_id: str) -> None:
        ...


class InMemoryWarehouseMapRepository(WarehouseMapRepository):
    def __init__(self) -> None:
        self._storage: Dict[str, WarehouseMap] = {}

    def list_maps(self) -> List[WarehouseMap]:
        return [
            _with_signed_image_url(item.model_copy(deep=True))
            for item in sorted(self._storage.values(), key=lambda record: record.created_at)
        ]

    def get_map(self, map_id: str) -> Optional[WarehouseMap]:
        value = self._storage.get(map_id)
        return _with_signed_image_url(value.model_copy(deep=True)) if value else None

    def create_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        stored = warehouse_map.model_copy(deep=True)
        stored.image_url = _prepare_storage_value(stored.image_url)
        self._storage[warehouse_map.id] = stored
        return _with_signed_image_url(stored.model_copy(deep=True))

    def update_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        if warehouse_map.id not in self._storage:
            raise KeyError("Map not found")
        stored = warehouse_map.model_copy(deep=True)
        stored.image_url = _prepare_storage_value(stored.image_url)
        self._storage[warehouse_map.id] = stored
        return _with_signed_image_url(stored.model_copy(deep=True))

    def delete_map(self, map_id: str) -> None:
        self._storage.pop(map_id, None)


class FirestoreWarehouseMapRepository(WarehouseMapRepository):
    def __init__(self, client: Optional[firestore.Client] = None) -> None:
        self._client = client or get_firestore_client()

    @property
    def collection(self) -> firestore.CollectionReference:
        return self._client.collection("warehouse_maps")

    def list_maps(self) -> List[WarehouseMap]:
        docs = self.collection.stream()
        result: List[WarehouseMap] = []
        for doc in docs:
            result.append(_document_to_map(doc))
        result.sort(key=lambda item: item.created_at)
        return result

    def get_map(self, map_id: str) -> Optional[WarehouseMap]:
        doc = self.collection.document(map_id).get()
        if not doc.exists:
            return None
        return _document_to_map(doc)

    def create_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        self.collection.document(warehouse_map.id).set(_map_to_document(warehouse_map))
        return _with_signed_image_url(warehouse_map)

    def update_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        self.collection.document(warehouse_map.id).set(_map_to_document(warehouse_map))
        return _with_signed_image_url(warehouse_map)

    def delete_map(self, map_id: str) -> None:
        self.collection.document(map_id).delete()


_DEFAULT_REPOSITORY: Optional[WarehouseMapRepository] = None


def get_warehouse_map_repository() -> WarehouseMapRepository:
    global _DEFAULT_REPOSITORY
    if _DEFAULT_REPOSITORY is not None:
        return _DEFAULT_REPOSITORY

    settings = get_settings()
    if settings.environment == "local":
        _DEFAULT_REPOSITORY = InMemoryWarehouseMapRepository()
    else:
        _DEFAULT_REPOSITORY = FirestoreWarehouseMapRepository()
    return _DEFAULT_REPOSITORY


def _document_to_map(doc: firestore.DocumentSnapshot) -> WarehouseMap:
    data = doc.to_dict() or {}
    areas = [MapArea(**area) for area in data.get("areas", [])]
    created_at = data.get("created_at")
    updated_at = data.get("updated_at")
    if not isinstance(created_at, datetime):
        created_at = datetime.now(timezone.utc)
    if not isinstance(updated_at, datetime):
        updated_at = created_at
    return _with_signed_image_url(
        WarehouseMap(
            id=doc.id,
            name=data.get("name"),
            image_url=_prepare_storage_value(data.get("image_url")),
            image_width=int(data.get("image_width", 0)),
            image_height=int(data.get("image_height", 0)),
            areas=areas,
            created_at=created_at,
            updated_at=updated_at,
        )
    )


def _map_to_document(warehouse_map: WarehouseMap) -> Dict[str, object]:
    return {
        "name": warehouse_map.name,
        "image_url": _prepare_storage_value(warehouse_map.image_url),
        "image_width": warehouse_map.image_width,
        "image_height": warehouse_map.image_height,
        "areas": [area.model_dump(mode="python") for area in warehouse_map.areas],
        "created_at": warehouse_map.created_at,
        "updated_at": warehouse_map.updated_at,
    }


def generate_area_id() -> str:
    return uuid.uuid4().hex


def _normalize_image_url(raw_url: Optional[str]) -> Optional[str]:
    # Deprecated helper retained for compatibility
    return _generate_signed_url_from_value(raw_url)


def _prepare_storage_value(raw_value: Optional[str]) -> Optional[str]:
    if not raw_value:
        return None
    text = str(raw_value).strip()
    if not text:
        return None
    parsed = urlparse(text)
    settings = get_settings()
    bucket = settings.r2.bucket_name
    if parsed.scheme:
        path = parsed.path.lstrip("/")
        if path.startswith(f"{bucket}/"):
            remainder = path[len(bucket) + 1 :]
            return remainder or None
        return path or None
    return text.lstrip("/")


def _with_signed_image_url(warehouse_map: WarehouseMap | None) -> WarehouseMap | None:
    if warehouse_map is None:
        return None
    key = _prepare_storage_value(warehouse_map.image_url)
    if not key:
        return warehouse_map
    signed_url = _generate_signed_url_from_key(key)
    if not signed_url:
        return warehouse_map
    return warehouse_map.model_copy(update={"image_url": signed_url})


def _generate_signed_url_from_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    key = _prepare_storage_value(value)
    if not key:
        return None
    return _generate_signed_url_from_key(key)


def _generate_signed_url_from_key(key: str) -> Optional[str]:
    client: CloudflareR2Client = get_r2_client()
    try:
        return client.generate_signed_read_url(key)
    except Exception:
        return client.build_object_url(key)
