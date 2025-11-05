from datetime import date, timedelta

from fastapi.testclient import TestClient

from src.main import app
from src.requests.services.catalog_service import CatalogService
from src.requests.services.repository import InMemoryRequestRepository
from src.requests.services.request_service import RequestService
from src.requests.services.catalog_service import get_catalog_service
from src.requests.services.request_service import get_request_service
from src.shared.config import Settings
from src.shared.storage.r2_client import CloudflareR2Client


class DummyR2Client(CloudflareR2Client):
    def __init__(self) -> None:
        super().__init__(settings=Settings())

    def build_public_url(self, key: str) -> str:
        return f"https://r2.local/{key}"


repository = InMemoryRequestRepository()
request_service = RequestService(repository=repository, storage_client=DummyR2Client())
catalog_service = CatalogService(repository=repository)


app.dependency_overrides[get_request_service] = lambda: request_service
app.dependency_overrides[get_catalog_service] = lambda: catalog_service

client = TestClient(app)


def test_list_categories():
    response = client.get("/api/catalog/categories")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["name"]


def test_submit_request_success():
    response = client.post(
        "/api/requests",
        json={
            "requester_id": "user-002",
            "requester_name": "คุณศักดิ์",
            "department": "งานโครงสร้าง",
            "required_date": (date.today() + timedelta(days=2)).isoformat(),
            "items": [
                {"item_id": "itm-drill", "quantity": 1},
                {"item_id": "itm-helmet", "quantity": 5},
            ],
            "attachments": [
                {
                    "key": "requests/plan.pdf",
                    "file_name": "plan.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 2048,
                }
            ],
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending_review"
    assert len(body["items"]) == 2
    assert body["attachments"][0]["public_url"].startswith("https://r2.local/requests/plan.pdf")
