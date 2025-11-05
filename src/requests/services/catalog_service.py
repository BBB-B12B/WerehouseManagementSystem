from __future__ import annotations

from functools import lru_cache
from typing import Optional

from src.requests.schemas.catalog import Category, Item, CatalogSummary, ItemCreate, ItemUpdate
from src.requests.services.repository import RequestRepository, get_request_repository


class CatalogService:
    """บริการสำหรับดึงข้อมูลแคตตาล็อกและสรุปผล"""

    def __init__(self, repository: RequestRepository) -> None:
        self._repository = repository

    def list_categories(self) -> list[Category]:
        return self._repository.list_categories()

    def list_items(
        self, *, category_id: Optional[str] = None, search: Optional[str] = None
    ) -> list[Item]:
        return self._repository.list_items(category_id=category_id, search=search)

    def get_catalog_summary(self) -> CatalogSummary:
        categories = self.list_categories()
        items = self.list_items()
        top_categories = categories[:4]
        return CatalogSummary(
            total_categories=len(categories),
            total_items=len(items),
            top_categories=top_categories,
        )

    def create_item(self, payload: ItemCreate) -> Item:
        return self._repository.create_item(payload)

    def update_item(self, item_id: str, payload: ItemUpdate) -> Item:
        return self._repository.update_item(item_id, payload)

    def delete_item(self, item_id: str) -> None:
        self._repository.delete_item(item_id)


@lru_cache
def get_catalog_service() -> CatalogService:
    return CatalogService(repository=get_request_repository())
