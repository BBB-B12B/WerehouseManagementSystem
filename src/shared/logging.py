"""เครื่องมือจัดการ logging กลางของระบบ WMS."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

LOGGER_NAME = "wms"


def configure_logging(level: str | int = "INFO") -> logging.Logger:
    """ตั้งค่า logging พื้นฐานให้เป็นรูปแบบ JSON-friendly."""

    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        # ป้องกันการตั้งค่าซ้ำเมื่อ FastAPI รีโหลด
        return logger

    log_level = _resolve_level(level)
    logger.setLevel(log_level)

    handler = logging.StreamHandler()
    handler.setLevel(log_level)
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    logger.debug("Logging configured", extra={"level": log_level})
    return logger


def log_event(event: str, payload: Optional[Dict[str, Any]] = None) -> None:
    """บันทึกเหตุการณ์สำคัญเพื่อใช้กับระบบ Analytics ภายนอก."""

    logger = logging.getLogger(LOGGER_NAME)
    metadata = {
        "event": event,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "payload": payload or {},
    }

    if (token := os.getenv("CLOUDFLARE_ANALYTICS_TOKEN")) is not None:
        metadata["cf_analytics"] = {"enabled": True, "token_prefix": token[:6]}

    logger.info("event", extra={"metadata": metadata})


def _resolve_level(level: str | int) -> int:
    if isinstance(level, int):
        return level
    return getattr(logging, level.upper(), logging.INFO)
