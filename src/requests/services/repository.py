from __future__ import annotations

import uuid
from datetime import datetime, timezone
import logging
from typing import Optional, Protocol, Sequence

import json
from pathlib import Path
from urllib.parse import urlparse

from google.api_core import exceptions as google_exceptions
from google.cloud import firestore

from src.requests.schemas.catalog import Category, Item, ItemCreate, ItemUpdate
from src.requests.schemas.request import (
    Attachment,
    Request,
    RequestCreate,
    RequestLine,
    RequestLineCreate,
    RequestStatus,
)
from src.shared.config import get_settings
from src.shared.firebase.client import get_firestore_client
from src.shared.storage.r2_client import CloudflareR2Client, get_r2_client


class RequestRepository(Protocol):
    """สัญญา repository สำหรับจัดการข้อมูลคำร้องและแคตตาล็อก."""

    def list_categories(self) -> list[Category]:
        ...

    def list_items(
        self, *, category_id: Optional[str] = None, search: Optional[str] = None
    ) -> list[Item]:
        ...

    def create_request(self, payload: RequestCreate) -> Request:
        ...

    def list_requests_by_status(self, statuses: Sequence[RequestStatus]) -> list[Request]:
        ...

    def create_item(self, payload: ItemCreate) -> Item:
        ...

    def update_item(self, item_id: str, payload: ItemUpdate) -> Item:
        ...

    def delete_item(self, item_id: str) -> None:
        ...


