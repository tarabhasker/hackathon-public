#!/usr/bin/env bash
# Start the FastAPI backend in Docker on http://127.0.0.1:5001
#
#   ./run-backend.sh            -> start (rebuilds image only when needed)
#   ./run-backend.sh --build    -> force a rebuild first
#
# - Source code is mounted, so edits hot-reload without rebuilding
# - SQLite DB lives in a named volume (hackathon-db) across restarts
# - Port is published on 127.0.0.1 only, not your whole network
set -euo pipefail
cd "$(dirname "$0")/backend"

IMAGE=hackathon-backend
STAMP=.docker-build-stamp

needs_build() {
  [[ "${1:-}" == "--build" ]] && return 0
  docker image inspect "$IMAGE" >/dev/null 2>&1 || return 0
  [[ ! -f "$STAMP" ]] && return 0
  [[ Dockerfile -nt "$STAMP" || requirements.txt -nt "$STAMP" ]] && return 0
  return 1
}

if needs_build "${1:-}"; then
  echo "==> Building Docker image..."
  docker build -t "$IMAGE" .
  touch "$STAMP"
else
  echo "==> Image up to date, skipping build (force with: ./run-backend.sh --build)"
fi

echo "==> Starting backend on http://127.0.0.1:5001 (Ctrl+C to stop)"
exec docker run --rm --name hackathon-backend -p 127.0.0.1:5001:5001 \
  -v "$PWD:/app" \
  -v hackathon-db:/data \
  -e DATABASE_PATH=/data/app.db \
  "$IMAGE" \
  sh -c "alembic upgrade head && exec uvicorn main:app --host 0.0.0.0 --port 5001 --reload"
