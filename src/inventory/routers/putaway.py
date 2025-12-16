from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.inventory.schemas.putaway import PutawayJobCreatePayload, PutawayJobUpdatePayload
from src.inventory.schemas.workflow import WorkflowJob, WorkflowStep
from src.inventory.services.workflow_repository import WorkflowBackendUnavailableError
from src.inventory.services.workflow_service import (
    WorkflowJobNotFoundError,
    WorkflowService,
    WorkflowValidationError,
    get_workflow_service,
)
from src.shared.auth import UserContext, require_roles

router = APIRouter(prefix="/inventory/putaway", tags=["inventory"])


@router.get("/jobs", response_model=list[WorkflowJob])
async def list_putaway_jobs(
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WorkflowService = Depends(get_workflow_service),
) -> list[WorkflowJob]:
    try:
        return service.list_jobs(WorkflowStep.PUTAWAY)
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานจัดเก็บได้ กรุณาลองใหม่ภายหลัง",
        ) from exc


@router.post("/jobs", response_model=WorkflowJob, status_code=status.HTTP_201_CREATED)
async def create_putaway_job(
    payload: PutawayJobCreatePayload,
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WorkflowService = Depends(get_workflow_service),
) -> WorkflowJob:
    try:
        return service.create_putaway_job(payload)
    except WorkflowJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานจัดเก็บได้ กรุณาลองใหม่ภายหลัง",
        ) from exc


@router.put("/jobs/{job_id}", response_model=WorkflowJob)
async def update_putaway_job(
    job_id: str,
    payload: PutawayJobUpdatePayload,
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WorkflowService = Depends(get_workflow_service),
) -> WorkflowJob:
    try:
        return service.update_putaway_job(job_id, payload)
    except WorkflowJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานจัดเก็บได้ กรุณาลองใหม่ภายหลัง",
        ) from exc


@router.delete("/jobs/{job_id}/movements/{movement_id}", response_model=WorkflowJob)
async def delete_putaway_movement(
    job_id: str,
    movement_id: str,
    _: UserContext = Depends(require_roles("admin")),
    service: WorkflowService = Depends(get_workflow_service),
) -> WorkflowJob:
    try:
        return service.remove_putaway_movement(job_id, movement_id)
    except WorkflowJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานจัดเก็บได้ กรุณาลองใหม่ภายหลัง",
        ) from exc
