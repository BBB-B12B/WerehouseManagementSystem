from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from httpx import HTTPError

from src.requests.schemas.request import Attachment
from src.shared.auth import UserContext, require_roles
from src.shared.storage.r2_client import CloudflareR2Client, get_r2_client

router = APIRouter(prefix="/storage", tags=["storage"])


@router.post("/uploads", response_model=Attachment)
async def upload_to_r2(
    file: UploadFile = File(...),
    prefix: str = Form("requests"),
    _: UserContext = Depends(require_roles("requester", "store_clerk", "admin")),
    client: CloudflareR2Client = Depends(get_r2_client),
) -> Attachment:
    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่พบข้อมูลไฟล์ที่จะอัปโหลด",
        )

    safe_file_name = file.filename or "attachment"
    key = client.generate_object_key(prefix=prefix, file_name=safe_file_name)
    try:
        client.upload_file(key, content=data, content_type=file.content_type)
        public_url = client.generate_signed_read_url(key)
    except HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="อัปโหลดไฟล์ไปยัง R2 ไม่สำเร็จ",
        ) from exc

    return Attachment(
        key=key,
        file_name=safe_file_name,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        public_url=public_url,
    )
