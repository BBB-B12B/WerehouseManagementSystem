from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.inventory.schemas.workflow import (
    WorkflowJobCreate,
    WorkflowJobUpdate,
    WorkflowLineCreate,
    WorkflowLineUpdate,
    WorkflowStep,
)
from src.inventory.services import workflow_repository as repo_module


def _build_line_create(sku: str = "SKU-001") -> WorkflowLineCreate:
    return WorkflowLineCreate(
        item_id=f"item-{sku}",
        sku=sku,
        name=f"Item {sku}",
        unit="ชิ้น",
        quantity_expected=5,
    )


def test_inmemory_repository_can_create_and_list_jobs() -> None:
    repo = repo_module.InMemoryWorkflowRepository()
    job = repo.create_job(WorkflowStep.RECEIVING, WorkflowJobCreate(lines=[_build_line_create()]))

    assert job.display_code.startswith("RD-")
    jobs = repo.list_jobs(WorkflowStep.RECEIVING)
    assert len(jobs) == 1
    assert jobs[0].id == job.id


def test_inmemory_repository_updates_existing_job() -> None:
    repo = repo_module.InMemoryWorkflowRepository()
    job = repo.create_job(WorkflowStep.RECEIVING, WorkflowJobCreate(lines=[_build_line_create()]))
    line = job.lines[0]

    payload = WorkflowJobUpdate(
        lines=[
            WorkflowLineUpdate(
                line_id=line.line_id,
                item_id=line.item_id,
                sku=line.sku,
                name=line.name,
                unit=line.unit,
                quantity_expected=line.quantity_expected,
                count_status="matched",
                counted_quantity=5,
            )
        ]
    )

    updated = repo.update_job(WorkflowStep.RECEIVING, job.id, payload)

    assert updated.updated_at > job.updated_at
    assert updated.lines[0].count_status == "matched"
    assert updated.lines[0].counted_quantity == 5


def test_inmemory_repository_delete_job() -> None:
    repo = repo_module.InMemoryWorkflowRepository()
    job = repo.create_job(WorkflowStep.RECEIVING, WorkflowJobCreate(lines=[_build_line_create()]))

    repo.delete_job(WorkflowStep.RECEIVING, job.id)

    assert repo.list_jobs(WorkflowStep.RECEIVING) == []


def test_get_workflow_repository_honors_prefer_in_memory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo_module, "_DEFAULT_REPOSITORY", None)
    monkeypatch.setattr(
        repo_module,
        "get_settings",
        lambda: SimpleNamespace(environment="local", workflow=SimpleNamespace(prefer_in_memory=True)),
    )

    repository = repo_module.get_workflow_repository()

    assert isinstance(repository, repo_module.InMemoryWorkflowRepository)


def test_get_workflow_repository_fallbacks_when_firestore_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repo_module, "_DEFAULT_REPOSITORY", None)
    monkeypatch.setattr(
        repo_module,
        "get_settings",
        lambda: SimpleNamespace(environment="production", workflow=SimpleNamespace(prefer_in_memory=False)),
    )

    class BrokenRepository:
        def __init__(self) -> None:
            raise RuntimeError("boom")

    monkeypatch.setattr(repo_module, "WorkflowRepository", BrokenRepository)

    repository = repo_module.get_workflow_repository()

    assert isinstance(repository, repo_module.InMemoryWorkflowRepository)
