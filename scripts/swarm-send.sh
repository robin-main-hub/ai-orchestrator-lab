#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${AI_SWARM_SESSION:-ai-swarm}"
STATE_DIR="${AI_SWARM_STATE_DIR:-.ai-swarm}"
ENV_FILE="${STATE_DIR}/${SESSION_NAME}.env"

usage() {
  cat <<'USAGE'
Usage:
  scripts/swarm-send.sh <role> <command...>

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

The helper sends text to the stored tmux pane id, then presses Enter.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

role="$1"
shift
command_text="$*"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed or not on PATH." >&2
  exit 127
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing swarm env file: $ENV_FILE" >&2
  echo "Run scripts/setup-agent-swarm.sh first." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

role_key="$(printf '%s' "$role" | tr '[:lower:]' '[:upper:]')"
pane_var="AI_SWARM_PANE_${role_key}"
pane_id="${!pane_var:-}"

if [[ -z "$pane_id" ]]; then
  echo "Unknown role or missing pane id: $role" >&2
  usage >&2
  exit 2
fi

if [[ "$command_text" =~ (sk-[A-Za-z0-9_-]{12,}|Bearer[[:space:]][A-Za-z0-9._-]{12,}|BEGIN[[:space:]]+PRIVATE[[:space:]]+KEY) ]]; then
  echo "Refusing to send command text that appears to contain a secret." >&2
  exit 3
fi

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "tmux session '$SESSION_NAME' is not running." >&2
  exit 1
fi

tmux send-keys -t "$pane_id" "$command_text" C-m
echo "Sent to ${role} (${pane_id}) in ${SESSION_NAME}."
