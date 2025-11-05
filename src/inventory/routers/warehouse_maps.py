from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from src.inventory.schemas.warehouse_map import WarehouseMap, WarehouseMapCreate, WarehouseMapUpdate
from src.inventory.services.warehouse_map_service import WarehouseMapService, get_warehouse_map_service
from src.shared.auth import UserContext, require_roles

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/maps", response_model=list[WarehouseMap])
async def list_maps(
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WarehouseMapService = Depends(get_warehouse_map_service),
) -> list[WarehouseMap]:
    return service.list_maps()


@router.get("/maps/{map_id}", response_model=WarehouseMap)
async def get_map(
    map_id: str,
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WarehouseMapService = Depends(get_warehouse_map_service),
) -> WarehouseMap:
    try:
        return service.get_map(map_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/maps", response_model=WarehouseMap, status_code=status.HTTP_201_CREATED)
async def create_map(
    payload: WarehouseMapCreate,
    _: UserContext = Depends(require_roles("admin")),
    service: WarehouseMapService = Depends(get_warehouse_map_service),
) -> WarehouseMap:
    return service.create_map(payload)


@router.put("/maps/{map_id}", response_model=WarehouseMap)
async def update_map(
    map_id: str,
    payload: WarehouseMapUpdate,
    _: UserContext = Depends(require_roles("admin")),
    service: WarehouseMapService = Depends(get_warehouse_map_service),
) -> WarehouseMap:
    try:
        return service.update_map(map_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/maps/{map_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_map(
    map_id: str,
    _: UserContext = Depends(require_roles("admin")),
    service: WarehouseMapService = Depends(get_warehouse_map_service),
) -> None:
    service.delete_map(map_id)
