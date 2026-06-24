# Runbook: Enable ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS

## 1. Purpose

This env switch opens the **real tmux send-keys execution path** on the DGX-02 orchestrator server. When enabled, approved tmux dispatch requests will execute `swarm-send.sh` against the target tmux session — real keystrokes in a real terminal.

This is the final execution gate. All other safety layers (approval queue, control queue handoff routing, parser contract, redaction) must be verified before this switch is turned on.

**Owner action only.** AI agents must not enable this env, deploy with it enabled, or execute tmux send-keys without explicit owner approval.

## 2. Current default state

```
ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=    (empty / unset)
```

- **Default: OFF.** Approved tmux dispatch requests return `status: "blocked"` with reason `"ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS is not enabled on this server"`.
- The server records the dispatch intent and approval in the Event Store but does not execute `swarm-send.sh`.
- `ORCHESTRATOR_TMUX_DRY_RUN=1` can be used independently to accept approved dispatches as dry-run audit events (no send-keys execution, no blocked status).

### Dispatch state machine (server-side, `apps/server/src/index.ts:4123-4169`)

```
dispatchMode != "execute_if_approved"
  → status: "recorded" (intent only, no execution path)

ORCHESTRATOR_TMUX_DRY_RUN=1
  → status: "dry_run" (approved, recorded, not executed)

ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS != "1"
  → status: "blocked" (approved, but send-keys gate is off)

ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1 AND ORCHESTRATOR_TMUX_DRY_RUN != "1"
  → status: "sent" (swarm-send.sh executed, stdout/stderr captured)
```

## 3. Preconditions

Before enabling, verify ALL of the following:

### 3.1 Control queue approval wiring
- PR #1063 merged — `onHandoff` routes through `routeHandoffToControlQueue` producing an `ApprovalQueueItem` with `state: "required"`.
- No handoff reaches runner dispatch without human approval.
- Verify: `grep -r "routeHandoffToControlQueue" apps/desktop/src/` returns the MissionBoardPanel wiring.

### 3.2 opencode JSON parser contract
- PR #1064 merged — `parseOpenCodeJsonOutput` returns `{ ok: false, reason }` for partial/truncated JSON and command failures.
- Parser does not silently drop invalid JSON lines — they become error events.
- Verify: `pnpm --filter @ai-orchestrator/desktop exec vitest run src/lib/openCodeRunner.test.ts` — 27/27 pass.

### 3.3 Cross-mission contamination defense
- PR #1060 merged — all nested `missionId` fields validated on write and read paths.
- PR #1061 merged — integration suite covers the full mission lifecycle.
- Verify: `pnpm --filter @ai-orchestrator/server exec vitest run src/missions/missionVertical.integration.test.ts` — 6/6 pass.

### 3.4 Deploy guard
- `scripts/deploy-dgx02.mjs` refuses to deploy with `ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1` unless `--allow-send-keys` is passed.
- This prevents accidental enablement during routine deploys.

### 3.5 DGX-02 server
- Server is running: `ssh robin@dgx-02 'systemctl --user is-active ai-orchestrator-server.service'` → `active`.
- Auth token is set (not dev fallback): `ssh robin@dgx-02 'grep ORCHESTRATOR_API_TOKEN ~/ai-orchestrator-lab/.env'` → non-empty, not `dev-orchestrator-token`.
- Event storage dir exists: `ssh robin@dgx-02 'ls -d ~/ai-orchestrator-lab-data/event-storage'`.

## 4. Owner-only enable steps

**All steps must be performed by the owner directly on DGX-02.** AI agents must not execute these.

### Step 1: SSH to DGX-02

```bash
ssh robin@dgx-02
```

### Step 2: Edit the .env file

```bash
cd ~/ai-orchestrator-lab
nano .env
```

Add or change:
```env
ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1
```

Ensure `ORCHESTRATOR_TMUX_DRY_RUN` is NOT set to `1` (it would override send-keys with dry-run):
```env
# ORCHESTRATOR_TMUX_DRY_RUN=1    ← comment out or remove
```

### Step 3: Restart the server

```bash
systemctl --user restart ai-orchestrator-server.service
```

### Step 4: Verify the server came up

```bash
systemctl --user is-active ai-orchestrator-server.service
# expected: active

curl -s http://127.0.0.1:4317/health
# expected: {"healthy":true}
```

## 5. Validation checklist

After enabling, run these checks **in order**. Stop and rollback if any fails.

### 5.1 Env gate is recognized

```bash
# Preflight check (no send-keys, just queries the gate state)
curl -s http://127.0.0.1:4317/tmux/preflight \
  -H "Authorization: Bearer $ORCHESTRATOR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"preflight_post_enable","sessionId":"session_validate","role":"builder","commandPreview":"echo ok","tmuxSessionName":"swarm","dispatchMode":"record_only"}'
```

Expected: `audit.sendKeysEnabled: true`, `audit.wouldAttemptSendKeys: false` (record_only mode).

### 5.2 First real dispatch — harmless command

Use a harmless command as the first real send-keys test:

```bash
# Create an approval request for a harmless command
curl -s http://127.0.0.1:4317/tmux/dispatch \
  -H "Authorization: Bearer $ORCHESTRATOR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"validate_first","sessionId":"session_validate","role":"builder","commandPreview":"echo hello-from-enablement-test","tmuxSessionName":"swarm","dispatchMode":"execute_if_approved"}'
```

