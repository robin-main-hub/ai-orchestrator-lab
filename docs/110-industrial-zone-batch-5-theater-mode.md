# Batch 5 (지시/스펙) — 작전극장 Theater Mode: LIVE / PREVIEW / REPLAY / SANDBOX

> **상태**: 지시(directive) · **미구현** · 정정안 반영본
> **정정 핵심**: 이전 Batch 5 초안의 "Preview Mode를 작전극장 *밖*으로 분리" 지시를 **폐기**. 프리뷰는 작전극장 *안*에 정식 좌석(모드/레이어)으로 넣되, live 데이터와 preview 데이터는 **데이터 평면(projection)에서 절대 섞지 않는다.**
> **선행 배치**: Batch 3 `docs/108`(honest live inbox + disabled gate route) · Batch 4 `docs/109`(공유 StatusBadge/SourceBadge + gate enablement 계약)
> **대상 표면**: `command_center` 나브 = Assistant Inbox (`AssistantInboxContainer` → `AssistantInbox`)
> **이번 배치 범위**: shell + **LIVE + PREVIEW만 구현**. REPLAY/SANDBOX는 라벨 있는 disabled placeholder.

---

## 0. 한 줄 판단

프리뷰 모드는 작전극장 밖에 두면 안 된다. 작전극장 **안**에 둬야 한다. 대신 live와 preview를 **데이터 차원에서 절대 섞지 말고**, 극장 안의 명확히 분리된 모드/레이어로 둔다. — 요새 안에 실전 작전실도 있고 훈련 시뮬레이터도 있는 구조.

이유:
- 프리뷰를 밖(숨은 데모 페이지)으로 빼면 → 개발자용 데모 느낌, 실제 OS 느낌이 안 나고 안 쓰게 됨.
- 프리뷰를 live처럼 보이게 섞으면 → 위험(가짜를 실제 업무로 오인).
- 그러니 극장 안에 **명확히 분리된 프리뷰 레이어**로 넣는다 → 실제 쓸 화면에서 카드 밀도 / 배지 / 빈 상태 / 경고 상태 / 지휘실 느낌을 바로 확인 → "멋있음" 평가 가능.

---

## 1. 구조 — 정식 좌석 4개

```text
작전극장 / Assistant Inbox
  ├─ LIVE      작전판       실제 app state만
  ├─ PREVIEW   예시판       fixture/demo, not live, action disabled, watermark
  ├─ REPLAY    과거 상황판   과거 eventLog 재생, read-only (이번엔 placeholder)
  └─ SANDBOX   훈련판       미래/위험 작업 실험, write·approval·external send 없음 (이번엔 placeholder)
```

상단 모드 스위치:

```text
[ LIVE ] [ PREVIEW ] [ REPLAY ] [ SANDBOX ]
```

---

## 2. 모드 정의 (고정 의미)

| 모드 | 데이터 | 액션 | 표시 |
|---|---|---|---|
| **LIVE** | 실제 app state / eventLog / ProjectRecord / runner gate **만**. 가짜·fixture·자동 action 0 | 정상(단, 현재 Inbox는 read-only) | source 배지 `LIVE`/`EMPTY` |
| **PREVIEW** | 디자인·상태 확인용 **예시(fixture)** 데이터. not live | **모든 액션 비활성** | 상시 배너/워터마크 + 카드 `EXAMPLE` 배지 |
| **REPLAY** | 과거 eventLog 재생(실제 과거 기록, 현재 live 아님) | **read-only** | source 배지 `REPLAY` |
| **SANDBOX** | 미래 기능/위험 작업 실험장 | **실제 write 0 · approval 0 · external send 0** | source 배지 `SANDBOX` |

공통: **어떤 모드에서도 자동 action 없음.** 모드 스위치 자체는 **UI state일 뿐**. 기본 모드는 **LIVE**(명시적으로 바꾸기 전까지). dev 편의로 PREVIEW 기본값을 쓸 경우 **dev-only + 가시적 표시** 필수.

---

## 3. UI 규칙

