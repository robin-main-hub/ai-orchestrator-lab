# A10 useDgxEventSyncController Re-wire — Slot-in Design (design only)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음. 재배선 실행 아님.**
> **선행**: A2 `docs/159`(두 계약 + 단일 slot-in 지점), A6 `docs/163`(Phase 1 테스트), A8 `docs/165`(AuthoritativeEventStore 포맷), A9 `docs/166`(ReplicaOutbox 포맷).
> **목표**: A2가 지목한 단일 slot-in 지점(`useDgxEventSyncController.ts:45-48`)에서 현 `LocalClientEventCache`(4메서드)를 `AuthoritativeEventStore`(A8)+`ReplicaOutbox`(A9) 두 계약으로 **재배선하는 절차**를 호출부 한 줄 단위로 명세한다. 현 동작(드레인 상태·offline-first·idempotency)을 **바이트 단위로 보존**하는 매핑을 못 박는다. **Phase 1 코드 작업의 설계서이지 재배선 실행이 아니다.**

## 한 줄 요약
The controller re-wire is a behavior-preserving substitution: each of the four LocalClientEventCache call-sites maps to an explicit AuthoritativeEventStore + ReplicaOutbox pair, with no change to drain state, offline-first ordering, or idempotency.

## 실측: 현 호출부 전수 (정본)
`localClientEventCache`는 controller 내부에서만 쓰이며(외부 의존 0), 정확히 **4 메서드 × 7 호출지점**.
| 호출 | 위치 | 현 의미 |
| --- | --- | --- |
| `append(event)` | `:55`(bootstrap seed), `:73`(queueEventForSync), `:85`(syncEventsToDgx) | 로컬 확정 + outbox 진입 |
| `listBySession(id)` | `:58`(bootstrap replay) | 세션 replay 읽기 |
| `listUnsynced()` | `:59`(bootstrap), `:101`(sync 후), `:169`(handleSync) | 미전송 outbox 목록 |
| `markProjected(ids,"dgx-02")` | `:98`(push 성공 후) | 전송 완료 표시 |
인스턴스화: `:45-48` `createLocalClientEventCache(window.localStorage)` — **유일 교체점**.

## 재배선 매핑 (호출부별, 동작 보존)
두 계약 인스턴스(`authStore`, `outbox`)를 주입. 현 한 줄 → 두 계약 호출로 분해.
| 현 호출 | 재배선 | 동작 보존 근거 |
| --- | --- | --- |
| `cache.append(e)` (`:55,:73,:85`) | `await authStore.append(e); await outbox.enqueue(e.id)` | A2 매핑표. append-only 확정(권위) + 전송대기 표시(전송). idempotent라 현재의 중복 append(:73 후 :85)도 무해(no-op). |
| `cache.listBySession(id)` (`:58`) | `await authStore.read(id)` | local-first 권위 읽기 — 동일 결과(createdAt 정렬 유지). |
| `cache.listUnsynced()` (`:59,:101,:169`) | `await outbox.listPending()` 의 eventId → `authStore` 조회로 EventEnvelope 복원 | **주의**: 현재는 페이로드를 직접 반환. A9는 outbox가 id만 보유 → controller가 id로 authStore에서 페이로드 hydrate. 결과 EventEnvelope[]는 동일. |
| `cache.markProjected(ids,"dgx-02")` (`:98`) | `await outbox.markReplicated(ids,"dgx-02")` | 의미 재정의(projection→replica push)뿐, 상태 전이 동일. |

### 핵심 변화: listUnsynced의 hydrate 단계 (유일한 비자명 지점)
```text
현재:   listUnsynced(): Promise<EventEnvelope[]>           # 페이로드 직접 반환
재배선: const ids = await outbox.listPending();            # id만
        const events = await authStore.readByIds(ids);     # 권위에서 hydrate
        # readByIds = readAll 필터 또는 contains+read 조합(A8 readAll/read 재사용)
근거:   A9 — outbox는 페이로드 복제 0. 권위 페이로드는 authStore 단독 보유.
        순서 보존: ids를 createdAt(또는 enqueuedAt)로 정렬해 현 mergeClientEventOutboxEvents 입력과 동일하게.
```
이 hydrate가 A8+A9 분리의 유일한 실질 코드 변화. 나머지는 1:1 치환.

