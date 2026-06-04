# Operator Cockpit Slot Map

## Purpose

This document defines where future external design ideas can land without
polluting protocol taxonomy or opening unsafe runtime paths.

The product is an operator cockpit, not a generic chat app. A candidate idea is
valuable when it helps the operator see state, choose the next action, approve
or block work, recover context, or route agents faster.

## Taxonomy Boundaries

Before assigning a candidate idea to a slot, preserve these boundaries.

| Concept | Meaning | Do not use it for |
| --- | --- | --- |
| `WorkLane` | Business state: `auto`, `check`, `ask`, `approve`, `blocked` | UI tabs, runtimes, channels, modes |
| `WorkSurface` | Where work appears or executes: conversation, debate, coding packet, execution slot, tmux, obsidian, notion, mobile | Business priority or customer intent |
| `WorkItemKind` | EXAMPLE_DOMAIN practical work type | Every external project's task taxonomy |
| `WorkMode` | Top-level product mode | Approval status or source channel |

External design candidates should land first as docs, mock UI, read-only views,
protocol contracts, or isolated prototype components.

## Top Navigation Slots

| Slot | Operator question | Candidate ideas that fit |
| --- | --- | --- |
| Conversation | What am I asking or deciding right now? | Chat-first command entry, current objective, answer provenance |
| Debate | What do multiple agents disagree about? | Argument maps, consensus meters, objection queues |
| Coding | What should be handed to implementation? | Coding packets, patch plans, review checklists |
| Tmux Workers | What are background workers doing? | Pane overview, worker health, dispatch history, safe prompt packets |
| Memory | What context is active and why? | Recall trace, contradiction warnings, memento resume packets |
| Recovery | What must sync or resume after interruption? | Offline outbox, conflict panels, MacBook/DGX mirror health |
| Provider Status | Which model/provider is in use and why? | Role pools, fallback state, trust/cost/speed badges |

## Cockpit Card Slots

| Card | Shows | Good external inspiration looks like |
| --- | --- | --- |
| Active Work Items | Current work grouped by business lane and owner | Kanban-like triage without changing `WorkLane` |
| Blocked Approvals | Human decisions required before action | Clear reason, evidence, replay preview, risk label |
| Worker Panes | Tmux or CLI worker state | Read-only pane summaries, last output age, role/status chips |
| Evidence Required | Missing facts blocking safe work | Missing-info fields, source links, confidence labels |
| Recent Dispatches | Approved, dry-run, failed, or blocked sends | Timeline with actor, target surface, and redacted preview |
| Memory Recall Reasons | Memories selected for current work | Why-this-memory, trust level, stale/contradiction badges |
| Model Routing / Fallback | Actual model/provider provenance | Role binding, fallback chain, cost/speed/trust indicators |
| Authority / Mirror Health | MacBook authority and DGX continuity mirror | Outbox count, last sync, conflict count, derived index revision |
| Handoff Packet | What the next worker needs | Objective, active files, missing info, evidence, next command |
| Command Shortcuts | Fast operator actions | Mode-aware actions, recent commands, permission-aware filtering |

## Runtime Slots

These slots may be represented in UI before they are live.

| Runtime slot | Safe first landing | Unsafe early landing |
| --- | --- | --- |
| tmux pane capture | Read-only capture preview with redaction note | Direct `send-keys` outside approval gates |
| tmux dispatch | Dry-run replay preview | Mobile/API/Telegram direct dispatch |
| SimpleMem/MCP | Derived recall trace or mock adapter | Treating MCP as source of truth |
| Provider fallback | Read-only provenance and badge | Silent fallback with no operator visibility |
| Recovery sync | Outbox/mirror health card | Automatic conflict overwrite |
| External ingress | Filtered confidence/risk preview | Direct promotion into trusted work state |
| Destructive action | Permission/evidence preview | One-click mutation without replay context |

## Candidate Placement Checklist

For every external idea, answer these before implementation:

1. Which operator question does it answer?
2. Which top navigation slot or cockpit card slot owns it?
3. Does it require a new protocol contract, or can it start as mock/read-only UI?
4. Does it keep `WorkLane`, `WorkSurface`, and `WorkItemKind` separate?
5. Does it preserve MacBook authority and DGX-02 continuity mirror semantics?
6. Does it avoid live tmux/MCP/provider mutation in the first PR?
7. Does it expose evidence, source trust, permission, or replay context where an
   operator decision is required?
8. What is the smallest visible improvement?

## Recommended First Landing Pattern

Prefer this order:

```text
external idea
  -> intake record
  -> cockpit slot
  -> mock or read-only UI
  -> protocol contract if needed
  -> runtime integration only after approval/security review
```

## Examples

| External idea | Slot | First PR shape |
| --- | --- | --- |
| "Worker dashboard with live status" | Tmux Workers / Worker Panes | Read-only pane status card using fixtures or existing state |
| "Memory graph explains recall" | Memory / Memory Recall Reasons | Add recall reason display before graph mutation |
| "Approval card shows exact command replay" | Blocked Approvals / Recent Dispatches | Expand replay preview text with existing redacted payload |
| "Model router shows why fallback happened" | Provider Status / Model Routing | Read-only fallback provenance badge |
| "Resume after sleep" | Recovery / Authority Health | Outbox/mirror health summary with no auto-conflict writes |
