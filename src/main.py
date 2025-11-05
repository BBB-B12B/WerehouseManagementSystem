from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.inventory.routers import picking_queue, qr_transactions, warehouse_maps
from src.logistics.routers import work_orders
from src.requests.routers import catalog, request
from src.shared.config import Settings, get_settings
from src.shared.logging import configure_logging, log_event
from src.shared.routers import storage


def create_app() -> FastAPI:
    """สร้างอินสแตนซ์ FastAPI พร้อมตั้งค่าพื้นฐาน."""
    logger = configure_logging()
    app = FastAPI(title="WMS Material Request API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(catalog.router, prefix="/api")
    app.include_router(request.router, prefix="/api")
    app.include_router(picking_queue.router, prefix="/api")
    app.include_router(qr_transactions.router, prefix="/api")
    app.include_router(warehouse_maps.router, prefix="/api")
    app.include_router(work_orders.router, prefix="/api")
    app.include_router(storage.router, prefix="/api")

    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        settings: Settings = get_settings()
        log_event("health_check", {"project": settings.project_name})
        return {"status": "ok", "project": settings.project_name}

    return app


app = create_app()
