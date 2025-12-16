"""ตัวช่วยเชื่อม Cloudflare R2 สำหรับการจัดการไฟล์."""

from __future__ import annotations

import hashlib
import hmac
import time
from base64 import urlsafe_b64encode
from dataclasses import dataclass
import ssl
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, Optional
from urllib.parse import quote

import httpx

from src.shared.config import Settings, get_settings


@dataclass
class SignedUploadURL:
    url: str
    fields: Dict[str, Any]
    expires_at: int


class CloudflareR2Client:
    """Client แบบง่ายสำหรับสร้าง key และ URL ใช้งาน Cloudflare R2."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._endpoint = f"https://{self._settings.r2.account_id}.r2.cloudflarestorage.com"
        self._public_base = self._settings.r2.public_base_url.rstrip("/")
        self._verify_target = self._build_ssl_context()

    @property
    def bucket_name(self) -> str:
        return self._settings.r2.bucket_name

    @property
    def public_prefix(self) -> str:
        return f"{self._endpoint}/{self.bucket_name}".rstrip("/")

    @property
    def public_base_url(self) -> str:
        return self._public_base

    def generate_object_key(self, *, prefix: str, file_name: str) -> str:
        timestamp = int(time.time())
        safe_name = file_name.replace(" ", "-")
        random_hash = hashlib.sha1(f"{file_name}-{timestamp}".encode()).hexdigest()
        return f"{prefix}/{timestamp}-{random_hash}-{safe_name}"

    def _object_path(self, key: str) -> str:
        encoded_key = quote(key.lstrip("/"), safe="/-_.~")
        return f"/{self.bucket_name}/{encoded_key}"

    def build_object_url(self, key: str) -> str:
        return f"{self._endpoint}{self._object_path(key)}"

    def build_public_url(self, key: str) -> str:
        clean_key = key.lstrip("/")
        if not self._public_base:
            return self.generate_signed_read_url(key)
        return f"{self._public_base}/{clean_key}"

    def sign_upload(self, key: str, expires_in: int | None = None) -> SignedUploadURL:
        ttl = expires_in or self._settings.r2.signed_url_ttl
        expires_at = int(time.time()) + ttl
        signature_payload = f"{key}:{expires_at}:{self._settings.r2.access_key_id}".encode()
        digest = hmac.new(
            self._settings.r2.secret_access_key.encode(),
            signature_payload,
            hashlib.sha256,
        ).digest()
        signature = urlsafe_b64encode(digest).decode()
        url = f"{self.public_prefix}/{key}?expires={expires_at}&signature={signature}"
        fields = {
            "key": key,
            "AWSAccessKeyId": self._settings.r2.access_key_id,
            "Expires": expires_at,
            "Signature": signature,
        }
        return SignedUploadURL(url=url, fields=fields, expires_at=expires_at)

    def upload_file(self, key: str, *, content: bytes, content_type: Optional[str] = None) -> str:
        """อัปโหลดไฟล์ขึ้น Cloudflare R2 ผ่าน S3-compatible API และคืนค่า public URL."""

        if not key:
            raise ValueError("key ต้องไม่เป็นค่าว่าง")
        if not content:
            raise ValueError("content ต้องไม่เป็นค่าว่าง")

        safe_content_type = content_type or "application/octet-stream"
        now = datetime.now(timezone.utc)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")

        payload_hash = hashlib.sha256(content).hexdigest()
        encoded_key = quote(key, safe="/-_.~")
        canonical_uri = f"/{self._settings.r2.bucket_name}/{encoded_key}"
        host = f"{self._settings.r2.account_id}.r2.cloudflarestorage.com"

        canonical_headers = (
            f"content-type:{safe_content_type}\n"
            f"host:{host}\n"
            f"x-amz-content-sha256:{payload_hash}\n"
            f"x-amz-date:{amz_date}\n"
        )
        signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"

        canonical_request = "\n".join(
            [
                "PUT",
                canonical_uri,
                "",
                canonical_headers,
                signed_headers,
                payload_hash,
            ]
        )
        hashed_canonical_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
        credential_scope = f"{date_stamp}/auto/s3/aws4_request"
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                credential_scope,
                hashed_canonical_request,
            ]
        )
        signing_key = self._derive_signing_key(date_stamp=date_stamp, region="auto", service="s3")
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        authorization_header = (
            "AWS4-HMAC-SHA256 "
            f"Credential={self._settings.r2.access_key_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, "
            f"Signature={signature}"
        )

        url = f"{self._endpoint}{canonical_uri}"
        headers = {
            "Content-Type": safe_content_type,
            "X-Amz-Date": amz_date,
            "X-Amz-Content-Sha256": payload_hash,
            "Authorization": authorization_header,
        }

        response = httpx.put(url, content=content, headers=headers, timeout=30.0, verify=self._verify_target)
        response.raise_for_status()
        return self.build_object_url(key)

    def delete_object(self, key: str) -> None:
        if not key:
            return
        encoded_key = quote(key.lstrip("/"), safe="/-_.~")
        canonical_uri = f"/{self._settings.r2.bucket_name}/{encoded_key}"
        host = f"{self._settings.r2.account_id}.r2.cloudflarestorage.com"
        now = datetime.now(timezone.utc)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        credential_scope = f"{date_stamp}/auto/s3/aws4_request"
        signed_headers = "host"
        canonical_headers = f"host:{host}\n"
        payload_hash = hashlib.sha256(b"").hexdigest()
        canonical_request = "\n".join(
            [
                "DELETE",
                canonical_uri,
                "",
                canonical_headers,
                signed_headers,
                payload_hash,
            ]
        )
        hashed_canonical_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                credential_scope,
                hashed_canonical_request,
            ]
        )
        signing_key = self._derive_signing_key(date_stamp=date_stamp, region="auto", service="s3")
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        authorization_header = (
            "AWS4-HMAC-SHA256 "
            f"Credential={self._settings.r2.access_key_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, "
            f"Signature={signature}"
        )
        url = f"{self._endpoint}{canonical_uri}"
        headers = {
            "Host": host,
            "X-Amz-Date": amz_date,
            "Authorization": authorization_header,
            "X-Amz-Content-Sha256": payload_hash,
        }
        response = httpx.delete(url, headers=headers, timeout=15.0, verify=self._verify_target)
        response.raise_for_status()

    def _build_ssl_context(self) -> ssl.SSLContext | bool:
        if not self._settings.r2.verify_ssl:
            return False

        # สร้าง SSL context ที่รองรับการใช้งานกับ Cloudflare R2
        try:
            if self._settings.r2.ca_bundle:
                ctx = ssl.create_default_context(cafile=self._settings.r2.ca_bundle)
            else:
                # ใช้ default context ที่จะโหลด CA จาก system
                ctx = ssl.create_default_context()

            # ตั้งค่าให้รองรับ TLS 1.2 และ 1.3
            ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            ctx.maximum_version = ssl.TLSVersion.TLSv1_3

            # เปิดใช้ modern ciphers สำหรับ Cloudflare
            ctx.set_ciphers('DEFAULT@SECLEVEL=1')

            # เปิดใช้ SNI (Server Name Indication) และ ALPN
            ctx.check_hostname = True
            ctx.verify_mode = ssl.CERT_REQUIRED

            return ctx
        except Exception:
            # ถ้าสร้าง context ไม่สำเร็จ ใช้ default
            return True

    def generate_signed_read_url(self, key: str, *, expires_in: Optional[int] = None) -> str:
        if not key:
            raise ValueError("key ต้องไม่เป็นค่าว่าง")

        ttl = expires_in or self._settings.r2.signed_url_ttl
        ttl = max(1, min(ttl, 7 * 24 * 60 * 60))

        now = datetime.now(timezone.utc)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")

        canonical_uri = self._object_path(key)
        host = f"{self._settings.r2.account_id}.r2.cloudflarestorage.com"
        credential_scope = f"{date_stamp}/auto/s3/aws4_request"
        credential = f"{self._settings.r2.access_key_id}/{credential_scope}"

        query_items = [
            ("X-Amz-Algorithm", "AWS4-HMAC-SHA256"),
            ("X-Amz-Credential", quote(credential, safe="")),
            ("X-Amz-Date", amz_date),
            ("X-Amz-Expires", str(ttl)),
            ("X-Amz-SignedHeaders", "host"),
        ]
        canonical_querystring = "&".join(f"{name}={value}" for name, value in query_items)

        canonical_headers = f"host:{host}\n"
        signed_headers = "host"
        payload_hash = "UNSIGNED-PAYLOAD"
        canonical_request = "\n".join(
            [
                "GET",
                canonical_uri,
                canonical_querystring,
                canonical_headers,
                signed_headers,
                payload_hash,
            ]
        )
        hashed_canonical_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                credential_scope,
                hashed_canonical_request,
            ]
        )
        signing_key = self._derive_signing_key(date_stamp=date_stamp, region="auto", service="s3")
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        signed_query = f"{canonical_querystring}&X-Amz-Signature={signature}"
        return f"https://{host}{canonical_uri}?{signed_query}"

    def _derive_signing_key(self, *, date_stamp: str, region: str, service: str) -> bytes:
        secret = self._settings.r2.secret_access_key

        def _sign(key: bytes, msg: str) -> bytes:
            return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

        k_date = _sign(f"AWS4{secret}".encode("utf-8"), date_stamp)
        k_region = _sign(k_date, region)
        k_service = _sign(k_region, service)
        return _sign(k_service, "aws4_request")


@lru_cache
def get_r2_client() -> CloudflareR2Client:
    return CloudflareR2Client(settings=get_settings())
