# @ai-orchestrator/mobile

iOS-first mobile PWA client for the AI Orchestrator. Designed for iPhone Safari
(reference target: iPhone 16 Pro Max), with the same backend boundary as the
desktop app via `@ai-orchestrator/protocol`.

## Scope (MVP)

- **Chat screen**: message list, composer (text + file attach + clipboard paste),
  options drawer button. No other settings menu is shown on this screen.
- **Options drawer**: 새 대화 / 이전 대화 / 설정 / 로그아웃.
- **Settings**: chat background image (local-only, stored in `localStorage`).

Backend wiring (Bearer auth + Cloudflare/LAN fallback + real
`/provider-completions` calls) ships in a follow-up PR. The chat screen
currently echoes a mock response so the layout and input flow can be
exercised end to end on the device.

## Running locally

```bash
# From repo root
corepack pnpm install                                  # picks up the new workspace
corepack pnpm --filter @ai-orchestrator/mobile dev     # http://0.0.0.0:5180
```

To open on the iPhone over the same Wi-Fi: get the dev machine's LAN IP and
visit `http://<lan-ip>:5180` in iOS Safari.

## Production build / PWA install on iPhone

```bash
corepack pnpm --filter @ai-orchestrator/mobile build
corepack pnpm --filter @ai-orchestrator/mobile preview
```

Then on the iPhone:

1. Open the preview URL in Safari.
2. Tap the Share icon → **홈 화면에 추가** (Add to Home Screen).
3. Launch from the home screen — it opens standalone (no Safari chrome) with
   safe-area handling for the Dynamic Island and home indicator.

## iOS-specific behavior

- `viewport-fit=cover` + `env(safe-area-inset-*)` so content respects the
  Dynamic Island, home indicator, and rotation.
- Composer uses `visualViewport` (see `hooks/useViewportInsets.ts`) to stay
  above the virtual keyboard.
- Inputs are `font-size: 16px` to suppress Safari's automatic zoom on focus.
- `100dvh` is used instead of `100vh` to avoid the iOS layout viewport bug.

## Icons (TODO)

`public/icons/` is missing the PNG assets referenced from `manifest.webmanifest`
and `index.html` (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).
Add real PNG files before shipping a public PWA install — without them, iOS
falls back to a screenshot for the home-screen icon. Recommended sizes:

| File | Size | Purpose |
|---|---|---|
| `apple-touch-icon.png` | 180×180 | iOS home-screen icon |
| `icon-192.png` | 192×192 | Android / PWA manifest |
| `icon-512.png` | 512×512 | High-DPI splash / install |

## Backend connection (follow-up PR)

Planned in the next PR:

- Bearer header (`VITE_ORCHESTRATOR_API_TOKEN`) attached to every DGX call.
- Cloudflare domain (`https://orchestrator.endruin.com`) primary,
  `http://dgx-02:4317` LAN fallback.
- `ProviderCompletionRequest` from `@ai-orchestrator/protocol` driving the
  call shape; mock response in `screens/Chat.tsx` will be replaced.
- Event sync stays a separate slice (parallel to desktop).
