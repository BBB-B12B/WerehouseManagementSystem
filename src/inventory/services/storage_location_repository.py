from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from google.api_core import exceptions as google_exceptions
from google.cloud import firestore

from src.inventory.schemas.location import (
    StorageLocation,
    StorageLocationCreate,
    StorageLocationUpdate,
)
from src.shared.firebase.client import get_firestore_client


class StorageLocationRepositoryError(RuntimeError):
    """ข้อผิดพลาดจาก repository ของ Storage Location."""


class FirestoreStorageLocationRepository:
    def __init__(self, client: Optional[firestore.Client] = None) -> None:
        self._client = client or get_firestore_client()
        self._collection = self._client.collection("locations")

    def list_locations(self) -> list[StorageLocation]:
        try:
            docs = self._collection.order_by("zone").stream()
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise StorageLocationRepositoryError("firestore_unavailable") from exc
        return [self._document_to_location(doc) for doc in docs]

    def create_location(self, payload: StorageLocationCreate) -> StorageLocation:
        now = datetime.now(timezone.utc)
        data = self._serialize_payload(payload)
        data["created_at"] = now
        data["updated_at"] = now
        data["used_volume_cm3"] = 0.0
        try:
            doc_ref = self._collection.document()
            doc_ref.set(data)
            return StorageLocation(id=doc_ref.id, **data)
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise StorageLocationRepositoryError("firestore_unavailable") from exc

    def update_location(self, location_id: str, payload: StorageLocationUpdate) -> StorageLocation:
        doc_ref = self._collection.document(location_id)
        try:
            snapshot = doc_ref.get()
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise StorageLocationRepositoryError("firestore_unavailable") from exc
        if not snapshot.exists:
            raise ValueError("ไม่พบตำแหน่งจัดเก็บที่ต้องการอัปเดต")
        existing = snapshot.to_dict() or {}
        updates = self._serialize_payload(payload, partial=True)
        updates["updated_at"] = datetime.now(timezone.utc)
        try:
            doc_ref.set(updates, merge=True)
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise StorageLocationRepositoryError("firestore_unavailable") from exc
        merged = {**existing, **updates}
        return StorageLocation(id=location_id, **merged)

    def delete_location(self, location_id: str) -> None:
        doc_ref = self._collection.document(location_id)
        try:
            doc_ref.delete()
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise StorageLocationRepositoryError("firestore_unavailable") from exc

    def adjust_used_volume(self, location_id: str, delta_cm3: float) -> None:
        if delta_cm3 == 0:
            return
        doc_ref = self._collection.document(location_id)
        transaction = self._client.transaction()

        @firestore.transactional
        def _txn(tx: firestore.Transaction) -> None:
            snapshot = doc_ref.get(transaction=tx)
            if not snapshot.exists:
                raise StorageLocationRepositoryError("location_not_found")
            data = snapshot.to_dict() or {}
            current_value = self._parse_optional_float(data.get("used_volume_cm3")) or 0.0
            next_value = max(0.0, round(current_value + delta_cm3, 2))
            tx.update(
                doc_ref,
                {
                    "used_volume_cm3": next_value,
                    "updated_at": datetime.now(timezone.utc),
                },
            )

        try:
            _txn(transaction)
        except StorageLocationRepositoryError:
            raise
        except (google_exceptions.GoogleAPICallError, google_exceptions.RetryError) as exc:
            raise StorageLocationRepositoryError("firestore_unavailable") from exc

    def _serialize_payload(
        self,
        payload: StorageLocationCreate | StorageLocationUpdate,
        *,
        partial: bool = False,
    ) -> dict:
        data = payload.model_dump(exclude_unset=partial)
        return data

    def _document_to_location(self, snapshot: firestore.DocumentSnapshot) -> StorageLocation:
        data = snapshot.to_dict() or {}
        created_at = self._normalize_datetime(data.get("created_at"))
        updated_at = self._normalize_datetime(data.get("updated_at"))
        return StorageLocation(
            id=snapshot.id,
            name=str(data.get("name", "")),
            building=data.get("building"),
            zone=str(data.get("zone", "")),
            aisle=data.get("aisle"),
            rack=str(data.get("rack", "")),
            level=str(data.get("level", "")),
            bin=data.get("bin"),
            code=str(data.get("code", "")),
            capacity=int(data.get("capacity", 0)),
            note=data.get("note"),
            width_cm=self._parse_optional_int(data.get("width_cm")),
            depth_cm=self._parse_optional_int(data.get("depth_cm")),
            height_cm=self._parse_optional_int(data.get("height_cm")),
            allowed_item_ids=self._parse_allowed_item_ids(data.get("allowed_item_ids")),
            created_at=created_at,
            updated_at=updated_at,
            used_volume_cm3=self._parse_optional_float(data.get("used_volume_cm3")) or 0.0,
        )

    def _normalize_datetime(self, value: object) -> datetime:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        return datetime.now(timezone.utc)

    def _parse_optional_int(self, value: object) -> Optional[int]:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _parse_optional_float(self, value: object) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _parse_allowed_item_ids(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        items: list[str] = []
        for entry in value:
            if isinstance(entry, str) and entry.strip():
                items.append(entry.strip())
        return items


def get_storage_location_repository() -> FirestoreStorageLocationRepository:
    return FirestoreStorageLocationRepository()
