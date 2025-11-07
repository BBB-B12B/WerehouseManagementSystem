from __future__ import annotations

from functools import lru_cache
from typing import List

from src.inventory.schemas.workflow import (
    WorkflowJob,
    WorkflowJobCreate,
    WorkflowJobUpdate,
    WorkflowStep,
)
from src.inventory.services.workflow_repository import WorkflowRepositoryProtocol, get_workflow_repository


class WorkflowService:
    def __init__(self, repository: WorkflowRepositoryProtocol) -> None:
        self._repository = repository

    def list_jobs(self, step: WorkflowStep) -> List[WorkflowJob]:
        return self._repository.list_jobs(step)

    def create_job(self, step: WorkflowStep, payload: WorkflowJobCreate) -> WorkflowJob:
        return self._repository.create_job(step, payload)

    def update_job(self, step: WorkflowStep, job_id: str, payload: WorkflowJobUpdate) -> WorkflowJob:
        return self._repository.update_job(step, job_id, payload)

    def delete_job(self, step: WorkflowStep, job_id: str) -> None:
        self._repository.delete_job(step, job_id)


@lru_cache
def get_workflow_service() -> WorkflowService:
    return WorkflowService(repository=get_workflow_repository())