**PREVIEW 모드 상시 배너 (워터마크):**

```text
PREVIEW MODE — 예시 데이터입니다
실제 업무/실제 이벤트가 아닙니다 · 모든 액션은 비활성화되어 있습니다
```

**카드별 source 배지** (모드에 따라):

```text
LIVE · EMPTY · EXAMPLE · REPLAY · SANDBOX
```

---

## 4. 현재 코드 기준 — Batch 3/4가 이미 깔아둔 것 (재사용)

> 정정안의 데이터 분리 요구 중 **절반은 이미 구현돼 있다.** Batch 5는 이걸 모드 스위치로 노출만 하면 된다.

- **provenance 타입 이미 존재**: `InboxSectionSource = 'live' | 'empty' | 'example'`
  — `apps/desktop/src/components/inbox/AssistantInbox.tsx:36`, `StatusBadge.tsx`의 `InboxSourceKind`(동일 union)
- **SourceBadge 컴포넌트 이미 존재**(현재 **섹션 레벨**에만 렌더, 카드 레벨 미적용)
  — `StatusBadge.tsx:91-108`. `SourceIcon`: live→Radio, example→FlaskConical, empty→CircleSlash (`:84-88`). `SOURCE_LABEL`: live / "no live data" / "예시(fixture)" (`:72-76`)
- **두 projection이 이미 분리돼 있다** (핵심 — `liveProjection !== previewProjection`가 이미 성립):
  - `buildAssistantInboxLiveProps(input: AssistantInboxLiveInput)` → **LIVE**. 실데이터 없으면 빈 배열 + source `empty`(정직). — `assistantInboxProjection.ts:538-602`
  - `buildAssistantInboxProps()` → **fixture/example**(모든 source `example`). 이게 **PREVIEW의 데이터 소스**가 된다. — `assistantInboxProjection.ts:427-442`
- **projection 모듈은 순수(pure)** — writer / runner / EventStorage / batchRemember / network import **0개** 확인 (`assistantInboxProjection.ts:1-26`, 모두 read-only transform). → PREVIEW는 그냥 이 순수 함수를 쓰면 안전.
- **카드 4종 모델**: `EvidenceItem`(verdict pass/warning/blocked, observed) · `LearningLoopItem`(stage) · `MemoryCandidateItem`(status/origin/observed) · `ManifestEntry`(loadable/blocked reason).
- **마운트**: `command_center` 나브에서 `<AssistantInboxContainer live={...}/>` (`App.tsx:5472-5485`). `command_center`는 `NAV_CENTER_ITEMS`가 아닌 일반 nav-owned 페이지.

---

## 5. LINE S 구체화 — 데이터 평면 분리 (실제 심볼 기준)

```text
liveProjection    === buildAssistantInboxLiveProps(input)   // LIVE 전용
previewProjection === buildAssistantInboxProps()            // PREVIEW 전용 (fixture)
liveProjection !== previewProjection   // 이미 별도 함수. 절대 합치지 말 것.
```

**불변식:**
- PREVIEW 모드는 **`buildAssistantInboxProps()`(fixture)만** 렌더. `live` 입력(`AssistantInboxLiveInput`)을 **절대 받지 않는다.**
- LIVE 모드는 **`buildAssistantInboxLiveProps(input)`만** 렌더. fixture를 **절대 받지 않는다.**
- PREVIEW projection이 **import/call 하면 안 되는 실제 seam** (현재 projection 순수성 유지 = 이 import들이 들어오면 안 됨):

| seam | 실제 심볼 | 경로 |
|---|---|---|
| EventStorage | `createLocalClientEventCache` | `apps/desktop/src/runtime/stage29LocalEventStore.ts` |
| Memory / batchRemember | `planBatchRemember` · `executeLocalBatchWrite` · `BatchRememberAdapter` | `packages/simplememo/src/batchRemember.ts` |
| 코딩 runner | `CodingRunner` · `createMockCodingRunner` | `apps/desktop/src/lib/codingRunner.ts` |
| server write route + gate | `handleFileChangeExecute` · `handleCommentWriteExecute` · `evaluateFileChangeGate` | `apps/server/src/routes/github.ts` |
| approval queue | `ApprovalQueueItem` · `grantDgxApproval` / `rejectDgxApproval` | `packages/protocol/src/index.ts` · `apps/desktop/src/runtime/stage34ApprovalServer.ts` |
| runtime manifest | `buildLearningRuntimeManifest` | `packages/protocol/src/learningRuntimeManifest.ts` |

