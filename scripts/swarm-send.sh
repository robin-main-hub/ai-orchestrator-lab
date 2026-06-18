#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${AI_SWARM_SESSION:-ai-swarm}"
STATE_DIR="${AI_SWARM_STATE_DIR:-.ai-swarm}"
ENV_FILE="${STATE_DIR}/${SESSION_NAME}.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/swarm-io-common.sh
source "${SCRIPT_DIR}/swarm-io-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/swarm-send.sh [--timeout SEC] [--marker|--no-marker] <role> <shell-command...>

Roles:
  discussion
  orchestrator
  status
  code
  architect
  frontend
  backend
  qa
  research
  memory

Examples:
  scripts/swarm-send.sh architect "codex 'Review protocol boundaries'"
  scripts/swarm-send.sh qa "pnpm typecheck && pnpm test"

The helper sends shell command text to the stored tmux pane id, then presses Enter.
By default it emits a non-secret AI_SWARM_MARKER line first and records only
marker metadata under .ai-swarm/ for freshness-aware capture.
Use scripts/swarm-claude-task.sh for persistent interactive Claude worker prompts.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

# P0-2: --timeout <sec>은 비인터랙티브 일회성 명령(pnpm test, tsc 등)을
# `setsid timeout --kill-after=10s <sec>`로 감싸 보낸다. setsid로 새 process
# group을 만들어 timeout 만료 시 그룹 전체가 종료되므로, 자식이 orphan으로
# 남아 pane을 "working"에 묶는 hang(Codex #4337 계열)을 차단한다.
# 인터랙티브 도구(codex/claude 대화 등)에는 쓰지 말 것 — 기본은 래핑 안 함.
send_timeout=""
marker_enabled=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout)
      send_timeout="${2:-}"
      shift 2 || { usage >&2; exit 2; }
      if ! [[ "$send_timeout" =~ ^[0-9]+$ ]]; then
        echo "--timeout requires an integer number of seconds." >&2
        exit 2
      fi
      ;;
    --timeout=*)
      send_timeout="${1#--timeout=}"
      shift
      if ! [[ "$send_timeout" =~ ^[0-9]+$ ]]; then
        echo "--timeout requires an integer number of seconds." >&2
        exit 2
      fi
      ;;
    --marker)
      marker_enabled=true
      shift
      ;;
    --no-marker)
      marker_enabled=false
      shift
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

role="$1"
shift
command_text="$*"

if [[ -n "$send_timeout" ]]; then
  if command -v setsid >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
    command_text="setsid timeout --signal=TERM --kill-after=10s ${send_timeout}s ${command_text}"
  elif command -v timeout >/dev/null 2>&1; then
    command_text="timeout --signal=TERM --kill-after=10s ${send_timeout}s ${command_text}"
  fi
fi

role_key="$(printf '%s' "$role" | tr '[:lower:]' '[:upper:]')"
pane_var="AI_SWARM_PANE_${role_key}"

if [[ "$command_text" =~ (sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|AIzaSy[A-Za-z0-9_-]{33}|Bearer[[:space:]][A-Za-z0-9._-]{12,}|BEGIN[[:space:]]+PRIVATE[[:space:]]+KEY) ]]; then
  echo "Refusing to send command text that appears to contain a secret." >&2
  exit 3
fi

require_tmux
acquire_lock
load_swarm_env
pane_id="${!pane_var:-}"
require_live_session
require_live_pane "$role" "$pane_id"

if [[ "$marker_enabled" == true ]]; then
  marker="$(make_marker "$role")"
  tmux send-keys -t "$pane_id" -l "printf '%s\\n' '${marker}'"
  tmux send-keys -t "$pane_id" C-m
  write_marker_metadata "$role" "$pane_id" "$marker"
fi

tmux send-keys -t "$pane_id" -l "$command_text"
tmux send-keys -t "$pane_id" C-m
if [[ "${marker_enabled}" == true ]]; then
  echo "Sent to ${role} (${pane_id}) in ${SESSION_NAME}; marker saved."
else
  echo "Sent to ${role} (${pane_id}) in ${SESSION_NAME}."
fi
