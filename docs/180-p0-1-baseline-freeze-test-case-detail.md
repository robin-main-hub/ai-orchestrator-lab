# A23 P0-1 Baseline Freeze — Test Case Detail (design only)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님.**
> **선행**: A6 `docs/163:21-25`(Phase 0 매트릭스 — P0-1·P0-2 *한 줄*), A22 `docs/179`(커버리지 맵 — P0-1을 *마지막 non-gated gap*으로 식별), A2 `docs/159`(어댑터 매핑 대상), A10 `docs/167`(controller 재배선 slot-in), A19 `docs/176`(재배선 동작-보존 CW-* — P0-1과 짝).
> **목표**: A22 추적표가 P0-1(현 `LocalClientEventCache` 4메서드 회귀 — "기존 stage29 테스트 전부 green 유지")을 *유일하게 남은 non-gated 한 줄 행*으로 못박았다. A23은 그 baseline freeze를 **무엇을 동결하고(현 green set), 무엇을 기준으로 회귀를 판정하며(before==after), 언제 게이트가 걸리는지** given/when/then으로 구체화한다. 이로써 non-gated 테스트 트랙(Phase 0~2 + controller + compare)이 100% 상세화 완결된다. **명세 설계이지 테스트 구현이 아니다 — 기존 테스트를 한 줄도 바꾸지 않는다.**

## 한 줄 요약
P0-1 baseline freeze is now specified as a regression gate that records the current green stage29/stage14 test set as the oracle and asserts byte-identical behavior before and after the A2 adapter mapping / A10 re-wire — the existing tests are the spec, frozen and unchanged, so any drift fails the gate.

## 실측: 동결 대상 (정본, 현재 green set)
```text
stage29 local client event cache (apps/desktop/src/runtime/stage29LocalEventStore.test.ts) — 7 케이스:
  T1 :32 keeps MacBook cache events locally and lists them by session   # append + listBySession
  T2 :42 treats unsynced events as projection outbox until DGX-02 is marked  # listUnsynced + markProjected
  T3 :53 persists through a localStorage-compatible adapter without taking DGX authority  # durable + authority 0
  T4 :70 redacts secret-like local outbox payloads before browser storage persistence  # redaction
  T5 :106 falls back to in-memory cache when browser storage quota is exhausted  # fallback
  T6 :122 does not resurrect a projected event when the local cache re-appends it  # idempotent/no-resurrect
  T7 :132 is the single client projection outbox source for unsynced events  # single outbox source
stage14 Event Storage sync (apps/desktop/src/runtime/stage14EventSync.test.ts) — 5 케이스:
  S1 :29 builds a deterministic client push envelope        # idempotencyKey 결정론
  S2 :42 marks accepted and duplicate events as synced       # accepted/duplicate→synced
  S3 :80 treats duplicate replay responses as synced outbox entries  # duplicate replay→synced
  S4 :115 keeps conflicting replay responses queued for review  # conflict→queued(G-4)
  S5 :157 keeps local outbox when the DGX server is unreachable  # offline 보존(G-1)
```
이 12 케이스가 P0-1이 동결하는 "현 동작"의 정본. A2 어댑터 매핑·A10 재배선은 이 12개를 *깨지 않아야* 한다.

## P0-1 baseline freeze 케이스 상세 (given/when/then)

### BF-1 freeze oracle 기록: 현 green set이 회귀 기준
```text
given: 재배선/어댑터 매핑 *전*(현 main) 상태.
when:  위 12 케이스(T1~T7 + S1~S5) 실행.
then:  전부 green(현 baseline). 이 green/red 벡터 == 회귀 오라클(freeze point).
       baseline freeze = "이 12개의 통과/실패 패턴을 변경 금지 대상으로 고정"이라는 선언.
근거: A6 P0-1 "기존 stage29 테스트 전부 green 유지". 동결은 *새 단언 추가*가 아니라 *기존 결과 보존* 약속.
```

### BF-2 before==after: A2 매핑 후에도 동일 green
```text
given: A2 어댑터(AuthoritativeEventStore+ReplicaOutbox) 매핑 + A10 재배선 적용 *후* 코드.
when:  동일 12 케이스 재실행(테스트 파일 무변경).
then:  T1~T7 + S1~S5 전부 여전히 green — before 벡터와 동일.
       단 하나라도 red 전환 → P0-1 게이트 fail = 재배선이 관찰 동작을 바꿈(회귀).
근거: A2/A10 "동작 보존". A19 CW-*가 *새* 동작-보존 케이스라면, P0-1은 *기존* 케이스 불변을 지키는 가드.
```

### BF-3 테스트 파일 불변: freeze는 테스트를 수정해 통과시키지 않음
```text
given: 재배선으로 T_k가 red.
then(금지): T_k의 expect를 느슨하게 고쳐 green 만드는 것 = freeze 위반(오라클 변조).
       올바른 처리: 구현(어댑터/재배선)을 고쳐 *원래 expect*를 만족시킴.
       테스트 파일 diff == 0 이 baseline freeze의 핵심 불변(케이스 추가/삭제/완화 0).
근거: A6 Phase 0 "코드 0, 회귀 가드". 동결의 의미 = 테스트가 고정된 계약, 구현이 거기 맞춤.
edge:  의도적 동작 변경(제품 결정)이 필요하면 P0-1 우회가 아니라 overseer 게이트로 — freeze 하에선 silent 완화 금지.
```

