from fastapi.testclient import TestClient

from src.main import app
from src.requests.services.repository import InMemoryRequestRepository, get_request_repository
from src.requests.services.catalog_service import get_catalog_service
from src.shared.auth import UserContext, get_current_user

repository = InMemoryRequestRepository()

get_request_repository.cache_clear()
get_catalog_service.cache_clear()

app.dependency_overrides[get_request_repository] = lambda: repository
app.dependency_overrides[get_current_user] = lambda: UserContext(
    id="admin-user",
    name="Administrator",
    roles=["admin"],
)

client = TestClient(app)


def test_create_item_success():
    response = client.post(
        "/api/catalog/items",
        json={
            "sku": "SKU-NEW",
            "name": "เครื่องตัดเหล็ก",
            "category_id": "cat-tools",
            "unit": "เครื่อง",
            "stock_on_hand": 5,
            "tags": ["ตัด", "เครื่องมือหนัก"],
            "image_url": "https://example.com/image.jpg",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["sku"] == "SKU-NEW"
    items = client.get("/api/catalog/items").json()
    assert any(item["sku"] == "SKU-NEW" for item in items)


def test_update_and_delete_item():
    create_response = client.post(
        "/api/catalog/items",
        json={
            "sku": "SKU-EDIT",
            "name": "ไฟฉาย",
            "category_id": "cat-tools",
            "unit": "อัน",
            "stock_on_hand": 10,
        },
    )
    assert create_response.status_code == 201
    item_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/catalog/items/{item_id}",
        json={
            "name": "ไฟฉาย LED",
            "stock_on_hand": 15,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "ไฟฉาย LED"

    delete_response = client.delete(f"/api/catalog/items/{item_id}")
    assert delete_response.status_code == 204
    items = client.get("/api/catalog/items").json()
    assert all(item["id"] != item_id for item in items)
