# 2026-06-25 PR #562 Review — Mimo Server-Side Auth Injection

## Summary

PR #562 adds server-side `MIMO_API_KEY` env injection to the Mimo proxy, preventing the real API key from reaching the browser bundle. Main currently uses a passthrough proxy that forwards client auth headers unchanged — the real key must be in the client.

## Current main state

| File | Lines | Behavior |
|---|---|---|
| `apps/desktop/functions/_mimoProxy.ts` | 49 | Passthrough — forwards client headers unchanged. Hardcoded upstream `token-plan-sgp.xiaomimimo.com`. No env. No auth injection. |
| `apps/desktop/functions/mimo-token-anthropic/[[path]].ts` | 8 | Calls `proxyMimo(request, config)` — no env passed. |
| `apps/desktop/functions/mimo-token-openai/[[path]].ts` | 8 | Calls `proxyMimo(request, config)` — no env passed. |
| `apps/desktop/vite.config.ts` | — | Proxy with `token-plan-sgp.xiaomimimo.com`. No auth injection. Client must send key. |

## #562 changes

### `_mimoProxy.ts` (rewritten, 66 lines)

- Signature: `proxyMimo(request, env: ProxyEnv, config: ProxyConfig)` — adds `env` parameter
- Reads `MIMO_API_KEY` from env, injects as `Authorization: Bearer` or `x-api-key` depending on `authStyle`
- Overwrites any client-sent auth header (client only sends readiness sentinel)
- Configurable upstream via `MIMO_UPSTREAM` env (default: `api.xiaomimimo.com`)
- `authStyle` parameter: `"bearer" | "x-api-key"`

### Route files (14 lines each)

- Pass `context.env` to `proxyMimo()`
- Add `authStyle` to config

### `vite.config.ts`

- Adds `mimoProxy()` helper that reads `MIMO_API_KEY` from `process.env` and injects via `proxyReq.setHeader()`
- Changes upstream to `api.xiaomimimo.com`
- Adds vitest config (`test.setupFiles`)
- Renames `@ai-orchestrator/memory` alias to `@ai-orchestrator/simplememo`

## Problem analysis

**Is the problem still present in main?** Yes.

Main's proxy forwards client auth headers unchanged. This means:
- The real `MIMO_API_KEY` must be in the client JS bundle (via `VITE_MIMO_API_KEY` or similar)
- Anyone with browser devtools can extract the key
- The key is committed to git if it's in `.env` files that leak

#562's server-side injection is a genuine security boundary improvement:
- Real key lives in Cloudflare Pages env (production) / `process.env` (dev)
- Client only sends a non-secret readiness sentinel
- Proxy overwrites client auth with the real key before forwarding upstream

## Conflicts

| File | Conflict risk | Reason |
|---|---|---|
| `_mimoProxy.ts` | None — full rewrite | Signature change, not a merge |
| Route files | None — full rewrite | Signature change |
| `vite.config.ts` | **High** | Main has diverged significantly since #562's branch point. Alias rename + vitest config may already be in main or conflict. |

## Upstream change concern

#562 changes the default upstream from `token-plan-sgp.xiaomimimo.com` to `api.xiaomimimo.com`. This is a **different API endpoint**:
- `token-plan-sgp` = token plan (subscription-based, Singapore region)
- `api.xiaomimimo.com` = direct API

This change may be intentional (moving from token plan to direct API) or may be wrong. **Owner must confirm which upstream to use.**

## Security/env requirements

- `MIMO_API_KEY` must be set in Cloudflare Pages project env (production)
- `MIMO_API_KEY` must be set in dev shell env (local dev)
- `MIMO_UPSTREAM` is optional (defaults to `api.xiaomimimo.com` in #562, `token-plan-sgp.xiaomimimo.com` in main)
- No `VITE_MIMO_API_KEY` or similar client-bundle env needed after this change
- The key must NOT be committed to git

## Can it be tested without env/secret?

Partially. The proxy logic (auth injection, header overwrite, upstream construction) can be unit-tested with a mock env. The actual upstream call requires a real `MIMO_API_KEY`.

## Salvage plan

### Minimal salvage (recommended)

1. Rewrite `_mimoProxy.ts` to accept `env` parameter and inject auth — take #562's pattern
2. Update route files to pass `context.env` and add `authStyle`
3. Update `vite.config.ts` proxy to inject from `process.env.MIMO_API_KEY`
4. **Keep main's upstream** (`token-plan-sgp.xiaomimimo.com`) unless owner confirms the change
5. **Do NOT** take the alias rename or vitest config from #562 (main may already have these or different versions)
6. Add a unit test for the auth injection logic (mock env, verify header overwrite)

### Do NOT merge as-is

- #562's branch is too stale (684 pre-squash duplicates)
- Upstream change is unconfirmed
- vite.config.ts will conflict

## Recommended owner decision

1. **Approve the security improvement** — server-side auth injection should land
2. **Confirm the upstream** — `token-plan-sgp.xiaomimimo.com` (keep current) or `api.xiaomimimo.com` (switch to direct API)?
3. After confirmation, AI can create a minimal salvage PR (rewrite `_mimoProxy.ts` + route files + vite proxy + unit test)
4. Owner sets `MIMO_API_KEY` in Cloudflare Pages env after the PR merges

## Do-not-merge-as-is

#562 should NOT be merged as-is. The branch is stale, the upstream change is unconfirmed, and vite.config.ts conflicts. A minimal salvage PR on current main is the right path — but only after owner confirms the upstream choice.
