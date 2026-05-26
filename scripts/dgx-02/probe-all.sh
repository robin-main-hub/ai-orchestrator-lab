#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${DGX_SERVER_BASE_URL:-${ORCHESTRATOR_BASE_URL:-http://dgx-02:4317}}"
API_TOKEN="${ORCHESTRATOR_API_TOKEN:-dev-orchestrator-token}"
TIMEOUT_SECONDS="${DGX_PROBE_TIMEOUT_SECONDS:-5}"

BASE_URL="${BASE_URL%/}"

"$SCRIPT_DIR/probe-health.sh"

if [[ -x "$SCRIPT_DIR/probe-models.sh" ]]; then
  "$SCRIPT_DIR/probe-models.sh"
else
  printf '\n== models ==\n%s\n' "$BASE_URL/models"
  curl \
    --fail \
    --show-error \
    --silent \
    --max-time "$TIMEOUT_SECONDS" \
    -H "Authorization: Bearer $API_TOKEN" \
    "$BASE_URL/models"
  printf '\n'
fi

