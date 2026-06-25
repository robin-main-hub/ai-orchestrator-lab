# 2026-06-25 PR #562 Mimo Salvage Plan — Upstream Choice & Implementation Design

## Summary

PR #562 adds server-side `MIMO_API_KEY` env injection to the Mimo proxy, preventing the real API key from reaching the browser bundle. This document narrows the salvage plan to a concrete implementation design with upstream options for owner decision.

## Current #562 status

- Branch `feat/mimo-real-token-server-proxy` — too stale to merge as-is (684 pre-squash duplicates)
- Review packet: `docs/handoffs/2026-06-25-mimo-pr-562-review.md`
- Security improvement confirmed: real key must not be in client bundle
- Do NOT merge as-is — stale branch, unconfirmed upstream, vite.config.ts conflict

## Current main architecture

### Server-side (DGX-02) — SECURE

`apps/server/src/index.ts` provider profiles `provider_mimo_token_openai` and `provider_mimo_token_anthropic`:
- baseUrl: `https://token-plan-sgp.xiaomimimo.com/v1` (OpenAI-style) / `/anthropic` (Anthropic-style)
- apiKeyEnvNames: `["MIMO_API_KEY"]` — read from server env, never sent to client
- Desktop client calls server `/provider-completions` → server injects key → upstream

### Client-side (desktop) — INSECURE / BROKEN

`apps/desktop/functions/_mimoProxy.ts` (49 lines):
- Passthrough — forwards client headers unchanged
- Hardcoded upstream: `https://token-plan-sgp.xiaomimimo.com`
- No env, no auth injection

`apps/desktop/src/hooks/useProviderRegistryController.ts:89`:
```ts
import.meta.env.VITE_MIMO_TOKEN_PLAN_API_KEY ?? import.meta.env.VITE_MIMO_API_KEY ?? MIMO_MOCK_DEFAULT_TOKEN
```
- Reads `VITE_MIMO_*` env vars — if set, the real key is bundled into client JavaScript
- Currently NOT set in `.env` → falls back to `MIMO_MOCK_DEFAULT_TOKEN` = `"mimo-mock-token"`
- Mock token sent to proxy → proxy forwards to upstream → upstream rejects (unauthorized)

**Security risk:** If someone sets `VITE_MIMO_API_KEY` in `.env` to make the proxy work, the real key is exposed in the browser bundle. Anyone with devtools can extract it.

## Upstream option comparison

### Option A: `token-plan-sgp.xiaomimimo.com` (keep current)

| Aspect | Value |
|---|---|
| Endpoint | `https://token-plan-sgp.xiaomimimo.com` |
| Routes | `/v1/*` (OpenAI-style), `/anthropic/*` (Anthropic-style) |
| Key type | `tp-` prefixed (token plan) |
| Env var to inject | `MIMO_TP_API_KEY` (local .env has `tp-slmvllbti6z4gmjnj5srk2r9nqdbhj5hteonqwswxks2o6ge`) |
| Server-side alignment | Server profiles already use this endpoint with `MIMO_API_KEY` |
| Seed provider test | `baseUrl` asserted as `https://token-plan-sgp.xiaomimimo.com/v1` in `agents.test.ts` |
| Change required | None — keep current upstream |
| Risk | Low — no endpoint change, no test breakage |
| Concern | Server uses `MIMO_API_KEY` env var name for this endpoint, but local .env has `sk-` key in `MIMO_API_KEY`. DGX-02 may have different value. **Owner must verify which env var name holds the tp- key on DGX-02.** |

### Option B: `api.xiaomimimo.com` (switch to direct API)

| Aspect | Value |
|---|---|
| Endpoint | `https://api.xiaomimimo.com` |
| Routes | `/v1/*` (OpenAI-style), `/anthropic/*` (Anthropic-style) — **unconfirmed** |
| Key type | `sk-` prefixed (direct API) |
| Env var to inject | `MIMO_API_KEY` (local .env has `sk-st7vi94m6cmaqmsnq5g4ez74toipqk4fpvwixgp2oeorgikc`) |
| Server-side alignment | Server does NOT use this endpoint for mimo profiles |
| Seed provider test | Would break `agents.test.ts` which asserts `token-plan-sgp` baseUrl |
| Change required | Update seed provider baseUrl + test assertions |
| Risk | Medium — endpoint change, test breakage, unconfirmed route structure |
| Concern | `api.xiaomimimo.com` route structure (does it have `/anthropic`?) is unconfirmed. opencode.json uses `api.xiaomimimo.com/v1` for OpenAI-style only — no Anthropic route. |

### Recommendation: Option A (token-plan-sgp)

**Reasons:**
1. No endpoint change — zero risk of breaking existing seed provider tests
2. Server-side already uses this endpoint — alignment
3. Only the auth injection pattern needs to change, not the upstream
4. The env var name mismatch (`MIMO_API_KEY` holding sk- vs tp-) is a DGX-02 configuration question, not a code question
5. `api.xiaomimimo.com` route structure for Anthropic is unconfirmed — risky

**If owner chooses Option B:** salvage PR must also update seed provider `baseUrl` and test assertions. Additional smoke test required to verify `/anthropic` route on `api.xiaomimimo.com`.

## Security boundary

### Before salvage (current main)

