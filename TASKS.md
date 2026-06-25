# AI Orchestrator Lab — Current Tasks

## Status

- Current operating mode: Real Behavior Continuous Mode
- Micro-characterization / zero-ref export loop: CLOSED
- New design docs: CLOSED unless owner explicitly reopens
- Authority flip / Phase 0+ execution changes: HOLD until owner approval

## Current PR

- None active. Last merged: #1070 (`befca9f1`).

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

### PR #1066 — summon theater cursor fix (merged `8daed7da`)

- Reimplementation of #561 on latest main
- Footer: flex nowrap row, cursor pinned to text end, aria-hidden
- Original #561 closed as superseded

### #561 closed as superseded by #1066

### #513 closed as superseded

- main's `productKernel.ts` (545 lines) replaces #513's 296-line version
- main adds `productKernelContracts.ts` (331 lines) runtime bridge — #513 never had
- All persona-file changes already in main
- Type vocabulary diverged (kernel*/product* → mission*/sandbox*)

### PR #1067 — stale PR decisions update (merged `f3a65f63`)

- #561 closed as superseded by #1066
- #513 closed as superseded
- #562 review packet: `docs/handoffs/2026-06-25-mimo-pr-562-review.md`
- #793 integration difficulty assessment added to landscape doc

### PR #1068 — #562 Mimo salvage plan (merged `0b21213e`)

- `docs/handoffs/2026-06-25-mimo-pr-562-salvage-plan.md` — upstream comparison, security boundary, minimal salvage PR plan
- Owner decisions resolved: upstream = `token-plan-sgp.xiaomimimo.com`, env = `MIMO_TP_API_KEY`

### PR #1069 — shell IA layer from #793 (merged `eee07542`)

- 4 new files cherry-picked from #793 commit `5c3e63e2`:
  - `apps/desktop/src/lib/appShellIa.ts` (322 lines) — 5-section IA config
  - `apps/desktop/src/lib/appShellIa.test.ts` (52 lines) — 5 tests
  - `apps/desktop/src/components/AppShellNav.tsx` (192 lines) — nav component
  - `apps/desktop/src/styles/renewal-shell.css` (653 lines) — command OS CSS
- No existing code touched — additive only
- PR B (App.tsx integration) plan at `docs/handoffs/2026-06-25-pr-b-shell-ia-integration-plan.md`

### PR #1070 — Mimo server-side auth injection (merged `befca9f1`)

- Replaces passthrough proxy with server-side `MIMO_TP_API_KEY` injection
- Client sends `"mimo-ready"` sentinel; proxy overwrites with real key from env
- VITE_MIMO_* env reading removed from client — no key in browser bundle
- 15 unit tests: env missing, auth injection, client stripping, endpoint verification, upstream errors, no real network
- Vite dev proxy mirrors same injection from `process.env.MIMO_TP_API_KEY`
- Owner action: set `MIMO_TP_API_KEY` in Cloudflare Pages env + dev shell

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
- #562 Mimo server-side auth: LANDED (PR #1070) — owner env insertion pending
- #793 shell IA layer: LANDED (PR #1069) — PR B App.tsx integration plan ready, owner seam confirmation pending

## Owner action pending

- **ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS** — runbook at `docs/runbooks/orchestrator-enable-tmux-send-keys.md`. Owner must SSH to DGX-02, edit `.env`, restart server, run validation checklist.
- **MIMO_TP_API_KEY env insertion** — set in Cloudflare Pages project env (Production + Preview) + dev shell. Do NOT set `VITE_MIMO_*` anywhere.
- **#793 PR B seam confirmation** — plan at `docs/handoffs/2026-06-25-pr-b-shell-ia-integration-plan.md`. Owner must confirm:
  1. Add `AppShellNav` alongside `RuntimeStatusBar` (not replacing)?
  2. Virtual surface handling: map to annex, wire specific handlers, or no-op?
  3. `pendingApprovals` data source for AppShellNav prop?

## Next steps

- #793 PR B: implement after owner confirms seam
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
