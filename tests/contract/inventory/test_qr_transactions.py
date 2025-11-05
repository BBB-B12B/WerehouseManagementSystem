from fastapi.testclient import TestClient

from src.inventory.schemas.movement import MovementType
from src.main import app
from src.shared.auth import UserContext, get_current_user


app.dependency_overrides[get_current_user] = lambda: UserContext(
    id="contract-tester",
    name="Contract Tester",
    roles=["store_clerk"],
)

client = TestClient(app)


def test_scan_requires_all_fields():
    response = client.post(
        "/api/inventory/transactions/scan",
        json={
            "type": MovementType.PUT_AWAY.value,
            "location_token": "",
            "item_id": "",
            "quantity": 0,
        },
    )
    assert response.status_code == 422
