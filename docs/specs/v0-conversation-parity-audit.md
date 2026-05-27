# v0 Conversation Parity Audit

Status: Implemented / R6 visual parity complete
Owner: Codex UI track
Date: 2026-05-27


## Goal

Bring the default desktop Conversation screen closer to the v0 source without touching Claude-owned runtime, memory, provider, or agents work. This audit intentionally starts as a small docs-only PR so the next UI code PR can be reviewed against a stable scope.

Primary source of truth:

- `docs/v0/v0-output/components/conversation/conversation-view.tsx`
- `docs/v0/v0-output/components/conversation/conversation-header.tsx`
- `docs/v0/v0-output/components/conversation/message-thread.tsx`
- `docs/v0/v0-output/components/conversation/message-bubble.tsx`
- `docs/v0/v0-output/components/conversation/conversation-composer.tsx`
- `docs/v0/v0-output/components/conversation/approval-queue.tsx`

Current implementation surfaces checked:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/ConversationWorkbench.tsx`

## v0 Baseline

The v0 Conversation screen is a focused command-room conversation:

1. Conversation header with active agent/session metadata and compact status chips.
2. Scrollable message thread.
3. Composer.
4. Collapsible approval queue strip.
5. Agents sidebar on the right.

The v0 Conversation screenshot does not show the full desktop operations shell around the conversation. In particular, the first-viewport Conversation state does not show a left rail, terminal dock, coding packet panel, handoff panel, or memory/memento panel as always-visible surfaces.

## Parity Gaps Status (R6 Update)

All App Shell and ConversationWorkbench visual parity gaps identified in this audit have been **resolved** or **superseded** in the R6 parity wave:

### App Shell Surfaces (Resolved)
- **Left rail**: Hidden by default in Conversation mode (`#169` merged).
- **TerminalDock**: Hidden by default in Conversation mode (`#169` merged).
- **WorkItemHandoffPanel**: Hidden by default in Conversation mode (`#169` merged).
- **CodingPacketPanel**: Hidden by default in Conversation mode (`#169` merged).
- **EvolveMementoPanel**: Hidden by default in Conversation mode (`#169` merged).

### ConversationWorkbench Surfaces (Resolved)
- **Inline approval queue**: Visibility cleaned up and integrated (`#173` merged).
- **Delegation inline panel**: Visibility cleaned up and integrated (`#173` merged).
- **Action strip extras**: Core actions preserved; layout visibility aligned with v0 (`#173` merged).
- **Header chips**: Visible chip count and labels aligned with v0 (`#173` merged).

### AgentsSidebar / Right Rail (Resolved)
- **AgentsSidebar rail layout**: Adapted to v0 categories; right rail width restricted to 360-420px (`#178` merged).
- **AgentSettingsPanel select replacement**: Native select replaced with DropdownMenu (`#194` merged).

## Remaining / Deferred Items (Post-R6)

These are structural/architectural items deferred for design judgment or future work:

1. **ConversationWorkbench Structural Decomposition**: Splitting the monolithic `ConversationWorkbench.tsx` into v0's 5-file structure (header/view/message-bubble/message-thread/composer + approval-queue).
2. **CommandPalette Full v0 Port**: Redesigning CommandPalette cmdk/Dialog structures vs current verb-command layout.
3. **AvatarWithStatus Broader Adoption**: Replacing `AgentAvatar` across remaining surfaces without breaking protocol contracts.


## Recommended Next PR

Create a small code PR named `codex/conversation-v0-shell-pass` with only App shell visibility changes:

1. Add a Conversation-specific shell class or boolean, for example `const conversationV0Shell = mode === "conversation"`.
2. In `apps/desktop/src/App.tsx`, hide or collapse the following by default when `conversationV0Shell` is true:
   - `.left-rail`
   - `TerminalDock`
   - `WorkItemHandoffPanel`
   - `CodingPacketPanel`
   - `EvolveMementoPanel`
3. Preserve all callbacks, state, and data creation paths. This pass is visual/default exposure only.
4. Keep `AgentsSidebar` visible on the right because it exists in the v0 Conversation screenshot.
5. Do not change `packages/memory/**`, `packages/providers/**`, `packages/agents/**`, or shared protocol types.

This is the safest first code PR because it moves the app closer to v0 without editing provider, memory, agents, or Claude open-PR files.

## Follow-up PRs

After the shell pass lands:

1. `codex/conversation-v0-workbench-pass`
   - Tighten `ConversationWorkbench` header chip count and labels.
   - Make inline approval/delegation panels conditional so the default screen reads like v0.
   - Move non-v0 action strip items into overflow.

2. `codex/conversation-v0-sidebar-pass`
   - Recheck `AgentsSidebar` after `#157` lands.
   - Adopt dropdown/collapsible primitives where needed.
   - Keep the right rail visually aligned with the v0 Agents panel.

3. `codex/conversation-v0-visual-qa`
   - Run desktop dev server.
   - Capture Conversation screenshots at desktop and mobile-ish widths.
   - Compare against the v0 screenshots already shared in the thread.

## Validation Plan

For this docs-only audit PR:

- `git diff --check`

For the next shell code PR:

- `npx --yes pnpm@10.11.0 --filter @ai-orchestrator/desktop typecheck`
- `npx --yes pnpm@10.11.0 --filter @ai-orchestrator/desktop test`
- Browser screenshot pass for Conversation mode after starting the desktop dev server.

Full dependency builds may remain blocked until the current `origin/main` memory build break from `#163` is fixed in the Claude-owned memory area.

## Non-goals

- No direct edits to `packages/memory/**`.
- No direct edits to `packages/providers/**`.
- No direct edits to `packages/agents/**`.
- No main branch push or merge.
- No attempt to resolve Claude PR conflicts from this UI track.
