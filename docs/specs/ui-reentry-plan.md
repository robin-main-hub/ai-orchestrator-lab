# UI re-entry plan

Date: 2026-05-26

Purpose: keep the v0 visual port strict while making sure required safety and workflow surfaces do not disappear. This plan only covers UI re-entry work that does not touch the memory, providers, or agents package areas owned by parallel PRs.

## File ownership guard

Do not touch these areas in this track:

- `packages/memory/src/**` — memory adapter / PR #156 track
- `packages/providers/src/**` — DGX + local fallback provider track
- `packages/agents/**` — debate engine and soul.md track
- `apps/desktop/src/components/AgentsSidebar.tsx` — PR #157 track
- `apps/desktop/src/ui/dropdown-menu.tsx`, `apps/desktop/src/ui/collapsible.tsx`, `apps/desktop/package.json`, `pnpm-lock.yaml` — PR #157 track

## Re-entry candidates

| Source ledger item | Risk | Safe surface | First UI step |
| --- | --- | --- | --- |
| EvolveMemento record actions: activate / pin / forget | High | Dedicated memento records drawer or right-click row action | Document contract first; avoid `packages/memory` until adapter PR lands |
| Debate provenance pills: accepted / rejected / evidence / coding / decision | High | `Stage3DebateTable` footer rows | Adopt existing `StatusBadge`; do not change protocol fields |
| Debate parent reference row | High | `Stage3DebateTable` card body | Render existing optional fields only |
| Tmux pane Warp timeline | High | `TmuxPaneCard` lower section | Use existing `TmuxPaneTimeline`; no tmux dispatch behavior change |
| Agent controls provider + model menu | High | `AgentsSidebar` after #157 | Wait for #157 merge; no parallel edits |
| Control Queue overlay shortcut | High | `ControlQueueDrawer` / `CheatSheetOverlay` | Keep keyboard entry visible and searchable |
| Cheat Sheet overlay | High | `CheatSheetOverlay` | Keep as standalone learning surface |

## Current safe sweep

This branch only takes low-conflict visible steps:

- Adds status-copy helpers for mobile runtime and approval queue labels.
- Adopts shared desktop `StatusBadge` in rail panels, Command Palette, and Cheat Sheet.
- Adds this re-entry plan and a v0 adoption map for coordination.

