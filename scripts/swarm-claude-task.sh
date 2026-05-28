#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${AI_SWARM_SESSION:-ai-swarm}"
STATE_DIR="${AI_SWARM_STATE_DIR:-.ai-swarm}"
ENV_FILE="${STATE_DIR}/${SESSION_NAME}.env"
WORKER_STATE_FILE="${STATE_DIR}/${SESSION_NAME}.claude-workers.env"
DISPATCH_LOG="${STATE_DIR}/${SESSION_NAME}.claude-dispatch.log"

usage() {
  cat <<'USAGE'
Usage:
  scripts/swarm-claude-task.sh <role> <task...>

Sends a task packet to a persistent interactive Claude worker pane.
This does not invoke `claude -p`; it only pastes text into an already-running Claude Code session.

Examples:
  scripts/swarm-claude-task.sh architect "Review protocol boundaries for the current patch."
  scripts/swarm-claude-task.sh qa "Run focused tests only if the operator has approved execution."

Safety:
  - Refuses obvious secrets in task text.
  - Uses tmux paste-buffer so multiline task packets are sent as input, not shell argv.
  - Records only redacted dispatch metadata in .ai-swarm.
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
task_text="$*"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed or not on PATH." >&2
  exit 127
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing swarm env file: $ENV_FILE" >&2
  echo "Run scripts/setup-agent-swarm.sh first." >&2
  exit 1
fi

if [[ ! -f "$WORKER_STATE_FILE" ]]; then
  echo "Missing Claude worker state file: $WORKER_STATE_FILE" >&2
  echo "Run scripts/swarm-start-claude-workers.sh first." >&2
  exit 1
fi

if [[ "$task_text" =~ (sk-[A-Za-z0-9_-]{12,}|Bearer[[:space:]][A-Za-z0-9._~+\/=-]{12,}|BEGIN[[:space:]]+PRIVATE[[:space:]]+KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|API_KEY|SECRET|TOKEN=) ]]; then
  echo "Refusing to send task text that appears to contain a secret." >&2
  exit 3
fi

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "tmux session '$SESSION_NAME' is not running." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
# shellcheck disable=SC1090
source "$WORKER_STATE_FILE"

role_key="$(printf '%s' "$role" | tr '[:lower:]' '[:upper:]')"
pane_var="CLAUDE_WORKER_${role_key}_PANE"
pane_id="${!pane_var:-}"

if [[ -z "$pane_id" ]]; then
  fallback_pane_var="AI_SWARM_PANE_${role_key}"
  pane_id="${!fallback_pane_var:-}"
fi

if [[ -z "$pane_id" ]]; then
  echo "Unknown role or missing Claude worker pane id: $role" >&2
  usage >&2
  exit 2
fi

packet_id="claude_task_$(date -u +%Y%m%dT%H%M%SZ)_${role_key}"
packet=$(
  cat <<PACKET
[AI Orchestrator delegated task]
packet_id: ${packet_id}
role: ${role}
policy:
- You are a persistent interactive Claude Code worker controlled by AI Orchestrator Lab.
- Do not claim that code was changed unless you actually changed it.
- Prefer analysis and concise handoff notes.
- Do not access secrets.
- Do not run destructive commands.
- If file edits, network, installs, git push, or expensive tests are needed, ask for operator approval first.

task:
${task_text}

Return:
- finding or patch summary
- files touched, if any
- verification performed, if any
- blockers or approvals needed
PACKET
)

buffer_name="${packet_id}"
tmp_packet="$(mktemp)"
trap 'rm -f "$tmp_packet"' EXIT
printf '%s\n' "$packet" > "$tmp_packet"

tmux load-buffer -b "$buffer_name" "$tmp_packet"
tmux paste-buffer -d -b "$buffer_name" -t "$pane_id"
tmux send-keys -t "$pane_id" C-m

mkdir -p "$STATE_DIR"
{
  printf '%s role=%s pane=%s packet=%s task=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$role" \
    "$pane_id" \
    "$packet_id" \
    "$(printf '%s' "$task_text" | sed -E 's/sk-[A-Za-z0-9_-]{8,}/[REDACTED:api_key]/g; s/Bearer[[:space:]]+[A-Za-z0-9._~+\/=-]+/[REDACTED:bearer_token]/g; s/(API_KEY|AUTH_TOKEN|SECRET|TOKEN)=([^[:space:]]+)/\1=[REDACTED:secret]/g' | cut -c1-220)"
} >> "$DISPATCH_LOG"

echo "Sent Claude task ${packet_id} to ${role} (${pane_id}) in ${SESSION_NAME}."
