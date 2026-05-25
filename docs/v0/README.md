# v0 design system reference

This directory holds the raw output from v0.app's design generation
session for the AI Orchestrator Lab desktop UI redesign.

- v0 share link: https://v0.app/chat/ai-orchestrator-lab-jRHRDd067QN
- Imported: 2026-05-25
- Stack v0 generated: **Next.js 16 + React 19 + Tailwind 4 + Shadcn full**
- Our target stack: **React 19 + Vite + Tailwind 4** (Vite, NOT Next.js)

## ⚠️ Reference only — do NOT import from `v0-output/`

The TypeScript / JSX in `v0-output/` is Next.js App Router code with
`"use client"` directives, `next/image`, `next/link`, and Next-specific
routing assumptions. Importing it into our Vite build will fail or
silently misbehave.

This directory exists to:
1. Preserve design intent (color tokens, spacing scale, component
   anatomy) when v0's hosted share link eventually expires.
2. Give code reviewers a side-by-side comparison: "this is what v0
   produced; this is how we ported it."
3. Let multiple agents (Claude, Codex, Cursor, future contributors)
   work from the same source of truth without re-asking v0.

**To use a component from here**: copy-port it to
`apps/desktop/src/ui/` (Shadcn primitives) or
`apps/desktop/src/components/` (feature components), strip
`"use client"`, replace `next/*` imports, and adapt to our protocol
types from `@ai-orchestrator/protocol`.

## Layout of `v0-output/`

| Path | Purpose |
|---|---|
| `app/globals.css` | **Design tokens.** Color palette, radius, font family. Already ported to `apps/desktop/src/styles/tokens.css`. |
| `components/ui/` | Shadcn primitive set (~50 components). Port on-demand to `apps/desktop/src/ui/`. |
| `components/{conversation,debate,tmux,sidebar,layout,shared}/` | Feature components. Wireframes for our screens A / B / C / F+G. |
| `lib/mock-data.ts` | Mock 17-persona data. Useful for stub data when wiring screens. |
| `lib/types.ts` | v0's invented types. Map to our `@ai-orchestrator/protocol` types when porting. |
| `lib/utils.ts` | `cn()` helper. Already ported to `apps/desktop/src/lib/cn.ts`. |

## Migration plan (multi-stage)

- **Stage 0** (this PR): Tailwind 4 + token CSS + `cn()` helper + fonts.
  Zero component changes. Existing `styles.css` untouched.
- **Stage 1**: Port Shadcn primitives into `apps/desktop/src/ui/`.
  Side-by-side with existing components, opt-in per feature.
- **Stage 2**: Migrate feature panels (Agents sidebar, Memento,
  TerminalDock, nav rail) — **avoiding areas Codex is actively
  working on** (ConversationWorkbench, delegation UI, App.tsx
  controller extractions).
- **Stage 3**: Migrate Conversation / Debate / Tmux Swarm once Codex
  activity settles.
- **Stage 4**: Shrink legacy `styles.css` once all consumers have
  migrated.

## Codex agent note

`docs/v0/v0-output/` is **reference material only**. Never import,
require, or symlink from this directory into the runtime app. The
TypeScript compiler is already scoped to `apps/desktop/src/` via
tsconfig include, so accidental imports would surface as resolution
errors — but the social contract is the safer guard.
