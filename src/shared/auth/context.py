"""Mock authentication layer สำหรับควบคุมสิทธิ์เบื้องต้น."""

from __future__ import annotations

from dataclasses import dataclass
from functools import partial
from typing import Iterable, List

from fastapi import Depends, HTTPException, status


@dataclass
class UserContext:
    id: str
    name: str
    roles: List[str]


def get_current_user() -> UserContext:
    """ให้ค่า mock user สำหรับสภาพแวดล้อม local/dev."""

    # TODO: ปรับให้ดึงจากระบบ auth จริงเมื่อพร้อม
    return UserContext(
        id="user-dev",
        name="Dev User",
        roles=["requester", "store_clerk", "logistics_lead", "admin"],
    )


def require_roles(*roles: str):
    def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if any(role in user.roles for role in roles):
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้",
        )

    return dependency
