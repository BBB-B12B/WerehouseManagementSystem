from __future__ import annotations

from fastapi import APIRouter, Depends

from src.inventory.schemas.location import PickingQueueResponse
from src.inventory.services.balance_service import (
    InventoryBalanceService,
    get_inventory_service,
)
from src.shared.auth import UserContext, require_roles


router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/picking-queue", response_model=PickingQueueResponse)
async def get_picking_queue(
    _: UserContext = Depends(require_roles("store_clerk", "admin")),
    service: InventoryBalanceService = Depends(get_inventory_service),
) -> PickingQueueResponse:
    return service.get_picking_queue()
