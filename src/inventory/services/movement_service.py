from __future__ import annotations

import uuid
from datetime import datetime, timezone
from functools import lru_cache

from src.inventory.schemas.movement import (
    MovementRecord,
    MovementResponse,
    MovementType,
    QRTransactionPayload,
)
from src.inventory.services.balance_service import (
    InventoryBalanceService,
    get_inventory_service,
)
from src.requests.schemas.request import RequestStatus
from src.requests.services.repository import RequestRepository, get_request_repository
from src.shared.auth import UserContext


class MovementService:
    """บริการสำหรับธุรกรรม put-away และ picking ผ่านการสแกน QR."""

    def __init__(
        self,
        inventory_service: InventoryBalanceService,
        request_repository: RequestRepository,
    ) -> None:
        self._inventory_service = inventory_service
        self._request_repository = request_repository

    def process(self, payload: QRTransactionPayload, user: UserContext) -> MovementResponse:
        location = self._inventory_service.get_location_by_token(payload.location_token)
        if not location:
            raise ValueError("ไม่พบ Location จาก QR token")

        delta = payload.quantity if payload.transaction_type == MovementType.PUT_AWAY else -payload.quantity
        balance = self._inventory_service.apply_delta(
            location_id=location.id, item_id=payload.item_id, delta=delta
        )

        if payload.transaction_type == MovementType.PICK:
            self._update_request_allocation(payload)

        record = MovementRecord(
            id=uuid.uuid4().hex,
            transaction_type=payload.transaction_type,
            location_id=location.id,
            item_id=payload.item_id,
            quantity=payload.quantity,
            reason=payload.reason,
            note=payload.note,
            request_id=payload.request_id,
            request_line_id=payload.request_line_id,
            processed_at=datetime.now(timezone.utc),
            processed_by=user.id,
        )
        self._inventory_service.add_movement_record(record.model_dump())

        return MovementResponse(
            balance_on_hand=balance.on_hand,
            allocated=balance.allocated,
            record=record,
        )

    def _update_request_allocation(self, payload: QRTransactionPayload) -> None:
        if not payload.request_id or not payload.request_line_id:
            return
        requests = self._request_repository.list_requests_by_status(
            [RequestStatus.APPROVED, RequestStatus.PICKING]
        )
        for req in requests:
            if req.id != payload.request_id:
                continue
            for line in req.items:
                if line.id != payload.request_line_id:
                    continue
                new_picked = line.quantity_picked + payload.quantity
                if new_picked > (line.quantity_approved or line.quantity_requested):
                    raise ValueError("จำนวนหยิบเกินที่อนุมัติ")
                line.quantity_picked = new_picked
                if all(
                    l.quantity_picked >= (l.quantity_approved or l.quantity_requested)
                    for l in req.items
                ):
                    req.status = RequestStatus.PICKING
                return


@lru_cache
def get_movement_service() -> MovementService:
    return MovementService(
        inventory_service=get_inventory_service(),
        request_repository=get_request_repository(),
    )
