# Batch 5 (구현 핸드오프) — 작전극장 Command Center view mode (LIVE/PREVIEW)

> **상태**: 구현 완료 · PR #564 · 지시 정본 `docs/110-industrial-zone-batch-5-theater-mode.md`
> **선행**: Batch 3 `docs/108`(honest live inbox) · Batch 4 `docs/109`(공유 배지 + gate 계약)

## 한 줄 요약
프리뷰를 작전극장(Assistant Inbox / `command_center`) **안**에 `[ LIVE | PREVIEW | REPLAY | SANDBOX ]` 좌석 스위치로 넣었다. LIVE와 PREVIEW 데이터는 **projection 평면에서 완전 분리** — 서로 새지 않는다. 이번엔 LIVE+PREVIEW만 실제 구현, REPLAY/SANDBOX는 disabled placeholder.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #563 | docs-only — Batch 5 지시 정본 `docs/110` (정정안) |
| #564 | feat(desktop) — Command Center view mode 구현 (이 핸드오프 `docs/111` 포함) |

## LINE Q — 좌석 스위치 (shell)
- `apps/desktop/src/components/inbox/AssistantInbox.tsx`: `InboxViewMode = "live"|"preview"|"replay"|"sandbox"` + `INBOX_VIEW_MODES` + `ModeSwitch`.
- 스위치는 **radio input**(`<button>` 아님) → 인박스의 zero-button read-only 불변식 유지. `data-testid="inbox-mode-switch"`, 각 옵션 `inbox-mode-option-{mode}`.
- LIVE/PREVIEW enabled, **REPLAY/SANDBOX disabled** + "준비 중" 라벨.

## LINE R — 극장 안의 프리뷰 덱
- PREVIEW는 별도 toy 페이지가 아니라 같은 인박스 레이아웃에 렌더. `buildAssistantInboxProps()` fixture가 PASS/WARNING/BLOCKED · live/empty/example · observed:false 케이스를 그대로 보여줌.
- `mode==="preview"`일 때만 **상시 워터마크 배너**(`assistant-inbox-preview-banner`): "PREVIEW MODE — 예시(fixture) 데이터입니다 · 실제 업무/실제 이벤트가 아닙니다 · 모든 액션은 비활성화되어 있습니다".

## LINE S — 데이터 평면 분리 (핵심)
- `AssistantInboxContainer.tsx`: 좌석은 local `useState` UI 상태. projection 분기:
  - `PREVIEW → buildAssistantInboxProps()` (fixture, 모든 source `example`)
  - `LIVE → buildAssistantInboxLiveProps(live ?? {})` (honest live/empty)
  - REPLAY/SANDBOX → honest empty live frame (placeholder)
- `liveProjection !== previewProjection` (이미 분리된 두 순수 함수). PREVIEW는 `live` 입력을 **절대 안 받고**, LIVE는 fixture를 **절대 안 받음**.
- 라운드트립 테스트로 누수 0 증명: LIVE(empty)에 fixture 없음 → PREVIEW 전환 시 `evidence-001` 등 등장 → LIVE 복귀 시 사라짐.
- projection 모듈 정적 import 가드: `executeLocalBatchWrite`/`createLocalClientEventCache`/`codingRunner`/`routes/github`/`grantDgxApproval` 등 부재 단언.

## LINE T — 비주얼
- 좌석 스위치는 컴팩트 세그먼트형(활성 cyan 강조), 배너는 amber. 기존 카드 밀도/배지 언어 그대로 — 일반 CRUD 대시보드 느낌 회피.
- 실제 브라우저 시각 검수는 dgx-01 headless 제약으로 오너 위임(`docs/ASSISTANT_INBOX_PREVIEW_CHECKLIST.md`).

## 기본 동작
- **default LIVE**: 실제 앱은 항상 `live`를 넘기므로 작전극장이 LIVE로 열림. `live` 미배선(고립/데모)일 때만 PREVIEW로 폴백(보여줄 live 데이터가 없으니 정직).
- PREVIEW는 명시적 opt-in. App.tsx 무변경(좌석 상태는 컨테이너 로컬).

## 검증
- desktop **1943** tests green (신규 **+10**: default LIVE / preview opt-in / 배너 / 섹션 example 라벨 / no-leak 라운드트립 / disabled placeholder / projection purity).
- root **typecheck** green · root **build** green.
- 적대적 검증 5차원(data-plane-leak / honesty / read-only / naming / spec) — naming 1건(테스트 파일명 "TheaterMode") 지적되어 `AssistantInboxViewMode.test.tsx`로 정정, 나머지 clean.

## 안전 불변식 (Batch 3/4 계승 — 0 유지)
```text
fake observed / fake live            0
auto append · write · flip           0
preview → live seam (데이터 누수)     0
EventStorage mutation                0
new write/activation/runtime load    0
OS core 도메인 import                 0
SummonTheater 네이밍 충돌             0  (InboxViewMode/commandCenterMode 사용)
```

## 미접촉 / 다음 후보
- **REPLAY** 실배선: 과거 `eventLog` 재생(read-only) — 타임라인 되감기(#482/483)·`providerReplayDelivery.ts` 연결.
- **SANDBOX** 실배선: sandbox runner(`docs/47`) — 실제 write/approval/external send 없이.
- 좌석 상태 localStorage 영속(현재는 세션 내 UI 상태) — 필요 시 `persistentJsonState` 패턴으로.
- 카드 레벨 REPLAY/SANDBOX source 배지(현재 섹션 레벨 live/empty/example만).
