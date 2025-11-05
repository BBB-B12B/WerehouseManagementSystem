from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.inventory.schemas.movement import MovementResponse, QRTransactionPayload
from src.inventory.services.movement_service import MovementService, get_movement_service
from src.shared.auth import UserContext, get_current_user, require_roles


router = APIRouter(prefix="/inventory/transactions", tags=["inventory-transactions"])


@router.post("/scan", response_model=MovementResponse, status_code=status.HTTP_200_OK)
async def process_transaction(
    payload: QRTransactionPayload,
    user: UserContext = Depends(require_roles("store_clerk", "admin")),
    service: MovementService = Depends(get_movement_service),
) -> MovementResponse:
    try:
        return service.process(payload, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
