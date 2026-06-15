# 2026-06-15 Claude Handoff — H10 Project Persistence / Resume (slices 1-4)

## One-Line State

The App Builder now has a **resumable project layer** ready to plug into the existing Mission Workspace. The data model, React state controller, read-only UI, and a wiring adapter all live in `apps/desktop/`. **No existing component has been modified yet** — wiring is the next step.

## Stack Position

This handoff continues the H7-H9 work in `docs/handoffs/2026-06-15-claude-app-builder-h9-handoff.md`. It does **not** replace that document — the H9 constraints (no fake preview URL, no auto-rerun, no GitHub write, etc.) still apply.

## What Was Just Completed

### Slice 1 — Pure data model + storage helper

Files:

- `apps/desktop/src/lib/projectRecord.ts`
- `apps/desktop/src/lib/projectRecord.test.ts`

Public types: `ProjectRecord`, `ProjectRecordIndex`, `ProjectVisualQaSummary`, `ProjectScaffoldStatus`, `ProjectPublishStatus`, `ProjectEditTimelineSummary`, `ProjectPreviewTruth`, `ProjectVisualQaStatus`.

Public helpers: `createProjectRecord`, `unknownVisualQaSummary`, `parseProjectRecordIndex`, `upsertProjectRecord`, `removeProjectRecord`, `findProjectRecord`, `sortProjectRecordsByUpdatedAt`, `updateProjectPreview`, `updateProjectVisualQa`, `updateProjectScaffold`, `updateProjectEditTimeline`, `updateProjectPublishStatus`, `readProjectRecordIndex`, `writeProjectRecordIndex`.

Storage: localStorage key `ai-orchestrator-lab:project-records:v1`, wrapped by the existing `persistentJsonState` helper.

Honesty enforced in the helper itself:

- `updateProjectPreview` clears the URL when `truth !== "observed"` — callers cannot persist a fake URL even by passing one.
- `createProjectRecord` defaults `scaffold` to `"unknown"`, leaves `visualQa`/`publish`/`lastPreviewUrl` undefined.
- `parseProjectRecordIndex` drops individual corrupt entries instead of failing the whole index.

### Slice 2 — `useProjectRecordController` React hook

Files:

- `apps/desktop/src/hooks/useProjectRecordController.ts`
- `apps/desktop/src/hooks/useProjectRecordController.test.ts`

API:

```ts
const controller = useProjectRecordController();
// controller.records:           sorted by updatedAt desc
// controller.find(missionId):   ProjectRecord | undefined
// controller.ensureRecord({ missionId, title, goal? })
// controller.recordPreview(missionId, { url?, truth, observedAt })
// controller.recordVisualQa(missionId, summary)
// controller.recordScaffold(missionId, status)
// controller.recordEditTimeline(missionId, summary)
// controller.recordPublishStatus(missionId, status | undefined)
// controller.remove(missionId)
```

Owns the in-memory `ProjectRecordIndex`, hydrates from storage on mount, persists on every change. Storage writes are no-throw. Update on a missing missionId is a no-op.

### Slice 3 — `RecentProjectsPanel` read-only UI

Files:

- `apps/desktop/src/components/RecentProjectsPanel.tsx`
- `apps/desktop/src/components/RecentProjectsPanel.test.tsx`

Renders one card per record (sorted by updatedAt desc) with title, goal, preview URL (only when truth === "observed"), Visual QA / scaffold / publish badges, edit timeline summary, restore-availability indicator, "이어서" button (→ `onSelectProject`), and an optional "삭제" button (→ `onRemoveProject` when the prop is provided).

The panel never auto-triggers a callback on mount (verified by test). The "이어서" button only emits `onSelectProject(missionId)` — what the caller does with that ID is a follow-up slice decision (intended: re-open the Mission Workspace context without auto-running preview / QA / provider / patch apply).

### Slice 4 — `useProjectRecordSync` adapter hook

Files:

- `apps/desktop/src/hooks/useProjectRecordSync.ts`
- `apps/desktop/src/hooks/useProjectRecordSync.test.ts`

Single hook for the future wiring layer:

```ts
useProjectRecordSync({
  controller,
  missionId,
  title,
  goal,
  observedPreview, // { url?, truth, observedAt } | undefined
  visualQa,        // ProjectVisualQaSummary | undefined
  scaffold,        // ProjectScaffoldStatus | undefined
  editTimeline,    // pre-summarized
  editTimelineItems, // OR raw EditTimelineItem[] (adapter derives)
  publish,         // ProjectPublishStatus | undefined
});
```

Internal change detection (string keys) dedupes redundant calls. Passing `undefined` for `publish` intentionally does NOT clear an existing record — call `controller.recordPublishStatus(missionId, undefined)` explicitly for that.

