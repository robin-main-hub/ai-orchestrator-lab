#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${AI_ORCHESTRATOR_HOME:-$HOME/ai-orchestrator-lab}"
PORT="${PORT:-4317}"
DGX02_VLLM_BASE_URL="${DGX02_VLLM_BASE_URL:-http://127.0.0.1:8001/v1}"

cd "$ROOT_DIR"

export PORT
export DGX02_VLLM_BASE_URL

# "@ai-orchestrator/server..." = server + 그 워크스페이스 의존성(protocol/agents/...)
# 까지 빌드. server만 빌드하면 의존 패키지가 바뀐 배포에서 낡은 dist 때문에
# tsc가 깨져 부팅 루프에 빠진다 (2026-06-13 mission persistence 배포에서 실제 발생).
corepack pnpm --filter "@ai-orchestrator/server..." build
exec corepack pnpm --filter @ai-orchestrator/server start
