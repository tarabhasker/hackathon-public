#!/usr/bin/env bash
# Create a new (empty) Alembic migration file to fill in by hand:
#
#   ./new-migration.sh "add priority column to items"
#
# Runs inside the backend Docker image, so no local Python setup is needed.
# The new file appears in backend/alembic/versions/ — edit upgrade()/downgrade(),
# then restart the backend (or run ./migrate.sh) to apply it.
set -euo pipefail
cd "$(dirname "$0")/backend"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./new-migration.sh \"describe the change\"" >&2
  exit 1
fi

docker image inspect hackathon-backend >/dev/null 2>&1 || docker build -t hackathon-backend .

docker run --rm -v "$PWD:/app" hackathon-backend alembic revision -m "$*"
