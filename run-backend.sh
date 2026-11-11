#!/usr/bin/env bash
# Start the FastAPI backend on http://127.0.0.1:5001
#
#   ./run-backend.sh            -> venv mode: creates/updates venv automatically
#   ./run-backend.sh --docker   -> Docker mode: builds image and runs container
set -euo pipefail
cd "$(dirname "$0")/backend"

if [[ "${1:-}" == "--docker" ]]; then
  echo "==> Building Docker image..."
  docker build -t hackathon-backend .
  echo "==> Starting container on http://127.0.0.1:5001 (Ctrl+C to stop)"
  # Named volume keeps the SQLite DB across container restarts
  exec docker run --rm -p 5001:5001 \
    -v hackathon-db:/data \
    -e DATABASE_PATH=/data/app.db \
    hackathon-backend
fi

# --- venv mode ---------------------------------------------------------------

if [[ ! -d venv ]]; then
  echo "==> Creating virtual environment..."
  python3 -m venv venv
fi

# Reinstall dependencies only when requirements.txt changed
STAMP=venv/.requirements-stamp
if [[ ! -f "$STAMP" || requirements.txt -nt "$STAMP" ]]; then
  echo "==> Installing dependencies..."
  ./venv/bin/pip install -q --disable-pip-version-check -r requirements.txt
  touch "$STAMP"
fi

echo "==> Starting backend on http://127.0.0.1:5001 (Ctrl+C to stop)"
exec ./venv/bin/uvicorn main:app --reload --port 5001
