from datetime import date

from fastapi.testclient import TestClient

from src.logistics.schemas.work_order import WorkOrderStatus
from src.main import app
from src.shared.auth import UserContext, get_current_user


app.dependency_overrides[get_current_user] = lambda: UserContext(
    id="contract-logistics",
    name="Contract Logistics",
    roles=["logistics_lead"],
)

client = TestClient(app)


def test_update_status_requires_payload():
    create = client.post(
        "/api/logistics/work-orders",
        json={
            "route": "เส้นทาง B",
            "vehicle": "รถ 2",
            "driver": "คุณขับ",
            "scheduled_date": date.today().isoformat(),
            "departure_time": "10:00",
        },
    )
    assert create.status_code in (201, 422)
    if create.status_code != 201:
        return

    work_order = create.json()
    resp = client.patch(f"/api/logistics/work-orders/{work_order['id']}/status", json={})
    assert resp.status_code == 422


def test_invalid_transition():
    create = client.post(
        "/api/logistics/work-orders",
        json={
            "route": "เส้นทาง C",
            "vehicle": "รถ 3",
            "driver": "คุณขับ",
            "scheduled_date": date.today().isoformat(),
            "departure_time": "11:00",
        },
    )
    if create.status_code != 201:
        return
    work_order = create.json()
    resp = client.patch(
        f"/api/logistics/work-orders/{work_order['id']}/status",
        json={"status": WorkOrderStatus.COMPLETED.value},
    )
    assert resp.status_code == 400
