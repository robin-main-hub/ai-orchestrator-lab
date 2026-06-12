#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${AI_SWARM_SESSION:-ai-swarm}"
STATE_DIR="${AI_SWARM_STATE_DIR:-.ai-swarm}"
ENV_FILE="${STATE_DIR}/${SESSION_NAME}.env"
WORKER_STATE_FILE="${STATE_DIR}/${SESSION_NAME}.hermes-workers.env"
HERMES_BIN="${HERMES_BIN_PATH:-}"
MODEL="${HERMES_WORKER_MODEL:-}"
TOOLSETS="${HERMES_WORKER_TOOLSETS:-}"
MAX_TURNS="${HERMES_WORKER_MAX_TURNS:-}"
EXTRA_ARGS="${HERMES_WORKER_EXTRA_ARGS:-}"
WAIT_SECS="${HERMES_WORKER_WAIT_SECS:-25}"
DEFAULT_ROLES="code,architect,frontend,backend,qa,research,memory"

usage() {
  cat <<'USAGE'
Usage:
  scripts/swarm-start-hermes-workers.sh [--roles role,role] [--model MODEL]
                                        [--toolsets LIST] [--max-turns N]
                                        [--hermes-bin PATH] [--extra-args "..."]
                                        [--wait-secs N] [--status]

Starts a persistent interactive Hermes Agent chat session inside each selected
ai-swarm pane. The desktop autonomous runner (persona summon -> identity
injection -> closed-loop verification) types text into these panes through the
gated dispatch path, so an interactive Hermes CLI must be running there first.
This is that provisioning layer.

Idempotent: panes that are no longer sitting at an idle shell (bash/sh/zsh)
are skipped, so it is safe to re-run at any time — including right before an
autonomous run as a readiness pass.

Defaults:
  roles: code,architect,frontend,backend,qa,research,memory
         (discussion/orchestrator/status stay as control panes)
  hermes binary: `hermes` on PATH, else ~/hermes-venv/bin/hermes
  wait: up to 25s per pane for the CLI to come up

Modes:
  --status   Only report each role pane's current foreground command and
             whether it looks like an idle shell or a running worker.

Examples:
  scripts/setup-agent-swarm.sh --reset --with-hermes
  scripts/swarm-start-hermes-workers.sh --roles code,qa
  scripts/swarm-start-hermes-workers.sh --status

Safety:
  - Requires an existing tmux swarm env file (scripts/setup-agent-swarm.sh).
  - Starts Hermes in interactive chat mode only (no -q/--query, no headless).
  - Refuses launch arguments that appear to contain secrets.
  - Records only non-secret pane metadata in .ai-swarm.
  - The session reset command (/new) is NOT sent here; persona boot/reset goes
    through the app's gated dispatch path (docs/40-persona-agent-set.md).
USAGE
}

roles_csv="$DEFAULT_ROLES"
status_only=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --roles)
      shift
      roles_csv="${1:-}"
      shift || true
      ;;
    --roles=*)
      roles_csv="${1#--roles=}"
      shift
      ;;
    --model)
      shift
      MODEL="${1:-}"
      shift || true
      ;;
    --model=*)
      MODEL="${1#--model=}"
      shift
      ;;
    --toolsets)
      shift
      TOOLSETS="${1:-}"
      shift || true
      ;;
    --toolsets=*)
      TOOLSETS="${1#--toolsets=}"
      shift
      ;;
    --max-turns)
      shift
      MAX_TURNS="${1:-}"
      shift || true
      ;;
    --max-turns=*)
      MAX_TURNS="${1#--max-turns=}"
      shift
      ;;
    --hermes-bin)
      shift
      HERMES_BIN="${1:-}"
      shift || true
      ;;
    --hermes-bin=*)
      HERMES_BIN="${1#--hermes-bin=}"
      shift
      ;;
    --extra-args)
      shift
      EXTRA_ARGS="${1:-}"
      shift || true
      ;;
    --extra-args=*)
      EXTRA_ARGS="${1#--extra-args=}"
      shift
      ;;
    --wait-secs)
      shift
      WAIT_SECS="${1:-}"
      shift || true
      ;;
    --wait-secs=*)
      WAIT_SECS="${1#--wait-secs=}"
      shift
      ;;
    --status)
      status_only=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$roles_csv" ]]; then
  echo "--roles must not be empty." >&2
  exit 2
fi

if ! [[ "$WAIT_SECS" =~ ^[0-9]+$ ]]; then
  echo "--wait-secs requires an integer number of seconds." >&2
  exit 2
fi

if [[ -n "$MAX_TURNS" ]] && ! [[ "$MAX_TURNS" =~ ^[0-9]+$ ]]; then
  echo "--max-turns requires an integer." >&2
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

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "tmux session '$SESSION_NAME' is not running." >&2
  exit 1
fi

# Resolve the Hermes binary: explicit flag/env > PATH > the conventional venv.
if [[ -z "$HERMES_BIN" ]]; then
  if command -v hermes >/dev/null 2>&1; then
    HERMES_BIN="hermes"
  elif [[ -x "$HOME/hermes-venv/bin/hermes" ]]; then
    HERMES_BIN="$HOME/hermes-venv/bin/hermes"
  else
    echo "Hermes CLI not found on PATH or at ~/hermes-venv/bin/hermes." >&2
    echo "Pass --hermes-bin PATH or set HERMES_BIN_PATH." >&2
    exit 127
  fi
fi

if [[ "$status_only" != true ]] && ! command -v "$HERMES_BIN" >/dev/null 2>&1 && [[ ! -x "$HERMES_BIN" ]]; then
  echo "Hermes CLI not executable: $HERMES_BIN" >&2
  exit 127
fi

