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
corepack pnpm personal-ai:sessions -- --refresh --grok-cli-refresh-fallback --hydrate-grok-homes --probe-grok --probe-mimo
```

macOS/Linux:

```bash
cd ~/Documents/Playground/ai-orchestrator-lab-codex
corepack pnpm personal-ai:sessions -- --refresh --grok-cli-refresh-fallback --hydrate-grok-homes --probe-grok --probe-mimo
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

Claude profiles are checked without printing OAuth credentials.

The local Mac profile is the Claude Team Context:

```text
~/.claude
~/.claude.json
```

The remote DGX profile is the Claude Max Context and is checked through SSH by verifying the presence of:

```text
/home/robin/.claude/.credentials.json
```

Claude CLI manages its own session refresh. Before assigning work after reboot, run a short profile probe for the local Team context.

Windows PowerShell:

```powershell
$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude"
claude --permission-mode plan -p "Reply OK if this Claude profile is active."
```

macOS/Linux:

```bash
CLAUDE_CONFIG_DIR="$HOME/.claude" claude --permission-mode plan -p "Reply OK if this Claude profile is active."
```

The remote Max context is checked by `--probe-remote`; do not copy OAuth tokens or cookies into chat logs.

## MiMo

MiMo profiles are checked by reading the `opencode.json` configuration file in the workspace root.
If an API key is formatted as `{env:VAR_NAME}`, the check verifies that the corresponding environment variable (or `.env` file entry) is defined.

When `--probe-mimo` is passed, it sends a lightweight direct completion ping request to each configured `baseURL` (`mimo` and `mimo-tp`).

* **active:** The ping request succeeded (HTTP 200).
* **unauthorized:** Upstream returned HTTP 401/403 (Invalid API Key).
* **network_error / probe_failed:** The request timed out or returned another error.

## Antigravity

No local token refresh path is configured in this repo for Antigravity/Gemini. Treat app login as registered, then use lane login checks after reboot or account switching:

```powershell
corepack pnpm antigravity:ultra-task -- --task-id ultra-login-check --title "Ultra login check" --body "Confirm this lane-a handoff is readable. Do not modify files." --run-dry-run
corepack pnpm antigravity:pro1-task -- --task-id pro1-login-check --title "Pro #1 login check" --body "Confirm this lane-b handoff is readable. Do not modify files." --run-dry-run
corepack pnpm antigravity:pro2-task -- --task-id pro2-login-check --title "Pro #2 login check" --body "Confirm this lane-c handoff is readable. Do not modify files." --run-dry-run
```

Paste the generated request into the currently logged-in Antigravity account and treat the returned response as the active-session proof.
