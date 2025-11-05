"""ตัวช่วยสำหรับเชื่อมต่อ Firebase Firestore."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

from src.shared.config import Settings, get_settings

_FIREBASE_APP: Optional[firebase_admin.App] = None


def _resolve_service_account_path(settings: Settings) -> Path:
    path = Path(settings.firebase.service_account_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path


def _initialise_app(settings: Settings) -> firebase_admin.App:
    global _FIREBASE_APP
    if _FIREBASE_APP:
        return _FIREBASE_APP

    service_account_path = _resolve_service_account_path(settings)
    if not service_account_path.exists():
        raise FileNotFoundError(
            f"ไม่พบไฟล์ service account: {service_account_path}. "
            "กรุณาคัดลอกจาก config/firebase.template.json และกรอกค่าให้ครบ"
        )

    cred = credentials.Certificate(service_account_path)
    _FIREBASE_APP = firebase_admin.initialize_app(
        cred,
        options={
            "projectId": settings.firebase.project_id,
        },
    )
    return _FIREBASE_APP


@lru_cache
def get_firestore_client() -> firestore.Client:
    """คืนค่า Firestore client โดยใช้ config จาก Settings."""

    settings = get_settings()
    app = _initialise_app(settings)
    return firestore.client(app=app)