- **runner gate 해석 정정**: 현재 `buildAssistantInboxLiveProps`는 runner gate를 항상 live evidence로 포함(`:545-549`). PREVIEW는 **fixture만** 보여야 하므로, PREVIEW에서는 **live gate를 끌어오지 않는다** — preview의 gate 카드는 `EXAMPLE`로 배지된 fixture여야 한다. (= 어떤 live 데이터도 preview에 새지 않음)

**테스트 계약 (Batch 5가 증명해야):**
1. PREVIEW로 전환 → fixture(EXAMPLE) 카드가 렌더된다.
2. LIVE로 되돌리면 → fixture 카드가 **사라진다**(preview fixture가 live로 새지 않음).
3. PREVIEW projection 출력에 `source === 'live'`가 **하나도 없다**.
4. `assistantInboxProjection.ts`는 writer/runner/EventStorage/approval/network를 **정적 import 하지 않는다** (기존 OS-core "도메인 용어 금지" 정적 단언 패턴 재사용 — `assistantInboxProjection.test.ts:31-36` 스타일).
5. 어떤 모드에서도 카드에 enable/approve/action 버튼이 **없다**(현재 read-only 불변식 유지).

---

## 6. Batch 5 LINE 지시 (코딩 에이전트 전달용 — 정정안 원문 보존)

```text
CORRECTION: Do not isolate Preview Mode outside the operation theater.

Assistant Inbox / Command Center should support an explicit Theater Mode switch:
- LIVE
- PREVIEW
- REPLAY
- SANDBOX

Implement only the shell and PREVIEW mode first if needed.

Rules:
- LIVE mode must remain honest app state only.
- PREVIEW mode may use fixture/demo data, but every preview card must be clearly
  labeled "예시(fixture)" or "not live".
- PREVIEW mode must have a persistent visible banner/watermark.
- No preview data may enter EventStorage, Memory, batchRemember, server route,
  approval queue, runner, or runtime manifest as live data.
- No action buttons in PREVIEW mode.
- No auto action in any mode.
- The mode switch itself is UI state only.
- Default mode should be LIVE unless explicitly changed.
- If defaulting to PREVIEW for dev convenience, it must be dev-only and visibly marked.

LINE Q — Theater Mode Switch
- Add mode switch: LIVE / PREVIEW / REPLAY / SANDBOX.
- Implement LIVE and PREVIEW now.
- REPLAY/SANDBOX may be disabled placeholders with clear labels.
- PREVIEW uses explicit fixture projection.
- LIVE uses current app state projection.

LINE R — Preview Deck Inside Command Center
- Preview cards should cover PASS/WARNING/BLOCKED, LIVE/EMPTY/EXAMPLE, observed:false.
- Preview must look like the real theater layout, not a separate toy page.
- Preview must be visually impressive enough to judge command-center design.

LINE S — Safety Separation
- Data plane separation: liveProjection !== previewProjection
- Preview projection cannot call writer/server/runner/EventStorage.
- Tests must prove preview data does not flow into live cards unless mode === "preview".
- Tests must prove switching back to LIVE removes preview fixture cards.

LINE T — Visual Polish
- Make the theater feel like an operations room.
- Dense cards, strong hierarchy, clean badges, no generic CRUD dashboard feeling.
```

### LINE별 현재 코드 매핑 (구현 가이드)

