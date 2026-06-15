# 2026-06-15 Claude Handoff — App Builder Closed Loop H9

## One-Line State

The App Builder loop now runs inside the desktop app:

Preview click → viewport annotation → Turbo Edits provider draft → SEARCH/REPLACE validation → SearchReplace textarea → user apply → scaffold overlay → preview rerun → Visual QA rerun → edit timeline.

## Repository State

- Repo: `robin-main-hub/ai-orchestrator-lab`
- Local worktree used by Codex: `/Users/robin/.config/superpowers/worktrees/ai-orchestrator-lab-review/preview-url-wiring`
- Current branch: `codex/h9-edit-history`
- Base branch: `main`
- Feature implementation HEAD before this handoff note: `8702000 feat(desktop): add mission edit timeline`

Recent commits that matter:

- `cc95e3d` — wired observed preview URL into `ConversationWorkbench`
- `33f25c7` — added safe viewport-only preview annotation for Turbo Edits
- `5bcf627` — fixed desktop test harness `localStorage.removeItem is not a function`
- `bb88c5e` — bridged Turbo Edits to in-app provider generation
- `8702000` — added Mission Workspace edit timeline

## Big Product Goal

The larger product direction is to make AI Orchestrator Lab an OpenCode/Dyad-class app builder inside the orchestration workspace:

1. A user describes or evolves an app in conversation.
2. The system creates a mission and scaffold.
3. The app gets a real observed preview URL.
4. The user can inspect the preview, click a bad spot, and turn that click into a precise edit prompt.
5. The in-app provider creates a narrow SEARCH/REPLACE draft.
6. The user validates and applies the patch.
7. Preview and Visual QA can be rerun.
8. The whole loop leaves a trace that can be resumed, audited, and eventually published.

The key principle is honest observed state. Do not fake preview URLs, DOM selectors, screenshots, provider results, or GitHub/overlay outcomes.

## What Was Just Completed

### H7 Preview Annotator

Purpose: turn the preview iframe into an input surface without crossing unsafe iframe boundaries.

Implemented:

- `PreviewIframe` supports selection mode.
- Clicks capture only:
  - `x`, `y`
  - `percentX`, `percentY`
  - `url`
  - `capturedAt`
- The captured annotation is shown in `ChatSidePanel`.
- "Turbo Edits에 보내기" sends annotation context into Mission Workspace / Turbo prompt context.
- Prompt includes:
  - `User clicked preview at {percentX}% x, {percentY}% y on {url}`
  - `DOM selector unknown due to iframe boundary`

Important honesty constraint:

- No iframe DOM selector capture.
- No fake selector or text.
- No cross-origin bypass.

Primary files:

- `apps/desktop/src/components/PreviewIframe.tsx`
- `apps/desktop/src/components/ConversationWorkbench/ChatSidePanel.tsx`
- `apps/desktop/src/lib/previewAnnotations.ts`
- `apps/desktop/src/components/MissionBoardPanel.tsx`

### H8 In-App Turbo Edits Provider Bridge

Purpose: remove the external LLM copy/paste bottleneck.

Implemented:

- `TurboEditDraftCard` has an `AI 수정 초안 생성` button.
- It uses the existing provider completion path via `createTurboEditGenerator`.
- It uses existing `buildTurboEditPrompt(input)`.
- H7 annotation context is included in the prompt.
- Provider output is validated through `validateTurboEditOutput`.
- Valid SEARCH/REPLACE output is injected into `SearchReplaceEditCard` textarea.
- `NO_CONFIDENT_EDITS`, invalid output, and provider failure stay non-applicable and show reasons.
- Provider/model unavailable state shows a disabled button plus guidance.

No automatic apply:

- No overlay apply.
- No preview rerun.
- No provider retry loop.

Primary files:

- `apps/desktop/src/components/TurboEditDraftCard.tsx`
- `apps/desktop/src/lib/turboEditGenerator.ts`
- `apps/desktop/src/components/MissionBoardPanel.tsx`
- `apps/desktop/src/App.tsx`

### Baseline Test Fix

Purpose: restore trust in desktop full suite before continuing.

Issue:

- Node 25 exposed an incomplete global `localStorage`; jsdom tests saw `localStorage.removeItem is not a function`.

Fix:

- Added desktop Vitest setup that normalizes `localStorage` and `sessionStorage` to a complete Storage API.

Primary files:

- `apps/desktop/vite.config.ts`
- `apps/desktop/src/test/setupDomStorage.ts`

Known remaining warning:

- `--localstorage-file was provided without a valid path` still appears.
- This is a warning only; the full desktop suite is green.

### H9 Edit History / Patch Timeline

Purpose: make the edit loop reviewable and resumable at the Mission Workspace level.

Implemented:

- Added pure `buildEditTimeline(events)`.
- Added `EditTimelineCard`.
- Mission Workspace mirrors compact local edit events into a timeline.
- Timeline shows only:
  - source
  - status
  - timestamp
  - affected files
  - short summary
- It intentionally does not display:
  - raw full file content
  - raw prompt
  - raw provider response
