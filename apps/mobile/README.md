# @ai-orchestrator/mobile

iOS-first mobile PWA client for the AI Orchestrator. Designed for iPhone Safari
(reference target: iPhone 16 Pro Max), wired against the shared
`@ai-orchestrator/protocol` package so it shares one boundary with the desktop
and the server.

## Surface area

Four-tab bottom bar mirrors the desktop's primary information / function /
settings surfaces:

| Tab | What's there | Desktop counterpart |
|---|---|---|
| 💬 **채팅** | Conversation: SOUL avatar + name in header (tap to switch), session list sheet (☰), new-session (＋), composer with text + file attach + clipboard paste, per-SOUL background | `ConversationWorkbench` + `ChannelRailPanel` |
| 🧠 **SOUL** | SOUL list with per-SOUL background thumbnails. Detail screen has hero with the SOUL's background, "이 SOUL과 새 대화 시작" button, **per-SOUL background management**, link to ConfigLibrary for SOUL.md editing | `AgentSettingsPanel` + `AgentConfigDrawer` + `ConfigLibraryPanel` (read-only on mobile) |
| ⚙️ **시스템** | DGX runtime status + endpoint + last probe, **"DGX 진단 실행" button** (mock today, wires to `stage32DgxRouteDiagnostics`), provider registry with trust / secret chips, backup status, ingress guard status | `RuntimeStatusBar` + `ProviderProfilesManagerPanel` + `BackupPanel` + `IngressGuardPanel` + `stage32` |
| ⋯ **더보기** | Memory search, coding packets (read-only), debate rounds (read-only), handoffs, general settings (theme / font / haptics), **connection settings (server URL + Bearer token)**, sign out | `MementoInspectorPanel` + `CodingPacketPanel` + `Stage3DebateTable` + `WorkItemHandoffPanel` |

Surfaces intentionally left to desktop (mobile-unfriendly): raw `TerminalDock`,
individual `TmuxPaneCard` editing. Tmux *status* is surfaced via the System
tab.

## Why backgrounds are keyed on SOUL, not agent

Agents are roles (`orchestrator`, `architect`, `reviewer`, `executor`). A SOUL
is the persona the user is actually talking to (Tracy, 본부장, Orchestrator).
One SOUL can be embodied by several agents. The user sees the persona, so
visual context (avatar, name, background) follows the persona via `soulId`,
NOT `agentId`. `useSoulBackground(soulId)` reads/writes `localStorage` per
SOUL; switching SOULs in chat re-applies that SOUL's background atomically via
a CSS custom property.

## Running locally

```bash
# From repo root
corepack pnpm install                                  # picks up the workspace
corepack pnpm --filter @ai-orchestrator/mobile dev     # http://0.0.0.0:5180
```

To open on the iPhone over the same Wi-Fi: get the dev machine's LAN IP and
visit `http://<lan-ip>:5180` in iOS Safari.

## Connecting to the real DGX backend

The chat composer talks to `/provider-completions` using
`ProviderCompletionRequest` from `@ai-orchestrator/protocol` so the server's
C2 zod validation accepts the payload without any mobile-specific shim. Until
the token is configured, the chat shows a clear in-bubble error pointing the
user at the setting.

1. Open the PWA on the phone.
2. **더보기 → 연결 (토큰·서버)**.
3. Set:
   - Primary URL: typically `https://orchestrator.endruin.com` (Cloudflare
     tunnel must be running on DGX-02).
   - Fallback URL: `http://dgx-02:4317` (only useful on the same Wi-Fi; use
     the LAN IP if the hostname doesn't resolve from the phone).
   - Bearer Token: match `ORCHESTRATOR_API_TOKEN` from DGX-02's `.env`.
4. Return to 💬 채팅 — replies now come from the live server.

Transport fallback: the primary URL is tried first. If the request fails at
the **transport** level (DNS, TLS handshake, refused connection), the fallback
URL is tried automatically. If the server itself returns an HTTP status (502,
504, ...), that status is treated as authoritative and the fallback is NOT
tried (the second URL would just give the same answer).

Error surfacing: 401, 413, 400 each get a user-facing Korean message rendered
as an assistant bubble.

## Production build / PWA install on iPhone

```bash
corepack pnpm --filter @ai-orchestrator/mobile build
corepack pnpm --filter @ai-orchestrator/mobile preview
```

Then on the iPhone:

1. Open the preview URL in Safari.
2. Tap the Share icon → **홈 화면에 추가** (Add to Home Screen).
3. Launch from the home screen — opens standalone (no Safari chrome) with
   safe-area handling for the Dynamic Island and home indicator.

## iOS-specific behavior

- `viewport-fit=cover` + `env(safe-area-inset-*)` so content respects the
  Dynamic Island, home indicator, and rotation.
- Composer uses `visualViewport` (see `hooks/useViewportInsets.ts`) to stay
  above the virtual keyboard.
- Inputs are `font-size: 16px` to suppress Safari's automatic zoom on focus.
- `100dvh` is used instead of `100vh` to avoid the iOS layout viewport bug.
- `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`,
  `overscroll-behavior: none`.

## Icons (TODO)

`public/icons/` still needs the PNG assets referenced from
`manifest.webmanifest` and `index.html` (`icon-192.png`, `icon-512.png`,
`apple-touch-icon.png`). Recommended sizes:

| File | Size | Purpose |
|---|---|---|
| `apple-touch-icon.png` | 180×180 | iOS home-screen icon |
| `icon-192.png` | 192×192 | Android / PWA manifest |
| `icon-512.png` | 512×512 | High-DPI splash / install |

Cosmetic — doesn't block install or build.

## What's still mock (next PR)

- **System tab** runtime / providers / backup / ingress data is the seed set
  from `seeds.ts`; live numbers come from `GET /health`, `GET /provider-registry`,
  `GET /event-storage` once those calls are wired (the bearer + base-URL helper
  in `lib/api.ts` already handles them).
- **메모리 / 토론 / 핸드오프 / 패킷** lists are seeded; live wiring follows
  the same pattern when the corresponding endpoints land.
- **Persistent message history per session** comes from event sync (replay
  via `/events?sessionId=...`).
- **이전 대화 목록** is populated locally as the user chats; the real session
  index will replace it.
- **로그아웃** currently logs to console; real auth flow lands when SOUL ↔
  agent authBinding is connected.