## 비동기/seam 정합 (이미 충족)
- 현 4메서드 **이미 전부 `Promise` 반환·`await`됨**(`:55,58,59,85,98,101,169`). → OPFS async backend(A8)로 바꿔도 호출부 시그니처 무변. localStorage(동기)→OPFS(비동기) 전환 마찰 없음(A1이 async seam 택한 이유 재확인).
- `useMemo(:45-48)` 단일 인스턴스화 → 두 계약도 같은 `useMemo`에서 backend 공유 생성(`createAuthoritativeStore(backend)`, `createReplicaOutbox(backend)`).

## 동작 불변 체크리스트 (재배선이 깨면 안 되는 것 — A5/A6 가드)
```text
[ ] offline-first: queueEventForSync(:73)가 push 실패해도 authStore.append 선확정 (A5 G-2)
[ ] 드레인 신호: eventSyncState status/outboxCount 전이 동일 (reduceEventSyncState 입력 불변)
[ ] outboxCount == outbox.listPending().length (현 nextOutbox.length와 동일 의미)
[ ] idempotency: 같은 event 재-append=no-op, 재전송은 idempotencyKey(:stage14 :56) 그대로
[ ] seed bootstrap 순서: seedEvents append → listBySession replay → listUnsynced 드레인 (:54-69 순서 보존)
[ ] markReplicated 후 listPending에서 제외 (현 markProjected→listUnsynced 동일)
```
A6 매트릭스 연결: P0-1/P0-2(회귀 가드), P1-2(idempotent), G-1~G-4(operational 보존)가 이 체크리스트를 커버.

## 재배선 절차 (Phase 1, 순서)
```text
1. 두 계약 인스턴스를 :45-48 useMemo에서 생성(backend=OPFS primary/IndexedDB fallback, A8).
   ReplicaOutbox backend=localStorage(A9 권장).
2. append 호출 3곳(:55,:73,:85) → authStore.append + outbox.enqueue.
3. listBySession(:58) → authStore.read.
4. listUnsynced 3곳(:59,:101,:169) → outbox.listPending + authStore hydrate.
5. markProjected(:98) → outbox.markReplicated.
6. DgxEventSyncController 타입의 localClientEventCache 필드 → { authStore, outbox } 노출로 교체.
7. 기존 stage29 테스트를 두 계약 기준으로 이식(A6 P1-*), 동작 불변 체크리스트 전부 green 확인.
주의: 이 절차는 authority FLIP이 아님 — 여전히 DGX가 durable authority(projectionTarget "dgx-02" 유지).
      MacBook authoritative 승격은 Phase 3(epoch 발급)에서, 본 재배선은 store 구조만 분리.
```

## 왜 지금 코드를 안 바꾸나 (HOLD 경계)
이 재배선은 Phase 1(부작용 없는 구조 분리)이라 authority flip은 아니지만, **A8 OPFS 어댑터·A9 outbox 어댑터 구현이 선행**돼야 의미가 있다. 어댑터 없이 호출부만 두 계약으로 쪼개면 주입할 구현체가 없다. 따라서 본 문서는 *재배선 설계*만 고정하고, 실제 배선은 어댑터 구현(Phase 1 코드)과 함께 overseer 승인 후. 지금 controller를 건드리면 현 동작 회귀 위험만 생기고 이득 0.

## non-goal (이번 A10)
```text
no controller 재배선 실행 / no 어댑터 구현 / no useMemo 교체
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A11 후보: phone pending-intent 레코드 포맷(A5 gap, flip-gated 설계), 또는 Phase 1 어댑터 PR 묶음 순서/플래그(shadow rollout) 설계.
- Phase 1 코드(overseer 승인 후): A8 OPFS 어댑터 + A9 outbox 어댑터 + 본 A10 절차대로 재배선 + A6 테스트.

## 검증
- inspect-first: `useDgxEventSyncController.ts:45-48`(slot-in), `:54-69`(bootstrap 순서), `:72-77`(queue), `:79-101`(sync+markProjected+listUnsynced), `:167-173`(handleSync). 4메서드 7호출 전수 확인. A2/A8/A9 계약 참조.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The controller re-wire is a behavior-preserving substitution mapping four call-sites to the two contracts, with the only non-trivial change being payload hydration of outbox ids from the authoritative store. 이 문서는 *재배선 설계* 완료를 뜻하며, controller가 재배선되었거나 어댑터가 구현되었다는 주장이 아니다. 실제 배선은 A8/A9 어댑터 구현과 함께 overseer 승인 후 Phase 1 작업이다.
```text
A10 controller re-wire slot-in design done (design only). behavior-preserving map, no code. STOP.
```