Expected: `status: "blocked"` (approval required) → approve via control queue → re-dispatch → `status: "sent"`.

### 5.3 Capture the pane

```bash
curl -s http://127.0.0.1:4317/tmux/capture \
  -H "Authorization: Bearer $ORCHESTRATOR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"session_validate","tmuxSessionName":"swarm","paneTarget":"0"}'
```

Expected: stdout contains `hello-from-enablement-test`.

### 5.4 Redaction still works

Verify the Event Store does not contain raw secrets:

```bash
# Check the latest dispatch event for secret leakage
grep -r "sk-" ~/ai-orchestrator-lab-data/event-storage/ | head -5
# expected: no real API keys (only redacted tokens or test fixtures)
```

## 6. Rollback

If anything goes wrong:

### Step 1: Remove the env

```bash
ssh robin@dgx-02
cd ~/ai-orchestrator-lab
nano .env
# Set: ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=
# (empty value or comment out the line)
```

### Step 2: Restart

```bash
systemctl --user restart ai-orchestrator-server.service
```

### Step 3: Verify rollback

```bash
# Preflight should show sendKeysEnabled: false
curl -s http://127.0.0.1:4317/tmux/preflight \
  -H "Authorization: Bearer $ORCHESTRATOR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"rollback_check","sessionId":"session_validate","role":"builder","commandPreview":"echo ok","tmuxSessionName":"swarm","dispatchMode":"record_only"}'
```

Expected: `audit.sendKeysEnabled: false`.

### Step 4: Deploy guard re-engaged

```bash
# Next deploy without --allow-send-keys should succeed
corepack pnpm deploy:dgx02:dry-run
# expected: dry-run plan without refusal
```

## 7. Safety boundaries

| Boundary | Enforcement |
|---|---|
| Approval required before send-keys | Server checks `dispatchMode === "execute_if_approved"` + approval in Event Store |
| Handoff → control queue routing | PR #1063 — `routeHandoffToControlQueue` produces `ApprovalQueueItem` |
| Parser failure classification | PR #1064 — `parseOpenCodeJsonOutput` returns `{ ok: false }` for partial/error |
| Cross-mission contamination | PR #1060/#1061 — nested `missionId` validated on all paths |
| Redaction | `redactSecrets` applied to stdout/stderr previews before persistence |
| Deploy guard | `scripts/deploy-dgx02.mjs` refuses `ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1` without `--allow-send-keys` |
| Read-only tools enforced | `safeOpenCodeTools` filters write/edit/bash from allowedTools |
| Timeout | `ORCHESTRATOR_TMUX_SEND_TIMEOUT_MS` (default 15000ms) caps send-keys execution |

## 8. Known risks

| Risk | Severity | Mitigation |
|---|---|---|
| Unapproved dispatch bypasses approval queue | Critical | Server validates approval in Event Store before send-keys. No bypass path exists in code. |
| Malicious command in send-keys | High | Command preview is redacted and persisted. Owner reviews before approval. |
| Secret leakage in tmux pane capture | Medium | `redactSecrets` applied to capture output. Verify with 5.4. |
| Stale approval replay | Medium | Approval TTL and replay matching (`tmuxDispatchApprovalReplayMatchesRequest`) — expired approvals are rejected. |
| Parser false success → silent send-keys | High | Fixed by PR #1064 — partial/truncated JSON now returns `ok: false`. |
| Cross-mission data leak via tmux | Medium | Tmux session is per-dispatch (`AI_SWARM_SESSION` env). No shared state between missions. |
| Deploy with env accidentally left on | Medium | Deploy script guard (`--allow-send-keys` required). |

## 9. Do-not-do list

| Action | Who must do it | AI must not |
|---|---|---|
| Edit `.env` on DGX-02 | Owner | Yes |
| Set `ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1` | Owner | Yes |
| Restart server with env enabled | Owner | Yes |
| Run `deploy:dgx02 --allow-send-keys` | Owner | Yes |
| Approve tmux dispatch for first real command | Owner | Yes |
| Disable the env (rollback) | Owner | Yes (unless explicitly instructed) |
| Execute `swarm-send.sh` directly | Server (via approval) | Yes |

## 10. Related completed work

| PR | Title | Date |
|---|---|---|
| #1060 | fix(server): reject cross-mission artifact payloads | 2026-06-25 |
| #1061 | test(server): mission vertical integration — cross-mission contamination end-to-end | 2026-06-25 |
| #1062 | docs: classify stale open pull requests | 2026-06-25 |
| #1063 | fix: route handoffs through control queue approval | 2026-06-25 |
| #1064 | fix: parse opencode json output defensively | 2026-06-25 |

### Related docs

- `docs/33-dgx02-deploy-runbook.md` — DGX-02 deploy runbook (preconditions include this env)
- `docs/31-tmux-dry-run-smoke-test.md` — tmux dry-run smoke test instructions
- `docs/36-autonomous-execution-layer.md` — autonomous execution layer spec
- `docs/handoffs/2026-06-16-h8-runner-stack.md` — H8 runner stack handoff
- `docs/handoffs/2026-06-25-real-behavior-mode.md` — real behavior mode handoff
- `TASKS.md` — current task source of truth
