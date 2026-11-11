#!/usr/bin/env bash
# Apply pending migrations to the dev database without (re)starting the server:
#
#   ./migrate.sh              -> upgrade to latest
#   ./migrate.sh current      -> show the DB's current revision
#   ./migrate.sh history      -> list all migrations
#   ./migrate.sh downgrade -1 -> roll back one migration
set -euo pipefail
cd "$(dirname "$0")"

CMD=("$@")
[[ $# -eq 0 ]] && CMD=(upgrade head)

# Starts the db service if it isn't already running
docker compose run --rm backend alembic "${CMD[@]}"
