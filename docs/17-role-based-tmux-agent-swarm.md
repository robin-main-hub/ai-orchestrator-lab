# Role-Based Tmux Agent Swarm

## Status

This document defines a future development and execution workflow for AI Orchestrator Lab.

The desktop preview and safe shell helpers are now part of the implementation path.

The v0 priority remains:

```text
Conversation Workbench
-> Event Store
-> Provider Adapter
-> Coding Packet
-> Execution Record
-> Obsidian Markdown Export
```

The first implemented tmux layer is deliberately conservative:

- `scripts/setup-agent-swarm.sh` creates the local `ai-swarm` session and records pane ids.
- `scripts/setup-agent-swarm.sh --panes 4..10` controls the swarm size. The default is 10 panes.
- `scripts/swarm-send.sh` dispatches to stored pane ids by role.
- Gemini CLI remains disconnected until CLI setup is done.
- The helper refuses obvious secret-bearing command text.
- The desktop UI still treats tmux as a permissioned execution backend, not an untracked side channel.

## Why This Fits the Product

AI Orchestrator Lab is not a normal single-chat coding app.

The product goal is a personal AI work command center where:

- the desktop app remains the orchestrator;
- conversation, debate, coding handoff, execution, review, memory, and backup are connected;
- multiple AI agents can work as specialized roles;
- CLI agents and terminal slots can eventually be controlled from the same system;
- all execution must be recorded, permissioned, redacted, and replayable as records.

The tmux swarm is a future local execution layer for this vision.

It should not replace the Event Store, Permission Matrix, Redaction Layer, Conversation Workbench, or Coding Packet flow.

It should become one possible runtime backend for execution slots.

## Core Paradigm

We are adopting a **Role-Based Tmux Agent Swarm** as a future local developer-operations workflow.

The orchestrator does not blindly execute all code in one chat or one terminal.

The intended workflow is:

1. Discuss the requirement.
2. Clarify product, business, and architecture constraints.
3. Convert the requirement into structured tasks.
4. Delegate each task to a specialized agent pane.
5. Monitor progress.
6. Collect results.
7. Record all decisions, commands, approvals, outputs, and unresolved errors in the Event Store.
8. Summarize the session into a Codex handoff record.

## Tmux Session

The tmux session name will be:

```text
ai-swarm
```

The swarm layout represents a virtual AI development office.

It is divided into two zones.

## Zone A: Command & Control

Left column, approximately 35% width.

This zone is for planning, command dispatch, and monitoring.

### Logical Pane 0: Discussion & Planning

Purpose:

- pre-work discussion;
- user requirements;
- product logic;
- business logic;
- architecture discussion;
- non-coding planning.

Rules:

- No direct coding happens here.
- This pane is for deciding what should be done before agents are dispatched.
- It mirrors the product's Conversation Workbench philosophy.

### Logical Pane 1: Orchestrator Control

Purpose:

- command center;
- task decomposition;
- delegation;
- issuing commands to worker panes;
- tracking which agent owns which task.

Rules:

- The orchestrator sends commands to specialized agent panes.
- The orchestrator should prefer structured task prompts over vague instructions.
- The orchestrator must not bypass permission or redaction policies.

### Logical Pane 2: Status & Monitor

Purpose:

- real-time progress monitoring;
- logs;
- typecheck/test output;
- stuck run detection;
- current agent status;
- unresolved errors.

Rules:

- This pane should be used to inspect progress, not to do primary coding.
- This pane should help the orchestrator decide when to retry, stop, or escalate.

## Zone B: Agent Grid

Right column, approximately 65% width.

This side is split into stacked horizontal panes.

Each pane represents a specialized AI worker role.

### Logical Pane 3: Agent - Code Expert

Purpose:

- complex algorithms;
- core logic;
- difficult implementation details;
- refactoring;
- cross-package problem solving.

### Logical Pane 4: Agent - Architect

Purpose:

- system structure;
- package boundaries;
- `packages/protocol`;
- Event Store schema;
- agent/session type design;
- long-term consistency.

### Logical Pane 5: Agent - Frontend Dev

Purpose:

