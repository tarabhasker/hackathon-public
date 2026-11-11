#!/usr/bin/env bash
# Start the React (Vite) frontend on http://127.0.0.1:3001
# Installs npm dependencies automatically when they're missing or out of date.
set -euo pipefail
cd "$(dirname "$0")/frontend"

if [[ ! -d node_modules || package.json -nt node_modules/.install-stamp ]]; then
  echo "==> Installing npm dependencies..."
  npm install
  touch node_modules/.install-stamp
fi

echo "==> Starting frontend on http://127.0.0.1:3001 (Ctrl+C to stop)"
exec npm run dev
