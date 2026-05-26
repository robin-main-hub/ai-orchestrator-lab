# v0 UI adoption map

Date: 2026-05-26

This map tracks remaining primitive adoption after the v0 cascade and PR #157.

## Already covered

| Area | Current state |
| --- | --- |
| `EvolveMementoPanel` | Uses `StatusBadge` for the first Stage 1b adoption path |
| `AgentsSidebar` | PR #157 adds dropdown/collapsible primitives and shared badges |
| `apps/desktop/src/ui` | Shared `AvatarWithStatus` and `StatusBadge` exist on main; dropdown/collapsible live in PR #157 |

## Safe non-conflict adoption

| Area | Files | Primitive step | Collision risk |
| --- | --- | --- | --- |
| Cheat Sheet | `apps/desktop/src/components/CheatSheetOverlay.tsx` | Priority chip to `StatusBadge` | Low |
| Command Palette | `apps/desktop/src/components/CommandPalette.tsx` | Verb chip to `StatusBadge` | Low |
| Runtime rail | `apps/desktop/src/components/RuntimeRailPanel.tsx` | Runtime state labels to `StatusBadge` | Low |
| Project rail | `apps/desktop/src/components/ProjectRailPanel.tsx` | Run and permission labels to `StatusBadge` | Low |
| Channel rail | `apps/desktop/src/components/ChannelRailPanel.tsx` | Channel and guard labels to `StatusBadge` | Low |
| Backup rail | `apps/desktop/src/components/BackupRailMenu.tsx` | Projection/artifact labels to `StatusBadge` | Low |
| Mobile more/system/approvals | `apps/mobile/src/**` | Compact runtime and approval status labels | Low |

## Wait for #157

| Area | Reason |
| --- | --- |
| `AgentsSidebar` follow-up polish | #157 owns the file and primitive dependency adoption |
| Any new dropdown/collapsible usage | #157 owns the new primitive wrappers and lockfile changes |

## Wait for package tracks

| Area | Reason |
| --- | --- |
| Provider fallback behavior | Parallel `packages/providers/src/**` track |
| Debate engine execution | Parallel `packages/agents/**` track |
| Memory record mutation behavior | Parallel `packages/memory/src/**` track |

## Native select inventory

These are candidates for later dropdown/select primitive work, but should not be changed in this branch:

| File | Notes |
| --- | --- |
| `AgentConfigDrawer.tsx` | Multiple config selects; likely a dedicated form-control pass |
| `AgentSettingsPanel.tsx` | Role select plus avatar controls |
| `ConfigLibraryPanel.tsx` | Scope select in config editor |
| `ConversationWorkbench.tsx` | Agent selector in the header; higher visual risk |

