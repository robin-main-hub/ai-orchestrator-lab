# `src/components/ui/` — third-party UI primitives

This directory contains **copy-in components** vendored from upstream open
source projects. They are not npm dependencies; we own the source so we
can theme, restyle, and adapt without forking. This file records where each
file came from and the license terms we adopted under.

## shadcn/ui (Card, Badge, Button)

- Upstream: https://github.com/shadcn-ui/ui
- License: MIT
  > Copyright (c) 2023 shadcn
  >
  > Permission is hereby granted, free of charge, to any person obtaining a
  > copy of this software and associated documentation files (the "Software"),
  > to deal in the Software without restriction, including without limitation
  > the rights to use, copy, modify, merge, publish, distribute, sublicense,
  > and/or sell copies of the Software, and to permit persons to whom the
  > Software is furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included
  > in all copies or substantial portions of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND...
  >
  > (Full text: https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)
- Style: `new-york`
- Adopted at: OSS-H1 (commit following 6b97e43)
- Files vendored:
    - `card.tsx`
    - `badge.tsx`
    - `button.tsx`
- Adaptation notes:
    - Tokens (`bg-card`, `text-card-foreground`, `bg-primary`, `border`, …)
      resolve through `src/styles/tokens.css` `@theme inline` to the v0
      "premium black-glass" palette already shipping (see tokens.css head
      comment for the Stage 1b alignment rationale).
    - `cn()` import path matches shadcn convention (`@/lib/utils`) so
      future v0-generated components drop in without rewrites.

## Adding more primitives

When vendoring additional shadcn primitives:

1. Copy the upstream source verbatim from
   https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui
   (new-york style, Tailwind v4 variant).
2. Add a short adaptation note here listing what you changed and why.
3. Keep the upstream license attribution above intact — the MIT terms cover
   modifications too, but the attribution requirement stays.

## Adding non-shadcn third-party UI

Add a new section under this file with: upstream URL, license text excerpt,
files vendored, adaptation notes. Do NOT vendor code under
copyleft/non-permissive licenses without explicit project owner sign-off.
