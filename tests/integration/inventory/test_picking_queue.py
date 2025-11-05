from datetime import date, timedelta

from fastapi.testclient import TestClient

from src.inventory.schemas.location import PickingQueueResponse
from src.inventory.services.balance_service import (
    InventoryBalanceService,
    get_inventory_service,
)
from src.main import app
from src.requests.schemas.request import (
    Attachment,
    RequestCreate,
    RequestLineCreate,
    RequestStatus,
)
from src.requests.services import repository as repository_module
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


# ล้าง cache dependency ก่อนบังคับค่าใหม่
get_request_service.cache_clear()
get_inventory_service.cache_clear()

repository_module._DEFAULT_REPO = repository  # type: ignore[attr-defined]

app.dependency_overrides[get_request_repository] = lambda: repository
app.dependency_overrides[get_request_service] = lambda: request_service
app.dependency_overrides[get_inventory_service] = lambda: inventory_service
app.dependency_overrides[get_current_user] = lambda: UserContext(
    id="store-clerk",
    name="Store Clerk",
    roles=["store_clerk"],
)

client = TestClient(app)


def setup_module(module):  # pragma: no cover - fixture เตรียมข้อมูล
    future_date = date.today() + timedelta(days=1)
    new_request = request_service.create_request(
        RequestCreate(
            requester_id="req-001",
            requester_name="คุณหน้างาน",
            department="ไซต์ก่อสร้าง",
            required_date=future_date,
            note="",
            attachments=[
                Attachment(
                    key="requests/site-plan.pdf",
                    file_name="site-plan.pdf",
                    mime_type="application/pdf",
                    size_bytes=1024,
                )
            ],
            items=[
                RequestLineCreate(item_id="itm-drill", quantity=1),
                RequestLineCreate(item_id="itm-helmet", quantity=2),
            ],
        )
    )

    repository._requests[new_request.id] = new_request.model_copy(  # type: ignore[attr-defined]
        update={
            "status": RequestStatus.APPROVED,
            "items": [
                line.model_copy(update={"quantity_approved": line.quantity_requested})
                for line in new_request.items
            ],
        }
    )


def test_picking_queue_returns_jobs():
    response = client.get("/api/inventory/picking-queue")
    assert response.status_code == 200

    data = PickingQueueResponse.model_validate(response.json())
    assert data.total_jobs >= 1
    assert any(job.item_id == "itm-drill" for job in data.jobs)
