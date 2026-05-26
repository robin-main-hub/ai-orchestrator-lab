# v0 Conversation Parity Audit

Status: audit PR seed
Owner: Codex UI track
Date: 2026-05-26

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

## Current Parity Gaps

### App Shell Surfaces

These are the largest visible mismatches because they sit outside `ConversationWorkbench` and appear by default in Conversation mode:

| Surface | Current location | v0 parity issue | First recommendation |
| --- | --- | --- | --- |
| Left rail | `apps/desktop/src/App.tsx` | v0 Conversation uses the app header + right Agents sidebar, not a persistent left operations rail. | Hide or collapse by default for `mode === "conversation"` in the v0 parity pass. |
| `TerminalDock` | `apps/desktop/src/App.tsx` | v0 Conversation screenshot has no bottom terminal dock. | Hide by default in Conversation mode; keep for tmux/runtime modes. |
| `WorkItemHandoffPanel` | `apps/desktop/src/App.tsx` | v0 has a compact approval queue, not a separate large handoff panel below the conversation. | Move behind drawer/toggle or hide by default for Conversation. |
| `CodingPacketPanel` | `apps/desktop/src/App.tsx` | v0 Conversation does not display the coding packet panel in the default conversation viewport. | Keep the create-packet action, but hide the panel unless explicitly opened. |
| `EvolveMementoPanel` | `apps/desktop/src/App.tsx` | v0 right side is Agents-focused; memento panel makes the default right rail heavier than v0. | Hide by default in Conversation mode or move behind Memory/settings affordance. |

### ConversationWorkbench Surfaces

`ConversationWorkbench` already mirrors the v0 hierarchy more closely than the outer app shell, but a few extra surfaces still make the default screen denser than v0:

| Surface | Current location | v0 parity issue | First recommendation |
| --- | --- | --- | --- |
| Inline approval queue | `ApprovalQueueInline` | v0 uses the bottom collapsible approval queue strip as the primary approval surface. | Keep only when there is an urgent pending retry, otherwise rely on `InboxApprovalStrip`. |
| Delegation inline panel | `DelegationInline` | Useful product behavior, but not visible in the v0 baseline. | Hide when empty or move under an explicit delegation affordance. |
| Action strip extras | `ActionStrip` | v0 screenshot emphasizes fewer bottom actions; current strip includes backup/Telegram/branch variants. | Keep core actions; defer non-v0 extras behind menu or overflow. |
| Header chips | `ConversationHeader` | Current header includes additional SOUL/Creativity/Context concepts beyond the v0 Profile/Memory/Preview shape. | Keep data contracts, but align visible chip count/labels with v0 first. |

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
