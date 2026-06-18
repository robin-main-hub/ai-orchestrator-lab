# Assistant Inbox — Browser Preview Checklist (LINE M prep)

This PR (LINE N + O) polished the Assistant Inbox cards into a dense command-center
look and expanded the generic (non-ERP) live sources. **The browser preview for
this PR was NOT run** — it was produced entirely over SSH on a headless box, so
the visual surface was verified only via jsdom + Testing Library and a clean
`build`/`typecheck`. This doc gives a human everything needed to run the real
browser preview (LINE M).

## 1. Run the desktop app locally

From the repo root (uses the workspace pnpm):

```bash
pnpm install --frozen-lockfile
pnpm --filter @ai-orchestrator/desktop dev
```

`dev` runs `vite --host 127.0.0.1` (see `apps/desktop/package.json` → `scripts.dev`).
Open the printed URL (default `http://127.0.0.1:5173`).

To preview a production build instead:

```bash
pnpm --filter @ai-orchestrator/desktop build
pnpm --filter @ai-orchestrator/desktop preview
```

## 2. Navigate to the Assistant Inbox

In the left nav: **시스템 (System) group → 어시스턴트 인박스**.
This selects the `command_center` surface (`AssistantInboxContainer`, rendered
in `App.tsx` when `activeNavItem === "command_center"`). The page wrapper is
`data-page="command_center"`.

Live wiring (honest): the container is fed real app state only —
`runnerGateMode: "dgx_disabled"` (dgx gate stays disabled → observed:false),
the real `eventLog` (filtered to learning events), and real
`projectRecordController.records`. With a fresh app these are usually empty, so
most sections show an HONEST EMPTY state — that is expected, not a bug.

## 3. Visual checklist

Tick each item by eye:

- [ ] **Layout not broken** — four sections in a 2-column grid (1-col on narrow),
      no overflow / overlap; each section is a bordered panel.
- [ ] **Card density** — cards are compact (no log-dump paragraphs); titles
      truncate; headers are single dense rows.
- [ ] **PASS / WARNING / BLOCKED color clarity** — status pills read consistently
      everywhere (evidence verdicts, manifest loadable/blocked). PASS = solid,
      WARNING = outline, BLOCKED = destructive/red. Same icon family throughout.
- [ ] **LIVE / no-live-data / 예시(fixture) badges legible** — each section header
      shows exactly one source badge, right-aligned; the `N/4 live` counter in the
      inbox header matches the badges; the amber "일부 섹션은 예시(fixture) — live
      아님" notice appears only when an example section is present.
- [ ] **Honest empty** — empty sections show their Korean empty hint, not a fixture.
- [ ] **Runner gate honesty** — evidence shows `runner gate · dgx_disabled` as
      BLOCKED / not observed (gate is disabled by default).
- [ ] **Nav placement** — the entry sits under 시스템 with the Inbox icon and reads
      "어시스턴트 인박스".
- [ ] **No action affordances** — no enable/approve/run buttons anywhere
      (read-only surface).
- [ ] **멋있는가 (subjective)** — does it read as one cohesive, dense
      command-center, or still feel like loose cards? Note anything that feels off.

## 4. To exercise live cards (optional)

Most sections are empty on a fresh app. To see live learning/memory rows you need
real learning events in the `eventLog` and real project records. Fixtures are
intentionally NOT injected into live mode — to view the fixture composition, the
component also has an example mode (no `live` prop) where every section is labeled
예시(fixture). The shipped App wiring is live-only.

## 5. Status of this PR's preview

- Browser preview: **NOT RUN** (SSH / headless environment).
- Substitute verification: jsdom + Testing-Library tests (inbox + projection) green,
  plus a clean `build` and `typecheck`.
- This checklist enables a human to perform LINE M (the real browser preview).

## 6. Batch 6 — owner preview findings + regression checklist

The real browser preview **WAS run** during Batch 6 (locally on the owner's
Windows desktop, vite dev on `127.0.0.1:5173`). Findings:

1. **PREVIEW passes** the command-center feel — dense, badged, clearly
   예시(fixture) with a persistent watermark.
2. **LIVE was visually too empty** → Batch 6 LINE U/V added a status strip
   (`mode · items · live X/4 · empty Y/4 · gate`), a polished
   `작전 대기 중 · No live data yet` hero (only when sparse), and intentional
   empty rows that say what will populate each section.
3. **The bottom approval toast** (`ApprovalToastBar`, `fixed bottom-4`) overlapped
   the inbox's lower cards → Batch 6 LINE W reserves bottom safe-area on the
   `command_center` page (`padding-bottom`) so content scrolls clear. The toast
   and approval flow are unchanged.