- **LINE Q (스위치)**: 마운트는 `AssistantInbox` CardHeader(`:132-158`)와 CardContent(`:159-204`) 사이 peer `<div>`. `AssistantInboxContainer`에 `mode` prop 추가, mode에 따라 `buildAssistantInboxLiveProps`(LIVE) / `buildAssistantInboxProps`(PREVIEW) 분기. REPLAY/SANDBOX 버튼은 `disabled` + 라벨.
- **LINE R (preview deck)**: `buildAssistantInboxProps()`의 fixture가 이미 PASS/WARNING/BLOCKED·observed:false 케이스를 담는지 점검 후, 부족한 케이스(EMPTY 상태 데모, observed:false) fixture 보강. **새 toy 페이지 금지 — 같은 극장 레이아웃 재사용.**
- **LINE S (안전 분리)**: §5 그대로. 핵심은 "이미 분리된 두 함수를 합치지 말 것" + import 금지 + 4개 테스트.
- **LINE T (visual polish)**: 카드 밀도/계층/배지 정리. 일반 CRUD 대시보드 느낌 금지, 지휘실 느낌.

---

## 7. ⚠️ 네이밍 리스크 (구현 전 필독)

코드에 **이미 `theater` 나브 아이템이 존재** = `SummonTheater`(마키마 위임 풀스크린 디스플레이, `App.tsx:5360-5371`). 본 정정안의 "Theater Mode"는 **그것이 아니라** `command_center`(Assistant Inbox) **안의** 모드 스위치다. 충돌 방지:

- 새 상태 식별자는 `theater`와 구분: `commandCenterMode` 또는 `inboxViewMode` 권장 (값 `'live' | 'preview' | 'replay' | 'sandbox'`).
- UI 라벨은 "Theater Mode"로 불러도 되나, **나브 `theater`(SummonTheater)와 별개**임을 코드 주석/타입으로 못박을 것.

---

## 8. 마운트 / 상태 위치 (grounded)

- **스위치 위치**: `AssistantInbox.tsx` CardHeader와 CardContent 사이 peer div (presentational, 콜백 0).
- **모드 상태**: App-level `useState` + localStorage 영속화 — 기존 `CENTER_MODE_STORAGE_KEY`('ai-orchestrator.center-mode.v1') 패턴 따라 `readJsonState`/`writeJsonState`(`persistentJsonState.ts`) 사용. **default `'live'`**.
- **prop 흐름**: `App` → `AssistantInboxContainer({ live, mode })` → projection 분기 → `AssistantInbox({ ...props, mode })` (배너/배지 렌더용).
- **useMemo**: `AssistantInboxContainer`의 projection memo deps에 `mode` 추가(모드 전환 시 재투영).

---

## 9. 안전 불변식 (Batch 3/4 계승 — 0 유지)

```text
fake observed / fake live            0
auto trusted · active                0
auto runtime load                    0
auto append · write · flip           0
EventStorage mutation                0
preview → live seam (데이터 누수)     0   ← Batch 5 신규 불변식
OS core 도메인 import (erp/gio/...)   0
```

---

## 10. 검증

- **코드측** (dgx-01 headless/ssh 제약 → 브라우저 프리뷰 불가): jsdom 렌더 테스트 + `pnpm build` + typecheck. Batch 5 신규 테스트 수 보고(§5의 1~5 케이스 포함).
- **오너측 시각 검수**: `docs/ASSISTANT_INBOX_PREVIEW_CHECKLIST.md` 갱신(LIVE/PREVIEW 전환, 배너/워터마크, 배지, REPLAY/SANDBOX placeholder 표시). 오너가 Mac/Antigravity에서 확인.

---

## 11. 이번 배치 미접촉 / 다음 후보

- **REPLAY 실배선**: 과거 `eventLog` 재생(read-only). 기존 타임라인 되감기(#482/483)·`providerReplayDelivery.ts`와 연결 지점.
- **SANDBOX 실배선**: sandbox runner(`docs/47-sandbox-runner-integration.md`)와 연결, 실제 write/approval/external send 없이.
- 둘 다 이번엔 **disabled placeholder**(라벨만), 실데이터 배선은 후속 슬라이스.
