# ENDRUIN.COM DGX-02 Domain Plan

## Status

Accepted domain:

```text
ENDRUIN.COM
```

Default orchestrator endpoint:

```text
https://orchestrator.endruin.com
```

LAN fallback endpoint:

```text
http://dgx-02:4317
```

The desktop app should try the domain first and then fall back to the LAN host when the domain is not reachable.

## Current DNS Observation

Checked on 2026-05-25:

```text
ENDRUIN.COM                 A     121.254.178.253
orchestrator.ENDRUIN.COM    no DNS record found
current visible public IP   210.113.103.102
```

`121.254.178.253` does not match the current visible public IP. Treat it as an existing/parking/default record until the user confirms otherwise.

## Gabia DNS Record

In Gabia DNS management, add this record:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `orchestrator` | `210.113.103.102` | `600` |

Result:

```text
orchestrator.endruin.com -> 210.113.103.102
```

Do not expose raw vLLM ports directly.

## Router / Firewall

If using direct public IP routing:

```text
WAN 443 -> DGX-02 443
WAN 80  -> DGX-02 80  (only for ACME HTTP challenge or redirect)
```

Keep these internal:

```text
DGX-02 orchestrator server: 127.0.0.1:4317 or LAN-only :4317
DGX-02 vLLM:                127.0.0.1:8001 or LAN-only :8001
OpenClaw/vLLM variants:     LAN/internal only
```

## Reverse Proxy

Use Caddy or Nginx on DGX-02.

Recommended Caddyfile:

```text
orchestrator.endruin.com {
  reverse_proxy 127.0.0.1:4317
}
```

This gives HTTPS certificates automatically if ports 80/443 reach DGX-02.

## App Defaults

The desktop runtime now uses:

```text
https://orchestrator.endruin.com
http://dgx-02:4317
```

The first is the stable public endpoint.
The second is the home/LAN fallback.

## Safer Alternative

If the home public IP changes often or port forwarding is undesirable, move DNS to Cloudflare and use Cloudflare Tunnel:

```text
orchestrator.endruin.com -> cloudflared tunnel -> DGX-02 localhost:4317
```

This avoids opening DGX-02 directly to the internet.

## Security Rules

- Only expose the orchestrator server, not raw vLLM.
- Keep API keys, OAuth sessions, and reseller keys on DGX-02.
- Require Permission Matrix approval for terminal, reboot, remote workspace, and provider execution.
- Log only redacted requests and responses.
- Use watchdog checks for DGX-01/DGX-02 reboot workflows.