### Batch 6 regression checklist (tick on each future preview)

- [ ] **LIVE sparse looks intentional** — status strip + "No live data yet" hero,
      not a dead screen.
- [ ] **Empty sections explain themselves** — each says what will populate it;
      never shows fixture text in LIVE.
- [ ] **PREVIEW still clearly fake** — persistent watermark banner + every section
      labeled 예시(fixture).
- [ ] **No toast overlap** — the last inbox card scrolls clear of the bottom
      approval toast.
- [ ] **Mode switch works** — LIVE/PREVIEW toggle; REPLAY/SANDBOX disabled
      placeholders.
- [ ] **No live/fixture leakage** — switching LIVE↔PREVIEW never mixes data.
- [ ] **Still read-only** — no enable/approve/run buttons in the inbox.

## 7. Batch 7 — OS-desk regression checklist

Batch 7 turned the inbox into a usable OS desk (command strip, work-queue lanes,
preview scenario deck, density pass). Tick on each future preview:

- [ ] **Command strip honest** — `mode · items · live X/4 · empty Y/4 · N blocked ·
      N warn · gate` reads correctly in LIVE and PREVIEW; in LIVE the `events`/
      `records`/`src` chips reflect real state (or "no live data"), never fabricated.
- [ ] **Work-queue lanes** — Today / Waiting / Blocked / Learning / Runner render
      read-only; counts match the cards; empty lanes are honest (Today stays empty
      until a real time bucket is wired); no buttons.
- [ ] **Preview scenario deck** — the scenario legend shows in PREVIEW only; the
      deck demonstrates PASS/WARNING/BLOCKED/not-observed/eval-failed/quarantined/
      verified/rejected; switching to LIVE removes the legend and all scenario data.
- [ ] **Density** — ops-desk feel: tight padding, 2-col on wide, section-header
      rules, no large dead whitespace; still no action buttons.
- [ ] **No leakage / honesty preserved** — LIVE never shows fixture rows; no fake
      live; no new write/activation/runtime-load paths.

## 8. Batch 8 — persistence / replay / today regression checklist

Batch 8 added seat persistence, Today/Recent time lanes, a REPLAY shell, and
scroll stability. Tick on each future preview:

- [ ] **Seat remembered** — switching LIVE/PREVIEW/REPLAY and reloading restores
      the last seat; an invalid/disabled stored seat (e.g. sandbox) falls back to
      LIVE; this is a local pref only (no server write).
- [ ] **Today/Recent honest** — the Today/Recent lanes fill from the real eventLog
      (today vs last-7-days); empty when there are no qualifying events; never
      fabricated, generic labels only.
- [ ] **REPLAY read-only** — REPLAY plays recent eventLog entries (newest first,
      type + timestamp), honest empty when the log is empty; no action buttons, no
      writes; SANDBOX stays a disabled placeholder.
- [ ] **Scroll stable** — narrow / short viewport scrolls the command center
      cleanly (no window bounce); the last card clears the fixed approval toast;
      wide desktop keeps the 2-column layout.

## 9. Batch 9 — semantic work desk regression checklist

Batch 9 classified generic events into readable categories and surfaced them.
Tick on each future preview:

- [ ] **Category badges** — Today/Recent rows show a generic category badge
      (failure/learning/runner/approval/memory/project/system); never a domain term.
- [ ] **REPLAY filters** — the all/failure/learning/runner/memory/approval/system
      filter narrows the replay read-only; switching back to "all" restores the full
      set (no mutation); a category with no events shows an honest empty replay.
- [ ] **WorkItem-lite rows** — replay rows show title + category + source; events
      read observed, project records read suggested/not-observed; nothing fabricated.
- [ ] **Honesty preserved** — no fake live, no new write/activation, no domain
      logic; classification is best-effort and "unknown" stays unknown.

## 10. Batch 10 — search / filter / focus (+ interaction philosophy)

**Interaction philosophy shift (Batch 10):** the old "zero buttons / no
interaction" rule becomes **"no side-effect action controls."** A command-center
desk needs to search, filter, switch mode, and focus — those are fine. What stays
forbidden is anything that *does* something.

- **Allowed** (view-only): search input · radio · select · mode switch · local
  view filter · keyboard focus/clear.
- **Forbidden** (side-effect): approve · send · write · run · apply · dispatch ·
  external call · server append · memory activation.
