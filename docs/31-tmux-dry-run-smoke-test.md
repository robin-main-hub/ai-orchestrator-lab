# Tmux Dry-Run Smoke Test

## Status

This document defines a no-engine smoke path for the desktop approval and tmux dispatch flow.

Use this when DGX-02 is busy with model work, vLLM is serving another queue, or real tmux panes must not be touched.

## Goal

Test this flow without using the DGX-02 local model engine and without executing real `tmux send-keys`:

```text
Desktop Tmux Workbench
-> /tmux/preflight
-> timeline block preview
-> /tmux/dispatch
-> approval.requested
-> Ops approval queue refresh
-> operator approve
-> /approvals/grant
-> desktop replay
-> /approvals/replay (server re-runs the stored dispatch payload)
-> dry-run accepted
-> Ops redispatch outcome
```

## Server Environment

Run the orchestrator server locally or on a non-busy node:

```env
ORCHESTRATOR_API_TOKEN=dev-orchestrator-token
ORCHESTRATOR_TMUX_DRY_RUN=1
```

Do not enable real send-keys for this smoke path:

```env
ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=
```

With dry-run enabled, an approved tmux dispatch returns:

```text
dispatch.status = dry_run
dispatch.attempted = false
dispatch.reason contains ORCHESTRATOR_TMUX_DRY_RUN
timelineBlocks includes kind=dry_run
```

## Desktop Environment

Point the desktop client at the dry-run server instead of DGX-02:

```env
VITE_DGX_SERVER_BASE_URL=http://127.0.0.1:4317
VITE_DGX_SERVER_FALLBACK_BASE_URLS=
VITE_ORCHESTRATOR_API_TOKEN=dev-orchestrator-token
```

This avoids `http://dgx-02:4317`, `https://orchestrator.endruin.com`, vLLM, and real tmux panes.

## Expected UI Result

1. Tmux pane dispatch shows approval queued.
2. Ops rail refreshes the DGX approval queue.
3. The approval row displays a tmux dispatch reason and replay endpoint.
4. After approval, the recent redispatch list shows `dry_run`.
5. No real `send-keys` command is executed.

## Production Rule

Dry-run is only for smoke testing.

Real dispatch still requires:

```env
ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1
ORCHESTRATOR_TMUX_DRY_RUN=
```

and must remain behind Event Storage, Permission, Redaction, and Approval gates.

## Automated Smoke

With a dry-run server already running, execute:

```bash
corepack pnpm tmux:smoke:dry-run
```

The script verifies:

- `/health` exposes `tmux-dispatch-gate`;
- `/tmux/preflight` returns permission, audit checks, and timeline blocks;
- `/tmux/dispatch` with `approvalState=required` queues an approval;
- `/approvals/grant` approves that dispatch;
- `/approvals/replay` re-runs the stored dispatch payload and returns `dry_run`;
- `dispatch.attempted=false`, proving no real `tmux send-keys` ran.

> Note: re-POSTing `/tmux/dispatch` with a fabricated `approvalState=approved`
> request is intentionally rejected by the approval-bypass gate. Approved
> dispatches must go through `/approvals/replay`, which is also what the
> desktop client does.
