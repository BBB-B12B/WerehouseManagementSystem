#!/usr/bin/env python3
"""Seed the Firebase Firestore database with baseline data."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Iterable

# Ensure we can import from the src package when executed from project root.
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from firebase_admin import firestore  # type: ignore

from src.inventory.schemas.warehouse_map import MapArea, WarehouseMap
from src.requests.services.repository import FirebaseRequestRepository
from src.shared.config import get_settings
from src.shared.firebase.client import get_firestore_client


CategoryPayload = dict[str, object]
ItemPayload = dict[str, object]


def seed_categories(db: firestore.Client, categories: Iterable[CategoryPayload]) -> None:
    batch = db.batch()
    for category in categories:
        doc_ref = db.collection("categories").document(str(category["id"]))
        batch.set(doc_ref, category)
    batch.commit()


def seed_items(db: firestore.Client, items: Iterable[ItemPayload]) -> None:
    batch = db.batch()
    for item in items:
        doc_ref = db.collection("items").document(str(item["id"]))
        batch.set(doc_ref, item)
    batch.commit()


def seed_warehouse_map(db: firestore.Client, warehouse_map: WarehouseMap) -> None:
    payload = {
        "name": warehouse_map.name,
        "image_url": str(warehouse_map.image_url) if warehouse_map.image_url else None,
        "image_width": warehouse_map.image_width,
        "image_height": warehouse_map.image_height,
        "areas": [area.model_dump(mode="python") for area in warehouse_map.areas],
        "created_at": warehouse_map.created_at,
        "updated_at": warehouse_map.updated_at,
    }
    db.collection("warehouse_maps").document(warehouse_map.id).set(payload)


def build_default_categories() -> list[CategoryPayload]:
    return [
        {
            "id": "cat-electronics",
            "name": "อิเล็กทรอนิกส์",
            "display_order": 1,
            "thumbnail_url": None,
            "active": True,
        },
        {
            "id": "cat-apparel",
            "name": "เครื่องแต่งกาย",
            "display_order": 2,
            "thumbnail_url": None,
            "active": True,
        },
        {
            "id": "cat-accessories",
            "name": "อุปกรณ์เสริม",
            "display_order": 3,
            "thumbnail_url": None,
            "active": True,
        },
    ]


def build_default_items() -> list[ItemPayload]:
    return [
        {
            "id": "item-iphone-15",
            "sku": "IP15-128GB-BLK",
            "name": "โทรศัพท์มือถือ iPhone 15",
            "description": "iPhone 15 128GB สีดำ",
            "category_id": "cat-electronics",
            "unit": "ชิ้น",
            "stock_on_hand": 12,
            "stock_reserved": 2,
            "tags": ["smartphone", "apple"],
            "active": True,
            "location_hint": "loc-a-01",
        },
        {
            "id": "item-tee-white",
            "sku": "SHIRT-M-WHT",
            "name": "เสื้อยืดคอกลม",
            "description": "เสื้อยืดสีขาว ไซส์ M",
            "category_id": "cat-apparel",
            "unit": "ชิ้น",
            "stock_on_hand": 180,
            "stock_reserved": 12,
            "tags": ["basic", "cotton"],
            "active": True,
            "location_hint": "loc-b-03",
        },
        {
            "id": "item-sony-headphones",
            "sku": "SONY-WH1000XM4",
            "name": "หูฟัง Sony WH-1000XM4",
            "description": "หูฟังไร้สาย Sony",
            "category_id": "cat-accessories",
            "unit": "ชิ้น",
            "stock_on_hand": 35,
            "stock_reserved": 5,
            "tags": ["audio", "bluetooth"],
            "active": True,
            "location_hint": "loc-b-07",
        },
    ]


def build_default_warehouse_map() -> WarehouseMap:
    now = datetime.now(timezone.utc)
    areas = [
        MapArea(
            id="area-loc-a-01",
            label="โซน A - ช่อง B1",
            location_id="loc-a-01",
            zone="A",
            allowed_item_ids=["item-iphone-15"],
            points=[0.12, 0.18, 0.28, 0.18, 0.28, 0.35, 0.12, 0.35],
        ),
        MapArea(
            id="area-loc-b-03",
            label="โซน B - ชั้น R2L3",
            location_id="loc-b-03",
            zone="B",
            allowed_item_ids=["item-tee-white"],
            points=[0.45, 0.20, 0.58, 0.20, 0.58, 0.36, 0.45, 0.36],
        ),
        MapArea(
            id="area-loc-b-07",
            label="โซน B - ชั้น R1L4",
            location_id="loc-b-07",
            zone="B",
            allowed_item_ids=["item-sony-headphones"],
            points=[0.63, 0.52, 0.78, 0.52, 0.78, 0.72, 0.63, 0.72],
        ),
    ]
    return WarehouseMap(
        id="wms-default-map",
        name="ผังคลังหลัก",
        image_url=None,
        image_width=1920,
        image_height=1080,
        areas=areas,
        created_at=now,
        updated_at=now,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Firestore with default data.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite documents even if they already exist.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = get_settings()
    db = get_firestore_client()

    repository = FirebaseRequestRepository(client=db)

    existing_categories = list(repository.list_categories())
    if existing_categories and not args.force:
        print("⚠️  Categories already exist; rerun with --force to overwrite.")
    else:
        seed_categories(db, build_default_categories())
        print("✅ Seeded categories.")

    existing_items = list(repository.list_items())
    if existing_items and not args.force:
        print("⚠️  Items already exist; rerun with --force to overwrite.")
    else:
        seed_items(db, build_default_items())
        print("✅ Seeded items.")

    map_ref = db.collection("warehouse_maps").document("wms-default-map").get()
    if map_ref.exists and not args.force:
        print("⚠️  Warehouse map already exists; rerun with --force to overwrite.")
    else:
        seed_warehouse_map(db, build_default_warehouse_map())
        print("✅ Seeded warehouse map.")

    print(f"Firestore project: {settings.firebase.project_id}")
    print("✨ Done.")


if __name__ == "__main__":
    main()