- The inbox still ships zero `<button>` (search = input, filters = radios). If a
  `<button>` is ever added it must be proven a view toggle by test, and the
  forbidden action words must not appear as control text.

Regression checklist:

- [ ] **Search** filters visible queue/replay rows; `Esc` clears search only; `/`
      focuses search only.
- [ ] **Category filter** changes visible rows only (refines event lanes); typed
      lanes untouched; no mutation.
- [ ] **Focus** changes visible sections only — today/blocked narrow lanes,
      warnings shows cards, replay jumps to the REPLAY seat.
- [ ] **Honest empty** — "검색 결과 없음 / 필터 결과 없음" (never a dead screen).
- [ ] **No side-effect controls** — no approve/send/run/apply/dispatch; no server
      call; REPLAY stays read-only; PREVIEW fixture stays labeled; LIVE gets no
      preview data.

## 11. Batch 11 — saved views / persistence / command palette

Batch 11 added view presets, active-view persistence, and Command Palette hooks.
Tick on each future preview:

- [ ] **Presets** — picking My Desk / Today / Blocked / Failures / Runner /
      Learning applies its filter combo; Replay jumps to the REPLAY seat.
- [ ] **Persistence** — with persistence on, the active view (focus/category/
      search) is remembered across reloads; an invalid stored view falls back to
      defaults; local pref only (no server write).
- [ ] **Command Palette** — "Assistant Inbox 열기 / REPLAY 좌석 / Failures 필터 /
      Blocked 보기 / 필터 초기화" each change the view only (nav/mode/filter), never
      execute an action.
- [ ] **Still view-only** — no side-effect controls; zero `<button>` (search =
      input, presets/filters = radios); REPLAY read-only; LIVE gets no preview data.

## 12. Batch 12 — user saved views + palette apply

Batch 12 added user-defined saved views and palette apply. Interaction rule
refined: **local preference actions** (save/delete/apply view locally) are
allowed; **OS actions** (send/approve/write/append/run/apply patch/dispatch) are
forbidden. Tick on each future preview:

- [ ] **Manager gated** — the Saved View Manager appears only with persistence on;
      the default read-only inbox is unchanged (no buttons).
- [ ] **Local-preference labelled** — save / apply / delete carry
      `data-action-scope="local-preference"` and read "로컬 전용"; no OS-action words.
- [ ] **Save / apply / delete** — save current view by name (localStorage), apply
      restores mode+focus+category+search, delete removes it; no server / EventStorage write.
- [ ] **Palette apply** — saved views appear in ⌘K and apply local view only (no
      save/delete from the palette); repeated apply of the same view re-applies.
- [ ] **Honesty** — invalid saved views ignored; empty list → no palette entries;
      preview→LIVE no fixture leak; no ERP/domain/domain terms.

## 13. Batch 13 — palette E2E + real OS lane source

Batch 13 closed the ⌘K honesty gap (integration tests) and drew lanes from real
classified event-log activity. Owner preview checks:

- [ ] **Real ⌘K** — open the palette, the inbox preset + saved-view entries show;
      selecting one changes mode/focus/category/search; "인박스 뷰 적용: <name>"
      reads as a local view command (no side effect); repeated apply re-applies.
- [ ] **Lane source** — Blocked/Runner/Learning/Waiting reflect real event-log
      activity (failure/runner/learning/approval) with category badges; no events →
      honest empty; LIVE shows no fixture rows.
- [ ] **No side-effect command** — no palette/manager control sends/writes/runs/
      approves/dispatches; saved views & view state stay local; SANDBOX inert.

## E9. Engine — WorkItem Candidate Next-Step Preview

