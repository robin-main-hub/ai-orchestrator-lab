#!/usr/bin/env bash
set -euo pipefail

# Default configuration
DGX_SERVER_BASE_URL="${DGX_SERVER_BASE_URL:-http://dgx-02:4317}"
API_TOKEN="${ORCHESTRATOR_API_TOKEN:-dev-orchestrator-token}"
TIMEOUT_SECONDS="${DGX_PROBE_TIMEOUT_SECONDS:-5}"

# Strip trailing slash from BASE_URL
BASE_URL="${DGX_SERVER_BASE_URL%/}"

curl_get() {
  local label="$1"
  local url="$2"

  # Print endpoint information without exposing credentials
  printf '\n== %s ==\n%s\n' "$label" "$url"
  
  curl \
    --fail \
    --show-error \
    --silent \
    --max-time "$TIMEOUT_SECONDS" \
    -H "Authorization: Bearer $API_TOKEN" \
    "$url"
  printf '\n'
}

# Call live models endpoint
curl_get "models" "$BASE_URL/models"

# Call specific vLLM provider profile models endpoint
curl_get "provider-models" "$BASE_URL/provider-models?providerProfileId=provider_dgx02_vllm"
