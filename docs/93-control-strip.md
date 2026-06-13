# 93 — Unified Model/Thinking/Tool/Runner Control Strip (Coding/Design OS D8)

Model / Mode(Plan·Build·Review) / Thinking / Tool permission / Runner를 한 줄에서 통제한다.
단 이건 **권한의 단일 진실이 아니다** — capability/SandboxRunner/approval이 그대로 권한
경계다. 컨트롤 스트립은 그 위의 힌트/선택이며, 불변식을 어기지 않는다.

## 한 일

- **protocol** `controlStrip.ts`: `ControlStripState`(modelId/mode/thinking/toolPermission/
  runner) + 순수 `resolveControlStrip(state, availability)` → 유효 상태 + 불변식 노트.
- **server**: `GET /controls/availability` — runner를 env에서 정직하게 파생(docker/gvisor는
  ENABLE 플래그일 때만 노출) + 안전 기본값(mode plan, read_only).
- **desktop**: `ControlStrip.tsx`(최소 프레젠테이션, resolveControlStrip 표시) +
  `fetchDgxControlAvailability` 래퍼.

## 절대 불변식 (resolveControlStrip이 강제, 테스트로 못박음)

- **thinking effort는 품질/비용 힌트일 뿐 권한을 올리지 않는다** — high thinking이어도
  effectiveToolPermission은 그대로(테스트: read_only 유지).
- **Build 모드여도 approval/sandbox를 우회하지 않는다** — mode는 권한을 에스컬레이션하지
  않는다. plan/review는 실행 안 함, build는 sandboxed(그래도 approval 경계 유효).
- **runner가 unavailable이면 blocked** — 가짜 사용 가능 표시 금지(테스트: gvisor 미가용 →
  effectiveRunner blocked, executionMode none, UI에서 disabled).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| Model/Mode/Thinking/Tool/Runner 단일 통제 | ✅ ControlStrip |
| thinking이 권한 안 올림 | ✅ effectiveToolPermission 불변 |
| Build도 approval/sandbox 우회 불가 | ✅ executionMode sandboxed지만 경계 유효 |
| runner unavailable → blocked/configured | ✅ effectiveRunner blocked |

## 후속

레이아웃 통합(어디에 배치할지)은 UI 트랙. 여기서는 자체 완결 컴포넌트 + 정직한 유효 상태 +
가용성 API까지. 모델 목록은 기존 `/models`와 합쳐 쓰면 된다.

## 검증

protocol 103(+4) · server 269 · desktop 1147(+2) 그린. docs/93.

## Coding/Design OS 시리즈 (docs/83–93)

D2 AppWorkspace · D3 DesignBlueprint · D4 Preview(probe) · D5a Preview(observed) ·
D5b Visual QA · D6 Debate→Mission · D7 scaffold · D8 control strip. 코어 = Dyad식 앱 빌더 +
멀티에이전트 오케스트레이션, 전부 EventStorage/Trace/checkpoint/real-git/honest-truthStatus 위.
