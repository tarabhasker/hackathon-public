#!/usr/bin/env bash
# Apply pending migrations to the DB volume without (re)starting the server:
#
#   ./migrate.sh              -> upgrade to latest
#   ./migrate.sh current      -> show the DB's current revision
#   ./migrate.sh downgrade -1 -> roll back one migration
set -euo pipefail
cd "$(dirname "$0")/backend"

docker image inspect hackathon-backend >/dev/null 2>&1 || docker build -t hackathon-backend .

CMD=("$@")
[[ $# -eq 0 ]] && CMD=(upgrade head)

docker run --rm -v "$PWD:/app" -v hackathon-db:/data -e DATABASE_PATH=/data/app.db \
  hackathon-backend alembic "${CMD[@]}"
