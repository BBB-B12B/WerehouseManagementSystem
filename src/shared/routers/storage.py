from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from httpx import HTTPError
from io import BytesIO
from pathlib import Path
from typing import Tuple

from PIL import Image, ImageOps

from src.requests.schemas.request import Attachment
from src.shared.auth import UserContext, require_roles
from src.shared.storage.r2_client import CloudflareR2Client, get_r2_client

router = APIRouter(prefix="/storage", tags=["storage"])

MAX_IMAGE_DIMENSION = 1600
JPEG_QUALITY = 75
IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
logger = logging.getLogger(__name__)


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
    optimized_bytes, optimized_content_type = _resize_image_if_needed(
        data=data,
        content_type=file.content_type,
        file_name=safe_file_name,
    )

    key = client.generate_object_key(prefix=prefix, file_name=safe_file_name)
    try:
        client.upload_file(key, content=optimized_bytes, content_type=optimized_content_type)
        public_url = client.build_public_url(key)
    except HTTPError as exc:
        _log_upload_error(exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="อัปโหลดไฟล์ไปยัง R2 ไม่สำเร็จ",
        ) from exc

    return Attachment(
        key=key,
        file_name=safe_file_name,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(optimized_bytes),
        public_url=public_url,
    )


def _resize_image_if_needed(data: bytes, *, content_type: str | None, file_name: str) -> Tuple[bytes, str]:
    """Downscale and recompress images before upload; return original for non-images or failures."""

    target_mime = content_type or "application/octet-stream"
    if not _looks_like_image(content_type, file_name):
        return data, target_mime

    try:
        with Image.open(BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            format_hint = (img.format or "").upper()
            format_choice, target_mime = _pick_format(format_hint, content_type)

            width, height = img.size
            max_side = max(width, height)
            if max_side > MAX_IMAGE_DIMENSION:
                scale = MAX_IMAGE_DIMENSION / float(max_side)
                new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
                img = img.resize(new_size, Image.LANCZOS)

            if format_choice == "JPEG" and img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            if format_choice == "WEBP" and img.mode not in ("RGB", "RGBA", "L"):
                img = img.convert("RGB")

            buffer = BytesIO()
            if format_choice == "JPEG":
                img.save(buffer, format="JPEG", optimize=True, quality=JPEG_QUALITY, progressive=True)
                target_mime = "image/jpeg"
            elif format_choice == "PNG":
                img.save(buffer, format="PNG", optimize=True)
                target_mime = "image/png"
            elif format_choice == "WEBP":
                img.save(buffer, format="WEBP", quality=JPEG_QUALITY, method=4)
                target_mime = "image/webp"
            else:
                img.save(buffer, format=format_choice or img.format)
            return buffer.getvalue(), target_mime
    except Exception:
        # ถ้าแปลงไม่สำเร็จ ใช้ไฟล์ต้นฉบับเพื่อหลีกเลี่ยงข้อมูลเสียหาย
        return data, target_mime

    return data, target_mime


def _looks_like_image(content_type: str | None, file_name: str) -> bool:
    if content_type and content_type.lower() in IMAGE_CONTENT_TYPES:
        return True
    extension = Path(file_name.lower()).suffix
    return extension in {".jpg", ".jpeg", ".png", ".webp"}


def _pick_format(format_hint: str, content_type: str | None) -> Tuple[str, str]:
    format_upper = format_hint or ""
    if format_upper in {"JPG", "JPEG"} or (content_type and content_type.lower() in {"image/jpeg", "image/jpg"}):
        return "JPEG", "image/jpeg"
    if format_upper == "PNG" or (content_type and content_type.lower() == "image/png"):
        return "PNG", "image/png"
    if format_upper == "WEBP" or (content_type and content_type.lower() == "image/webp"):
        return "WEBP", "image/webp"
    return format_upper or "PNG", content_type or "application/octet-stream"


def _log_upload_error(exc: HTTPError) -> None:
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    text = None
    if response is not None:
        try:
            text = response.text
        except Exception:
            text = None
    logger.error("อัปโหลดไฟล์ไปยัง R2 ไม่สำเร็จ status=%s body=%s", status_code, text, exc_info=True)