- "마지막 적용 patch 보기" restores the last applied SEARCH/REPLACE patch into `SearchReplaceEditCard` textarea.
- Restore only fills the textarea. It does not apply automatically.
- Search/Replace overlay apply now refreshes scaffold cache after a recorded overlay so `scaffold/latest` can line up with the applied overlay.

Primary files:

- `apps/desktop/src/lib/editTimeline.ts`
- `apps/desktop/src/components/EditTimelineCard.tsx`
- `apps/desktop/src/components/MissionBoardPanel.tsx`
- `apps/desktop/src/components/SearchReplaceEditCard.tsx`
- `apps/desktop/src/components/PreviewAnnotatePanel.tsx`

## Current Validation Evidence

Most recent checks from H9:

- Focused H7/H8/H9 loop:
  - `pnpm exec vitest run src/lib/editTimeline.test.ts src/components/EditTimelineCard.test.tsx src/components/MissionBoardPanel.editTimeline.test.tsx src/components/TurboEditDraftCard.test.tsx src/components/SearchReplaceEditCard.test.tsx src/components/PreviewAnnotatePanel.test.tsx src/components/MissionBoardPanel.previewViewportAnnotation.test.tsx src/components/PreviewRunCard.test.tsx src/components/VisualQaCard.test.tsx`
  - Result: 9 files / 56 tests passed
- Typecheck:
  - `pnpm --filter @ai-orchestrator/desktop typecheck`
  - Result: passed
- Build:
  - `pnpm --filter @ai-orchestrator/desktop build`
  - Result: passed
- Last desktop full:
  - `pnpm --filter @ai-orchestrator/desktop test`
  - Result: 285 files / 1645 tests passed

## Important Constraints For Claude

Keep these constraints unless the user explicitly changes scope:

- No fake preview URL.
- No iframe DOM selector for cross-origin previews.
- No fake selector/text.
- No automatic overlay apply.
- No automatic provider retry or patch application.
- No automatic preview rerun after draft generation.
- No new server route unless the next task explicitly requires persistence.
- No GitHub write unless the user explicitly asks.
- Do not display raw prompt/provider response/full file content in UI.
- Preserve the existing prompt copy / response paste path as a fallback.
- Treat `--localstorage-file was provided without a valid path` as a known warning, not a failure, while the suite remains green.

## How Claude Should Start

1. Read this file first.
2. Confirm branch and recent commits:
   - `git branch --show-current`
   - `git log --oneline -8`
3. Re-run a focused test before changing code:
   - `pnpm exec vitest run src/lib/editTimeline.test.ts src/components/MissionBoardPanel.editTimeline.test.tsx`
4. Inspect these files before editing:
   - `apps/desktop/src/components/MissionBoardPanel.tsx`
   - `apps/desktop/src/lib/editTimeline.ts`
   - `apps/desktop/src/components/EditTimelineCard.tsx`
   - `apps/desktop/src/components/TurboEditDraftCard.tsx`
   - `apps/desktop/src/components/PreviewIframe.tsx`
   - `apps/desktop/src/lib/previewAnnotations.ts`

## Recommended Next Step

The recommended next step is not same-origin selector capture yet. It is:

### H10 Project Persistence / Resume

Purpose:

- The edit loop exists, but the user still needs project-level continuity.
- The next product gap is being able to leave and come back to an app with its preview, QA state, edit history, and publish status intact.

Suggested H10 scope:

1. Introduce a lightweight App Project / Mission Resume model.
2. Persist enough project state to recover:
   - mission ID
   - app title/goal
   - last observed preview URL
   - last Visual QA summary
   - latest scaffold availability
   - edit timeline summary
   - last restorable patch metadata
   - publish/PR draft status if present
3. Add an app/project list or recent projects surface.
4. Selecting a project should reopen the Mission Workspace context.
5. Do not automatically rerun preview, QA, provider, or patch apply on resume.

Possible implementation path:

- Start with client-side/local persistence if that matches current desktop patterns.
- Prefer existing event/store primitives if available.
- Only add a server route if local persistence cannot meet the resume requirement and the user approves the scope.

Suggested H10 tests:

- project record is created/updated when mission workspace gets preview/timeline updates
- recent project card shows last preview/QA/edit status
- selecting a project restores Mission Workspace state
- no provider call on resume
- no overlay apply on resume
- no preview or QA rerun on resume
- full desktop suite last

## Later Candidate

### H11 Same-Origin DOM Selector Capture

Purpose:

- Improve annotation precision when the preview is same-origin and safe to inspect.

Rules:

- Only same-origin.
- Must gracefully fall back to coordinate-only annotations.
- Never fake selector/text.
- Never bypass cross-origin restrictions.

Do this after persistence/resume unless the user explicitly reprioritizes selector capture.

## Final Picture

The end-state is an app builder where the user can:

- create an app from conversation,
- see a real preview,
- point at a broken visual spot,
- ask the in-app provider for a narrow patch,
- inspect and apply it,
- rerun preview/QA,
- review the full edit history,
- leave and resume the project,
- and eventually publish through explicit, staged GitHub writes.

The product should feel like a trustworthy cockpit for app evolution: every observed thing is labeled as observed, every draft stays a draft until user action, and every applied change leaves a compact audit trail.
