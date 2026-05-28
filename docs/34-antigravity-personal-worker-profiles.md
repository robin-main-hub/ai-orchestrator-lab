# Antigravity Personal Worker Profiles

## Status

This document defines the first safe implementation step for personal Antigravity/Gemini worker profiles.

The current implementation is file-based handoff only:

```text
scripts/run-antigravity-worker.mjs
scripts/run-antigravity-worker.sh
scripts/create-antigravity-ultra-task.mjs
scripts/create-antigravity-pro1-task.mjs
scripts/smoke-antigravity-worker.mjs
```

It does not automate the Antigravity GUI, browser sessions, OAuth cookies, or any unofficial public API wrapper.

## Policy Frame

This integration is a single-owner personal coding/research workflow across trusted devices.

The owner controls three individually paid personal Antigravity/Gemini accounts:

| Profile | Plan | Use |
| --- | --- | --- |
| `personal_antigravity_ultra` | Ultra | Coding-capable lane; prefer when heavy validation is needed |
| `personal_antigravity_pro_1` | Pro | Coding-capable lane |
| `personal_antigravity_pro_2` | Pro | Coding-capable lane |
| `primary_google_account` | excluded | Protected primary Google account; never automate |

These profiles are separated by workflow lane and risk isolation. They are not shared accounts, family-account workarounds, public providers, company-wide resources, free-tier rotations, or quota-circumvention pools.

## Worker Model

Do not assign the profiles to narrow non-coding roles.

All three allowed profiles are coding-capable workers. Codex should split work by non-overlapping files, modules, branches, or worktrees, then reconcile at checkpoints.

Suggested lane mapping:

```text
lane_a -> personal_antigravity_ultra
lane_b -> personal_antigravity_pro_1
lane_c -> personal_antigravity_pro_2
```

When heavy validation is specifically required, prefer:

```text
heavy_validation -> personal_antigravity_ultra
```

Start with Ultra while it is the currently connected Antigravity account. Treat it as the first live lane, prove the handoff and checkpoint loop there, then add the Pro lanes after the loop is stable.

After Ultra is verified, prepare the next account as Pro #1 on `lane_b`. It should also be a coding worker, but its assigned files or modules should not overlap with active Ultra work.

## Required Guards

The wrapper enforces:

- `ENABLE_PERSONAL_ANTIGRAVITY_PROFILES=true`
- `OWNER_USER_ID`
- request user must match `OWNER_USER_ID`
- route type must be `personal_codex` or `personal_lab`
- shared routes are blocked
- `primary_google_account` is always blocked
- each profile has a single active task lock
- GUI/browser automation mode is rejected
- fallback is disabled unless `ENABLE_PERSONAL_ANTIGRAVITY_FALLBACK=true`
- fallback selection is logged when used

Blocked route types:

```text
slack_bot
company_webapp
public_api
multi_user_openclaw
shared_service
scheduled_bulk_job
shared
```

## File Handoff

Ultra-first task bootstrap:

```bash
ENABLE_PERSONAL_ANTIGRAVITY_PROFILES=true \
OWNER_USER_ID=robin \
node scripts/create-antigravity-ultra-task.mjs \
  --task-id first-ultra-task \
  --title "First Ultra coding task" \
  --body "Implement this task in the Ultra lane." \
  --run-dry-run
```

PowerShell equivalent:

```powershell
$env:ENABLE_PERSONAL_ANTIGRAVITY_PROFILES="true"
$env:OWNER_USER_ID="robin"
node scripts/create-antigravity-ultra-task.mjs --task-id first-ultra-task --title "First Ultra coding task" --body "Implement this task in the Ultra lane." --run-dry-run
```

Pro #1 task bootstrap after the Ultra loop is stable:

```powershell
$env:ENABLE_PERSONAL_ANTIGRAVITY_PROFILES="true"
$env:OWNER_USER_ID="robin"
node scripts/create-antigravity-pro1-task.mjs --task-id first-pro1-task --title "First Pro #1 coding task" --body "Implement this task in the Pro #1 lane." --run-dry-run
```

Recommended task shape:

```text
.codex-tasks/antigravity/<task-id>/lane-a/request.md
.codex-tasks/antigravity/<task-id>/lane-a/result.md
.codex-tasks/antigravity/<task-id>/lane-a/log.txt
```

Dry-run example:

```bash
ENABLE_PERSONAL_ANTIGRAVITY_PROFILES=true \
OWNER_USER_ID=robin \
node scripts/run-antigravity-worker.mjs \
  --task .codex-tasks/antigravity/example/lane-a/request.md \
  --user-id robin \
  --route-type personal_codex \
  --ultra-first \
  --dry-run
```

Explicit profile example:

```bash
ENABLE_PERSONAL_ANTIGRAVITY_PROFILES=true \
OWNER_USER_ID=robin \
node scripts/run-antigravity-worker.mjs \
  --task .codex-tasks/antigravity/example/lane-b/request.md \
  --user-id robin \
  --route-type personal_lab \
  --profile personal_antigravity_pro_1 \
  --dry-run
```

The wrapper writes:

- `result.md`
- `log.txt`

The audit log includes:

- `profileId`
- `provider`
- `planTier`
- `routeType`
- `userId`
- `taskId`
- `startTime`
- `endTime`
- `concurrencyState`
- `selectedBy`
- `fallbackFrom`, when used

## Checkpoint Rule

Workers should produce code in isolated lanes until a checkpoint.

At checkpoint time, Codex compares the outputs, resolves conflicts, chooses what to keep, and decides the next lane split. This keeps the profiles useful as coding workers while avoiding blind account rotation or shared-service routing.
