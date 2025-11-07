from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.inventory.schemas.workflow import WorkflowJob, WorkflowJobCreate, WorkflowJobUpdate, WorkflowStep
from src.inventory.services.workflow_repository import WorkflowBackendUnavailableError
from src.inventory.services.workflow_service import WorkflowService, get_workflow_service
from src.shared.auth import UserContext, require_roles

router = APIRouter(prefix="/inventory/receiving", tags=["inventory"])


@router.get("/jobs", response_model=list[WorkflowJob])
async def list_receiving_jobs(
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WorkflowService = Depends(get_workflow_service),
) -> list[WorkflowJob]:
    try:
        return service.list_jobs(WorkflowStep.RECEIVING)
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานได้ กรุณาลองใหม่ภายหลัง",
        ) from exc


@router.post("/jobs", response_model=WorkflowJob, status_code=status.HTTP_201_CREATED)
async def create_receiving_job(
    payload: WorkflowJobCreate,
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WorkflowService = Depends(get_workflow_service),
) -> WorkflowJob:
    try:
        return service.create_job(WorkflowStep.RECEIVING, payload)
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานได้ กรุณาลองใหม่ภายหลัง",
        ) from exc


@router.put("/jobs/{job_id}", response_model=WorkflowJob)
async def update_receiving_job(
    job_id: str,
    payload: WorkflowJobUpdate,
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WorkflowService = Depends(get_workflow_service),
) -> WorkflowJob:
    try:
        return service.update_job(WorkflowStep.RECEIVING, job_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานได้ กรุณาลองใหม่ภายหลัง",
        ) from exc


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_receiving_job(
    job_id: str,
    _: UserContext = Depends(require_roles("admin", "store_clerk")),
    service: WorkflowService = Depends(get_workflow_service),
) -> None:
    try:
        service.delete_job(WorkflowStep.RECEIVING, job_id)
    except WorkflowBackendUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ไม่สามารถเชื่อมต่อฐานข้อมูลใบงานได้ กรุณาลองใหม่ภายหลัง",
        ) from exc
