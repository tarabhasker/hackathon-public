#!/usr/bin/env bash
# Start the backend stack (Postgres + FastAPI) on http://127.0.0.1:5001
#
#   ./run-backend.sh            -> start (rebuilds image only when needed)
#   ./run-backend.sh --build    -> force a rebuild first
#
# - Backend source is mounted, so edits hot-reload without rebuilding
# - Postgres data lives in the pgdata volume across restarts
# - Ports are published on 127.0.0.1 only, not your whole network
set -euo pipefail
cd "$(dirname "$0")"

STAMP=backend/.docker-build-stamp

needs_build() {
  [[ "${1:-}" == "--build" ]] && return 0
  docker image inspect hackathon-backend >/dev/null 2>&1 || return 0
  [[ ! -f "$STAMP" ]] && return 0
  [[ backend/Dockerfile -nt "$STAMP" || backend/requirements.txt -nt "$STAMP" ]] && return 0
  return 1
}

if needs_build "${1:-}"; then
  echo "==> Building Docker image..."
  docker compose build backend
  touch "$STAMP"
else
  echo "==> Image up to date, skipping build (force with: ./run-backend.sh --build)"
fi

echo "==> Starting Postgres + backend on http://127.0.0.1:5001 (Ctrl+C to stop)"
exec docker compose up backend
