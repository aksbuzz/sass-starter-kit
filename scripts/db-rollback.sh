#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_URL="${DATABASE_URL:-postgresql://saas_admin:saas_password@localhost:5432/saas_dev?sslmode=disable}"
MIGRATIONS_DIR="$ROOT_DIR/packages/db/migrations"
SCHEMA_FILE="$ROOT_DIR/packages/db/schema.sql"

DB_HOST=$(echo "$DB_URL" | sed 's|postgresql://[^@]*@||' | sed 's|?.*||')
echo "→ Rolling back last migration → $DB_HOST"

dbmate \
  --url "$DB_URL" \
  --migrations-dir "$MIGRATIONS_DIR" \
  --schema-file "$SCHEMA_FILE" \
  down

echo "✓ Rollback complete"
