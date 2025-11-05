#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

declare -a RESOURCE_FORK_CANDIDATES=(
  "$ROOT_DIR/._README.md"
  "$ROOT_DIR/._.dockerignore"
  "$ROOT_DIR/._docker-compose.yml"
  "$ROOT_DIR/frontend/._Dockerfile"
)

while IFS= read -r -d '' path; do
  RESOURCE_FORK_CANDIDATES+=("$path")
done < <(find "$ROOT_DIR" -maxdepth 2 -name '._*' -print0 2>/dev/null)

declare -a RESOURCE_FORK_TARGETS=()
for candidate in "${RESOURCE_FORK_CANDIDATES[@]}"; do
  if [ -e "$candidate" ]; then
    RESOURCE_FORK_TARGETS+=("$candidate")
  fi
done

if [ "${#RESOURCE_FORK_TARGETS[@]}" -gt 0 ]; then
  if [ "$EUID" -ne 0 ]; then
    echo "Requesting sudo to purge macOS resource forks before composing..." >&2
    sudo -v
  fi

  for fork in "${RESOURCE_FORK_TARGETS[@]}"; do
    sudo chflags nouchg,noschg "$fork" 2>/dev/null || true
    sudo xattr -c "$fork" 2>/dev/null || true
    sudo rm -f "$fork" || true
    echo "Removed resource fork: ${fork#$ROOT_DIR/}" >&2
  done
fi

exec docker compose "$@"
