# AI Orchestrator Lab — Current Tasks

## Status

- Current operating mode: Real Behavior Continuous Mode
- Micro-characterization / zero-ref export loop: CLOSED
- New design docs: CLOSED unless owner explicitly reopens
- Authority flip / Phase 0+ execution changes: HOLD until owner approval

## Current PR

- None active. Last merged: #1061 (`d20e2a86`).

## Completed

### PR #1060 — cross-mission contamination defense (merged `e68e6b14`)

- cross-mission artifact payload rejection
- nested missionId audit (13 schemas, 3 write-side gaps, 11 read-side gaps fixed)
- TASKS.md established as source of truth
- docs/work-board.md deprecated
- handoff: `docs/handoffs/2026-06-25-real-behavior-mode.md`

### PR #1061 — mission vertical integration suite (merged `d20e2a86`)

- 6 end-to-end integration tests
- create → artifact → verify → merge queue → reload → rebuild
- cross-mission injection rejection (artifact/verification/merge)
- read-side contaminated log defense
- merge queue requires observed + passed verification

### Open PR landscape review (completed 2026-06-25)

- `docs/handoffs/2026-06-25-open-pr-landscape.md` created
- #793 — stale but salvageable (shell IA files unique, App.tsx massive conflict, test commits stale)
- #562 — still valuable (server-side mimo auth injection, security improvement, needs rebase + owner env verification)
- #561 — still valuable (tiny SummonTheater cursor fix, cherry-pick candidate)
- #513 — already landed / superseded (main has richer productKernel.ts + runtime bridge)

## Next Tasks

1. onHandoff → control queue approval wiring

   - Handoff should create an approval/control queue item.
   - It must not dispatch runner execution before approval.

2. opencode --format json schema

   - Define parser contract from real output or fixture.
   - Handle partial JSON, unknown fields, and failure output.

3. ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS runbook

   - Owner action only.
   - Do not enable automatically.
   - Document env, validation, rollback.

4. Open PR owner actions (review only — do not merge/close)

   - #561: cherry-pick `1ea87bbd` onto main
   - #562: rebase onto main, resolve vite.config.ts, verify MiMo env
   - #793: cherry-pick `5c3e63e2`, manually re-apply App.tsx integration
   - #513: close (superseded)

## Explicitly Deprecated

- `docs/work-board.md`
  - R5/R6-era work board
  - Not the current source of truth
  - Kept only for historical context

## Rules

- One active behavior PR at a time.
- No zero-ref export mining.
- No enum/schema/fixture/constant-only PRs.
- No test-only micro PR loop.
- No new design docs unless owner asks.
- No authority flip without owner approval.
- No production write, secret entry, or old PR merge/close without owner approval.
