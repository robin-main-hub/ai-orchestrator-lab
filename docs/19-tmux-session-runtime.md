# Tmux Session Runtime

## Status

This document defines tmux as a future terminal session runtime for AI Orchestrator Lab.

The current implementation may define protocol types, read-only capture helpers, UI previews, and Event Storage mappings.

Real automatic command dispatch remains gated by:

- Event Storage persistence
- Permission Matrix
- Redaction Layer
- Execution Slot UI
- explicit user approval for dangerous actions

The Claude worker path uses persistent interactive Claude Code sessions inside tmux panes. It must not use `claude -p`, `--print`, or unaudited direct process execution.

## Why tmux

tmux is a terminal multiplexer. It can keep sessions alive after detach and can later reattach to them from another terminal. That matches the product need for long-lived CLI agents that survive app reconnects, SSH interruption, and MacBook/Home PC handoff.

For AI Orchestrator Lab, tmux is not the source of truth.

```text
Conversation / Debate / Coding Packet
  -> Event Storage
  -> Permission + Redaction
  -> TerminalCommandIntent
  -> tmux runtime
  -> pane output capture
  -> Event Storage
  -> Backup / Mobile / Replay
```

tmux is the runtime surface.
Event Storage remains the record.

Interactive Claude workers fit this model as long-lived processes inside selected panes:

```text
Operator request
  -> Permission + Redaction
  -> TerminalCommandIntent
  -> scripts/swarm-claude-task.sh
  -> interactive Claude Code pane
  -> scripts/swarm-capture.sh
  -> redacted capture event
```

The worker process is not a separate source of truth. It is just another terminal runtime attached to an audited pane id.

## Runtime Concepts

### TmuxSessionRef

Represents one tmux session such as `ai-swarm`.

Required fields:

- session name
- host: local Mac, Home PC, DGX-02, or locked DGX-01
- attach command
- pane count
- status: planned, starting, attached, detached, unreachable, closed
- whether control mode is enabled

### TerminalPane

Represents one tmux pane.

Required fields:

- pane id such as `%8`
- role: discussion, orchestrator, status, code, architect, frontend, backend, qa, research, memory
- host
- title
- optional agent id
- status
- last output timestamp

### TerminalCommandIntent

Represents the intention to run a command, before any actual `send-keys`.

Required fields:

- target pane id
- requested actor
- command preview
- redacted command preview
- requested permissions
- approval state
- dispatch state
- blocked reason if applicable

This object is safe to persist because it stores redacted command preview only.

## Event Mapping

The tmux runtime should emit or derive these events:

| Event | Meaning |
| --- | --- |
| `terminal.session.detected` | Existing tmux session was found |
| `terminal.session.attached` | UI or runtime attached to a tmux session |
| `terminal.session.detached` | Runtime detached but session remains alive |
| `terminal.pane.detected` | Pane id/title/role was discovered |
| `terminal.command.intent.created` | Command intent was recorded before dispatch |
| `terminal.command.blocked` | Permission, redaction, or policy blocked dispatch |
| `terminal.command.sent` | Approved command was sent to a pane |
| `terminal.pane.output.captured` | Pane output was captured and redacted |
| `terminal.pane.stale` | Pane has not emitted output recently |

## Read-Only Capture

`scripts/swarm-capture.sh` is the safe capture helper.

It:

- reads stored pane ids from `.ai-swarm/ai-swarm.env`
- uses `tmux capture-pane`
- redacts obvious API keys, bearer tokens, env token assignments, and private key markers
- prints output only
- never sends keys
- never executes commands inside a pane

This can be wired into Event Storage before command dispatch is enabled.

## Interactive Claude Worker Helpers

`scripts/swarm-start-claude-workers.sh` starts interactive Claude Code workers in existing swarm panes.

It:

- requires an existing `ai-swarm` tmux session and `.ai-swarm/ai-swarm.env`;
- starts `claude` without `-p` or `--print`;
- defaults to `--permission-mode plan`;
- records non-secret worker pane metadata in `.ai-swarm/ai-swarm.claude-workers.env`;
- leaves actual task dispatch to `scripts/swarm-claude-task.sh`.

`scripts/swarm-claude-task.sh` sends a structured prompt packet to an already-running worker pane.

It:

- requires worker state from `swarm-start-claude-workers.sh`;
- refuses obvious secrets in task text;
- uses `tmux load-buffer` and `paste-buffer` for prompt dispatch;
- logs only redacted dispatch metadata;
- does not run a new Claude process.

The app-facing runtime should still model these sends as `TerminalCommandIntent` records and route real dispatch through the same approval, dry-run, and redaction gates as any other tmux send.

## Interactive Hermes Worker Provisioning

`scripts/swarm-start-hermes-workers.sh` provisions the pane runtime the desktop autonomous runner depends on.

The persona/closed-loop path (`personaTaskRunner` → `closedLoopRuntime`) dispatches text into agent panes; that text is meaningful only to an interactive agent CLI already running there. A bare-shell pane would interpret injected identity text as shell commands, so autonomous runs must not start until the worker layer is up.

Rules:

- start workers at pane creation (`setup-agent-swarm.sh --with-hermes`) or re-run the starter as an idempotent readiness pass before an autonomous run;
- `--status` is the read-only readiness probe (idle-shell vs worker per role);
- the starter never sends task prompts, persona text, or session resets — those stay on the gated dispatch path;
- worker metadata lives in `.ai-swarm/<session>.hermes-workers.env` and contains no secrets.

## Control Mode Later

tmux control mode should be considered after basic capture works.

It is useful because a control client can receive pane output notifications with stable pane ids and session/window change notifications. It is also more complex than a plain capture helper and can become a terminal emulator project if implemented too early.

Recommended order:

1. `list-panes` / env file / read-only `capture-pane`
2. Event Storage mapping for captured output
3. Permissioned command intent and approval
4. Manual dispatch from approved intent
5. Control mode parser for streaming output

## DGX Rules

DGX-02 may host remote tmux sessions.

DGX-01 must remain locked unless explicitly released by the user.

If DGX-02 is unreachable:

- local Mac tmux may still work
- local capture may still work
- remote pane output is unavailable
- queued remote intents stay pending

## Hard Rules

- Never treat tmux pane output as trusted before redaction.
- Never store raw secrets from pane output.
- Never dispatch external/mobile/API commands directly into tmux.
- Never use numeric pane indexes as stable identity when pane ids are available.
- Never make tmux the source of truth.
- Never use headless Claude invocation for this worker path; use persistent interactive panes only.
