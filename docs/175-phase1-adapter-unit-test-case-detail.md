# A18 Phase 1 Adapter Unit-Test — Case Detail (design only)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님.**
> **선행**: A6 `docs/163`(테스트 매트릭스 — P1-1~P1-7 *한 줄* 케이스), A2 `docs/159`(두 계약), A8 `docs/165`(AuthoritativeEventStore OPFS 포맷), A9 `docs/166`(ReplicaOutbox), A10 `docs/167`(controller 재배선).
> **목표**: A6가 매트릭스에서 P1-* 케이스를 *한 줄씩만* 적었다. A18은 그 Phase 1 어댑터(AuthoritativeEventStore + ReplicaOutbox) 단위테스트를 **given/when/then + fake adapter 셋업 + 정확한 assertion + 엣지케이스**로 구체화해 *바로 구현 가능한* 명세로 만든다. Phase 1은 부작용 없는 shadow 단계(A7: 승인 후 안전 착수)라 flip-gate가 아니다 — 단 이번 PR은 **명세 설계이지 테스트 구현이 아니다.**

## 한 줄 요약
The Phase 1 adapter tests are now fully specified as given/when/then vitest cases over an in-memory fake backend — each A6 P1 row expanded into concrete fixtures, assertions, and edge cases so the adapter implementation has an unambiguous contract to satisfy.

## 실측: 재사용할 테스트 토대 (정본, A6 재확인)
- vitest `import { describe, expect, it } from "vitest"`, async store `await store.append(...)`(`stage29LocalEventStore.test.ts:31-141` 정본).
- **in-memory fake backend**: `Map<string,string>`를 backend 인터페이스로 감싼 어댑터(`:53-68` 패턴). OPFS/IndexedDB 실물 없이 계약 동작 단위테스트. A18도 동일하게 fake로 시작.
- 결정론 oracle: `fingerprintEvent=stableStringify`(`apps/server/src/index.ts:7494-7511`).
- no real network/DB(루프 안전): 전 케이스 fake adapter + 결정론 fixture.

## 공통 테스트 하니스 (제안 — 두 계약 공유)
```text
makeFakeBackend(): { read(name), write(name, bytes), list(), remove(name) } over Map<string,string>
  - OPFS sync-access-handle / IndexedDB objectStore의 최소 표면만 모사(A8: name→bytes).
  - flush()는 fake에서 즉시 반영(durability 시점은 별도 P1-5에서 재생성으로 검증).
makeEvent(id, opts?): 결정론 EventEnvelope fixture
  - 필수: id, sessionId, createdAt(ISO), type, payload. createdAt 고정 시드(정렬 결정론).
  - fingerprintEvent(makeEvent("e",...)) 는 호출마다 동일(stableStringify, A3).
주의: 하니스는 테스트 전용. 프로덕션 OPFS/IndexedDB 어댑터는 같은 계약을 실물 backend로 구현(A8).
```

## AuthoritativeEventStore 케이스 상세 (A6 P1-1~P1-7 확장)

### P1-1 append-only: 변경/삭제 API 부재 (타입 + 런타임)
```text
given: AuthoritativeEventStore 계약 타입.
then(타입): 계약에 update/delete/overwrite 메서드 *없음*(컴파일 레벨 — 존재하면 타입 에러).
then(런타임): append(makeEvent("e1")) 후 같은 id 다른 payload append →
             기존 레코드 *변경 안 됨*(아래 P1-2 idempotent와 연결). readAll()[0]==원본.
edge: append 후 backend bytes를 외부에서 손대도 store API로는 mutate 경로 없음(읽기만).
```

### P1-2 idempotent append: 동일 id 재-append = no-op (I3)
```text
given: 빈 store.
when:  await append(makeEvent("e1")); await append(makeEvent("e1"))   # 동일 id 2회
then:  readAll().length === 1                                          # 중복 0
       contains("e1") === true
edge-a: 동일 id·다른 payload 재append → 첫 레코드 우선(no overwrite), length 여전히 1.
        fingerprintEvent(readAll()[0]) == fingerprintEvent(첫 이벤트).
edge-b: 서로 다른 id e1,e2 각 1회 → length 2(정상 append 경로 회귀).
근거: A2 idempotent + A3 I3(no dup). A10 재배선의 :73 후 :85 중복 append 무해성 보장.
```

### P1-3 head() 단조: 역행 없음
```text
given: 빈 store. h0 = head().
when:  append(e1) → h1; append(e2) → h2.
then:  h1.count > h0.count AND h2.count > h1.count           # 단조 증가
       idempotent 재append(e2) → head().count == h2.count    # no-op은 head 불변
edge:  append 0건 store의 head()=well-defined(count 0, 빈 head 표현 — null 아님/명세된 기본).
근거: A2 head() 계약. revision/count 단조는 cutover baseline 기록(A4)·verifierHash 입력 안정에 필요.
```

### P1-4 contains(id) 정확성 (import 판정용)
```text
given: append(e1) 완료 store.
then:  contains("e1") === true
       contains("e_absent") === false
       contains("") === false (빈 문자열 비id 안전)
edge:  대소문자/공백 변형 id는 별개 키(contains는 정확 일치만 — fuzzy 금지).
근거: A2(import dedup 판정 A15 단계2). 정확성 실패 시 import이 duplicate/imported 오분류.
```