- `apps/desktop`;
- Orchestrator Board;
- Conversation Workbench;
- Debate Table;
- Execution Slot UI;
- Runtime Status Bar;
- UI state and component structure.

### Logical Pane 6: Agent - Backend Dev

Purpose:

- `apps/server`;
- Event Store implementation;
- persistence;
- sync layer;
- server-side orchestration;
- future DGX integration points.

### Logical Pane 7: Agent - QA & Security

Purpose:

- tests;
- type-checks;
- lint;
- permission review;
- redaction review;
- secret-handling review;
- destructive command safety;
- regression checks.

### Logical Pane 8: Agent - Research Scout

Purpose:

- external documentation;
- repository reference checks;
- architecture examples;
- provider/model capability comparison;
- upstream changelog risk.

### Logical Pane 9: Agent - Memory Curator

Purpose:

- Memento recall;
- decision record cleanup;
- handoff state maintenance;
- Obsidian/Notion projection review;
- long-running project continuity.

## Relationship to Current v0

In v0, the real tmux swarm is not implemented.

v0 should only prepare the following foundations:

- `ExecutionSlot` type or equivalent;
- `AgentSession` type or equivalent;
- `RunRequestedEvent` / `RunCompletedEvent` event concepts;
- permission status for file write, terminal execution, network, secret, and destructive actions;
- redaction-before-persist rule;
- UI placeholder for terminal or execution slots;
- ability to create a Coding Packet from Conversation Workbench;
- ability to record execution intent without actually running dangerous commands.

The real tmux script must wait until these are stable.

## Current Desktop Preview

The desktop app may expose a `Tmux` top-level mode before real tmux execution exists.

This preview is allowed because it is only a UI/runtime concept boundary.

The preview should keep the same center board and change the interface inside it:

- left side: compact Operator Chat with small text, recent user/orchestrator messages, and planning context;
- right side: agent work-status board showing each logical pane, assigned role, current state, and important message;
- bottom/status areas: implementation gate, pending decisions, and disabled real command dispatch notice.

The preview must not send commands to tmux.

The preview must show unresolved decisions as blanks or `미정` so the user can decide later without blocking unrelated implementation.

Gemini CLI must remain disconnected until CLI setup is explicitly completed.

## Hard Rule: Event Store First

The tmux swarm must never become an untracked side channel.

Every meaningful swarm action should eventually map to Event Store events.

Examples:

```text
agent.session.spawned
agent.session.message.sent
agent.session.yielded
run.requested
run.approval.requested
run.approval.granted
run.completed
run.failed
coding_packet.created
```

The tmux pane itself is only a runtime surface.

The Event Store remains the source of truth.

## Hard Rule: Permission Before Execution

Real tmux execution must obey the Permission Matrix.

The following actions require explicit approval unless the project policy says otherwise:

- file writes;
- terminal execution;
- network calls;
- secret access;
- destructive operations;
- remote workspace commands;
- commands from Telegram, mobile, API, or other external channels.

Telegram, mobile, and external API commands must never directly execute inside tmux panes.

They must pass through Ingress Guard, Redaction, Permission classification, and approval.

## Hard Rule: Redaction Before Logging

The tmux swarm must not leak secrets into logs, Event Store, Obsidian, Notion, or handoff documents.

The system must redact:

- API keys;
- bearer tokens;
- auth tokens;
- `.env` contents;
- private key blocks;
- cookies;
- session tokens;
- user-defined sensitive strings.

If a command contains secrets, only redacted command text may be recorded.

## Setup Script

The repository includes:

```text
scripts/setup-agent-swarm.sh
```

This script:

1. create or reset the `ai-swarm` tmux session;
2. build the two-zone layout;
3. create 4 to 10 logical panes;
4. title each pane clearly;
5. use visible pane labels;
6. save actual tmux pane IDs to a local env file;
7. generate a helper script for sending commands to logical roles;
8. avoid relying on fragile numeric pane indexes;
9. be safe to rerun;
10. not store secrets or raw credentials.

Required tmux features:

```bash
tmux set -g pane-border-status top
tmux select-pane -T "Pane Title"
printf "\033]2;%s\033\\"
```

The script should prefer stored pane IDs like `%3`, `%4`, etc. over assumptions such as `ai-swarm:0.6`.

