# AI Orchestrator Lab — Current Tasks

## Status

- Current operating mode: Real Behavior Continuous Mode
- Micro-characterization / zero-ref export loop: CLOSED
- New design docs: CLOSED unless owner explicitly reopens
- Authority flip / Phase 0+ execution changes: HOLD until owner approval

## Current PR

- PR #1060
- Purpose: cross-mission contamination defense
- Included fixes:
  - write-side nested missionId checks
  - read-side replay/materialization defense
  - regression tests
- Latest known commit: 7ff15d31
- Baseline mentioned in handoff: main 1e70f7ae

## Completed in PR #1060

- cross-mission artifact payload rejection
- nested missionId audit
- 13 payload schema reviewed
- 3 write-side gaps fixed
- 11 read-side gaps fixed
- targeted tests: 43/43 pass
- full server tests: 609/609 pass
- typecheck: clean

## Next Tasks

1. Mission vertical integration suite
   Flow:
   create mission
   → append artifact
   → record verification
   → queue merge
   → reload raw events
   → rebuild materialized mission

   Required assertions:

   - all nested missionId values match the route mission
   - rejected events are not appended
   - replay/materialization does not resurrect rejected events
   - observed truth only follows observed evidence
   - no cross-mission artifact/verification/merge leakage

2. Open PR landscape review
   Review only. Do not merge or close automatically.
   PRs:

   - #793 UI renewal draft
   - #562 Mimo server-side auth injection
   - #561 summon theater cursor fix
   - #513 product kernel isolation draft

   Classify each as:

   - already landed / superseded
   - stale but salvageable
   - conflict / obsolete
   - still valuable

3. onHandoff → control queue approval wiring

   - Handoff should create an approval/control queue item.
   - It must not dispatch runner execution before approval.

4. opencode --format json schema

   - Define parser contract from real output or fixture.
   - Handle partial JSON, unknown fields, and failure output.

5. ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS runbook

   - Owner action only.
   - Do not enable automatically.
   - Document env, validation, rollback.

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
