from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Iterable, Optional

from src.inventory.schemas.location import (
    InventoryBalance,
    InventoryLocation,
    LocationType,
    PickingQueueLine,
    PickingQueueResponse,
)
from src.requests.schemas.request import RequestStatus
from src.requests.services.repository import RequestRepository, get_request_repository
from src.shared.config import get_settings


@dataclass
class _InventoryData:
    locations: Dict[str, InventoryLocation]
    balances: list[InventoryBalance]


class InventoryBalanceService:
    """จัดการข้อมูล Inventory สำหรับการหยิบสินค้า."""

    def __init__(self, repository: RequestRepository, inventory_data: Optional[_InventoryData] = None) -> None:
        self._repository = repository
        self._data = inventory_data or self._seed_data()
        self._movement_history: list[dict] = []

    def _seed_data(self) -> _InventoryData:
        locations = {
            "loc-a-01": InventoryLocation(
                id="loc-a-01",
                zone="A",
                aisle="01",
                rack="01",
                bin_code="A0101",
                type=LocationType.PICK_FACE,
                capacity=100,
                qr_token="LOC-A-01",
                comment="ใกล้ทางเข้า",
            ),
            "loc-b-05": InventoryLocation(
                id="loc-b-05",
                zone="B",
                aisle="05",
                rack="02",
                bin_code="B0502",
                type=LocationType.PICK_FACE,
                capacity=200,
                qr_token="LOC-B-05",
            ),
        }

        balances = [
            InventoryBalance(
                item_id="itm-drill",
                location_id="loc-a-01",
                lot_number="L202403",
                on_hand=5,
                allocated=1,
            ),
            InventoryBalance(
                item_id="itm-helmet",
                location_id="loc-b-05",
                lot_number="L202402",
                on_hand=120,
                allocated=10,
            ),
        ]

        return _InventoryData(locations=locations, balances=balances)

    def list_locations(self) -> list[InventoryLocation]:
        return list(self._data.locations.values())

    def list_balances(self, *, item_ids: Optional[Iterable[str]] = None) -> list[InventoryBalance]:
        if item_ids is None:
            return list(self._data.balances)
        item_set = set(item_ids)
        return [balance for balance in self._data.balances if balance.item_id in item_set]

    def get_location_by_token(self, token: str) -> Optional[InventoryLocation]:
        for location in self._data.locations.values():
            if location.qr_token == token:
                return location
        return None

    def apply_delta(self, *, location_id: str, item_id: str, delta: int) -> InventoryBalance:
        balance = next(
            (b for b in self._data.balances if b.location_id == location_id and b.item_id == item_id),
            None,
        )
        if balance is None:
            balance = InventoryBalance(
                item_id=item_id,
                location_id=location_id,
                on_hand=0,
                allocated=0,
            )
            self._data.balances.append(balance)

        new_on_hand = balance.on_hand + delta
        if new_on_hand < 0:
            raise ValueError("สต็อกคงเหลือไม่พอสำหรับการตัดออก")
        balance.on_hand = new_on_hand
        return balance

    def get_picking_queue(self) -> PickingQueueResponse:
        approved_requests = self._repository.list_requests_by_status(
            statuses=[RequestStatus.APPROVED, RequestStatus.PICKING]
        )
        jobs: list[PickingQueueLine] = []
        item_map = {item.id: item for item in self._repository.list_items()}

        for request in approved_requests:
            for line in request.items:
                location = self._find_location_for_item(line.item_id)
                if not location:
                    continue
                item = item_map.get(line.item_id)
                jobs.append(
                    PickingQueueLine(
                        request_id=request.id,
                        request_line_id=line.id,
                        item_id=line.item_id,
                        item_name=item.name if item else line.item_id,
                        sku=item.sku if item else line.item_id,
                        quantity_needed=line.quantity_approved or line.quantity_requested,
                        quantity_allocated=line.quantity_picked,
                        required_date=request.required_date.isoformat(),
                        location=location,
                        note=line.note,
                    )
                )

        jobs.sort(key=lambda job: job.required_date)
        return PickingQueueResponse(jobs=jobs, total_jobs=len(jobs))

    def _find_location_for_item(self, item_id: str) -> Optional[InventoryLocation]:
        for balance in self._data.balances:
            if balance.item_id == item_id:
                return self._data.locations.get(balance.location_id)
        return None

    def add_movement_record(self, record: dict) -> None:
        self._movement_history.append(record)

    def list_movement_history(self) -> list[dict]:
        return list(self._movement_history)


@lru_cache
def get_inventory_service() -> InventoryBalanceService:
    settings = get_settings()
    repository = get_request_repository()
    return InventoryBalanceService(repository=repository)
