# Repository Guidelines

## Project Structure & Module Organization
- `specs/` holds feature folders (`specs/003-receiving-audit`); keep `spec.md`, `plan.md`, `tasks.md` in sync before coding.
- Implementation modules belong in `src/<domain>/` (inventory, fulfillment, billing) with routers, services, and schemas split per package.
- Mirror the layout in `tests/` (`tests/unit`, `tests/integration`, `tests/contract`) so fixtures match the code they exercise.
- Workflow automation lives in `.specify/scripts`; agent prompts live in `.codex/prompts`; touch them only when the workflow changes.

## Build, Test, and Development Commands
- `./.specify/scripts/bash/create-new-feature.sh "Add receiving audit"` scaffolds the next `specs/` directory and branch slug.
- `./.specify/scripts/bash/check-prerequisites.sh --json --require-tasks` confirms plan/tasks exist before you start implementation.
- Create a venv (`python3 -m venv .venv && source .venv/bin/activate`) and install deps via `pip install -r requirements.txt`.
- Run `pytest --maxfail=1 --disable-warnings -q`; use `coverage run -m pytest` before pushing to track metrics.

## Coding Style & Naming Conventions
- Target Python 3.11+, four-space indentation, and type hints on public functions; prefer dataclasses for plain data objects.
- Format with `black` and `isort`; lint with `ruff check src tests`; run `mypy src tests` when you add new modules.
- Use `snake_case` for files, functions, and variables; `PascalCase` for classes; `UPPER_SNAKE_CASE` for constants and feature flags.

## Testing Guidelines
- Keep unit suites in `tests/unit/`, integration journeys in `tests/integration/`, and contract checks in `tests/contract/` mirroring API specs.
- Name files `test_<feature>.py` and functions `test_<behavior>`; parametrize acceptance criteria lifted from `spec.md`.
- Maintain ≥85% statement coverage; log exceptions and manual steps inside `specs/<id>/plan.md` and `quickstart.md`.

## Commit & Pull Request Guidelines
- History is sparse; adopt Conventional Commits (`feat`, `fix`, `chore`, `docs`) e.g. `feat(inventory): add cycle count adjustments`.
- Scope each branch to one prioritized user story and reference the matching `specs/###-short-name` folder in the PR template.
- PR descriptions must list validation commands, schema or data migrations, and screenshots or sample payloads for API/UI changes.

## Agent Workflow Notes
- Run `./.specify/scripts/bash/update-agent-context.sh` after editing specs so agents pull the latest context.
- If governance changes, update `.specify/memory/constitution.md` and flag the revision in the PR.
