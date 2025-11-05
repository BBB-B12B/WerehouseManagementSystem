from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from src.requests.schemas.catalog import CatalogSummary, Category, Item, ItemCreate, ItemUpdate
from src.requests.services.catalog_service import CatalogService, get_catalog_service
from src.shared.auth import UserContext, require_roles


router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/categories", response_model=list[Category])
async def list_categories(service: CatalogService = Depends(get_catalog_service)) -> list[Category]:
    return service.list_categories()


@router.get("/items", response_model=list[Item])
async def list_items(
    category_id: str | None = Query(default=None, description="รหัสหมวดหมู่"),
    search: str | None = Query(default=None, min_length=2, description="คำค้นหา"),
    service: CatalogService = Depends(get_catalog_service),
) -> list[Item]:
    return service.list_items(category_id=category_id, search=search)


@router.get("/summary", response_model=CatalogSummary)
async def catalog_summary(service: CatalogService = Depends(get_catalog_service)) -> CatalogSummary:
    return service.get_catalog_summary()


@router.post("/items", response_model=Item, status_code=201)
async def create_item(
    payload: ItemCreate,
    service: CatalogService = Depends(get_catalog_service),
    _: UserContext = Depends(require_roles("admin", "logistics_lead")),
) -> Item:
    return service.create_item(payload)


@router.put("/items/{item_id}", response_model=Item)
async def update_item(
    item_id: str,
    payload: ItemUpdate,
    service: CatalogService = Depends(get_catalog_service),
    _: UserContext = Depends(require_roles("admin", "logistics_lead")),
) -> Item:
    try:
        return service.update_item(item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/items/{item_id}", status_code=204, response_class=Response, response_model=None)
async def delete_item(
    item_id: str,
    service: CatalogService = Depends(get_catalog_service),
    _: UserContext = Depends(require_roles("admin", "logistics_lead")),
) -> Response:
    try:
        service.delete_item(item_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