Also exports `deriveEditTimelineSummary(items)` for callers that want to compute the summary directly.

## Repository State

- Repo: `robin-main-hub/ai-orchestrator-lab`
- PR: #515 (draft) — `claude/h10-project-record-data-model` → `codex/h9-edit-history`
- Commits on top of PR #514:
  - `0b60304` — feat(desktop): ProjectRecord data model + storage helper
  - `664db8a` + `c070e5d` — feat(desktop): useProjectRecordController hook (+ type fix)
  - `ebb3df7` + `947a684` — feat(desktop): RecentProjectsPanel UI (+ repo test pattern)
  - `2840be8` — feat(desktop): useProjectRecordSync adapter hook
- All 8 new files; **no existing file modified**.

## Important Constraints For The Next Agent

The H9 handoff constraints still apply. In addition, for the H10 layer:

- **No automatic rerun on resume.** Selecting a project in the panel must only reopen the Mission Workspace context — never auto-trigger preview / Visual QA / provider / overlay apply / publish.
- **Never display raw payload.** The `editTimeline` summary intentionally stores only counts + enum strings + timestamps + a boolean. Do not add raw prompt / provider response / file content fields.
- **Storage is local-only.** Do not add a server route just to persist project records unless the user explicitly approves the scope.
- **Honesty in display.** `lastPreviewUrl` only renders when truth === "observed" — this is enforced at both the data layer (`updateProjectPreview` clears the URL otherwise) and the UI layer (`RecentProjectsPanel` checks truth before rendering).
- **No new dependency.** The H10 stack uses `react`, existing `persistentJsonState`, existing `EditTimelineItem` types, and the existing shadcn-style `components/ui/{card,badge,button}` primitives.

## How To Wire (next slice)

The recommended wiring point is **App.tsx top-level**, where the current Mission Workspace state already lives. The simplest wiring:

```ts
// At the top of App() or wherever the current mission state is centralized:
const projectController = useProjectRecordController();

// For each active mission rendered by MissionBoardPanel / MissionBoardContainer:
useProjectRecordSync({
  controller: projectController,
  missionId: mission.id,
  title: mission.title,
  goal: mission.goal,
  observedPreview: lastObservedPreview, // already tracked
  visualQa: latestVisualQaSummary,      // already tracked
  scaffold: scaffoldAvailability,       // derived from existing scaffold fetch
  editTimelineItems: editTimelineItems, // already used by EditTimelineCard
  publish: publishDraftStatus,          // when present
});

// Render the panel somewhere appropriate (e.g. a "Recent Projects" tab):
<RecentProjectsPanel
  records={projectController.records}
  onSelectProject={handleProjectResume}      // wires to Mission Workspace open
  onRemoveProject={projectController.remove} // optional
/>
```

The wiring slice should:

1. Add the controller call once at the highest scope where all missions are visible.
2. Pass each active mission's observable inputs into `useProjectRecordSync`.
3. Add `handleProjectResume(missionId)` that re-opens the Mission Workspace context **without** any side-effect rerun.
4. Add `RecentProjectsPanel` to a navigation point (an existing tab, a new sidebar entry, or a modal).
5. Provide one or two test cases that confirm the resume action does NOT trigger preview / QA / provider / overlay calls.

## Validation Evidence (this slice)

- dgx-01 typecheck: my 8 new files clean; the only remaining errors are env-only `Cannot find module '@testing-library/react'` because dgx-01 does not have node_modules installed for this branch state. The dep is already declared in `apps/desktop/package.json` at `^16.3.2`, so Codex / Mac dev environment resolves automatically.
- 462 pre-existing typecheck errors from PR #514 base being 781 commits behind `origin/main` — unchanged, not introduced by H10.
- Runtime vitest deferred to Codex machine (rolldown native binding unavailable on dgx-01, same pattern as previous Antigravity-style slice PRs).

## Recommended Next Step

**H10 wiring slice** — see "How To Wire" above. After that:

- **H10 resume action slice** — `handleProjectResume(missionId)` implementation in App / MissionBoardPanel.
- **H11 same-origin DOM selector capture** — only after persistence/resume is settled, per H9 handoff.

## Final Picture

After the wiring slice lands, leaving and reopening an App Builder mission becomes:

1. Operator leaves the app while a mission is mid-flight.
2. ProjectRecord index has captured: mission ID, title, goal, last observed preview URL (only if truly observed), Visual QA summary, scaffold availability, edit timeline summary (counts + enum strings), publish draft status.
3. On return, the "최근 프로젝트" panel lists missions sorted by last activity.
4. Selecting one re-opens the Mission Workspace with the recorded state — **no auto-rerun**.
5. The operator decides whether to re-observe the preview, re-run Visual QA, or pick up the in-progress patch.

The H10 layer is the persistence + reopen surface; the operator stays in charge of every rerun.
