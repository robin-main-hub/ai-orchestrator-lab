# A19 Controller Re-wire — Behavior-Preservation Test Cases (design only)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님.**
> **선행**: A10 `docs/167`(controller 재배선 slot-in + *동작 불변 체크리스트* — 한 줄씩), A13 `docs/170`(PR-2 shadow dual-write), A18 `docs/175`(어댑터 단위테스트 — store/outbox 계약 레벨), A6 `docs/163`(G-1~G-4 안티-회귀 가드).
> **목표**: A18이 *어댑터 계약*(store/outbox) 단위테스트를 상세화했다면, A19는 그 어댑터를 controller에 재배선(A10)했을 때 **현 동작이 바이트 단위로 보존됨을 증명하는 테스트 케이스**를 given/when/then으로 못 박는다. A10의 "동작 불변 체크리스트"(`docs/167:44-52`)와 A6 G-1~G-4를 vitest 명세로 구체화해 A13 PR-2(shadow 배선)가 회귀 0으로 머지 가능하게 한다. **테스트 명세 설계이지 테스트 구현이 아니다.**

## 한 줄 요약
The controller re-wire is covered by behavior-preservation tests that assert the four-method substitution and shadow dual-write leave drain state, offline-first ordering, idempotency, and bootstrap order byte-identical to the current LocalClientEventCache path.

## 실측: 재사용할 토대 + 무엇을 가드하나 (정본)
- 테스트 토대: `stage14EventSync.test.ts`(드레인 상태 전이), `stage29LocalEventStore.test.ts:31-141`(async store + in-memory fake adapter). A18 하니스(`makeFakeBackend`/`makeEvent`) 재사용.
- 재배선 대상(A10): `useDgxEventSyncController.ts:45-48` 단일 slot-in. 4메서드×7호출 → `authStore`+`outbox` 두 계약. **유일 비자명 변화=listUnsynced hydrate**(outbox id→authStore 페이로드 복원, `docs/167:29-37`).
- 가드 대상: A10 체크리스트 6항 + A6 G-1~G-4. "현 동작"=재배선 *전* `LocalClientEventCache` 경로의 관찰 가능한 결과(상태 전이·순서·카운트).

## 동작-보존 테스트 케이스 (A10 체크리스트 → given/when/then)

### CW-1 offline-first: push 실패해도 append 선확정 (A10 / A6 G-2)
```text
given: 재배선된 controller, authStore+outbox(fake backend), push transport=항상 실패(fake reject).
when:  queueEventForSync(e1) 호출(:73 경로).
then:  authStore.contains("e1") === true          # 로컬 선확정(push 실패와 무관)
       outbox.listPending() 에 "e1" 포함           # 전송대기 표시
       eventSyncState.status === "queued"          # 현 동작 동일(A5 offline ✅)
근거: A10 "offline-first: append 선확정 후 push". push 실패가 durable 확정을 막지 않음.
```

### CW-2 드레인 신호 전이 보존 (A10 / A6 G-1,G-4)
```text
given: 재배선 controller. push transport=성공.
when:  queueEventForSync(e1) → syncEventsToDgx() → 완료.
then:  status 전이 == 현 경로와 동일 시퀀스: "queued" → "syncing" → "synced"
       부분 실패 주입 시 → "failed"(conflict review 보존, G-4)
       reduceEventSyncState 입력(이벤트 수·outbox 길이)이 재배선 전후 동일.
근거: A10 "status/outboxCount 전이 동일". 재배선이 상태기 입력을 바꾸지 않음.
```

### CW-3 outboxCount == listPending().length 등가 (A10)
```text
given: 재배선 controller.
when:  e1,e2 enqueue 후 markReplicated(["e1"]).
then:  eventSyncState.outboxCount === outbox.listPending().length === 1   # "e2"만
       (현 nextOutbox.length 의미와 동일 — 카운트 소스만 outbox로 교체, 값 불변)
근거: A10 "outboxCount == outbox.listPending().length". 드레인 신호 수치 보존.
```

### CW-4 idempotency: 재-append no-op + 재전송 안전 (A10 / A6 G-3)
```text
given: 재배선 controller. 같은 e1을 :73 후 :85 경로로 중복 append(A10이 무해라 한 경로).
then:  authStore.readAll().filter(id=="e1").length === 1     # 중복 append no-op(A18 P1-2)
       재전송 시 idempotencyKey(`${clientId}:${sessionId}:${ids}` :56) 동일 → 서버 dedup
       → target 중복 확정 0(G-3 reconnect drain 멱등).
근거: A10 "idempotency: 재-append=no-op, 재전송 idempotencyKey 그대로".
```

### CW-5 seed bootstrap 순서 보존 (A10)
```text
given: 재배선 controller, seedEvents=[e1,e2].
when:  bootstrap(:54-69 순서): seed append → listBySession replay → listUnsynced 드레인.
then:  실행 순서 == 현 경로: append(seed) 먼저, 그 다음 replay 읽기, 그 다음 unsynced 드레인.
       authStore.read(session) 결과 createdAt 정렬 == 현 listBySession 결과(A10 :58 매핑).
근거: A10 "seed bootstrap 순서 보존(:54-69)". 부팅 시 순서 역전 0.
```

