from datetime import date, timedelta

from fastapi.testclient import TestClient

from src.inventory.schemas.movement import MovementType
from src.inventory.services.balance_service import InventoryBalanceService, get_inventory_service
from src.inventory.services.movement_service import MovementService, get_movement_service
from src.main import app
from src.requests.schemas.request import (
    Attachment,
    RequestCreate,
    RequestLineCreate,
    RequestStatus,
)
from src.requests.services.repository import InMemoryRequestRepository, get_request_repository
from src.requests.services.request_service import RequestService, get_request_service
from src.shared.auth import UserContext, get_current_user
from src.shared.config import Settings
from src.shared.storage.r2_client import CloudflareR2Client


class DummyR2Client(CloudflareR2Client):
    def __init__(self) -> None:
        super().__init__(settings=Settings())

    def build_public_url(self, key: str) -> str:
        return f"https://r2.local/{key}"


repository = InMemoryRequestRepository()
request_service = RequestService(repository=repository, storage_client=DummyR2Client())
inventory_service = InventoryBalanceService(repository=repository)
movement_service = MovementService(inventory_service=inventory_service, request_repository=repository)

# reset caches
get_request_repository.cache_clear()
get_request_service.cache_clear()
get_inventory_service.cache_clear()
get_movement_service.cache_clear()

app.dependency_overrides[get_request_repository] = lambda: repository
app.dependency_overrides[get_request_service] = lambda: request_service
app.dependency_overrides[get_inventory_service] = lambda: inventory_service
app.dependency_overrides[get_movement_service] = lambda: movement_service
app.dependency_overrides[get_current_user] = lambda: UserContext(
    id="store-clerk",
    name="Store Clerk",
    roles=["store_clerk"],
)

client = TestClient(app)


def _seed_request():
    future_date = date.today() + timedelta(days=1)
    req = request_service.create_request(
        RequestCreate(
            requester_id="req-001",
            requester_name="คุณหน้างาน",
            department="ไซต์",
            required_date=future_date,
            attachments=[
                Attachment(
                    key="requests/photo.png",
                    file_name="photo.png",
                    mime_type="image/png",
                    size_bytes=512,
                )
            ],
            items=[
                RequestLineCreate(item_id="itm-drill", quantity=1),
            ],
        )
    )

    repository._requests[req.id] = req.model_copy(  # type: ignore[attr-defined]
        update={
            "status": RequestStatus.APPROVED,
            "items": [
                line.model_copy(update={"quantity_approved": line.quantity_requested})
                for line in req.items
            ],
        }
    )
    return repository._requests[req.id]


def test_put_away_updates_balance():
    response = client.post(
        "/api/inventory/transactions/scan",
        json={
            "type": MovementType.PUT_AWAY.value,
            "location_token": "LOC-A-01",
            "item_id": "itm-drill",
            "quantity": 2,
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["balance_on_hand"] >= 2
    assert data["record"]["transaction_type"] == MovementType.PUT_AWAY.value


def test_pick_validates_and_updates_request():
    seeded = _seed_request()
    line = seeded.items[0]

    response = client.post(
        "/api/inventory/transactions/scan",
        json={
            "type": MovementType.PICK.value,
            "location_token": "LOC-A-01",
            "item_id": "itm-drill",
            "quantity": 1,
            "request_id": seeded.id,
            "request_line_id": line.id,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["record"]["transaction_type"] == MovementType.PICK.value
    assert body["record"]["processed_by"] == "store-clerk"


def test_pick_rejects_when_over_quantity():
    seeded = _seed_request()
    line = seeded.items[0]

    response = client.post(
        "/api/inventory/transactions/scan",
        json={
            "type": MovementType.PICK.value,
            "location_token": "LOC-A-01",
            "item_id": "itm-drill",
            "quantity": 5,
            "request_id": seeded.id,
            "request_line_id": line.id,
        },
    )
    assert response.status_code == 400
    assert "เกิน" in response.json()["detail"]
