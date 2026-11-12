#!/usr/bin/env bash
# Seed the synthetic 200-person org into the dev database.
#
#   ./seed.sh                      # people, facets, edges (no API key needed)
#   ./seed.sh --with-embeddings    # also embed facets via Gemini (GOOGLE_API_KEY in backend/.env)
set -euo pipefail
cd "$(dirname "$0")"

docker compose run --rm backend python seed.py "$@"
