from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Protocol

from google.cloud import firestore

from src.inventory.schemas.warehouse_map import MapArea, WarehouseMap
from src.shared.config import get_settings
from src.shared.firebase.client import get_firestore_client


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
        return sorted(self._storage.values(), key=lambda item: item.created_at)

    def get_map(self, map_id: str) -> Optional[WarehouseMap]:
        value = self._storage.get(map_id)
        return value.model_copy(deep=True) if value else None

    def create_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        self._storage[warehouse_map.id] = warehouse_map.model_copy(deep=True)
        return warehouse_map

    def update_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        if warehouse_map.id not in self._storage:
            raise KeyError("Map not found")
        self._storage[warehouse_map.id] = warehouse_map.model_copy(deep=True)
        return warehouse_map

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
        return warehouse_map

    def update_map(self, warehouse_map: WarehouseMap) -> WarehouseMap:
        self.collection.document(warehouse_map.id).set(_map_to_document(warehouse_map))
        return warehouse_map

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
    return WarehouseMap(
        id=doc.id,
        name=data.get("name"),
        image_url=data.get("image_url"),
        image_width=int(data.get("image_width", 0)),
        image_height=int(data.get("image_height", 0)),
        areas=areas,
        created_at=created_at,
        updated_at=updated_at,
    )


def _map_to_document(warehouse_map: WarehouseMap) -> Dict[str, object]:
    return {
        "name": warehouse_map.name,
        "image_url": str(warehouse_map.image_url) if warehouse_map.image_url else None,
        "image_width": warehouse_map.image_width,
        "image_height": warehouse_map.image_height,
        "areas": [area.model_dump(mode="python") for area in warehouse_map.areas],
        "created_at": warehouse_map.created_at,
        "updated_at": warehouse_map.updated_at,
    }


def generate_area_id() -> str:
    return uuid.uuid4().hex
