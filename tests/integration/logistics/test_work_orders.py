from datetime import date, timedelta

from fastapi.testclient import TestClient

from src.logistics.schemas.work_order import WorkOrderStatus
from src.logistics.services.work_order_planner import WorkOrderPlanner, get_work_order_planner
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

# reset caches
get_request_repository.cache_clear()
get_request_service.cache_clear()
get_work_order_planner.cache_clear()

app.dependency_overrides[get_request_repository] = lambda: repository
app.dependency_overrides[get_request_service] = lambda: request_service
planner = WorkOrderPlanner(repository=repository)
app.dependency_overrides[get_work_order_planner] = lambda: planner
app.dependency_overrides[get_current_user] = lambda: UserContext(
    id="logistics-lead",
    name="Logistics Lead",
    roles=["logistics_lead"],
)

client = TestClient(app)


def _seed_requests():
    future = date.today() + timedelta(days=2)
    req = request_service.create_request(
        RequestCreate(
            requester_id="req-123",
            requester_name="คุณไซต์",
            department="ไซต์งาน",
            required_date=future,
            attachments=[
                Attachment(
                    key="requests/doc.pdf",
                    file_name="doc.pdf",
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

    repository._requests[req.id] = req.model_copy(  # type: ignore[attr-defined]
        update={
            "status": RequestStatus.PICKING,
            "items": [
                line.model_copy(update={"quantity_approved": line.quantity_requested})
                for line in req.items
            ],
        }
    )
    return req.id


def test_create_work_order_and_update_status():
    request_id = _seed_requests()

    response = client.post(
        "/api/logistics/work-orders",
        json={
            "route": "เส้นทาง A",
            "vehicle": "รถ 1",
            "driver": "คุณขับ",
            "scheduled_date": (date.today() + timedelta(days=1)).isoformat(),
            "departure_time": "09:00",
            "include_request_ids": [request_id],
        },
    )
    assert response.status_code == 201, response.text
    work_order = response.json()
    assert work_order["status"] == WorkOrderStatus.PLANNED.value
    assert len(work_order["tasks"]) == 2

    work_order_id = work_order["id"]
    patch_resp = client.patch(
        f"/api/logistics/work-orders/{work_order_id}/status",
        json={"status": WorkOrderStatus.LOADING.value},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == WorkOrderStatus.LOADING.value


def test_list_work_orders_requires_role():
    response = client.get("/api/logistics/work-orders")
    assert response.status_code == 200
