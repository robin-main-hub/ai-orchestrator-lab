#!/usr/bin/env bash
# P0-2 (KIMI 브리프): ai-swarm tmux 세션의 프로세스 생명주기 정리.
#
# 문제: tmux kill-session은 pane의 main shell만 종료한다. pane 안에서 fork된
# 자식/손자(테스트 러너, codex, node 등)는 orphan(PPID=1)으로 남아 stdout pipe를
# 점유하거나 좀비로 쌓여 메모리/PID를 소모한다 (Codex #4337과 동일 계열).
#
# 이 스크립트는 (1) 각 pane PID를 루트로 한 프로세스 트리 전체를 SIGTERM→SIGKILL로
# 회수하고, (2) 세션을 종료하며, (3) 남은 swarm 관련 orphan을 보수적으로 sweep한다.
#
# 사용:
#   scripts/swarm-cleanup.sh            # graceful: 트리 종료 → 세션 종료 → orphan sweep
#   scripts/swarm-cleanup.sh --tree-only   # 세션은 유지, 프로세스 트리만 회수
#   scripts/swarm-cleanup.sh --sweep-only  # orphan sweep만 (세션/트리 손대지 않음)
set -uo pipefail

SESSION_NAME="${AI_SWARM_SESSION:-ai-swarm}"
STATE_DIR="${AI_SWARM_STATE_DIR:-.ai-swarm}"
ENV_FILE="${STATE_DIR}/${SESSION_NAME}.env"
GRACE_SECONDS="${AI_SWARM_KILL_GRACE_SECONDS:-5}"

mode="graceful"
case "${1:-}" in
  --tree-only) mode="tree-only" ;;
  --sweep-only) mode="sweep-only" ;;
  -h|--help)
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *) echo "Unknown argument: $1" >&2; exit 2 ;;
esac

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed or not on PATH." >&2
  exit 127
fi

# Kill an entire process tree rooted at PID: children first (post-order), then
# the root. SIGTERM, brief grace, then SIGKILL for anything still alive.
kill_process_tree() {
  local root_pid="$1"
  local sig="${2:-TERM}"
  [[ -z "$root_pid" || "$root_pid" -le 1 ]] && return 0
  local child
  for child in $(pgrep -P "$root_pid" 2>/dev/null); do
    kill_process_tree "$child" "$sig"
  done
  kill -"$sig" "$root_pid" 2>/dev/null || true
}

# Collect pane PIDs for the session (live tmux query, with .env fallback).
collect_pane_pids() {
  local pids=()
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    while read -r pid; do
      [[ -n "$pid" ]] && pids+=("$pid")
    done < <(tmux list-panes -s -t "$SESSION_NAME" -F '#{pane_pid}' 2>/dev/null)
  fi
  printf '%s\n' "${pids[@]:-}"
}

reap_session_trees() {
  local pane_pids
  mapfile -t pane_pids < <(collect_pane_pids)
  local reaped=0
  for pid in "${pane_pids[@]}"; do
    [[ -z "$pid" ]] && continue
    echo "  reaping process tree under pane PID $pid"
    kill_process_tree "$pid" TERM
    reaped=$((reaped + 1))
  done
  if (( reaped > 0 )); then
    sleep "$GRACE_SECONDS"
    for pid in "${pane_pids[@]}"; do
      [[ -z "$pid" ]] && continue
      # anything still alive in the tree gets SIGKILL
      kill_process_tree "$pid" KILL
    done
  fi
  echo "  reaped $reaped pane tree(s)."
}

# Conservatively sweep orphans: PPID=1, not inside ANY tmux pane tree, and whose
# command looks swarm-related. Never touches tmux/sshd/system processes.
sweep_orphans() {
  local swept=0
  # build the set of PIDs that belong to any live tmux pane (protected)
  local protected=()
  while read -r ppid; do
    [[ -n "$ppid" ]] && protected+=("$ppid")
  done < <(tmux list-panes -a -F '#{pane_pid}' 2>/dev/null)

  while read -r pid ppid cmd; do
    [[ "$ppid" != "1" ]] && continue
    # only sweep agent-runtime-looking orphans
    echo "$cmd" | grep -qiE '(codex|claude|node .*(swarm|agent)|pnpm|vitest|python3? .*agent)' || continue
    # protect anything still reachable from a live pane
    local is_protected=false
    for p in "${protected[@]:-}"; do
      if [[ "$pid" == "$p" ]]; then is_protected=true; break; fi
    done
    [[ "$is_protected" == true ]] && continue
    echo "  orphan: PID=$pid CMD=$(echo "$cmd" | cut -c1-60)"
    kill -TERM "$pid" 2>/dev/null || true
    swept=$((swept + 1))
  done < <(ps -eo pid=,ppid=,cmd= 2>/dev/null)
  echo "  swept $swept orphan(s)."
}

echo "[swarm-cleanup] mode=$mode session=$SESSION_NAME"

case "$mode" in
  sweep-only)
    sweep_orphans
    ;;
  tree-only)
    reap_session_trees
    ;;
  graceful)
    reap_session_trees
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
      echo "  killed tmux session $SESSION_NAME."
    fi
    sweep_orphans
    [[ -f "$ENV_FILE" ]] && rm -f "$ENV_FILE" && echo "  removed $ENV_FILE."
    ;;
esac

echo "[swarm-cleanup] done."
