#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE_BIN="${TMP_DIR}/bin"
STATE_DIR="${TMP_DIR}/state"
LOG_FILE="${TMP_DIR}/tmux.log"
SESSION_NAME="test-swarm"
LIVE_PANE="%1"
mkdir -p "$FAKE_BIN" "$STATE_DIR"

cat > "${FAKE_BIN}/tmux" <<'TMUX'
#!/usr/bin/env bash
set -euo pipefail

log_file="${FAKE_TMUX_LOG:?}"
session="${FAKE_TMUX_SESSION:?}"
pane="${FAKE_TMUX_PANE:?}"

target=""
format=""
literal=""

case "${1:-}" in
  has-session)
    shift
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -t)
          target="${2:-}"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done
    [[ "$target" == "$session" ]]
    ;;
  display-message)
    shift
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -p)
          shift
          ;;
        -t)
          target="${2:-}"
          shift 2
          ;;
        *)
          format="$1"
          shift
          ;;
      esac
    done
    [[ "$target" == "$pane" ]] || exit 1
    if [[ "$format" == "#{pane_id}" ]]; then
      printf '%s\n' "$pane"
    elif [[ "$format" == "#{session_name}" ]]; then
      printf '%s\n' "$session"
    else
      printf '%s\n' "$pane"
    fi
    ;;
  send-keys)
    shift
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -t)
          target="${2:-}"
          shift 2
          ;;
        -l)
          literal="${2:-}"
          shift 2
          ;;
        *)
          printf 'send-keys|%s|%s\n' "$target" "$1" >> "$log_file"
          shift
          ;;
      esac
    done
    [[ "$target" == "$pane" ]] || exit 1
    if [[ -n "$literal" ]]; then
      sleep "${FAKE_TMUX_SEND_SLEEP:-0}"
      printf 'send-keys|%s|literal|%s\n' "$target" "$literal" >> "$log_file"
    fi
    ;;
  capture-pane)
    shift
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -t)
          target="${2:-}"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done
    [[ "$target" == "$pane" ]] || exit 1
    printf '%s\n' "${FAKE_TMUX_CAPTURE_OUTPUT:-}"
    ;;
  kill-session)
    exit 0
    ;;
  *)
    printf 'unexpected tmux call: %s\n' "$*" >&2
    exit 99
    ;;
esac
TMUX
chmod +x "${FAKE_BIN}/tmux"

export PATH="${FAKE_BIN}:${PATH}"
export FAKE_TMUX_LOG="$LOG_FILE"
export FAKE_TMUX_SESSION="$SESSION_NAME"
export FAKE_TMUX_PANE="$LIVE_PANE"

write_env() {
  local env_session="${1:-$SESSION_NAME}"
  local pane="${2:-$LIVE_PANE}"
  mkdir -p "$STATE_DIR"
  cat > "${STATE_DIR}/${SESSION_NAME}.env" <<EOF
AI_SWARM_SESSION=${env_session}
AI_SWARM_PANE_COUNT=4
AI_SWARM_PANE_CODE=${pane}
EOF
}

run_ok() {
  local name="$1"
  shift
  "$@" > "${TMP_DIR}/${name}.out" 2> "${TMP_DIR}/${name}.err"
}

run_fail() {
  local name="$1"
  shift
  if "$@" > "${TMP_DIR}/${name}.out" 2> "${TMP_DIR}/${name}.err"; then
    echo "expected failure: ${name}" >&2
    cat "${TMP_DIR}/${name}.out" >&2
    exit 1
  fi
}