### CW-6 listUnsynced hydrate 동등성 (A10 유일 비자명 변화)
```text
given: 재배선 controller. outbox.listPending()==["e2","e1"](enqueue 역순 가정).
when:  listUnsynced 경로(:59/:101/:169) = outbox.listPending() → authStore hydrate.
then:  복원된 EventEnvelope[] == 현 cache.listUnsynced() 결과(페이로드·순서 동일).
       순서: ids를 createdAt(또는 enqueuedAt)로 정렬해 현 mergeClientEventOutboxEvents 입력과 동일(A10 :36).
edge:  outbox에 id 있으나 authStore에 페이로드 없음(이상상태) → 명시 처리(skip+가시화, silent 0).
근거: A10 "listUnsynced hydrate가 유일한 실질 코드 변화" — 결과 동등성이 회귀 가드 핵심.
```

### CW-7 markReplicated 후 listPending 제외 (A10)
```text
given: e1,e2 enqueue.
when:  markReplicated(["e1"],"dgx-02")  (현 markProjected :98 대응).
then:  listPending() === ["e2"]           # e1 제외(현 markProjected→listUnsynced 동일)
       projectionTarget "dgx-02" 의미 보존(A10: projection→replica 의미 재정의뿐, 전이 동일).
근거: A10 markProjected→markReplicated 매핑. 전송완료 표식 동작 불변.
```

## shadow dual-write 특화 케이스 (A13 PR-2)
```text
SD-1 dual-write: SHADOW 모드(flag on)에서 append 시 cache(primary)+어댑터(병행) *둘 다* write.
     then: cache.readAll() 와 authStore.readAll() 가 같은 이벤트 집합(verifierHash 일치, A14).
SD-2 read=cache: SHADOW에서 read는 여전히 cache(primary). 어댑터는 write만 받음(A13).
     then: 읽기 결과가 cache 기준 — 어댑터 누락/추가가 read 결과 안 바꿈.
SD-3 flag OFF 기본: VITE_AUTH_STORE_SHADOW 미설정 → 어댑터 인스턴스화 0, 현 cache 단독.
     then: 재배선 전과 100% 동일 경로(부작용 0, A13 [OFF] 상태).
SD-4 rollback 안전: flag on→off 전환 후 어댑터 write 폐기해도 cache 무손상(A13 ROLLBACK).
     then: cache.readAll() 불변(어댑터는 비권위 병행이라 폐기 안전).
근거: A13 OFF/SHADOW 상태기 + flag 분기 단일점(:45-48). flip 아님(cache=primary 유지).
```

## 결정론·격리 불변 (전 케이스 공통, 루프 안전)
```text
- push transport는 fake(성공/실패 주입) — real fetch 0. backend fake(메모리) — real OPFS/IndexedDB/DB 0.
- 고정 createdAt 시드 → 정렬·verifierHash 재현(flaky 0).
- 어떤 케이스도 authority flip 신호 emit 안 함(SHADOW=cache primary, epoch 발급 0).
- 외부 전송·러너 디스패치·secret 0(A18과 동일 경계).
```

## non-goal (이번 A19)
```text
no 테스트 구현 / no controller 재배선 실행 / no shadow flag 추가 (Phase 1 코드=overseer 승인 후)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A20 후보: Phase 2 import 테스트 케이스 상세(A6 P2-* 구체화 — verifier I1~I6 given/when/then + manifest GO/HOLD 분기), 또는 A13 PR-3 compare 도구 테스트 케이스(A14 ShadowParityReport verdict 산출 단위테스트).
- Phase 1 코드(overseer 승인 후): A10 재배선 + A13 PR-2 배선 + 본 A19 명세대로 회귀 테스트.

## 검증
- inspect-first: A10 `docs/167:20-37,44-52,56-67`(재배선 매핑·hydrate·동작 불변 체크리스트), A13 `docs/170:24-30,37-47`(PR-2 dual-write·OFF/SHADOW 상태기), A6 `docs/163:89-96`(G-1~G-4), `stage14EventSync.test.ts`/`stage29LocalEventStore.test.ts:31-141`(테스트 토대). A18 하니스 재사용. 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The controller re-wire is covered by behavior-preservation tests (CW-1~CW-7) plus shadow dual-write cases (SD-1~SD-4) that assert drain state, offline-first ordering, idempotency, bootstrap order, and hydrate-equivalence stay byte-identical to the current path, with flag-OFF as a zero-side-effect default. 이 문서는 *회귀 테스트 케이스 설계* 완료를 뜻하며, 테스트가 작성되었거나 controller가 재배선되었다는 주장이 아니다. 실제 테스트·배선은 overseer 승인 후 Phase 1 코드이고, 이 단계는 authority flip이 아니다(SHADOW=cache primary, 여전히 DGX durable authority).
```text
A19 controller re-wire behavior-preservation test cases done (design only). CW-1~7 + SD-1~4 given/when/then, fake transport/backend, flag-OFF zero-side-effect. no tests/code. not a flip. STOP.
```
