# 86 — Preview runner (probe-only) (Coding/Design OS D4)

Dyad식 "바로 본다"의 **정직한 1차**. 사용자 선택대로 probe-only로 간다: dev 서버 spawn/
lifecycle 관리는 후속, 지금은 **deterministic 포트 + 실제 포트 바인딩 관측**만 한다.

```
POST /missions/:id/workspace/:wsId/preview
  → derivePreviewPort(wsId) (deterministic) 또는 요청 포트
  → probePreview(TCP connect)  ← 실제 바인딩 관측
  → previewFromProbe: bound면 running/observed, 아니면 failed/configured
  → mission.workspace.preview.recorded → workspace.preview 갱신
```

## 한 일

- **protocol** (appWorkspace.ts): `derivePreviewPort(wsId)`(순수, 워크스페이스당 안정 포트 —
  Dyad deterministic ports에 대응), `previewProbeRequestSchema`, `previewFromProbe`(probe→
  preview), `mission.workspace.preview.recorded` payload. trace에 `preview.recorded` 매핑.
- **server**: missionIndex가 preview 이벤트로 workspace.preview만 갱신, `store.recordPreview`,
  `POST /missions/:id/workspace/:wsId/preview`(probePreview DI), index.ts에서 `net.connect`
  2초 타임아웃 TCP probe로 주입(미주입이면 501).

## 정직성 불변식 (테스트로 못박음)

- **observed running은 실제 바인딩을 관측했을 때만**. probe 실패는 failed/configured —
  가짜 running/observed 없음(테스트: bound→observed, unbound→not observed).
- preview 포트는 deterministic(같은 워크스페이스 → 같은 포트, 범위 내).
- **dev 서버를 spawn하지 않는다** — 관측만. spawn/proxy/stop 관리형 lifecycle은 후속(사용자
  선택: probe-only 먼저).
- preview는 workspace.preview에만 들어가고, observed 정직성은 payload가 보장.

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| deterministic preview port | ✅ derivePreviewPort 안정·범위 |
| preview start/stop event | ✅ mission.workspace.preview.recorded(상태 전이) |
| screenshot 없는데 visual pass 금지 | ✅ (visual QA는 D5 — 여기선 포트 관측만) |
| observed only when bound | ✅ TCP probe 성공 시만 observed |

## 후속

관리형 dev-server lifecycle(spawn pnpm dev + 포트 보장 + stop)은 별도(allowlist repo +
approval 경계 뒤). Visual QA/screenshot은 D5.

## 검증

protocol 84(+3) · server 241(+6) · desktop typecheck 그린. docs/86.
