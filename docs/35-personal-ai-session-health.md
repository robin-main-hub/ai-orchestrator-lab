# Personal AI Session Health

Use this startup check before assigning work to personal AI worker accounts.

The goal is not just "logged in". Track these states:

```text
registered     account/profile files exist
active         a short CLI/app probe succeeded in the current OS session
boot-verified  the probe also succeeded after reboot
refreshable    an automatic refresh path exists and has been tested
```

## Startup Command

Windows PowerShell:

```powershell
cd C:\Users\Robin\Documents\Playground\ai-orchestrator-lab-codex
corepack pnpm personal-ai:sessions -- --refresh --grok-cli-refresh-fallback --hydrate-grok-homes --probe-grok
```

macOS/Linux:

```bash
cd ~/Documents/Playground/ai-orchestrator-lab-codex
corepack pnpm personal-ai:sessions -- --refresh --grok-cli-refresh-fallback --hydrate-grok-homes --probe-grok
```

The script does not print access tokens or refresh tokens.

## Grok

Grok has an automatic local refresh path when the account file includes a refresh token:

```text
Grok #1 -> ~/.grok/accounts/1.json -> ~/.grok/auth.json
Grok #2 -> ~/.grok/accounts/2.json -> ~/.grok2/auth.json
Grok #3 -> ~/.grok/accounts/3.json -> ~/.grok3/auth.json
```

`--refresh` refreshes expired or near-expiry Grok access tokens.
`--grok-cli-refresh-fallback` runs a short `grok -p` probe if the direct OAuth refresh endpoint fails, letting the official Grok CLI attempt its own session refresh.
`--hydrate-grok-homes` writes per-account `auth.json` files from the account slots.
`--probe-grok` runs `grok models` with each `GROK_HOME`.

If direct refresh and CLI fallback fail but `grok models` still succeeds, treat the account as:

```text
active_probe_ok_reauth_required_for_refresh
```

That means the account can answer basic CLI health checks now, but the automatic refresh path has not been proven. Before assigning long work or after reboot, run account-specific reauth and complete the browser/device approval flow.

Windows PowerShell:

```powershell
$env:GROK_HOME="$env:USERPROFILE\.grok2"
grok login --oauth
```

If browser login is not available:

```powershell
$env:GROK_HOME="$env:USERPROFILE\.grok2"
grok login --device-auth
```

macOS/Linux:

```bash
GROK_HOME="$HOME/.grok2" grok login --oauth
GROK_HOME="$HOME/.grok2" grok login --device-auth
```

Do not paste device codes, access tokens, refresh tokens, or OAuth URLs into shared chat logs. Enter device codes only into the provider's official browser approval page or the CLI prompt that requested them.

## Claude

Claude profiles are checked as registered when their config directories exist:

```text
~/.claude-max20
~/.claude-premium
```

Claude CLI manages its own session refresh. Before assigning work after reboot, run a short profile probe.

Windows PowerShell:

```powershell
$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-max20"
claude --permission-mode plan -p "Reply OK if this Claude profile is active."
```

macOS/Linux:

```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-max20" claude --permission-mode plan -p "Reply OK if this Claude profile is active."
```

## Antigravity

No local token refresh path is configured in this repo for Antigravity/Gemini. Treat app login as registered, then use lane login checks after reboot or account switching:

```powershell
corepack pnpm antigravity:ultra-task -- --task-id ultra-login-check --title "Ultra login check" --body "Confirm this lane-a handoff is readable. Do not modify files." --run-dry-run
corepack pnpm antigravity:pro1-task -- --task-id pro1-login-check --title "Pro #1 login check" --body "Confirm this lane-b handoff is readable. Do not modify files." --run-dry-run
corepack pnpm antigravity:pro2-task -- --task-id pro2-login-check --title "Pro #2 login check" --body "Confirm this lane-c handoff is readable. Do not modify files." --run-dry-run
```

Paste the generated request into the currently logged-in Antigravity account and treat the returned response as the active-session proof.