### P1-5 durable backend: clear/재생성 견딤 (A8 핵심)
```text
given: backend = makeFakeBackend(). store1 = createAuthoritativeStore(backend).
when:  await store1.append(e1); await store1.append(e2).
       # 같은 backend로 새 store 인스턴스 생성(앱 재시작 모사 — 메모리 상태 버림, backend bytes 유지)
       store2 = createAuthoritativeStore(backend).
then:  (await store2.readAll()).map(e=>e.id) === ["e1","e2"]   # 재생성 후 보존(durable)
edge-a: backend가 비어있으면(첫 부팅) store.readAll()===[] (빈 부팅 안전, boot-replay no-op).
edge-b: backend bytes에 손상 줄 1개 섞임 → 손상 줄 skip, 유효 이벤트만 readAll (A3 parse 패턴, silent 아님—skip 카운트 노출 가능).
근거: A2 durable 불변식 + A8 boot-replay. **이 케이스가 localStorage 부적격(P1-6)과 대비되는 durable 증명.**
```

### P1-6 localStorage backend 거부 (부적격)
```text
given: localStorage류(clear()가 전체 소실) backend.
then:  AuthoritativeEventStore 생성자/팩토리가 이를 authoritative backend로 *수용 안 함*
       (타입 가드 또는 런타임 거부). — authoritative durable 보장 불가이므로.
대조:  ReplicaOutbox는 localStorage 적격(A9: 재구축 가능). 즉 거부는 store에만.
근거: A1/A2(localStorage authoritative 제외). A8 OPFS/IndexedDB만 durable.
주의(테스트 형태): "거부"는 부정 케이스 — 잘못된 backend 주입 시 명시적 실패(throw 또는 컴파일 불가) assert.
```

### P1-7 shadow 격리: authority 주장 안 함 (A13 SHADOW)
```text
given: Phase 1 store가 SHADOW 모드(A13)로 인스턴스화.
then:  store는 ProjectionTarget/authority 신호를 *방출하지 않음* — DGX 여전히 authority.
       즉 store.append는 로컬 축적만, "이것이 authoritative다"는 메타 0(epoch 발급 0).
       flip 신호(epoch bump, conflictPolicy 전환) 부재.
근거: A1(shadow) + A13(SHADOW 단계 cache=primary). flip 아님을 테스트로 못박아 회귀 가드.
```

## ReplicaOutbox 케이스 상세 (A9 계약 — A6엔 명시 안 됐던 짝 보강)
A6 P1-*는 store 위주였다. A9 outbox도 같은 결정론 하니스로 단위테스트 — A10 재배선(hydrate)이 의존.
```text
RO-1 enqueue/listPending: enqueue("e1"); enqueue("e2") → listPending()==["e1","e2"](enqueuedAt 순).
RO-2 idempotent enqueue: 동일 eventId 2회 enqueue → listPending 길이 1(중복 0, A9).
RO-3 markReplicated: markReplicated(["e1"],"dgx-02") 후 listPending()==["e2"](e1 제외).
RO-4 payload 0: outbox 레코드는 eventId+replicatedTo+enqueuedAt만 — payload 필드 부재(A9, 타입 레벨).
RO-5 rebuild 안전(A9 손실복구): outbox 비워도 authoritative store에서 미복제분 재유도 가능
     (over-send 안전=idempotencyKey, under-send 금지). — 이 케이스는 hydrate(A10)와 연결.
RO-6 localStorage backend 적격: store와 달리 outbox는 localStorage fake에서 정상 동작(A9).
```

## 결정론·격리 불변 (전 케이스 공통 가드)
```text
- 모든 fixture는 고정 createdAt 시드 → 정렬·fingerprint·verifierHash 재현 가능(flaky 0).
- 전 케이스 fake backend(메모리) — real OPFS/IndexedDB/네트워크/DB 0(루프 안전 경계).
- append/enqueue 외 부작용 0(순수 계약 동작). 외부 전송·러너 디스패치 없음.
- P1-7/RO-* 어디서도 authority flip 신호 emit 안 함 — Phase 1은 구조 분리뿐(A10/A13).
```

## non-goal (이번 A18)
```text
no 테스트 구현 / no 어댑터 구현 / no 하니스 코드 (Phase 1 코드 = overseer 승인 후)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A19 후보: Phase 2 import 테스트 케이스 상세(A6 P2-* 구체화 — verifier I1~I6 given/when/then), 또는 A13 PR-2 shadow dual-write 배선의 동작-보존 회귀 테스트 케이스(A10 체크리스트→vitest).
- Phase 1 코드(overseer 승인 후): A8/A9 어댑터 + 본 A18 명세대로 단위테스트 작성.

## 검증
- inspect-first: A6 `docs/163:27-37`(P1-1~P1-7 매트릭스 — 본 문서가 확장), `stage29LocalEventStore.test.ts:31-141,53-68`(vitest async store + in-memory fake adapter 패턴), `apps/server/src/index.ts:7494-7511`(fingerprint oracle). A2/A8/A9/A10 계약 참조. 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The Phase 1 adapter tests are now fully specified as given/when/then vitest cases over an in-memory fake backend, expanding each A6 P1 row (plus the A9 outbox pair) into concrete fixtures, assertions, and edge cases. 이 문서는 *테스트 케이스 상세 설계* 완료를 뜻하며, 테스트가 작성되었거나 어댑터가 구현되었다는 주장이 아니다. 실제 테스트·어댑터는 overseer 승인 후 Phase 1 코드 작업이고, 이 단계는 authority flip이 아니다(shadow 구조 분리, 여전히 DGX durable authority).
```text
A18 phase 1 adapter unit-test case detail done (design only). P1-1~P1-7 + RO-1~RO-6 given/when/then over in-memory fake, no tests/code written. not a flip. STOP.
```
