# 2026-06-25 #793 PR B Plan — App.tsx Shell IA Integration (Narrowest Seam)

## Summary

Wire the shell IA layer (landed via PR #1069) into App.tsx through the narrowest possible seam. No full UI replacement — add `AppShellNav` as an alternative top nav, derive active tab from existing `mode` + `activeNavItem` state, and wire tab selection back to existing state setters.

## Owner constraint

> PR B should wire the new IA layer into the existing shell through the narrowest seam. No full UI replacement.

## Current state (after PR #1069 merge)

- 4 new files exist on main: `appShellIa.ts`, `appShellIa.test.ts`, `AppShellNav.tsx`, `renewal-shell.css`
- App.tsx does NOT import or reference any of them
- App.tsx uses `RuntimeStatusBar` (top bar) + left rail nav (`navSections` from `seeds/conversation.ts`)
- Navigation state: `mode: CenterMode` + `activeNavItem: NavItemId`

## The narrowest seam

### What changes (approx. 35 lines added, 0 removed)

1. **Imports** (~5 lines):
   ```tsx
   import { AppShellNav } from "./components/AppShellNav";
   import { appShellSections, findAppShellTab, findAppShellSection, resolveAppShellTabForSurface, sectionIdForAppShellTab, defaultAppShellTabBySection } from "./lib/appShellIa";
   import "./styles/renewal-shell.css";
   ```

2. **Derived state** (~10 lines):
   ```tsx
   const activeShellTabId = resolveAppShellTabForSurface({ activeNavItem, mode });
   const activeShellTab = findAppShellTab(activeShellTabId);
   const activeShellSection = findAppShellSection(sectionIdForAppShellTab(activeShellTabId));
   ```

3. **Reverse mapping** (~10 lines):
   ```tsx
   const handleSelectShellTab = useCallback((tabId: AppShellTabId) => {
     const tab = findAppShellTab(tabId);
     if (tab.target.mode) setMode(tab.target.mode);
     if (tab.target.nav) setActiveNavItem(tab.target.nav);
   }, []);
   const handleSelectShellSection = useCallback((sectionId: AppShellSectionId) => {
     handleSelectShellTab(defaultAppShellTabBySection[sectionId]);
   }, [handleSelectShellTab]);
   ```

4. **Render** (~10 lines): Add `<AppShellNav>` above or below existing `<RuntimeStatusBar>`:
   ```tsx
   <AppShellNav
     activeSection={activeShellSection}
     activeTab={activeShellTab}
     pendingApprovals={controlQueueSnapshot.pending.length}
     providerName={activeProvider?.name ?? "local-provider"}
     sections={appShellSections}
     onCommandPalette={() => setCommandPaletteOpen(true)}
     onOpenQueue={() => setApprovalDrawerOpen(true)}
     onProbeRuntime={handleProbeDgx}
     onSelectSection={handleSelectShellSection}
     onSelectTab={handleSelectShellTab}
   />
   ```

### What does NOT change

- `RuntimeStatusBar` — stays as-is (PR B adds, does not remove)
- Left rail nav (`navSections`, `<aside className="left-rail">`) — stays as-is
- `mode` / `activeNavItem` state management — no new state, no new storage keys
- All existing callbacks (`setMode`, `setActiveNavItem`, `setCommandPaletteOpen`, etc.)
- Content rendering below the nav (workspace-grid, center panels, etc.)
- No CSS changes (renewal-shell.css is additive)

## Tab → state reverse mapping

| Tab ID | target.mode | target.nav | Effect |
|---|---|---|---|
| `command.overview` | — | `dashboard` | setActiveNavItem("dashboard") |
| `command.attention` | — | `command_center` | setActiveNavItem("command_center") |
| `command.cockpit` | `cockpit` | — | setMode("cockpit") |
| `studio.chat` | `conversation` | — | setMode("conversation") |
| `studio.code` | — | `coding` | setActiveNavItem("coding") |
| `studio.research` | — | `research` | setActiveNavItem("research") |
| `studio.debate` | `debate` | — | setMode("debate") |
| `operations.launch` | — | `run` | setActiveNavItem("run") |
| `operations.live` | — | `theater` | setActiveNavItem("theater") |
| `operations.terminal` | `tmux` | — | setMode("tmux") |
| `operations.queue` | — | — (virtual) | Open approval drawer |
| `operations.replay` | — | — (virtual) | TBD (no existing replay nav item) |
| `library.sessions` | — | `sessions` | setActiveNavItem("sessions") |
| `library.workspaces` | — | — (virtual) | TBD |
| `library.agents` | — | — (virtual) | TBD |
| `system.providers` | — | `providers` | setActiveNavItem("providers") |
| `system.sources` | — | `channels` | setActiveNavItem("channels") |
| `system.config` | — | `config_files` | setActiveNavItem("config_files") |
| `system.backup` | — | `backup` | setActiveNavItem("backup") |

**Virtual surfaces** (operations.missions, operations.queue, operations.replay, library.workspaces, library.artifacts, library.memory, library.agents, system.models, system.modules, system.runtime): these tabs don't map to an existing `mode` or `navItem`. For PR B, they will:
- Set `mode` to `"annex"` (management rail view)
- Set `activeNavItem` to the closest existing nav item, or `"dashboard"` as fallback
- Or: trigger the relevant drawer/panel (e.g., `operations.queue` → `setApprovalDrawerOpen(true)`)

**Owner decision needed:** How should virtual surfaces be handled in PR B? Options:
1. Map to `mode: "annex"` + closest nav item (minimal, may not show the right content)
2. Wire specific virtuals to their existing handlers (e.g., queue → approval drawer)
3. Leave virtual tabs as no-ops for now (tab highlights but nothing changes)

## Pending approvals count

Need to find or derive `pendingApprovals` for the `AppShellNav` prop. Options:
1. Use `controlQueueSnapshot.pending.length` if it exists
2. Count items in the approval queue state
3. Pass `0` as placeholder for PR B

## Test plan for PR B

1. `pnpm typecheck` — clean
2. `pnpm vitest run` — existing 2400+ tests still pass
3. Manual smoke: AppShellNav renders, tab clicks change mode/nav, active tab reflects current state
4. No visual regression in existing RuntimeStatusBar or left rail

## Estimated diff

- App.tsx: +35 lines, -0 lines
- No other files changed
- No new files

## Owner action needed

1. Confirm the seam: add `AppShellNav` alongside `RuntimeStatusBar` (not replacing)?
2. Confirm virtual surface handling: option 1, 2, or 3?
3. Confirm `pendingApprovals` data source
4. After confirmation, AI implements PR B
