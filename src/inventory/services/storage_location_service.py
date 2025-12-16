from __future__ import annotations

from functools import lru_cache
from typing import List

from src.inventory.schemas.location import (
    StorageLocation,
    StorageLocationCreate,
    StorageLocationUpdate,
)
from src.inventory.services.storage_location_repository import (
    FirestoreStorageLocationRepository,
    get_storage_location_repository,
)


class StorageLocationService:
    def __init__(self, repository: FirestoreStorageLocationRepository) -> None:
        self._repository = repository

    def list_locations(self) -> List[StorageLocation]:
        return self._repository.list_locations()

    def create_location(self, payload: StorageLocationCreate) -> StorageLocation:
        return self._repository.create_location(payload)

    def update_location(self, location_id: str, payload: StorageLocationUpdate) -> StorageLocation:
        return self._repository.update_location(location_id, payload)

    def delete_location(self, location_id: str) -> None:
        self._repository.delete_location(location_id)


@lru_cache
def get_storage_location_service() -> StorageLocationService:
    return StorageLocationService(repository=get_storage_location_repository())
