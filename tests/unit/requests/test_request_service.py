from datetime import date

from src.requests.schemas.request import Attachment, RequestCreate, RequestLineCreate
from src.requests.services.repository import InMemoryRequestRepository
from src.requests.services.request_service import RequestService
from src.shared.config import Settings
from src.shared.storage.r2_client import CloudflareR2Client


class DummyR2Client(CloudflareR2Client):
    def __init__(self) -> None:  # pragma: no cover - ค่าคงที่สำหรับเทส
        settings = Settings()
        super().__init__(settings=settings)

    def build_public_url(self, key: str) -> str:  # pragma: no cover - override เฉพาะเทส
        return f"https://r2.local/{key}"


def test_create_request_assigns_id_and_status():
    repository = InMemoryRequestRepository()
    service = RequestService(repository=repository, storage_client=DummyR2Client())

    payload = RequestCreate(
        requester_id="user-001",
        requester_name="คุณยอด",
        department="โครงการก่อสร้าง A",
        required_date=date.today(),
        note="เร่งด่วน",
        attachments=[
            Attachment(
                key="requests/demo.png",
                file_name="demo.png",
                mime_type="image/png",
                size_bytes=1024,
            )
        ],
        items=[
            RequestLineCreate(item_id="itm-drill", quantity=1),
            RequestLineCreate(item_id="itm-helmet", quantity=3, note="เพิ่มสำหรับทีมใหม่"),
        ],
    )

    request = service.create_request(payload)

    assert request.id
    assert request.status.value == "pending_review"
    assert len(request.items) == 2
    assert request.attachments[0].public_url  # R2 client เติมลิงก์ให้แล้ว
