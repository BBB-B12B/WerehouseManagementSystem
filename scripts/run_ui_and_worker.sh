#!/usr/bin/env bash
set -euo pipefail

# Helper script to start the frontend UI and a data worker together.
# You can override the commands via environment variables:
#   FRONTEND_CMD="npm --prefix frontend run dev:https" WORKER_CMD="PYTHONPATH=. python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload" ./scripts/run_ui_and_worker.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FRONTEND_CMD=${FRONTEND_CMD:-"npm --prefix \"$ROOT_DIR/frontend\" run dev"}
WORKER_CMD=${WORKER_CMD:-"PYTHONPATH=\"$ROOT_DIR\" \"$ROOT_DIR/.venv/bin/uvicorn\" src.main:app --host 0.0.0.0 --port 8000 --reload"}

pids=()

cleanup() {
  echo "Shutting down processes..."
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

echo "Starting worker: ${WORKER_CMD}"
bash -c "$WORKER_CMD" &
pids+=($!)

echo "Starting frontend: ${FRONTEND_CMD}"
bash -c "$FRONTEND_CMD" &
pids+=($!)

echo "Both processes started. Press Ctrl+C to stop."

wait_for_any_exit() {
  while true; do
    for pid in "${pids[@]}"; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        wait "$pid" 2>/dev/null || true
        return
      fi
    done
    sleep 1
  done
}

wait_for_any_exit
