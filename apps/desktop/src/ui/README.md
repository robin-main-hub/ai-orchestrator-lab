# Shadcn primitives (`apps/desktop/src/ui/`)

Headless, theme-aware UI primitives ported from the v0 design output.
Live alongside the legacy `apps/desktop/src/components/` tree — feature
components migrate to use these one panel at a time (Stage 2+).

## What's here (Stage 1a)

| Primitive | Radix backing | Notes |
|---|---|---|
| `button` | `react-slot` | default / destructive / outline / secondary / ghost / link variants, sm/md/lg sizes |
| `card` | none | Plain div composition. CardHeader / Content / Footer slots |
| `avatar` | `react-avatar` | Image fallback with initials. Status-dot composition handled at call site |
| `badge` | `react-slot` | semantic variants (default / secondary / destructive / outline) |
| `input` | none | Text input baseline |
| `textarea` | none | Auto-resize via CSS, not JS |
| `label` | `react-label` | Form-control association |
| `tooltip` | `react-tooltip` | Hover popover with 0-delay variant |
| `popover` | `react-popover` | Click-anchored content |
| `dropdown-menu` | `react-dropdown-menu` | Menu, checkbox/radio item, submenu, separator, shortcut slots |
| `collapsible` | `react-collapsible` | Lightweight disclosure primitive for deferred panel sections |
| `dialog` | `react-dialog` | Modal overlay + close affordance |
| `sheet` | `react-dialog` (variant) | Slide-in drawer (right edge by default) |
| `scroll-area` | `react-scroll-area` | Custom scrollbar — used by long lists |
| `separator` | `react-separator` | Horizontal / vertical thin divider |
| `tabs` | `react-tabs` | Pill / underline variants depending on `className` |
| `switch` | `react-switch` | Toggle for boolean settings |
| `skeleton` | none | Loading placeholder block |

## What's intentionally NOT here yet (Stage 1b on demand)

Lower-priority primitives that we'll port only when a screen migration
actually needs them — keeps the bundle lean and avoids carrying
dead-weight code:

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `breadcrumb`,
`calendar`, `carousel`, `chart`, `checkbox`, `command`,
`context-menu`, `drawer`, `form`, `hover-card`,
`input-otp`, `menubar`, `navigation-menu`, `pagination`, `progress`,
`radio-group`, `resizable`, `select`, `sidebar` (Shadcn's prebuilt
shell — we'll build ours), `slider`, `sonner`, `table`, `toast`,
`toggle`, `toggle-group`.

If you need one of these, copy from `docs/v0/v0-output/components/ui/`,
strip the leading `"use client"` directive, and drop into this folder.

## Conventions

- All primitives use `cn()` from `@/lib/utils` (the Shadcn-standard
  combiner — re-exports `clsx + tailwind-merge`).
- The `@/` path alias is wired in `tsconfig.json` and `vite.config.ts`.
- No `"use client"` directives — this is a Vite app, not Next.js.
- Color tokens (`bg-primary`, `border-border`, `text-foreground`, ...)
  resolve through `src/styles/tokens.css` (Stage 0 work).
- Dark mode is the only theme; no light-mode toggle.

## Don't import this from legacy components yet

The Stage 1 PRs add primitives WITHOUT touching any existing component.
Migration of `components/*.tsx` to use these primitives happens in
Stage 2 — and only in regions Codex is not actively rewriting (see
`docs/v0/README.md` for the full plan).
