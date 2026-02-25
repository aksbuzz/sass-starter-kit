#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

EXTRA_FLAGS=""
for arg in "$@"; do
  case "$arg" in
    --volumes) EXTRA_FLAGS="-v" ;;
  esac
done

echo "→ Stopping Docker services..."
# shellcheck disable=SC2086
docker compose -f "$ROOT_DIR/docker-compose.yml" down $EXTRA_FLAGS
echo "✓ Services stopped"
