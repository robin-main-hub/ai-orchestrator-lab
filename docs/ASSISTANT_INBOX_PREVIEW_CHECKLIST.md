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
      preview→LIVE no fixture leak; no ERP/GIO/domain terms.

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
      ERP/GIO/domain terms anywhere; no plugin run/import/remote-load affordance.