assert_file_contains() {
  local file="$1"
  local needle="$2"
  if ! grep -Fq -- "$needle" "$file"; then
    echo "expected ${file} to contain: ${needle}" >&2
    echo "--- ${file}" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

assert_file_not_contains() {
  local file="$1"
  local needle="$2"
  [[ -f "$file" ]] || return 0
  if grep -Fq -- "$needle" "$file"; then
    echo "expected ${file} not to contain: ${needle}" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

run_ok help-send bash "${ROOT_DIR}/scripts/swarm-send.sh" --help
assert_file_contains "${TMP_DIR}/help-send.out" "Usage:"
run_ok help-capture bash "${ROOT_DIR}/scripts/swarm-capture.sh" --help
assert_file_contains "${TMP_DIR}/help-capture.out" "Usage:"
run_ok help-setup bash "${ROOT_DIR}/scripts/setup-agent-swarm.sh" --help
assert_file_contains "${TMP_DIR}/help-setup.out" "Usage:"

run_fail setup-existing env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/setup-agent-swarm.sh" --panes 4
assert_file_contains "${TMP_DIR}/setup-existing.err" "already exists"

rm -f "${STATE_DIR}/${SESSION_NAME}.env"
run_fail send-missing-env env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo hello"
assert_file_contains "${TMP_DIR}/send-missing-env.err" "Missing swarm env file"

write_env "other-swarm" "$LIVE_PANE"
run_fail send-session-mismatch env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo hello"
assert_file_contains "${TMP_DIR}/send-session-mismatch.err" "session mismatch"

write_env "$SESSION_NAME" "%dead"
run_fail send-stale-pane env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo hello"
assert_file_contains "${TMP_DIR}/send-stale-pane.err" "stale pane id"

write_env "$SESSION_NAME" "$LIVE_PANE"
run_fail send-secret env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo sk-123456789012345678"
assert_file_contains "${TMP_DIR}/send-secret.err" "Refusing to send command text"
assert_file_not_contains "$LOG_FILE" "sk-123456789012345678"

: > "$LOG_FILE"
run_ok send-marker env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo hello"
assert_file_contains "$LOG_FILE" "AI_SWARM_MARKER:"
assert_file_contains "${STATE_DIR}/last-marker-code.env" "AI_SWARM_LAST_MARKER="
assert_file_not_contains "${STATE_DIR}/last-marker-code.env" "echo hello"

: > "$LOG_FILE"
run_ok send-no-marker env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" --no-marker code "echo hello"
assert_file_not_contains "$LOG_FILE" "AI_SWARM_MARKER:"

mkdir -p "${STATE_DIR}/locks/swarm.lock"
run_fail send-lock-busy env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" AI_SWARM_LOCK_TIMEOUT=0 \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo hello"
assert_file_contains "${TMP_DIR}/send-lock-busy.err" "Timed out acquiring swarm lock"
rm -rf "${STATE_DIR}/locks/swarm.lock"

write_env "$SESSION_NAME" "%dead"
run_fail capture-stale-pane env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-capture.sh" code
assert_file_contains "${TMP_DIR}/capture-stale-pane.err" "stale pane id"

write_env "$SESSION_NAME" "$LIVE_PANE"
marker="AI_SWARM_MARKER:test-marker"
run_fail capture-require-marker-empty env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  FAKE_TMUX_CAPTURE_OUTPUT=$'AI_SWARM_MARKER:test-marker\nfresh line' \
  bash "${ROOT_DIR}/scripts/swarm-capture.sh" code --require-marker
assert_file_contains "${TMP_DIR}/capture-require-marker-empty.err" "--require-marker requires a marker value."

run_fail capture-since-marker-empty env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  FAKE_TMUX_CAPTURE_OUTPUT=$'AI_SWARM_MARKER:test-marker\nfresh line' \
  bash "${ROOT_DIR}/scripts/swarm-capture.sh" code --since-marker=
assert_file_contains "${TMP_DIR}/capture-since-marker-empty.err" "--since-marker requires a marker value."

run_ok capture-marker env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  FAKE_TMUX_CAPTURE_OUTPUT=$'old line\nAI_SWARM_MARKER:test-marker\nfresh line' \
  bash "${ROOT_DIR}/scripts/swarm-capture.sh" code --since-marker "$marker"
assert_file_contains "${TMP_DIR}/capture-marker.out" "$marker"
assert_file_contains "${TMP_DIR}/capture-marker.out" "fresh line"
assert_file_not_contains "${TMP_DIR}/capture-marker.out" "old line"

run_fail capture-missing-marker env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  FAKE_TMUX_CAPTURE_OUTPUT="old line only" \
  bash "${ROOT_DIR}/scripts/swarm-capture.sh" code --require-marker "$marker"
assert_file_contains "${TMP_DIR}/capture-missing-marker.err" "stale or marker missing"

: > "$LOG_FILE"
write_env "$SESSION_NAME" "$LIVE_PANE"
FAKE_TMUX_SEND_SLEEP=0.1 env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo one" > "${TMP_DIR}/send-concurrent-1.out" 2> "${TMP_DIR}/send-concurrent-1.err" &
p1=$!
FAKE_TMUX_SEND_SLEEP=0.1 env AI_SWARM_SESSION="$SESSION_NAME" AI_SWARM_STATE_DIR="$STATE_DIR" \
  bash "${ROOT_DIR}/scripts/swarm-send.sh" code "echo two" > "${TMP_DIR}/send-concurrent-2.out" 2> "${TMP_DIR}/send-concurrent-2.err" &
p2=$!
wait "$p1"
wait "$p2"
assert_file_contains "${STATE_DIR}/last-marker-code.env" "AI_SWARM_LAST_MARKER="
assert_file_contains "${STATE_DIR}/last-marker-code.env" "AI_SWARM_LAST_MARKER_PANE=${LIVE_PANE}"
assert_file_not_contains "${STATE_DIR}/last-marker-code.env" "echo one"
assert_file_not_contains "${STATE_DIR}/last-marker-code.env" "echo two"

echo "swarm IO hardening tests passed"
