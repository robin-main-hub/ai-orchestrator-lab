# External Design Intake Framework

## Goal

The goal is not conservative refusal, and it is not blind copying.

AI Orchestrator Lab should actively absorb strong ideas from external project
research, then reshape them into this product's operator-cockpit architecture.
External projects can provide excellent interaction patterns even when their
runtime, taxonomy, or implementation style is not suitable for this codebase.

Use this document when Kimi, MiMo, Claude, GPT Pro, or another research worker
brings reference projects, screenshots, papers, repo links, demos, or design
notes.

## Absorb, Do Not Copy

- Messy implementation can still contain a great idea.
- Extract the operator value, not the source project's architecture.
- Prefer pattern transplantation over raw code copying.
- Every adoption must become a small PR with clear user-visible value.
- License and attribution must be checked before copying any source code.
- If a license is unclear or restrictive, reimplement the idea from scratch.
- Reference folders such as `docs/v0/v0-output/` and `docs/manus/` are
  inspiration sources, not authority. Port patterns into this repo's current
  primitives, components, and design decisions instead of importing raw output.

The winning move is:

```text
external inspiration
  -> operator value
  -> cockpit slot
  -> smallest safe PR
  -> verified adoption
```

## Intake Record

Create one record per candidate idea.

| Field | Required answer |
| --- | --- |
| Source / project | Name, URL, license if known, and what artifact was inspected |
| Inspiring design pattern | The specific UI, workflow, memory, approval, routing, or recovery pattern |
| Operator value | How this helps the human decide, command, observe, resume, or trust faster |
| Applicable area | Cockpit navigation, approval evidence UX, memory recall UX, multi-agent handoff, provider routing, recovery continuity, or command palette |
| Proposed transplant shape | How the idea should look or behave inside AI Orchestrator Lab |
| Smallest PR unit | The smallest docs-first, mock-first, read-only-first, protocol-first, or UI-only slice |
| Guardrails | Which existing rules must remain untouched |
| Copy policy | Copy with attribution, reimplement from pattern, or do not use |
| Decision | Reject, defer, adopt, or prototype |

## Landing Modes

External ideas should land in one of these controlled modes before touching live
runtime behavior.

| Mode | Use when | Allowed scope |
| --- | --- | --- |
| docs-first | The pattern affects architecture, taxonomy, or product language | Design docs, scorecards, diagrams |
| mock-first | The idea is visual or cockpit-oriented but runtime wiring is risky | Fixture data, read-only mock UI, no mutation |
| read-only-first | The idea observes state but should not alter state yet | Inspectors, traces, timelines, explainers |
| protocol-first | The idea needs a stable contract before UI or runtime work | Zod schemas, tests, event payloads |
| isolated prototype-first | The idea is promising but not ready for the main workflow | Feature-flagged or unlinked prototype surface |

## Areas To Actively Mine

Do not ask GPT Pro or Kimi only to reject risky ideas. Ask them to find useful
patterns in these areas.

### Cockpit Navigation

- Mode grouping for Conversation, Debate, Coding, Tmux Workers, Memory,
  Recovery, and Provider Status.
- Worker overview panels that show state without opening terminal panes.
- Operator-first top navigation that answers "where should I act now?"

### Approval Evidence UX

- Approval rows that show why the action is blocked.
- Replay previews that explain exactly what will happen after approval.
- Evidence cards that connect the request to events, memory, files, and source
  channels.

### Memory Recall UX

- Recall traces that explain why a memory appeared.
- Stale, contradictory, quarantined, or low-trust memory warnings.
- Memento or resume packets that are compact enough to hand off.

### Multi-Agent Handoff

- Next-action cards.
- Missing-info slots.
- Owner / lane / surface separation.
- Compact packets that another worker can start from immediately.

### Provider Routing

- Role-based pools.
- Fallback visibility.
- Cost, speed, trust, and provenance badges.
- Explicit display of which model actually answered.

### Recovery Continuity

- Sleep/offline resume.
- Outbox sync status.
- MacBook authority to DGX-02 continuity mirror health.
- Conflict panels that do not require reading raw logs.

### Command Palette

- Mode-aware command groups.
- Recent actions.
- Safe destructive-action confirmation.
- Search results that include target surface and required permission.

## Hard Guardrails

These are not negotiable.

- `WorkLane` remains business-only: `auto`, `check`, `ask`, `approve`,
  `blocked`.
- UI and execution placement belongs in `WorkSurface`, not `WorkLane`.
- Do not broaden `WorkItemKind` merely because an external project has more
  categories.
- MacBook remains the operator authority for active work and offline outbox.
- DGX-02 remains continuity mirror, sync server, heavy model host, and derived
  retrieval index host.
- SimpleMem and MCP are derived retrieval/index layers, not source-of-truth
  databases.
- Live tmux dispatch remains behind approval, redaction, replay binding,
  dry-run safety, and server gates.
- Telegram, mobile, or API input must not dispatch directly into tmux.
- Protected actions must pass through Permission Matrix policy and redaction.
- Unknown external effects deny by default until explicitly modeled.
- Untrusted sources, providers, and memories must not receive automatic recall,
  secret access, or execution authority.
- Approval and execution candidates must show evidence, source trust, and replay
  context before asking the operator to act.

## GPT Pro Review Prompt Shape

When Kimi returns research, ask GPT Pro for positive selection:

```text
Do not only reject risky ideas.
Choose what AI Orchestrator Lab should add.

For each candidate, extract the useful product pattern, map it to our cockpit,
name the smallest safe PR, and list the guardrails that keep it clean.
If the original implementation is messy, discard the implementation and keep
the idea.
```

## Russian Judge Rule

- Refusing good external ideas just because they are external: deduction.
- Copying external architecture blindly: deduction.
- Extracting a great design and transplanting it into our architecture through
  small verified PRs: high score.
