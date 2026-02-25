#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Parse flags ───────────────────────────────────────────────────────────────
DOCKER=true
MIGRATE=true
CLEAN=false

for arg in "$@"; do
  case "$arg" in
    --no-docker)  DOCKER=false  ;;
    --no-migrate) MIGRATE=false ;;
    --clean)      CLEAN=true    ;;
  esac
done

# ── Step 1: Docker ────────────────────────────────────────────────────────────
if $DOCKER; then
  "$SCRIPT_DIR/docker-up.sh"
fi

# ── Step 2: Migrations ────────────────────────────────────────────────────────
if $MIGRATE; then
  "$SCRIPT_DIR/db-migrate.sh"
fi

# ── Step 3: Run Cucumber ──────────────────────────────────────────────────────
echo "→ Running e2e tests (Cucumber)..."

export DATABASE_URL="${DATABASE_URL:-postgresql://saas_admin:saas_password@localhost:5432/saas_dev?sslmode=disable}"
export DATABASE_APP_URL="${DATABASE_APP_URL:-postgresql://app_user:app_user_password@localhost:5432/saas_dev?sslmode=disable}"

E2E_FAILED=false
pnpm --filter @saas/api e2e || E2E_FAILED=true

# ── Step 4: Optional teardown ─────────────────────────────────────────────────
if $CLEAN; then
  "$SCRIPT_DIR/docker-down.sh"
fi

# ── Result ────────────────────────────────────────────────────────────────────
if $E2E_FAILED; then
  echo "✗ e2e tests failed" >&2
  exit 1
fi

echo "✓ All e2e tests passed"
