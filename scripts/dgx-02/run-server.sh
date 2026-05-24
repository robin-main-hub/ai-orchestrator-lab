#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${AI_ORCHESTRATOR_HOME:-$HOME/ai-orchestrator-lab}"
PORT="${PORT:-4317}"
DGX02_VLLM_BASE_URL="${DGX02_VLLM_BASE_URL:-http://127.0.0.1:8001/v1}"

cd "$ROOT_DIR"

export PORT
export DGX02_VLLM_BASE_URL

corepack pnpm --filter @ai-orchestrator/server build
exec corepack pnpm --filter @ai-orchestrator/server start
