#!/usr/bin/env bash
# Start the FastAPI backend in Docker on http://127.0.0.1:5001
#
# - Builds the image if needed
# - Mounts the source code, so edits hot-reload without rebuilding
# - Keeps the SQLite DB in a named volume (hackathon-db) across restarts
set -euo pipefail
cd "$(dirname "$0")/backend"

echo "==> Building Docker image..."
docker build -t hackathon-backend .

echo "==> Starting backend on http://127.0.0.1:5001 (Ctrl+C to stop)"
exec docker run --rm --name hackathon-backend -p 5001:5001 \
  -v "$PWD:/app" \
  -v hackathon-db:/data \
  -e DATABASE_PATH=/data/app.db \
  hackathon-backend \
  uvicorn main:app --host 0.0.0.0 --port 5001 --reload
