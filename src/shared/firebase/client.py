"""ตัวช่วยสำหรับเชื่อมต่อ Firebase Firestore."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional
import json

from google.cloud import firestore
from google.oauth2 import service_account

from src.shared.config import Settings, get_settings

_FIREBASE_CREDENTIALS: Optional[service_account.Credentials] = None
_FIREBASE_PROJECT_ID: Optional[str] = None


def _resolve_service_account_path(settings: Settings) -> Path:
    path = Path(settings.firebase.service_account_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    fallback = Path.cwd() / "config/firebase.json"
    if path.name == "firebase.template.json" and fallback.exists():
        return fallback
    if not path.exists() and fallback.exists():
        return fallback
    return path


def _load_credentials(settings: Settings) -> tuple[service_account.Credentials, str]:
    global _FIREBASE_CREDENTIALS
    global _FIREBASE_PROJECT_ID
    if _FIREBASE_CREDENTIALS and _FIREBASE_PROJECT_ID:
        return _FIREBASE_CREDENTIALS, _FIREBASE_PROJECT_ID

    service_account_path = _resolve_service_account_path(settings)
    if not service_account_path.exists():
        raise FileNotFoundError(
            f"ไม่พบไฟล์ service account: {service_account_path}. "
            "กรุณาคัดลอกจาก config/firebase.template.json และกรอกค่าให้ครบ"
        )

    with service_account_path.open("r", encoding="utf-8") as fh:
        service_account_info = json.load(fh)
    private_key = service_account_info.get("private_key")
    if isinstance(private_key, str):
        service_account_info["private_key"] = private_key.replace("\\n", "\n")

    _FIREBASE_CREDENTIALS = service_account.Credentials.from_service_account_info(service_account_info)
    _FIREBASE_PROJECT_ID = service_account_info.get("project_id") or settings.firebase.project_id
    return _FIREBASE_CREDENTIALS, _FIREBASE_PROJECT_ID


@lru_cache
def get_firestore_client() -> firestore.Client:
    """คืนค่า Firestore client โดยใช้ config จาก Settings."""

    settings = get_settings()
    credentials, project_id = _load_credentials(settings)
    return firestore.Client(project=project_id, credentials=credentials)