class FirebaseRequestRepository:
    """repository ที่ทำงานกับ Firebase Firestore."""

    def __init__(
        self,
        client: Optional[firestore.Client] = None,
        storage_client: Optional[CloudflareR2Client] = None,
    ) -> None:
        self._client = client or get_firestore_client()
        self._storage = storage_client or get_r2_client()

    @property
    def categories_collection(self) -> firestore.CollectionReference:
        return self._client.collection("categories")

    @property
    def items_collection(self) -> firestore.CollectionReference:
        return self._client.collection("items")

    @property
    def requests_collection(self) -> firestore.CollectionReference:
        return self._client.collection("requests")

    def list_categories(self) -> list[Category]:
        docs = self.categories_collection.where("active", "==", True).stream()
        categories: list[Category] = []
        for doc in docs:
            data = doc.to_dict()
            categories.append(
                Category(
                    id=doc.id,
                    name=data.get("name", ""),
                    parent_id=data.get("parent_id"),
                    display_order=int(data.get("display_order", 0)),
                    thumbnail_url=data.get("thumbnail_url"),
                    active=bool(data.get("active", True)),
                )
            )
        categories.sort(key=lambda c: (c.display_order, c.name))
        return categories

    def list_items(
        self, *, category_id: Optional[str] = None, search: Optional[str] = None
    ) -> list[Item]:
        query: firestore.Query = self.items_collection.where("active", "==", True)
        if category_id:
            query = query.where("category_id", "==", category_id)

        items: list[Item] = []
        try:
            documents = list(query.stream(retry=None, timeout=5))
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            logging.warning("ไม่สามารถเชื่อม Firestore ได้ ข้ามไปใช้ข้อมูลสำรอง (%s)", exc)
            return self._load_local_items(search=search, category_id=category_id)

        for doc in documents:
            data = doc.to_dict()
            if search:
                keyword = search.lower()
                searchable = f"{data.get('name', '')} {data.get('sku', '')} {' '.join(data.get('tags', []))}"
                if keyword not in searchable.lower():
                    continue
            items.append(
                Item(
                    id=doc.id,
                    sku=data.get("sku", ""),
                    name=data.get("name", ""),
                    description=data.get("description"),
                    category_id=data.get("category_id", ""),
                    unit=data.get("unit", "ชิ้น"),
                    stock_on_hand=int(data.get("stock_on_hand", 0)),
                    stock_reserved=int(data.get("stock_reserved", 0)),
                    image_url=data.get("image_url"),
                    tags=list(data.get("tags", [])),
                    location_hint=data.get("location_hint"),
                    package_width_cm=self._safe_positive_float(data.get("package_width_cm")),
                    package_depth_cm=self._safe_positive_float(data.get("package_depth_cm")),
                    package_height_cm=self._safe_positive_float(data.get("package_height_cm")),
                    package_volume_cm3=self._safe_positive_float(data.get("package_volume_cm3")),
                )
            )
        items.sort(key=lambda item: item.name)
        return items

    def create_request(self, payload: RequestCreate) -> Request:
        batch = self._client.batch()
        request_ref = self.requests_collection.document()

        now = datetime.now(timezone.utc)
        request_data = {
            "requester_id": payload.requester_id,
            "requester_name": payload.requester_name,
            "department": payload.department,
            "required_date": payload.required_date.isoformat(),
            "status": RequestStatus.PENDING_REVIEW.value,
            "note": payload.note,
            "attachments": [attachment.model_dump() for attachment in payload.attachments],
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        batch.set(request_ref, request_data)

        lines: list[RequestLine] = []
        for line in payload.items:
            line_id = uuid.uuid4().hex
            line_ref = request_ref.collection("lines").document(line_id)
            line_data = _build_line_data(line)
            batch.set(line_ref, line_data)
            lines.append(
                RequestLine(
                    id=line_id,
                    item_id=line.item_id,
                    quantity_requested=line.quantity,
                    quantity_approved=0,
                    quantity_picked=0,
                    note=line.note,
                )
            )

        batch.commit()
        return Request(
            id=request_ref.id,
            requester_id=payload.requester_id,
            requester_name=payload.requester_name,
            department=payload.department,
            required_date=payload.required_date,
            status=RequestStatus.PENDING_REVIEW,
            items=lines,
            attachments=payload.attachments,
            note=payload.note,
            created_at=now,
            updated_at=now,
        )

    def list_requests_by_status(self, statuses: Sequence[RequestStatus]) -> list[Request]:
        status_values = [status.value for status in statuses]
        docs = self.requests_collection.where("status", "in", status_values).stream()
        requests: list[Request] = []
        for doc in docs:
            data = doc.to_dict()
            request_lines = []
            lines_collection = doc.reference.collection("lines").stream()
            for line_doc in lines_collection:
                line_data = line_doc.to_dict()
                request_lines.append(
                    RequestLine(
                        id=line_doc.id,
                        item_id=line_data.get("item_id", ""),
                        quantity_requested=int(line_data.get("quantity_requested", 0)),
                        quantity_approved=int(line_data.get("quantity_approved", 0)),
                        quantity_picked=int(line_data.get("quantity_picked", 0)),
                        note=line_data.get("note"),
                    )
                )
            requests.append(
                Request(
                    id=doc.id,
                    requester_id=data.get("requester_id", ""),
                    requester_name=data.get("requester_name", ""),
                    department=data.get("department", ""),
                    required_date=datetime.fromisoformat(
                        data.get("required_date", datetime.now(timezone.utc).isoformat())
                    ).date(),
                    status=RequestStatus(data.get("status", RequestStatus.PENDING_REVIEW.value)),
                    items=request_lines,
                    attachments=[Attachment(**attachment) for attachment in data.get("attachments", [])],
                    note=data.get("note"),
                    created_at=datetime.fromisoformat(data.get("created_at", datetime.now(timezone.utc).isoformat())),
                    updated_at=datetime.fromisoformat(data.get("updated_at", datetime.now(timezone.utc).isoformat())),
                )
            )
        return requests

    def _load_local_items(
        self, *, search: Optional[str] = None, category_id: Optional[str] = None
    ) -> list[Item]:
        fallback_path = Path("config/catalog_items.sample.json")
        if not fallback_path.exists():
            logging.warning("ไม่มีไฟล์รายการสินค้าสำรองที่ %s", fallback_path)
            return []

        try:
            with fallback_path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            logging.error("อ่านไฟล์ catalog sample ไม่สำเร็จ: %s", exc)
            return []

        results: list[Item] = []
        for entry in payload:
            try:
                item = Item(**entry)
            except Exception as exc:  # pydantic validation error
                logging.warning("ข้ามข้อมูลสินค้าไม่ถูกต้องจาก sample: %s", exc)
                continue
            if category_id and item.category_id != category_id:
                continue
            if search:
                keyword = search.lower()
                searchable = f"{item.name} {item.sku} {' '.join(item.tags)}"
                if keyword not in searchable.lower():
                    continue
            results.append(item)
        results.sort(key=lambda item: item.name)
        return results

    def create_item(self, payload: ItemCreate) -> Item:
        doc_ref = self.items_collection.document()
        package_data = self._prepare_package_document(
            width=payload.package_width_cm,
            depth=payload.package_depth_cm,
            height=payload.package_height_cm,
            volume=payload.package_volume_cm3,
        )
        data = {
            "sku": payload.sku,
            "name": payload.name,
            "description": payload.description,
            "category_id": payload.category_id,
            "unit": payload.unit,
            "stock_on_hand": payload.stock_on_hand,
            "stock_reserved": payload.stock_reserved,
            "tags": payload.tags,
            "image_url": str(payload.image_url) if payload.image_url else None,
            "location_hint": payload.location_hint,
            "active": payload.active,
        }
        data.update(package_data)
        doc_ref.set(data)
        return Item(id=doc_ref.id, **data)

    def update_item(self, item_id: str, payload: ItemUpdate) -> Item:
        doc_ref = self.items_collection.document(item_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            raise ValueError("ไม่พบสินค้า")
        update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
        if "image_url" in update_data and update_data["image_url"] is not None:
            update_data["image_url"] = str(update_data["image_url"])
        current_data = snapshot.to_dict() or {}
        previous_image = current_data.get("image_url")
        current_data.pop("id", None)
        if "stock_reserved" in update_data:
            stock_on_hand = update_data.get("stock_on_hand", current_data.get("stock_on_hand", 0))
            if update_data["stock_reserved"] > stock_on_hand:
                raise ValueError("stock_reserved ต้องไม่เกิน stock_on_hand")
        self._apply_package_updates(update_data, current_data)
        doc_ref.update(update_data)
        current_data.update(update_data)
        if "image_url" in update_data and previous_image and update_data.get("image_url") != previous_image:
            self._delete_image(previous_image)
        return Item(id=item_id, **current_data)

    def delete_item(self, item_id: str) -> None:
        doc_ref = self.items_collection.document(item_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            raise ValueError("ไม่พบสินค้า")
        doc_ref.delete()
        data = snapshot.to_dict() or {}
        image_url = data.get("image_url")
        if image_url:
            self._delete_image(image_url)

    def _delete_image(self, image_url: Optional[str]) -> None:
        key = self._extract_key(image_url)
        if not key:
            return
        try:
            self._storage.delete_object(key)
        except Exception:
            logging.warning("ลบไฟล์ %s จาก R2 ไม่สำเร็จ", key, exc_info=True)

    def _extract_key(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        text = str(value).strip()
        if not text:
            return None
        parsed = urlparse(text)
        if parsed.scheme and parsed.netloc:
            path = parsed.path.lstrip("/")
            bucket_prefix = f"{self._storage.bucket_name}/"
            if path.startswith(bucket_prefix):
                return path[len(bucket_prefix) :]
            return path or None
        return text.lstrip("/")

    def _safe_positive_float(self, value: Optional[object]) -> Optional[float]:
        if value is None:
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        return round(numeric, 4) if numeric > 0 else None

    def _prepare_package_document(
        self,
        *,
        width: Optional[float],
        depth: Optional[float],
        height: Optional[float],
        volume: Optional[float],
    ) -> dict[str, Optional[float]]:
        normalized_width = self._safe_positive_float(width)
        normalized_depth = self._safe_positive_float(depth)
        normalized_height = self._safe_positive_float(height)
        normalized_volume = self._safe_positive_float(volume)
        computed_volume = self._calculate_volume(normalized_width, normalized_depth, normalized_height)
        if computed_volume is not None:
            normalized_volume = computed_volume
        return {
            "package_width_cm": normalized_width,
            "package_depth_cm": normalized_depth,
            "package_height_cm": normalized_height,
            "package_volume_cm3": normalized_volume,
        }

    def _apply_package_updates(
        self,
        update_data: dict[str, object],
        current_data: dict[str, object],
    ) -> None:
        fields = ("package_width_cm", "package_depth_cm", "package_height_cm")
        dims_changed = any(field in update_data for field in fields)
        volume_changed = "package_volume_cm3" in update_data
        if not dims_changed and not volume_changed:
            return
        resolved = self._prepare_package_document(
            width=update_data.get("package_width_cm")
            if "package_width_cm" in update_data
            else current_data.get("package_width_cm"),
            depth=update_data.get("package_depth_cm")
            if "package_depth_cm" in update_data
            else current_data.get("package_depth_cm"),
            height=update_data.get("package_height_cm")
            if "package_height_cm" in update_data
            else current_data.get("package_height_cm"),
            volume=update_data.get("package_volume_cm3")
            if volume_changed
            else current_data.get("package_volume_cm3"),
        )
        for field in fields:
            if field in update_data:
                update_data[field] = resolved[field]
        if dims_changed or volume_changed:
            update_data["package_volume_cm3"] = resolved["package_volume_cm3"]

    def _calculate_volume(
        self,
        width: Optional[float],
        depth: Optional[float],
        height: Optional[float],
    ) -> Optional[float]:
        if width is None or depth is None or height is None:
            return None
        volume = width * depth * height
        if volume <= 0:
            return None
        return round(volume, 2)


class InMemoryRequestRepository:
    """ตัวเลือกสำหรับ development/test เพื่อหลีกเลี่ยงการเชื่อม Firebase จริง."""

    def __init__(self) -> None:
        self._categories: dict[str, Category] = {}
        self._items: dict[str, Item] = {}
        self._requests: dict[str, Request] = {}
        self._seed_catalog()

    def _seed_catalog(self) -> None:
        cat_tools = Category(id="cat-tools", name="อุปกรณ์เครื่องมือ", display_order=1)
        cat_consumable = Category(id="cat-consumable", name="วัสดุสิ้นเปลือง", display_order=2)
        self._categories[cat_tools.id] = cat_tools
        self._categories[cat_consumable.id] = cat_consumable

        demo_items = [
            Item(
                id="itm-drill",
                sku="DRL-001",
                name="สว่านกระแทกไร้สาย",
                description="แบตเตอรี่ 18V พร้อมกระเป๋า",
                category_id=cat_tools.id,
                unit="ชุด",
                stock_on_hand=5,
                stock_reserved=1,
                image_url=None,
                tags=["สว่าน", "ไร้สาย"],
                location_hint="โซน A ชั้น 2",
            ),
            Item(
                id="itm-helmet",
                sku="HLM-010",
                name="หมวกนิรภัยมาตรฐาน",
                description=None,
                category_id=cat_consumable.id,
                unit="ใบ",
                stock_on_hand=120,
                stock_reserved=10,
                image_url=None,
                tags=["PPE"],
                location_hint="โซน B ชั้น 1",
            ),
        ]

        for item in demo_items:
            self._items[item.id] = item

    def list_categories(self) -> list[Category]:
        return sorted(self._categories.values(), key=lambda c: (c.display_order, c.name))

    def list_items(
        self, *, category_id: Optional[str] = None, search: Optional[str] = None
    ) -> list[Item]:
        items = list(self._items.values())
        if category_id:
            items = [item for item in items if item.category_id == category_id]
        if search:
            keyword = search.lower()
            items = [
                item
                for item in items
                if keyword in item.name.lower()
                or keyword in item.sku.lower()
                or any(keyword in tag.lower() for tag in item.tags)
            ]
        return sorted(items, key=lambda item: item.name)

    def create_request(self, payload: RequestCreate) -> Request:
        now = datetime.now(timezone.utc)
        request_id = uuid.uuid4().hex

        lines = [
            RequestLine(
                id=uuid.uuid4().hex,
                item_id=line.item_id,
                quantity_requested=line.quantity,
                quantity_approved=0,
                quantity_picked=0,
                note=line.note,
            )
            for line in payload.items
        ]

        request = Request(
            id=request_id,
            requester_id=payload.requester_id,
            requester_name=payload.requester_name,
            department=payload.department,
            required_date=payload.required_date,
            status=RequestStatus.PENDING_REVIEW,
            items=lines,
            attachments=payload.attachments,
            note=payload.note,
            created_at=now,
            updated_at=now,
        )
        self._requests[request_id] = request
        return request

    def list_requests_by_status(self, statuses: Sequence[RequestStatus]) -> list[Request]:
        status_set = set(statuses)
        return [request for request in self._requests.values() if request.status in status_set]

    def create_item(self, payload: ItemCreate) -> Item:
        item_id = uuid.uuid4().hex
        item = Item(
            id=item_id,
            sku=payload.sku,
            name=payload.name,
            description=payload.description,
            category_id=payload.category_id,
            unit=payload.unit,
            stock_on_hand=payload.stock_on_hand,
            stock_reserved=payload.stock_reserved,
            image_url=str(payload.image_url) if payload.image_url else None,
            tags=payload.tags,
            location_hint=payload.location_hint,
            active=payload.active,
            package_width_cm=payload.package_width_cm,
            package_depth_cm=payload.package_depth_cm,
            package_height_cm=payload.package_height_cm,
            package_volume_cm3=payload.package_volume_cm3,
        )
        self._items[item_id] = item
        return item

    def update_item(self, item_id: str, payload: ItemUpdate) -> Item:
        item = self._items.get(item_id)
        if not item:
            raise ValueError("ไม่พบสินค้า")
        data = item.model_dump()
        updates = payload.model_dump(exclude_unset=True)
        if "stock_reserved" in updates:
            stock_on_hand = updates.get("stock_on_hand", data["stock_on_hand"])
            if updates["stock_reserved"] > stock_on_hand:
                raise ValueError("stock_reserved ต้องไม่เกิน stock_on_hand")
        if "image_url" in updates and updates["image_url"] is not None:
            updates["image_url"] = str(updates["image_url"])
        data.update(updates)
        updated = Item(**data)
        self._items[item_id] = updated
        return updated

    def delete_item(self, item_id: str) -> None:
        if item_id not in self._items:
            raise ValueError("ไม่พบสินค้า")
        self._items.pop(item_id)


def _build_line_data(line: RequestLineCreate) -> dict:
    return {
        "item_id": line.item_id,
        "quantity_requested": line.quantity,
        "quantity_approved": 0,
        "quantity_picked": 0,
        "note": line.note,
    }


_DEFAULT_REPO: Optional[RequestRepository] = None
_LOGGER = logging.getLogger(__name__)


def get_request_repository() -> RequestRepository:
    """เลือก repository ตาม environment (Firebase สำหรับ production, in-memory สำหรับ local)."""

    global _DEFAULT_REPO
    if _DEFAULT_REPO is not None:
        return _DEFAULT_REPO

    settings = get_settings()
    if settings.environment == "local":
        _DEFAULT_REPO = InMemoryRequestRepository()
    else:
        try:
            _DEFAULT_REPO = FirebaseRequestRepository()
        except Exception as exc:  # pragma: no cover - เน้น fallback runtime
            _LOGGER.warning(
                "เชื่อม Firebase Firestore ไม่สำเร็จ (%s) – ใช้คลังข้อมูลในหน่วยความจำแทนชั่วคราว",
                exc,
            )
            _DEFAULT_REPO = InMemoryRequestRepository()
    return _DEFAULT_REPO
