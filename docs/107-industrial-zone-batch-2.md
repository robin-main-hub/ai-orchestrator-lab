# 107 — Industrial Zone Batch 2 (canonical cleanup + visible mount + server gate)

## 한 줄

Batch 1이 만든 OS 엔진 위에서, (A) 병렬로 굳어가던 #538 중복을 canonical로 정리하고 OS core를 도메인-불가지 경계로 굳혔고, (B+C) Assistant Inbox를 실제 앱 nav에 올려 카드 5종을 generic projection에 연결했으며, (D) learning failure 자동 append를 위한 gate+idempotency를 기본 OFF로 설계했다.

## PR 트랙 (모두 main merged)

| PR | merge | 라인 | 내용 |
|---|---|---|---|
| #546 | `cb7818b` | A | OS generic evidence plugin boundary (p61-p80 audit, docs, domain example cleanup) — 병렬 워커 |
| #547 | `7920ebe` | D | learning failure append gate + idempotency (disabled by default, no auto-run) |
| #548 | `b042964` | B+C | Assistant Inbox를 app nav에 mount + 카드 5종 generic projection 연결 |

## LINE A — OS boundary / canonical cleanup (#546)

- OS core에 도메인 전용 타입/import 0 확인(구조적으로 깨끗). 오염은 주석/네이밍 + #538 dead 중복뿐.
- `smokeIngest.ts` 계열 도메인 예제는 제거하고 `smokeGenericEvidenceIngest.ts` 방향의 neutral smoke만 유지.
- boundary docs 4종 + p61-p80 audit/forbidden-scan 아티팩트.
- evidenceIngest는 keep+genericize(스펙대로). **owner 메모**: evidence 경로가 server evidenceIngest + simplememo evidenceBridge 둘 공존 — 단일화 시 evidenceBridge(B/C/D canonical) 기준 권장.
- (배치 중 내가 동일 LINE A를 중복 구현했으나 #546이 스펙에 더 충실하여 내 중복은 폐기 — 병렬 충돌, 비파괴 처리.)

## LINE B+C — Assistant Inbox mount + wire (#548)

**Mount (B)**: `command_center` nav 항목("어시스턴트 인박스", Inbox 아이콘)을 시스템 섹션에 추가.
- `types.ts` NavItemId + `lib/navSurface.ts` NAV_CENTER_ITEMS 등록
- `seeds/conversation.ts` nav 항목
- `App.tsx`:5452 render 분기 (`activeNavItem === "command_center"` → `<AssistantInboxContainer />`), 기존 ternary 체인 패턴 그대로.

**Wire (C)**: `lib/assistantInboxProjection.ts`(순수) + `components/inbox/AssistantInboxContainer.tsx`(thin). 카드별 generic projection (neutral fixtures, example-system/entity-001):
- Evidence 카드 ← `buildBatchRememberCandidatesFromEvidence` (evidence observed = source refs 있을 때)
- Learning 카드 ← `deriveLearningLoopState` (verified + terminal rejected)
- Runner 카드 ← `deriveRunnerGateStatus` (dgx_disabled 기본, observed:false)
- Runtime manifest 카드 ← `buildLearningRuntimeManifest` (loadable / eval-warned / eval_failed / quarantined)

**검증(직접 확인)**: 새 파일에 ERP/도메인 실사용 0(금지어 hit은 "no ERP terms" 주석 부정문뿐), `<button>`/`onClick` 0(read-only, 자동액션·승인버튼·서버호출 0), observed:false 정직 투영(runner 카드 line 313), 12 tests(container+projection) pass.

**browser preview**: 미실행. 사유 — repo가 원격 headless dgx-01에 있고 preview 툴링은 로컬·해당 repo 미연결·ssh display 브리지 없음. 대체 검증 = jsdom DOM-level render(컨테이너 테스트가 실제 AssistantInbox 트리 렌더 + 카드/배지/텍스트 assert) + Vite build green. (이전 모든 UI PR과 동일 기준.)

## LINE D — server gate + idempotency (#547)

- `learningFailureIdempotency.ts` — 결정론적 키(`lf:<missionId>:<anchor>`, verificationReportId 우선), Date.now/IO 0.
- `learningFailureGate.ts` — `LearningFailureGateConfig{enabled:false}` 기본, `shouldAppendLearningFailure()`는 **결정만**(append/reason/key) 반환, 절대 append 안 함. evidence-gating은 C1 `deriveLearningFailureEvent` 위임.
- `docs/SERVER_LEARNING_FAILURE_GATE.md` — enabling path, dedup 규칙, owner=lab maintainer, future-route seam(명시적으로 onEventsCommitted 아님 — observe-only/loop-guarded).
- 25 tests.

## 통합 검증 (main, 4개 PR 합쳐진 후)

- `corepack pnpm typecheck`: **0 errors**
- `corepack pnpm build`: **green**
- 신규 테스트: A(p61-p80) + D 25 + B+C 12 (focused 31 pass)
- 안전 불변선 전부 유지: 가짜 observed 0 / 자동 trusted·active 승격 0 / 자동 runtime load 0 / 자동 외부 발송 0 / 자동 server route 0 / DB migration 0 / secret 노출 0 / OS core 도메인 import 0.

## 처음으로 — "켰을 때 보이는 OS"

`어시스턴트 인박스` nav를 누르면 Evidence / Learning Loop / Memory Candidate / Runtime Manifest / (runner) 카드가 실제 앱 화면에 뜬다. 전부 read-only, generic projection 기반, 자동 액션 0.

## 다음 후보

- **browser preview/스크린샷 실측** (로컬 desktop dev 환경에서 — 현재 ssh/headless 제약 밖)
- evidence 경로 단일화 (evidenceBridge canonical 기준, evidenceIngest 통합)
- D gate를 실제 server route에 연결 (owner가 enable 결정 후)
- 카드를 fixture가 아닌 실데이터(실제 mission/eval/runner 상태)에 연결
- 실제 SimpleMem/DGX writer, runtime skill load