### BF-4 4메서드 표면 동결: append/listBySession/listUnsynced/markProjected
```text
given: A10이 매핑하는 LocalClientEventCache 4메서드(append :55/:73/:85, listBySession :58,
       listUnsynced :59/:101/:169, markProjected :98 — `docs/167`).
then:  각 메서드의 관찰 동작이 동결 케이스로 커버됨:
       append→T1/T6, listBySession→T1, listUnsynced→T2/T7, markProjected→T2/T6.
       재배선은 호출 *대상*만 어댑터로 바꿈(A2) — 이 4 표면의 입출력은 P0-1로 고정.
근거: A2 4메서드 slot-in. A22 추적표가 P0-1↔"4메서드 회귀"로 매핑한 것을 케이스로 환산.
```

### BF-5 P0-2와 분리: state 전이는 별도(A19 CW-2가 덮음)
```text
given: A6 P0-2(현 sync state 전이 보존)는 A22에서 이미 ✅(A19 CW-2).
then:  P0-1은 *store 4메서드*에 한정 — status 전이(queued→syncing→synced)는 P0-2/CW-2 소관.
       두 행이 겹치지 않게: P0-1=cache 동작 동결, P0-2=드레인 신호 동결.
근거: A6 Phase 0 두 행 분리. A22 커버리지 맵의 P0-1/P0-2 별도 항목 정합.
```

## non-gated 트랙 완결 의미 (A22 커버리지 맵 갱신)
```text
A22가 ◻︎non-gated gap으로 남긴 단 하나 = P0-1. A23이 이를 BF-1~BF-5로 상세화하면:
  non-gated 테스트 트랙(Phase 0 P0-1·P0-2 + Phase 1 P1+RO + controller CW+SD+G + compare CP + Phase 2 P2+MG)
  = 전 행 given/when/then 명세 보유 → "바로 구현 가능" 100%.
남는 미상세는 전부 ◻︎🔒 flip-gated(Phase 3 P3·Phase 4 P4+S0→S4·Phase 5 P5) — overseer 승인 전 구현 금지.
즉 이 문서로 *승인 없이 진행 가능한 설계 잔여*가 소진된다(코드 착수만 overseer GO 대기).
```

## 결정론·격리 불변 (전 케이스 공통)
```text
- baseline freeze는 *기존* 테스트(메모리 fake adapter, 고정 fixture)를 오라클로 쓸 뿐 — 새 fixture·새 primitive 0.
- real OPFS/IndexedDB/네트워크/DB 0(기존 stage29/stage14가 이미 fake 경계).
- 어떤 케이스도 authority flip 신호 emit 안 함 — P0-1은 회귀 가드일 뿐(구조 분리 동작 동일성 확인).
- 테스트 파일 diff 0이 불변 — freeze는 *읽기 전용 계약*(BF-3).
```

## non-goal (이번 A23)
```text
no 테스트 구현·수정 / no 어댑터·재배선 구현 (overseer 승인 후 Phase 1 코드)
no 기존 stage29/stage14 케이스 추가·삭제·완화(freeze 위반)
no Phase 3~5 상세화(flip-gated)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급 · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- **non-gated 트랙 완결**: P0-1 상세화로 승인 불요 설계 잔여 소진. 이후 설계 증분은 전부 flip-gated 또는 overseer 코드 GO 대기.
- A24 후보(flip-gated, 🔒 overseer 승인 후): Phase 3 epoch/quarantine 테스트 상세(P3-1~6, A16 `docs/173`/A17 `docs/174` 포맷 위), Phase 4 cutover state-machine 테스트(P4-1~6 + S0→S4, A4 `docs/161`), Phase 5 phone intent 변환 테스트(P5-1~4, A11 `docs/168`).
- overseer 승인 후 Phase 0~2 코드: A8/A9 어댑터 + A10 재배선 + A13 PR-1~4, 본 baseline freeze를 회귀 게이트로 두고 구현.

## 검증
- inspect-first: A6 `docs/163:21-25`(P0-1·P0-2 매트릭스), A22 `docs/179`(P0-1=마지막 non-gated gap 식별), `stage29LocalEventStore.test.ts:32-132`(T1~T7 정본)·`stage14EventSync.test.ts:29-157`(S1~S5 정본), A2 `docs/159`(4메서드)·A10 `docs/167:20-37`(재배선 매핑). 새 primitive·새 케이스 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
P0-1 baseline freeze is now specified (BF-1~BF-5) as a regression gate over the existing green stage29 (T1~T7) and stage14 (S1~S5) tests: record them as the frozen oracle, assert before==after across the A2 mapping / A10 re-wire, forbid loosening the test files, and pin the 4-method cache surface — completing the non-gated test track to 100% given/when/then coverage. 이 문서는 *baseline freeze 케이스 설계* 완료를 뜻하며, 테스트가 작성·수정되었거나 어떤 코드가 구현되었다는 주장이 아니다. 기존 테스트는 한 줄도 바뀌지 않으며(freeze=읽기 전용 계약), 이 단계는 authority flip이 아니다(여전히 DGX durable authority).
```text
A23 P0-1 baseline freeze test case detail done (design only). BF-1~BF-5 over existing stage29 T1~T7 + stage14 S1~S5 as frozen oracle, before==after gate, test files unchanged. non-gated track now 100%. no tests/code. not a flip. STOP.
```
