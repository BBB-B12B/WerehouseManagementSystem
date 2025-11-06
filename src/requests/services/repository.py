from __future__ import annotations

import uuid
from datetime import datetime, timezone
import logging
from typing import Optional, Protocol, Sequence

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

    def __init__(self, client: Optional[firestore.Client] = None) -> None:
        self._client = client or get_firestore_client()

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
        docs = query.stream()

        items: list[Item] = []
        for doc in docs:
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

    def create_item(self, payload: ItemCreate) -> Item:
        doc_ref = self.items_collection.document()
        data = {
            "sku": payload.sku,
            "name": payload.name,
            "description": payload.description,
            "category_id": payload.category_id,
            "unit": payload.unit,
            "stock_on_hand": payload.stock_on_hand,
            "stock_reserved": payload.stock_reserved,
            "tags": payload.tags,
            "image_url": payload.image_url,
            "location_hint": payload.location_hint,
            "active": payload.active,
        }
        doc_ref.set(data)
        return Item(id=doc_ref.id, **data)

    def update_item(self, item_id: str, payload: ItemUpdate) -> Item:
        doc_ref = self.items_collection.document(item_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            raise ValueError("ไม่พบสินค้า")
        update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
        if "stock_reserved" in update_data:
            stock_on_hand = update_data.get("stock_on_hand", snapshot.get("stock_on_hand", 0))
            if update_data["stock_reserved"] > stock_on_hand:
                raise ValueError("stock_reserved ต้องไม่เกิน stock_on_hand")
        doc_ref.update(update_data)
        final_data = snapshot.to_dict() or {}
        final_data.update(update_data)
        return Item(id=item_id, **final_data)

    def delete_item(self, item_id: str) -> None:
        doc_ref = self.items_collection.document(item_id)
        if not doc_ref.get().exists:
            raise ValueError("ไม่พบสินค้า")
        doc_ref.delete()


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
            image_url=payload.image_url,
            tags=payload.tags,
            location_hint=payload.location_hint,
            active=payload.active,
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
