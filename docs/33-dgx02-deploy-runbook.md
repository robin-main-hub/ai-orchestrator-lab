# DGX-02 Deploy Runbook

## Status

DGX-02 is the authority node for AI Orchestrator Lab storage, approvals, provider proxying, mobile continuity, and future tmux execution.

This runbook keeps deploys boring: pull, build, validate private endpoints, then expose through Cloudflare only after auth works.

## Preconditions

- `cloudflared-orchestrator` can be stopped and started by systemd.
- `.env` exists on DGX-02 and is not committed.
- `ORCHESTRATOR_API_TOKEN` is set to a strong random value.
- Desktop/mobile clients use the same token through their local env.
- `ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS` is empty unless a real tmux execution window is intentionally approved.

Generate a token:

```bash
openssl rand -hex 32
```

Required env:

```env
ORCHESTRATOR_API_TOKEN=<same strong token on server and clients>
EVENT_STORAGE_DIR=/home/robin/ai-orchestrator-lab-data/event-storage
```

Optional smoke env:

```env
ORCHESTRATOR_TMUX_DRY_RUN=1
ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=
```

## Safe Deploy Sequence

1. Close the public tunnel while deploying:

```bash
sudo systemctl stop cloudflared-orchestrator
```

2. Pull and build:

```bash
cd /path/to/ai-orchestrator-lab
git pull --ff-only origin main
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm server:build
```

3. Restart the orchestrator server:

```bash
sudo systemctl restart ai-orchestrator-server
```

4. Validate local health and auth:

```bash
curl -i http://127.0.0.1:4317/health
curl -i http://127.0.0.1:4317/provider-registry
curl -i -H "Authorization: Bearer $ORCHESTRATOR_API_TOKEN" http://127.0.0.1:4317/provider-registry
```

Expected:

- `/health` returns `200`.
- `/provider-registry` without bearer returns `401`.
- `/provider-registry` with bearer returns `200`.

### Automated Probes (GET-only Read-only)

For a quick, read-only diagnostic check of the deployed server, use the automated probe scripts in `scripts/dgx-02/`. These scripts execute only safe HTTP GET requests to audit the node's availability.

- **`probe-health.sh`**: Checks `/health` (public) and `/heartbeat` (private).
- **`probe-models.sh`**: Checks `/models` and `/provider-models` for vLLM status.
- **`probe-all.sh`**: A wrapper script that sequentially executes `probe-health.sh` and `probe-models.sh`.

#### Usage Example

To verify the local deployment:

```bash
# Execute health and model checks sequentially
DGX_SERVER_BASE_URL=http://127.0.0.1:4317 \
  ORCHESTRATOR_API_TOKEN=$ORCHESTRATOR_API_TOKEN \
  DGX_PROBE_TIMEOUT_SECONDS=5 \
  ./scripts/dgx-02/probe-all.sh
```

> [!WARNING]
> - **Credential Safety**: Never hardcode production API tokens inside runbooks or wrapper files. Always pass them dynamically via shell environment variables or retrieve them from a secure vault.
> - **CI Logging**: Ensure that execution logs in CI/CD pipelines mask or redact environment variables (such as `ORCHESTRATOR_API_TOKEN`) to prevent token leaks.
> - **Network Security**: The scripts default to HTTP for internal network checks. If executing queries over public networks, configure `DGX_SERVER_BASE_URL` with `https://` for transport security.

5. Run no-engine smoke checks:

```bash
ORCHESTRATOR_TMUX_DRY_RUN=1 corepack pnpm tmux:smoke:dry-run
```

6. Run provider/event smoke only when the selected provider is available:

```bash
corepack pnpm server:smoke
```

7. Re-open the public tunnel:

```bash
sudo systemctl start cloudflared-orchestrator
```

8. Validate public health and protected endpoint:

```bash
curl -i https://orchestrator.endruin.com/health
curl -i https://orchestrator.endruin.com/provider-registry
curl -i -H "Authorization: Bearer $ORCHESTRATOR_API_TOKEN" https://orchestrator.endruin.com/provider-registry
```

## Rollback

If any protected endpoint is exposed without bearer auth, stop the tunnel first:

```bash
sudo systemctl stop cloudflared-orchestrator
```

Then roll back the server checkout and restart:

```bash
cd /path/to/ai-orchestrator-lab
git log --oneline -5
git checkout <known-good-sha>
corepack pnpm server:build
sudo systemctl restart ai-orchestrator-server
```

Only restart `cloudflared-orchestrator` after `/provider-registry` returns `401` without bearer and `200` with bearer.

## Tmux Safety

Dry-run is the default deploy smoke path. Real tmux dispatch requires both:

```env
ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1
ORCHESTRATOR_TMUX_DRY_RUN=
```

Do not enable real send-keys until Event Storage, Permission, Redaction, Approval, and replay logging are all verified for the current deploy.
