from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.inventory.schemas.location import (
    StorageLocation,
    StorageLocationCreate,
    StorageLocationUpdate,
)
from src.inventory.services.storage_location_service import StorageLocationService, get_storage_location_service
from src.shared.auth import UserContext, require_roles


router = APIRouter(prefix="/inventory/locations", tags=["inventory-locations"])


@router.get("", response_model=list[StorageLocation])
async def list_locations(
    _: UserContext = Depends(require_roles("store_clerk", "admin", "logistics_lead")),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> list[StorageLocation]:
    return service.list_locations()


@router.post("", response_model=StorageLocation, status_code=status.HTTP_201_CREATED)
async def create_location(
    payload: StorageLocationCreate,
    _: UserContext = Depends(require_roles("store_clerk", "admin")),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> StorageLocation:
    return service.create_location(payload)


@router.put("/{location_id}", response_model=StorageLocation)
async def update_location(
    location_id: str,
    payload: StorageLocationUpdate,
    _: UserContext = Depends(require_roles("store_clerk", "admin")),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> StorageLocation:
    try:
        return service.update_location(location_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_location(
    location_id: str,
    _: UserContext = Depends(require_roles("store_clerk", "admin")),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> None:
    service.delete_location(location_id)
