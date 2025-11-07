"""โมดูลโหลดค่าคอนฟิกกลางของระบบจากตัวแปรสภาพแวดล้อม."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class FirebaseSettings(BaseSettings):
    """ค่าตั้งต้นสำหรับเชื่อม Firebase Admin SDK."""

    project_id: str = Field(default="demo-project", alias="FIREBASE_PROJECT_ID")
    service_account_path: str = Field(default="config/firebase.template.json", alias="FIREBASE_CREDENTIALS")


class R2Settings(BaseSettings):
    """ค่าตั้งต้นสำหรับเชื่อม Cloudflare R2."""

    account_id: str = Field(default="demo-account", alias="R2_ACCOUNT_ID")
    access_key_id: str = Field(default="demo-access-key", alias="R2_ACCESS_KEY_ID")
    secret_access_key: str = Field(default="demo-secret", alias="R2_SECRET_ACCESS_KEY")
    bucket_name: str = Field(default="wms-material-assets", alias="R2_BUCKET_NAME")
    public_base_url: str = Field(default="https://example.r2.dev", alias="R2_PUBLIC_BASE_URL")
    signed_url_ttl: int = Field(default=3600, alias="R2_SIGNED_URL_TTL")


class WorkflowSettings(BaseSettings):
    """ค่าตั้งต้นสำหรับโครงสร้างเอกสารงานคลังสินค้า."""

    root_collection: str = Field(default="warehouse_workflows", alias="WORKFLOW_ROOT_COLLECTION")
    root_document: str = Field(default="document", alias="WORKFLOW_ROOT_DOCUMENT")
    prefer_in_memory: bool = Field(default=False, alias="WORKFLOW_PREFER_IN_MEMORY")


class Settings(BaseSettings):
    """ค่าคอนฟิกส่วนกลางของระบบ WMS."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["local", "staging", "production"] = Field(default="local", alias="APP_ENV")
    project_name: str = Field(default="WMS Material Request", alias="APP_NAME")

    firebase: FirebaseSettings = Field(default_factory=FirebaseSettings)
    r2: R2Settings = Field(default_factory=R2Settings)
    workflow: WorkflowSettings = Field(default_factory=WorkflowSettings)


@lru_cache
def get_settings() -> Settings:
    """คืนค่าคอนฟิกเดียวกันต่อเนื่องเพื่อลดค่าใช้จ่ายในการโหลด."""

    return Settings()
