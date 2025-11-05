from __future__ import annotations

from functools import lru_cache

from src.requests.schemas.request import Attachment, Request, RequestCreate
from src.requests.services.repository import RequestRepository, get_request_repository
from src.shared.storage.r2_client import get_r2_client, CloudflareR2Client


class RequestService:
    """บริการหลักสำหรับสร้างคำร้องและคำนวณผลลัพธ์"""

    def __init__(
        self,
        repository: RequestRepository,
        storage_client: CloudflareR2Client,
    ) -> None:
        self._repository = repository
        self._storage = storage_client

    def create_request(self, payload: RequestCreate) -> Request:
        enriched_attachments = [
            _ensure_public_url(attachment, self._storage)
            for attachment in payload.attachments
        ]
        normalized = payload.model_copy(update={"attachments": enriched_attachments})
        request = self._repository.create_request(normalized)
        return request


@lru_cache
def get_request_service() -> RequestService:
    return RequestService(
        repository=get_request_repository(),
        storage_client=get_r2_client(),
    )


def _ensure_public_url(attachment: Attachment, storage: CloudflareR2Client) -> Attachment:
    if attachment.public_url:
        return attachment
    public_url = storage.build_public_url(attachment.key)
    return attachment.model_copy(update={"public_url": public_url})