## Helper Script

The repository includes:

```text
scripts/swarm-send.sh
```

The helper should support role-based dispatch.

Example roles:

```text
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
```

Example future command shape:

```bash
scripts/swarm-send.sh architect "codex 'Review packages/protocol and propose Event Store type boundaries'"
scripts/swarm-send.sh frontend "codex 'Implement Execution Slot UI stub in apps/desktop'"
scripts/swarm-send.sh backend "codex 'Implement SQLite Event Store adapter skeleton'"
scripts/swarm-send.sh qa "pnpm typecheck && pnpm test"
scripts/swarm-send.sh research "codex 'Check upstream docs for tmux pane title behavior'"
scripts/swarm-send.sh memory "codex 'Summarize this run into handoff notes'"
```

The helper is role-based and uses stored pane ids instead of fragile pane indexes. It also refuses command text that appears to contain API keys, bearer tokens, or private key material.

## Orchestration Rules

### 1. Discuss First, Delegate Second

For any new requirement:

1. discuss it in the Discussion & Planning context;
2. identify business, product, and architecture implications;
3. decide whether it belongs in v0 or later;
4. convert it into implementation tasks;
5. delegate tasks to the correct role;
6. monitor progress;
7. collect results;
8. update the handoff document.

### 2. Delegate by Role

Do not send all tasks to one generic coding agent.

Use role-based delegation:

| Task Type | Agent |
| --- | --- |
| protocol types | Architect |
| Event Store / server | Backend Dev |
| desktop UI | Frontend Dev |
| core logic | Code Expert |
| security / permission / tests | QA & Security |
| monitoring / progress | Status & Monitor |

### 3. Preserve Human Visibility

The user should be able to see:

- which agent received which task;
- what command was sent;
- what files changed;
- what checks ran;
- what failed;
- what remains unresolved.

This future capability should connect to Human Peek or an equivalent inspection UI.

### 4. Do Not Break v0

The tmux swarm must not distract from the v0 slice.

Codex must not implement real tmux execution until these exist:

- protocol package;
- Event Store interface;
- redaction layer;
- permission model;
- execution slot UI stub;
- Coding Packet flow;
- basic test/typecheck workflow.

### 5. Maintain Handoff State

Before ending a swarm-based work session, update:

```text
docs/16-codex-implementation-handoff.md
```

Include:

1. what was discussed;
2. what tasks were delegated;
3. which agent handled each task;
4. files changed;
5. tests/checks run;
6. unresolved errors;
7. next recommended action.

## Implementation Gate

Codex may only implement the real tmux swarm when all of the following are true:

- `packages/protocol` exports execution/session/event-related types;
- Event Store can record at least conversation and run-intent events;
- Permission Matrix has a basic implementation;
- Redaction is applied before persistence/export;
- desktop has an execution slot or terminal slot placeholder;
- current v0 flow is not blocked by adding the swarm;
- the user explicitly asks to implement tmux.

Until then, this document is a future architecture and operations specification only.

## Current Desktop Preview Requirements

Before real tmux execution exists, the desktop Tmux mode must still make the future workflow visible.

The preview UI should:

- keep the operator conversation on the left in compact text;
- remove the normal right rail while Tmux mode is active;
- use the expanded center surface for agent pane status;
- show each logical pane with agent name, role, selected model, current status, and important message;
- let the orchestrator recommend 4, 6, 8, or 10 panes based on task difficulty;
- show implementation gates for the event storage, Permission Matrix, Redaction, Gemini CLI lockout, runner selection, and profile asset storage;
- keep real command dispatch disabled.

Agent profile images are supported as embedded data URLs in the desktop state and profile update events. The preview must not depend on local file paths because MacBook, Home PC, and remote/mobile views may not share the same filesystem.

Agent setting controls must allow:

- editing the agent display name;
- changing the agent role;
- uploading or clearing the profile image;
- preserving the profile image in a path-independent form.

## Summary

The Role-Based Tmux Agent Swarm fits AI Orchestrator Lab and now has a safe local helper implementation.

It is still governed by the Event Store, Permission Matrix, Redaction Layer, and human-visible orchestration rules.
