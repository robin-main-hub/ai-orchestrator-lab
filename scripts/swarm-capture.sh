#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${AI_SWARM_SESSION:-ai-swarm}"
STATE_DIR="${AI_SWARM_STATE_DIR:-.ai-swarm}"
ENV_FILE="${STATE_DIR}/${SESSION_NAME}.env"
LINES="${AI_SWARM_CAPTURE_LINES:-120}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/swarm-io-common.sh
source "${SCRIPT_DIR}/swarm-io-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/swarm-capture.sh <role> [--lines N] [--require-marker MARKER] [--since-marker MARKER]

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
When a marker is required but absent, it fails as stale or marker missing.
USAGE
}

require_marker=""
since_marker=""
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
    --require-marker)
      shift
      require_marker="${1:-}"
      if [[ -z "$require_marker" ]]; then
        echo "--require-marker requires a marker value." >&2
        exit 2
      fi
      shift || true
      ;;
    --require-marker=*)
      require_marker="${1#--require-marker=}"
      if [[ -z "$require_marker" ]]; then
        echo "--require-marker requires a marker value." >&2
        exit 2
      fi
      shift
      ;;
    --since-marker)
      shift
      since_marker="${1:-}"
      if [[ -z "$since_marker" ]]; then
        echo "--since-marker requires a marker value." >&2
        exit 2
      fi
      require_marker="$since_marker"
      shift || true
      ;;
    --since-marker=*)
      since_marker="${1#--since-marker=}"
      if [[ -z "$since_marker" ]]; then
        echo "--since-marker requires a marker value." >&2
        exit 2
      fi
      require_marker="$since_marker"
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

if [[ -z "$require_marker" && -n "$since_marker" ]]; then
  require_marker="$since_marker"
fi

require_tmux
acquire_lock
load_swarm_env

role_key="$(printf '%s' "$role" | tr '[:lower:]' '[:upper:]')"
pane_var="AI_SWARM_PANE_${role_key}"
pane_id="${!pane_var:-}"

require_live_session
require_live_pane "$role" "$pane_id"

capture_output="$(tmux capture-pane -p -t "$pane_id" -S "-${LINES}")"

if [[ -n "$require_marker" ]]; then
  if ! grep -Fq -- "$require_marker" <<< "$capture_output"; then
    echo "stale or marker missing: ${require_marker}" >&2
    exit 4
  fi
fi

if [[ -n "$since_marker" ]]; then
  capture_output="$(awk -v marker="$since_marker" 'seen || index($0, marker) { seen=1; print }' <<< "$capture_output")"
fi

printf '%s\n' "$capture_output" | redact_swarm_output
