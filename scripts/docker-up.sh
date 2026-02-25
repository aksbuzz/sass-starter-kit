#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "→ Starting Docker services..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --build

echo "→ Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
  if docker exec saas_postgres pg_isready -U saas_admin -d saas_dev -q 2>/dev/null; then
    echo "✓ Postgres is ready"
    exit 0
  fi
  echo "  Waiting... ($i/30)"
  sleep 2
done

echo "✗ Postgres did not become ready within 60 s" >&2
docker compose -f "$ROOT_DIR/docker-compose.yml" logs postgres >&2
exit 1
