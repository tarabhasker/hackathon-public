#!/usr/bin/env bash
# Start the frontend (plain static file server, no deps)
#
#   ./run-frontend.sh          -> http://127.0.0.1:3001
#   ./run-frontend.sh 8080     -> custom port
set -euo pipefail
cd "$(dirname "$0")/frontend"

PORT="${1:-3001}"
echo "==> Starting frontend on http://127.0.0.1:${PORT} (Ctrl+C to stop)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
