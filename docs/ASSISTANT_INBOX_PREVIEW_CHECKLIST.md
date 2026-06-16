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