is_idle_shell() {
  case "$1" in
    bash|sh|zsh|dash|ksh) return 0 ;;
    *) return 1 ;;
  esac
}

pane_current_command() {
  tmux display-message -p -t "$1" "#{pane_current_command}" 2>/dev/null || echo "unknown"
}

resolve_pane_id() {
  local role_key
  role_key="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
  local pane_var="AI_SWARM_PANE_${role_key}"
  printf '%s' "${!pane_var:-}"
}

IFS=',' read -r -a roles <<< "$roles_csv"

if [[ "$status_only" == true ]]; then
  for role in "${roles[@]}"; do
    role="$(printf '%s' "$role" | xargs)"
    [[ -z "$role" ]] && continue
    pane_id="$(resolve_pane_id "$role")"
    if [[ -z "$pane_id" ]]; then
      printf '%-12s %-6s %s\n' "$role" "-" "unknown role / missing pane id"
      continue
    fi
    current="$(pane_current_command "$pane_id")"
    if is_idle_shell "$current"; then
      printf '%-12s %-6s %-12s idle-shell (no worker)\n' "$role" "$pane_id" "$current"
    else
      printf '%-12s %-6s %-12s worker-or-busy\n' "$role" "$pane_id" "$current"
    fi
  done
  exit 0
fi

# Preflight: the desktop's persona boot step dispatches `/new` unattended.
# Hermes confirms destructive slash commands by default, which would stall an
# autonomous run on an interactive [1/2/3] prompt. Warn when the silence flag
# is not present in the Hermes config (set via the prompt's "Always Approve"
# or `approvals.destructive_slash_confirm: false` in config.yaml).
hermes_config="${HERMES_HOME:-$HOME/.hermes}/config.yaml"
if [[ -f "$hermes_config" ]] && ! grep -q "destructive_slash_confirm:[[:space:]]*false" "$hermes_config"; then
  echo "Warning: ${hermes_config} does not disable destructive-slash confirmation." >&2
  echo "An unattended '/new' boot step will stall on a confirmation prompt until" >&2
  echo "'approvals.destructive_slash_confirm: false' is set (or approved once interactively)." >&2
fi

command_line="${HERMES_BIN} chat"
if [[ -n "$MODEL" ]]; then
  command_line="${command_line} --model ${MODEL}"
fi
if [[ -n "$TOOLSETS" ]]; then
  command_line="${command_line} --toolsets ${TOOLSETS}"
fi
if [[ -n "$MAX_TURNS" ]]; then
  command_line="${command_line} --max-turns ${MAX_TURNS}"
fi
if [[ -n "$EXTRA_ARGS" ]]; then
  command_line="${command_line} ${EXTRA_ARGS}"
fi

if [[ "$command_line" =~ (sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|AIzaSy[A-Za-z0-9_-]{33}|Bearer[[:space:]][A-Za-z0-9._-]{12,}|BEGIN[[:space:]]+PRIVATE[[:space:]]+KEY) ]]; then
  echo "Refusing a launch command line that appears to contain a secret." >&2
  exit 3
fi

mkdir -p "$STATE_DIR"
{
  echo "# Generated by scripts/swarm-start-hermes-workers.sh"
  echo "AI_SWARM_SESSION=${SESSION_NAME}"
  echo "HERMES_WORKER_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$WORKER_STATE_FILE"

declare -a started_roles=()
declare -a started_panes=()

for role in "${roles[@]}"; do
  role="$(printf '%s' "$role" | xargs)"
  [[ -z "$role" ]] && continue

  pane_id="$(resolve_pane_id "$role")"
  if [[ -z "$pane_id" ]]; then
    echo "Unknown role or missing pane id: $role" >&2
    exit 2
  fi

  current="$(pane_current_command "$pane_id")"
  role_key="$(printf '%s' "$role" | tr '[:lower:]' '[:upper:]')"
  if ! is_idle_shell "$current"; then
    echo "Skipping ${role} (${pane_id}): pane is running '${current}', not an idle shell."
    echo "HERMES_WORKER_${role_key}_PANE=${pane_id}" >> "$WORKER_STATE_FILE"
    echo "HERMES_WORKER_${role_key}_STATE=already_running:${current}" >> "$WORKER_STATE_FILE"
    continue
  fi

  tmux send-keys -t "$pane_id" -l "$command_line"
  tmux send-keys -t "$pane_id" C-m
  echo "HERMES_WORKER_${role_key}_PANE=${pane_id}" >> "$WORKER_STATE_FILE"
  echo "HERMES_WORKER_${role_key}_STATE=started" >> "$WORKER_STATE_FILE"
  started_roles+=("$role")
  started_panes+=("$pane_id")
  echo "Starting Hermes worker for ${role} (${pane_id})."
done

# Readiness pass: wait until each launched pane's foreground command is no
# longer an idle shell (i.e. the Hermes CLI took over the pane).
failures=0
deadline=$(( $(date +%s) + WAIT_SECS ))
for i in "${!started_panes[@]}"; do
  pane_id="${started_panes[$i]}"
  role="${started_roles[$i]}"
  while :; do
    current="$(pane_current_command "$pane_id")"
    if ! is_idle_shell "$current"; then
      echo "Hermes worker ready for ${role} (${pane_id}): ${current}."
      break
    fi
    if (( $(date +%s) >= deadline )); then
      echo "Hermes worker for ${role} (${pane_id}) did not come up within ${WAIT_SECS}s." >&2
      failures=$((failures + 1))
      break
    fi
    sleep 1
  done
done

echo "Hermes worker state saved to ${WORKER_STATE_FILE}."
if (( failures > 0 )); then
  echo "${failures} worker(s) failed to come up; inspect the pane(s) with scripts/swarm-capture.sh." >&2
  exit 1
fi
