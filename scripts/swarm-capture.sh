#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${AI_SWARM_SESSION:-ai-swarm}"
STATE_DIR="${AI_SWARM_STATE_DIR:-.ai-swarm}"
ENV_FILE="${STATE_DIR}/${SESSION_NAME}.env"
LINES="${AI_SWARM_CAPTURE_LINES:-120}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/swarm-capture.sh <role> [--lines N]

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

Captures pane output read-only and redacts obvious secrets before printing.
This helper does not send keys or execute commands.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lines)
      shift
      LINES="${1:-}"
      shift || true
      ;;
    --lines=*)
      LINES="${1#--lines=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "${role:-}" ]]; then
        role="$1"
        shift
      else
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
done

if [[ -z "${role:-}" ]]; then
  usage >&2
  exit 2
fi

if ! [[ "$LINES" =~ ^[0-9]+$ ]] || (( LINES < 1 || LINES > 2000 )); then
  echo "--lines must be an integer from 1 to 2000." >&2
  exit 2
fi

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

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "tmux session '$SESSION_NAME' is not running." >&2
  exit 1
fi

tmux capture-pane -p -t "$pane_id" -S "-${LINES}" |
  sed -E \
    -e 's/sk-[A-Za-z0-9_-]{8,}/[REDACTED:api_key]/g' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._~+\/=-]+/[REDACTED:bearer_token]/g' \
    -e 's/(ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|AUTH_TOKEN|API_KEY|SECRET|TOKEN)=([^[:space:]]+)/\1=[REDACTED:secret]/g' \
    -e 's/-----BEGIN [A-Z ]*PRIVATE KEY-----/[REDACTED:private_key]/g'
