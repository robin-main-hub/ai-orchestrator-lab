# AI Orchestrator Lab — Current Tasks

## Status

- Current operating mode: Real Behavior Continuous Mode
- Micro-characterization / zero-ref export loop: CLOSED
- New design docs: CLOSED unless owner explicitly reopens
- Authority flip / Phase 0+ execution changes: HOLD until owner approval

## Current PR

- None active. Last merged: #1064 (`d9d12e70`).

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

### PR #1062 — open PR landscape review (merged `fdd61ff8`)

- `docs/handoffs/2026-06-25-open-pr-landscape.md` created
- #793 — stale but salvageable (shell IA files unique, App.tsx massive conflict, test commits stale)
- #562 — still valuable (server-side mimo auth injection, security improvement, needs rebase + owner env verification)
- #561 — still valuable (tiny SummonTheater cursor fix, cherry-pick candidate)
- #513 — already landed / superseded (main has richer productKernel.ts + runtime bridge)

### PR #1063 — onHandoff → control queue approval wiring (merged `bb5a1b20`)

- `routeHandoffToControlQueue` adapter: RunnerPatchHandoff → ApprovalQueueItem
- state="required" — approval mandatory before any apply
- runner dispatch never called from handoff path
- 8 regression tests

### PR #1064 — opencode JSON parser contract (merged `d9d12e70`)

- `parseOpenCodeJsonStream` fix: invalid JSON lines now emit error events (no silent drop)
- `parseOpenCodeJsonOutput` classifier: discriminated union `{ ok: true, events } | { ok: false, reason, rawPreview, parseError? }`
- 16 contract tests covering valid/invalid/partial/noise/failure/empty cases
- Note: actual opencode --format json sample unavailable; synthetic fixtures used; contract should be strengthened when real sample is available

### tmux send-keys runbook (completed 2026-06-25)

- `docs/runbooks/orchestrator-enable-tmux-send-keys.md` created
- Owner-only enable steps, validation checklist, rollback, safety boundaries
- ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS enablement is OWNER ACTION PENDING

## Current status

- Real behavior transition: COMPLETE
- Cross-mission contamination defenses: COMPLETE
- Mission vertical integration suite: COMPLETE
- Open PR landscape: REVIEWED
- onHandoff approval wiring: COMPLETE
- opencode JSON parser contract: PINNED
- tmux send-keys enablement: OWNER ACTION PENDING (runbook ready)

## Owner action pending

- **ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS** — runbook at `docs/runbooks/orchestrator-enable-tmux-send-keys.md`. Owner must SSH to DGX-02, edit `.env`, restart server, run validation checklist.
- **Open PR decisions** — see landscape review (`docs/handoffs/2026-06-25-open-pr-landscape.md`):
  - #561: cherry-pick `1ea87bbd` onto main
  - #562: rebase onto main, resolve vite.config.ts, verify MiMo env
  - #793: cherry-pick `5c3e63e2`, manually re-apply App.tsx integration
  - #513: close (superseded)

## Next steps

No remaining AI-executable implementation tasks. Next work requires owner decision:
- Enable tmux send-keys (runbook ready)
- Act on stale PR landscape (4 PRs awaiting owner decision)
- Or assign new work

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