Engine batch E9 (PR #644, merge commit `0fa9982`) made WorkItemCandidates
preview their possible next-step context without creating committed work. Owner
checks:

- [ ] **Next-step preview** — opening a WorkItemCandidate detail drawer shows a
      `Next-step preview` section.
- [ ] **Preview labels** — the section clearly says `preview only`,
      `not committed`, and `no lifecycle transition`.
- [ ] **Refs shown honestly** — available source/evidence refs appear as string
      refs only; missing refs show honest unknown/missing states.
- [ ] **Draft links reused** — when E8 cross-links exist, related draft claims and
      footnotes appear in the preview; absent links show honest empty states.
- [ ] **PREVIEW/LIVE honesty** — PREVIEW fixtures can show example refs, but LIVE
      derives only from live candidate/draft inputs and receives no fixture refs.
- [ ] **Read-only** — no create / launch / commit lifecycle, no write/append/send/
      dispatch/apply controls, no lifecycle transition.

## E8. Engine — WorkItem Candidate / Evidence Draft Cross-Link

Engine batch E8 connected WorkItemCandidate and Evidence Draft surfaces through
read-only string refs only. Owner checks:

- [ ] **Helper behavior** — `linkWorkItemCandidatesToEvidenceDraft` links candidate
      `evidenceRefs[]` to draft footnote `refId`s only; unknown refs stay unmatched.
- [ ] **Candidate detail links** — a candidate with overlapping evidence refs shows
      draft footnote number, ref id, label, and claim ids in the local detail drawer.
- [ ] **Candidate detail empty** — a candidate with no matching draft evidence shows
      `no matching draft evidence`.
- [ ] **Draft related candidates** — Evidence Draft header/footnotes show related
      candidate count/chips only when refs overlap.
- [ ] **LIVE honesty** — absent live draft or absent live candidates does not fake
      links; LIVE links appear only when both inputs exist.
- [ ] **PREVIEW honesty** — PREVIEW shows fixture cross-links only where fixture refs
      overlap; no PREVIEW refs leak into LIVE.
- [ ] **Read-only** — no create / launch / commit lifecycle, no write/append/send/
      dispatch/apply controls, no object resolution beyond existing refs.

## E7. Engine — WorkItem Candidate Board / Triage View

Engine batch E7 made WorkItemCandidates faster to triage locally without creating
committed work. Owner checks:

- [ ] **Board summary** — card shows total plus counts by lane(now/soon/watch),
      risk(high/medium/low), kind(patch/runner/evidence/memory/source), sourceRefs,
      and evidenceRefs.
- [ ] **Local filters** — lane/risk/kind/source-ref/evidence-ref filters narrow
      the visible candidates only; filters are scoped `data-action-scope="local-view"`.
- [ ] **Local search** — candidate search narrows by title, reason, id, status,
      risk, kind, lane, and string refs; empty filtered result is honest.
- [ ] **Command jump** — Command Deck / Command Palette shows `WorkItem Candidates 열기`
      with hint `작업 후보 보기 · 확정 없음`; it scrolls/focuses the board only.
- [ ] **E6 still works** — filtered rows still open the read-only local detail
      drawer and ref-only link graph.
- [ ] **Candidate-only** — no create / launch / commit lifecycle, no write/append/
      send/dispatch/apply controls, PREVIEW/LIVE separation unchanged.

## E6. Engine — WorkItem Candidate Detail / Link Graph

Engine batch E6 made WorkItemCandidate rows inspectable without creating committed work. Owner checks:

- [ ] **Row opens detail** — click / Enter / Space on a candidate row opens a
      local detail drawer; the row is scoped `data-action-scope="local-detail"`.
- [ ] **Candidate fields** — drawer shows id, title, kind, lane, status, risk,
      reason, observed, createdAt, sourceRefs, evidenceRefs.
- [ ] **Ref-only graph** — mini graph shows candidate → sourceRefs,
      candidate → evidenceRefs, candidate → signal(reason/kind); refs are string
      refs only and marked unresolved.
- [ ] **Honest empty** — missing refs / missing createdAt render as
      `none / unknown`, never as resolved objects.
- [ ] **Candidate-only** — display-only, no create / launch / commit lifecycle,
      no write/append/send/dispatch/apply controls, PREVIEW/LIVE separation unchanged.

## E5. Engine — WorkItem Candidates (candidate-only central axis)

Engine batch E5 added the first central axis: a candidate-only WorkItem surface
derived from the OS's read-only signals. Owner checks:

- [ ] **Card visible** — the inbox shows a "Work Item Candidates" card grouping
      candidates by urgency lane (now / soon / watch) with kind badge + risk chip.
- [ ] **Central axis** — candidates derive from real signals: a blocked/warning
      patch, an attention/stalled runner, an evidence missing-info ask, a memory
      eval fail / hygiene flag, an error/stale source.
- [ ] **Candidate-only** — header reads "candidate · read-only · not committed";
      there is **no** create / launch / commit button.
- [ ] **LIVE real-only** — with real signals (e.g. a blocked runner) a candidate
      appears; empty → honest empty ("작업 후보 신호 없음"); PREVIEW example
      candidates never leak into LIVE.
- [ ] **Read-only / generic** — display-only (0 buttons), no append/write/dispatch,
      generic names; passes the no-side-effect invariant.

## E4. Engine — Evidence Draft LIVE input seam

Engine batch E4A lifted the PREVIEW-only Evidence Draft to a LIVE-ready input
seam (no producer). Owner checks:

- [ ] **PREVIEW** still shows the example footnoted draft.
- [ ] **LIVE input** — when a draft is passed via `live.evidenceDraft`, the card
      renders its claims / numbered footnotes / freshness chips / missing-info ask.
- [ ] **Honest empty** — LIVE with no draft shows no card (no producer exists yet).
- [ ] **Read-only** — display-only, no send/write/approve; no PREVIEW→LIVE leak.

## E3. Engine — Learning & Memory Console (read-only)

Engine batch E3 added a read-only roll-up of what the OS learned / distilled and
its memory health, composed from the existing learning + memory + eval
projections. Owner checks:

- [ ] **Console visible** — the inbox shows a "Learning & Memory" card with a
      learning row (loops / settled / active / rejected) and a memory row
      (candidates / suggested / written-observed).
- [ ] **Eval health** — when eval reports exist (PREVIEW fixture), pass/warn/fail
      chips show; forbidden/stale/contradicted hits and eval fails surface as
      honest flag chips at the header.
- [ ] **Honest memory** — memory candidates read as "suggested" with "0 written
      (observed)" until a real writer exists — never auto-promoted.
- [ ] **LIVE real-only** — with real project records the memory count reflects
      them; PREVIEW fixture learning/eval never leak into LIVE; empty → honest empty.
- [ ] **Read-only / generic** — display-only (no buttons), no auto-trust / load /
      write, generic names; passes the no-side-effect invariant.

## E2. Engine — Runner Theater (read-only, LIVE-wired)

Engine batch E2 added a read-only operations theater over REAL runner/mission
state (the shared `workbenchMissionStore`). Owner checks:

- [ ] **Runner Theater visible** — the inbox shows a "Runner Theater" card with
      runners grouped by lane (active / attention / idle / done) and an
      active/attention summary.
- [ ] **Heartbeat liveness** — each runner row carries a liveness chip
      (live / idle / stale / unknown); a running runner with a stale heartbeat
      raises the header "stalled" warning.
- [ ] **LIVE from real state** — when a mission exists in the coding workbench /
      conversation-fork store, it appears in the inbox LIVE Runner Theater;
      starting/stopping a runner there updates the card (read-only subscription).
- [ ] **Honest empty** — with no missions, the card shows "관측된 runner 세션 없음"
      (not a fixture); PREVIEW example runners never leak into LIVE.
- [ ] **Read-only / generic** — display-only (no buttons), no dispatch/start/write,
      no fabricated diff stats, generic names; passes the no-side-effect invariant.

## 26. Batch 26 — Visual Style Pass

Batch 26 unified the inbox's status chips + section shells into a shared style
token module (purely presentational). Owner checks:

- [ ] **Consistent status chips** — pass/connected/fresh chips are the same green,
      warn/aging/stale-source the same amber, blocked/error/stale the same red,
      everywhere they appear (status strip, source dock health, patch summary,
      sandbox outcome, evidence freshness).
- [ ] **Freshness chips match** — the Evidence Draft freshness chips no longer look
      slightly faded vs the rest (the old `/90` opacity was removed).
- [ ] **Empty states read as "waiting"** — empty sections still show the compact
      dashed ghost row (not a card, no fake data).
- [ ] **No regressions** — all surfaces render as before; no new buttons/controls;
      no domain terms; PREVIEW/LIVE separation unchanged.

## 25. Batch 25 — Command Palette Power Pass

Batch 25 expanded the inbox command palette with more local-view jump targets and
keyboard accelerators. Owner checks:

- [ ] **New palette commands** — the command palette lists "Operator Console 열기",
      "SANDBOX 좌석", and "Evidence Draft 열기" alongside the existing Source Dock /
      Patch Candidates / Replay / clear / saved-view entries.
- [ ] **Jumps scroll/focus** — running "Operator Console 열기" scrolls to the status
      strip; "Evidence Draft 열기" scrolls to the Evidence Draft card (PREVIEW).
- [ ] **Keyboard accelerators** — with the inbox focused (not typing), `o` jumps to
      the Operator Console, `e` to the Evidence Draft; the shortcuts hint shows both.
- [ ] **Honest no-op** — "Evidence Draft 열기" in LIVE does nothing (the card is
      PREVIEW-only) — no scroll, no error.
- [ ] **View-only / generic** — no command sends/writes/runs/approves/dispatches;
      labels carry no side-effect words; passes the palette forbidden-label test.

## 24. Batch 24 — Evidence Draft / Footnote Surface

Batch 24 added a PREVIEW-only Evidence Draft card: a read-only draft of claims,
each backed by numbered evidence footnotes with a freshness verdict, plus a
missing-info/ask slot. Owner checks:

- [ ] **Draft + footnote markers** — the Evidence Draft card shows the draft
      title and claims with superscript `[n]` footnote markers; unbacked claims
      show a "needs source" tag instead of a marker.
- [ ] **Numbered footnotes + freshness chips** — the footnotes table lists each
      ref (`source-001`…) with a freshness chip: fresh / aging / stale / unknown.
      A stale footnote present → the header shows an "N stale" warning chip.
- [ ] **Missing info / ask slot** — the unbacked claim (`claim-4`) appears under
      "missing info · ask" with a generic ask prompt — no approve/send affordance.
- [ ] **PREVIEW-only / no leak** — the draft card appears only in PREVIEW; LIVE
      never shows it.
- [ ] **Read-only / generic** — display-only (no buttons), generic names only,
      pure projection (deterministic chips from an injected reference time),
      passes assertNoSideEffectActionControls + assertNoForbiddenActionText.

## 23. Batch 23 — Generic Source Pack Demo

Batch 23 added a PREVIEW-only demo of a bundled source pack feeding the OS. Owner
checks:

- [ ] **Manifest visible** — the Source Pack card shows the declarative manifest:
      name, version, source kind, and capability chips (inbox_source_provider /
      workitem_lite_provider / evidence_provider).
- [ ] **Pack rows + evidence** — the pack's projected WorkItemLite rows and an
      evidence candidate render under the manifest.
- [ ] **PREVIEW-only / no leak** — the pack card appears only in PREVIEW; LIVE never
      shows it.
- [ ] **Domain-independent / read-only** — generic names only; `sourceKind: static`
      (no remote loading); no buttons; no execution/sync/write; passes
      assertNoSideEffectActionControls.

## 22. Batch 22 — Sandbox Proposal Shell

Batch 22 turned the disabled SANDBOX seat into a read-only "proposal only" surface.
Owner checks:

- [ ] **SANDBOX selectable** — the seat is enabled in the mode switch (no longer a
      disabled placeholder).
- [ ] **Proposal-only watermark** — a persistent "PROPOSAL ONLY · no execution"
      banner is shown in the sandbox seat.
- [ ] **Scenario cards** — each proposal shows a dry-run badge, a simulated-outcome
      label (pass/warning/blocked tone), and proposed steps.
- [ ] **Read-only** — no apply/commit/dispatch/run controls anywhere; normal
      live/preview cards do not appear in the sandbox body; generic only; passes
      assertNoSideEffectActionControls.
- [ ] **Honest** — every outcome is labelled simulated; nothing is executed.

## 21. Batch 21 — Replay Timeline V2

Batch 21 turned REPLAY into a time-clustered, read-only operation-theater replay.
Owner checks:

- [ ] **List/Timeline toggle** — REPLAY shows a list by default; a view-only toggle
      switches to the timeline.
- [ ] **Time clusters** — events group into clusters by time proximity (newest
      cluster first), each with a span, event count, and category chips.
- [ ] **Scrubber** — a local scrubber steps the active cluster (view state only);
      the active cluster expands its items.
- [ ] **Filter integration** — the category filter + search narrow the timeline to
      the same set as the list.
- [ ] **Read-only** — no EventStorage mutation, no server write; the scrubber/toggle
      are local-view; passes assertNoSideEffectActionControls.

## 20. Batch 20 — Patch Candidate Comparison V2

Batch 20 added a read-only compare board for patch candidates. Owner checks:

- [ ] **Compare toggle** — with ≥2 candidates a "Compare" toggle (view-only) opens
      a read-only board; closed by default.
- [ ] **Risk lanes** — candidates bucket into safe / watch / risk, each sorted so
      the smallest (fastest to review) change is first.
- [ ] **File-overlap heatmap** — files touched by multiple candidates are
      highlighted as overlap; counts are correct.
- [ ] **Verification delta** — a ⚠ verify flag appears when a runner claims a clean
      pass but actual verification is unconfirmed.
- [ ] **Safety reason chips** — blocked/warning reasons show as chips per candidate.
- [ ] **Read-only** — the board has no buttons; no apply/commit/dispatch; generic
      only; passes assertNoSideEffectActionControls.

## 19. Batch 19 — Operator Console Speed Polish

Batch 19 added view-only keyboard accelerators + at-a-glance status. Owner checks:

- [ ] **Keyboard accelerators** — `s` jumps to Source Dock, `p` to Patch Candidates
      (scroll + focus, seat unchanged), `b` focuses Blocked, `c` clears filters;
      `/` focuses search, `Esc` clears it.
- [ ] **Suppressed while typing** — pressing the letters inside the search box (or
      with a modifier held) does NOT trigger an accelerator.
- [ ] **Shortcuts hint** — the key hint row is visible/discoverable and has no buttons.
- [ ] **Patch-count chip** — the Operator Console shows `N patch` when candidates
      exist, and nothing on a LIVE-empty desk.
- [ ] **No side-effect controls** — every accelerator is a local view/focus/filter;
      no apply/commit/dispatch; the surface passes assertNoSideEffectActionControls.

## 18. Batch 18 — LIVE Patch Candidate Wiring

Batch 18 maps real H8 runner patch handoffs into the Patch Candidate lane as
read-only LIVE candidates. Owner preview checks:

- [ ] **Live candidate appears when provided** — when the app passes mapped patch
      candidates (from `RunnerPatchHandoff` + `RunnerPatchSafetyReport`), the lane
      shows them with safety / verification / source / observed / file counts.
- [ ] **Honest empty when none** — with no patch candidates the lane is absent
      (no fabricated rows); the per-mission approval queues aren't unified to an
      app feed yet, so LIVE is honest-empty for now.
- [ ] **Blocked candidates inspectable** — a blocked candidate is tinted blocked,
      opens its detail drawer, but exposes NO apply / commit / dispatch control.
- [ ] **Claimed vs actual verification visible** — the row + detail drawer show
      verification status (claimed / actual / not_run); a missing safety report
      shows as `warning`, never `pass`.
- [ ] **Health summary strip** — total · pass · warn · blocked · observed ·
      not-observed · no-actual · claimed counts; display-only.
- [ ] **No apply/commit/PR controls anywhere** — the mapper is read-only
      (type-only imports, no runner execution path); raw diff text is never shown
      (only counts/flags); generic only.

## 17. Batch 17 — Patch Candidate Speed Lane

Batch 17 exposed the existing runner patch/diff handoff as a fast, read-only patch
candidate review surface — no apply/commit/PR. Owner preview checks:

- [ ] **Patch lane visible** — a "Patch Candidate Lane · read-only · preview only"
      card shows each candidate's id / runner / mission / changed-file count /
      +adds −dels / safety (pass·warning·blocked toned) / verification (claimed·
      actual·not_run) / source (runner·handoff) / observed.
- [ ] **Blocked candidate inspectable, never appliable** — a blocked candidate is
      tinted blocked and still opens its detail drawer, but exposes NO apply /
      commit / stage / dispatch control anywhere.
- [ ] **Detail drawer** — clicking a candidate opens a local read-only drawer with
      Identity / Stats / Safety / Verification / Evidence sections; Esc and ✕ close.
- [ ] **Diff preview** — compact per-file blocks show path / change / risk / +adds
      −dels / a short hunk summary and a static "diff preview only" label; no raw
      diff dump, no copy/apply/stage button.
- [ ] **Comparison strip** — with >1 candidate, a strip shows count / safest /
      blocked / warning / files-touched overlap (display-only).
- [ ] **Jump + filters** — ⌘K "Patch Candidates 열기 · 적용 없음" and the deck
      button scroll to the lane (view/move only, no seat change); All / Blocked /
      Warning / Runner filters narrow the listed candidates only.
- [ ] **No side-effect / generic** — every control carries an allowed
      data-action-scope (rows = local-detail, filters/deck = local-view); the lane
      passes assertNoSideEffectActionControls; no apply/commit/dispatch text; all
      ids/paths generic; PREVIEW fixtures never appear in LIVE; LIVE-empty shows no
      lane.

## 16. Batch 16 — Operator Console / Command Deck

Batch 16 turned the inbox into an operator cockpit and flipped the interaction
invariant from "zero `<button>`" to **"no side-effect action control"**. Owner
preview checks:

- [ ] **Operator Console (3-second read)** — the top strip shows seat · active view ·
      filter summary · source health (✓/~/!) · blocked · warn · gate · replay count;
      everything reflects real on-screen state, never fabricated; LIVE-empty shows
      no source-health chips.
- [ ] **Command Deck** — a row of buttons (My Desk / Today / Blocked / Failures /
      Runner / Learning / Replay / Source Dock / Clear Filters); each changes the
      view/seat only; the active preset is highlighted; Source Dock scrolls without
      changing the seat; Clear Filters returns to My Desk.
- [ ] **Source Dock quick controls** — Jump / Alerts (stale·error only) / Sources /
      Evidence / All narrow what the dock lists; the health strip still shows the
      full overview; nothing syncs/refreshes/runs.
- [ ] **Detail drawer sections** — the drawer reads as Identity / Health / Source /
      Evidence·Trust / Observed; sourceRef shows in full; Esc and ✕ close it.
- [ ] **Interaction invariant (the headline)** — every interactive control carries
      an allowed `data-action-scope` (local-view / local-preference / local-detail)
      and no side-effect action word (send/approve/run/sync/dispatch/write/…). Real
      `<button>`s are allowed; what's forbidden is a control that *does* something to
      the OS. New controls must pass `assertNoSideEffectActionControls` — no more
      `role=button` hacks needed.
- [ ] **Generic / no domain roadmap** — all labels generic; no ERP/domain/domain
      vocabulary; no company/domain/ERP future-milestone wording.

## 15. Batch 15 — Source Dock V2 / External Source Deck

Batch 15 grew the Batch 14 plugin-source card into a real OS surface: the Source
Dock. Visual upgrade + health strip, a PREVIEW demo deck, a palette jump, and a
local row→detail drawer — all read-only, generic, zero side effect. Owner preview
checks:

- [ ] **Source Dock visual** — the card reads "Source Dock · External Source Deck";
      each health state has a distinct tone (connected=emerald, stale=amber,
      error=rose, disabled=muted, unknown=slate); per-source row-count chip is right.
- [ ] **Health strip** — the at-a-glance strip shows connected/stale/error/disabled/
      unknown counts + active-only total rows + evidence count; LIVE with no plugin
      input shows **no dock and no strip** (honest empty, never an all-zero strip).
- [ ] **PREVIEW demo deck** — a PREVIEW-only radio switch (mixed/healthy/stale/error/
      disabled) flips the dock between generic source states; selecting `error`/
      `disabled` shows the right tone and no rows; the deck **never appears in LIVE**
      and never injects fixtures into the live seat.
- [ ] **Palette jump** — ⌘K "Source Dock 열기" (hint "외부 소스 보기 · 화면 이동만")
      scrolls/focuses the dock; it changes **nothing else** (no mode/filter/data);
      on an empty LIVE dock it is a silent no-op.
- [ ] **Row → detail drawer** — clicking a source/evidence row opens a local
      read-only drawer (pluginId/sourceRef/status/health/category/observed, or
      trust for evidence); Esc and the ✕ close it; **zero action buttons**.
- [ ] **Interaction scope (updated in Batch 16)** — rows and the drawer close stay
      `role="button"` divs + Esc (now `data-action-scope="local-detail"`). As of
      Batch 16 the rule is **"no side-effect action control"** (not "zero button"):
      real `<button>`s are fine when scoped local-view/preference/detail. See §16.
- [ ] **Generic / no domain roadmap** — every label/fixture/field is generic
      (example-plugin, external-source, source-00x, entity-001); no ERP/domain/domain
      vocabulary and no company/domain/ERP future-milestone wording.

## 14. Batch 14 — generic plugin source framework (+ visible slice)

Batch 14 let external/generic plugins feed the OS via generic provider contracts
(manifest / WorkItemLite / evidence) WITHOUT contaminating OS core, and surfaced
them as a real **Plugin Sources** card in the inbox. Owner preview checks:

- [ ] **Plugin Sources card (PREVIEW)** — the PREVIEW seat shows a "Plugin Sources ·
      read-only" card: each example source (example-plugin / external-source /
      disabled-plugin) renders a health row (status + health badge), its plugin
      WorkItemLite rows (`plugin` badge + category + sourceRef), and an approved
      plugin-evidence candidate with a trust label.
- [ ] **Disabled / active-stale honesty** — the disabled provider shows but
      contributes **no rows** (marked "비활성 소스 — 행 없음"); an active-but-stale
      source still lists its rows (health does not gate rows, status does).
- [ ] **Evidence honesty** — only approved/published evidence appears as a
      `suggested` candidate; the draft is not promoted; trust never reads
      "trusted"/"active".
- [ ] **LIVE honest empty + no leak** — in LIVE with no real plugin input the
      Plugin Sources card is **absent** (not a fixture); the PREVIEW example
      sources never appear in a LIVE seat.
- [ ] **Display-only / generic** — no buttons in the plugin surface; no
      ERP/domain/domain terms anywhere; no plugin run/import/remote-load affordance.