```
Client (browser) → [auth: VITE_MIMO_* or mock] → Proxy (passthrough) → Upstream
                    ↑ KEY EXPOSED IN BUNDLE
```

### After salvage

```
Client (browser) → [auth: readiness sentinel] → Proxy (injects MIMO_*_API_KEY) → Upstream
                                                   ↑ KEY STAYS SERVER-SIDE
```

- Client sends `"mimo-ready"` as auth header (non-secret sentinel)
- Proxy overwrites it with real key from `MIMO_API_KEY` (or `MIMO_TP_API_KEY`) env
- Real key never reaches browser bundle, JS, or git
- If env is missing, proxy returns 502 with clear error (no silent fail)

## Env/secret requirements

| Env var | Where | Purpose | Committed to git? |
|---|---|---|---|
| `MIMO_API_KEY` | Cloudflare Pages env / dev shell | Real API key (injected server-side) | NO |
| `MIMO_UPSTREAM` | Cloudflare Pages env / dev shell (optional) | Override upstream URL | NO (can be in .env.example as default) |
| `VITE_MIMO_*` | **REMOVE** | Client-bundle key — security hole | MUST NOT EXIST |

**Owner action after PR merge:**
1. Set `MIMO_API_KEY` (or `MIMO_TP_API_KEY`) in Cloudflare Pages project env
2. Set same in dev shell env for local dev
3. Verify `VITE_MIMO_*` is NOT set anywhere

## Minimal salvage PR plan

### Files to change

| File | Change |
|---|---|
| `apps/desktop/functions/_mimoProxy.ts` | Rewrite: accept `env` param, inject auth, configurable upstream |
| `apps/desktop/functions/mimo-token-anthropic/[[path]].ts` | Pass `context.env` + `authStyle: "x-api-key"` |
| `apps/desktop/functions/mimo-token-openai/[[path]].ts` | Pass `context.env` + `authStyle: "bearer"` |
| `apps/desktop/vite.config.ts` | Add `mimoProxy()` helper that injects from `process.env.MIMO_API_KEY` |
| `apps/desktop/src/hooks/useProviderRegistryController.ts` | Remove `VITE_MIMO_*` reading; send readiness sentinel instead |

### Files NOT to change

- `apps/desktop/src/seeds/providers.ts` — seed provider baseUrl stays as `token-plan-sgp` (Option A)
- `apps/desktop/src/seeds/agents.test.ts` — test assertions stay unchanged
- Server `apps/server/src/index.ts` — server-side proxy is already secure

### Key design decisions

1. **Upstream:** Keep `token-plan-sgp.xiaomimimo.com` (Option A) as default. Add `MIMO_UPSTREAM` env override for flexibility.
2. **Auth injection:** `Authorization: Bearer <key>` for OpenAI route, `x-api-key: <key>` for Anthropic route. Delete any client-sent auth header first.
3. **Env missing:** Return `502 Bad Gateway` with `{"error":"MIMO_API_KEY not configured"}` — no silent fail, no mock token fallback for real requests.
4. **Client sentinel:** `"mimo-ready"` — non-secret string indicating the client is configured but doesn't carry the real key.
5. **Vite dev proxy:** Mirror the same injection from `process.env.MIMO_API_KEY` via `proxyReq.setHeader()`.

## Tests to write

### Unit tests (no real API call needed)

1. **Auth injection — bearer:** mock env with `MIMO_API_KEY`, verify `Authorization: Bearer <key>` header set
2. **Auth injection — x-api-key:** mock env with `MIMO_API_KEY`, verify `x-api-key: <key>` header set, `Authorization` deleted
3. **Client auth overwrite:** client sends `Authorization: Bearer client-sent`, verify proxy overwrites with env key
4. **Env missing:** no `MIMO_API_KEY` in env → 502 response with error message
5. **Upstream construction:** verify URL path mapping (`/mimo-token-openai/chat/completions` → `https://token-plan-sgp.xiaomimimo.com/v1/chat/completions`)
6. **Method/body passthrough:** POST with body → upstream receives same method and body
7. **Response passthrough:** upstream returns 200 with headers → proxy returns same status/headers/body

### Tests NOT to write in this PR

- Real Mimo API call (requires real key, owner action)
- Cloudflare Pages deployment smoke (requires deploy, owner action)
- Vite dev proxy integration (requires running dev server)

## Do-not-do list

| Action | Status |
|---|---|
| Merge #562 as-is | NO — stale branch |
| Rebase #562 branch | NO |
| Set `VITE_MIMO_*` in .env | NO — security hole |
| Commit real API key | NO |
| Call real Mimo API in tests | NO |
| Change upstream without owner confirmation | NO |
| Change seed provider baseUrl (Option A) | NO |
| Touch server-side proxy code | NO — already secure |
| Add vitest config / alias changes from #562 | NO — main already has these |

## Owner decision needed

1. **Upstream choice:** Option A (`token-plan-sgp.xiaomimimo.com`, recommended) or Option B (`api.xiaomimimo.com`)?
2. **Env var name:** Which env var holds the real key on DGX-02? `MIMO_API_KEY` or `MIMO_TP_API_KEY`?
3. **After decision:** AI creates minimal salvage PR on fresh branch from main. Owner sets env in Cloudflare Pages after merge.
