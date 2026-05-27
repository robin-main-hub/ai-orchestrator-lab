#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${DGX_SERVER_BASE_URL:-${ORCHESTRATOR_BASE_URL:-http://dgx-02:4317}}"
API_TOKEN="${ORCHESTRATOR_API_TOKEN:-dev-orchestrator-token}"
TIMEOUT_SECONDS="${DGX_PROBE_TIMEOUT_SECONDS:-5}"

BASE_URL="${BASE_URL%/}"

curl_json() {
  local label="$1"
  local url="$2"
  shift 2

  printf '\n== %s ==\n%s\n' "$label" "$url"
  curl \
    --fail \
    --show-error \
    --silent \
    --max-time "$TIMEOUT_SECONDS" \
    "$@" \
    "$url"
  printf '\n'
}

curl_json "health" "$BASE_URL/health"
curl_json "heartbeat" "$BASE_URL/heartbeat" \
  -H "Authorization: Bearer $API_TOKEN"

