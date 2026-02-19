#!/usr/bin/env bash
# Seed CLI - Run database seeds for a given stage
# Usage: ./scripts/seed.sh <stage>
#   stage: dev | staging | production (default: dev)
#
# Examples:
#   ./scripts/seed.sh dev
#   ./scripts/seed.sh staging
#   ./scripts/seed.sh production

set -e

STAGE="${1:-dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Seeding for stage: $STAGE"
echo "==> Root: $ROOT_DIR"
echo ""

# Load .env.{stage} if it exists (for shell-level vars); Node script handles both
if [ -f ".env.$STAGE" ]; then
  echo "==> Loading .env.$STAGE"
  set -a
  source ".env.$STAGE"
  set +a
fi

export STAGE="$STAGE"
export NODE_ENV="$STAGE"

if [ -f "dist/src/scripts/seed.js" ]; then
  node dist/src/scripts/seed.js
else
  echo "==> Build not found. Running with ts-node..."
  npx ts-node -r tsconfig-paths/register src/scripts/seed.ts
fi
