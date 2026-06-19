# A2 Local Authoritative Store Seam — Interface Contract (design only)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음.**
> **선행**: A0 `docs/157` (실측: DGX-data-authority), A1 `docs/158` (migration blueprint: target = MacBook authoritative store, OPFS/IndexedDB, atomic cutover).
> **목표**: A1 blueprint의 "local authoritative store ⟂ outbox 분리"를 **구체적 인터페이스 계약**으로 못 박는다. 어떤 durable adapter(OPFS/IndexedDB)든 이 계약을 구현하면 호출부 변경 없이 Phase 1에서 slot-in 가능하도록 seam을 정의한다. **본 문서는 인터페이스 *계약*이지 구현이 아니다.**

## 한 줄 요약
The local authoritative store seam is now specified as a concrete, adapter-agnostic interface contract separating durable authority from the sync outbox.

## 실측: 현재 seam (정본)
- **단일 인스턴스화 지점**: `apps/desktop/src/hooks/useDgxEventSyncController.ts:45-48`
  ```ts
  const localClientEventCache = useMemo(
    () => createLocalClientEventCache(typeof window === "undefined" ? undefined : window.localStorage),
    [],
  );
  ```
  → `window.localStorage`를 넘기는 **유일한** 호출부. durable adapter 교체는 *이 한 줄*에서 일어난다.
- **현재 인터페이스**: `LocalClientEventCache`(`stage29LocalEventStore.ts:7-12`) — async 4메서드(`append`/`listBySession`/`listUnsynced`/`markProjected`). 이것이 진짜 seam.
- **현재 책임 혼합**: 이 한 store가 (i) cache(replay 읽기), (ii) outbox(`listUnsynced`+`markProjected("dgx-02")`), (iii) (미래)authority를 겸한다. `markProjected`의 의미는 현재 "DGX authority로 projection됨"이다.
- **소비자**: `bootstrapLocalEventStorage`/`queueEventForSync`/`syncEventsToDgx`/`handleSyncEventStorage` 4개 — 전부 동일 controller 내부. 외부 직접 의존 없음 → 계약 도입이 좁다.

## 설계: 두 계약 분리 (authority ⟂ outbox)
A1 원칙대로 하나의 store를 **두 인터페이스**로 가른다. 같은 durable backend를 공유하되 *책임*을 분리한다.

### 1) `AuthoritativeEventStore` (durable source of truth)
```text
append(event): 사용자 저작 이벤트를 durable·append-only로 확정. MacBook epoch/revision 부여 시점(설계상; 발급 로직은 Phase 3).
              절대 silent overwrite/drop 없음. 동일 id 재-append는 idempotent no-op(중복 확정 금지).
read(sessionId): local-first 권위 읽기(현 listBySession 대체).
readAll(): 전체 authoritative 로그(검증·import parity·hash용).
head(): { epoch, revision, count } — 현재 authority 위치(cutover/split-brain 판정용).
contains(eventId): 멱등 import·dedup 판정용.
불변식:
  - append-only. 기존 레코드 변경/삭제 API 없음.
  - durable: 브라우저 clear에 견뎌야 함 → localStorage 부적격(OPFS/IndexedDB only).
  - 모든 메서드 async(durable backend는 비동기).
```

### 2) `ReplicaOutbox` (DGX replica 전송 큐 — authority 아님)
```text
enqueue(eventId): authoritative store에 *이미 확정된* 이벤트의 replica 미전송 표시.
listPending(): DGX replica로 아직 push 안 된 eventId 목록(현 listUnsynced 대체).
markReplicated(eventIds, target): replica 전송 완료 표시. 의미 = "DGX replica로 push됨"(NOT "authority로 projection됨").
불변식:
  - outbox는 *전송 상태*만 추적. 데이터 authority와 무관.
  - outbox 비움이 authoritative 데이터에 영향 주지 않음(전송≠확정).
  - target은 replica node id(예 "dgx-02") — 의미는 A1대로 "authority projection"에서 "replica push"로 재정의.
```

### seam 어댑터 형태 (Phase 1 slot-in 지점)
```text
createAuthoritativeStore(backend): AuthoritativeEventStore
createReplicaOutbox(backend): ReplicaOutbox
  backend ∈ { OpfsBackend(primary), IndexedDbBackend(fallback) }  // A1 결정. localStorage 제외.
useDgxEventSyncController는 createLocalClientEventCache(localStorage) 대신
  이 두 계약 인스턴스를 주입받는다(현재 4-메서드 호출을 두 계약으로 재배선 — Phase 1 코드 작업, 본 문서 아님).
```

## 현 `LocalClientEventCache` → 두 계약 매핑 (마이그레이션 표)
| 현재 메서드 | 분배 계약 | 비고 |
| --- | --- | --- |
| `append(event)` | `AuthoritativeEventStore.append` + `ReplicaOutbox.enqueue(event.id)` | 확정과 "전송 대기 표시"를 동시에(단, 의미 분리). |
| `listBySession(id)` | `AuthoritativeEventStore.read(id)` | local-first 권위 읽기. |
| `listUnsynced()` | `ReplicaOutbox.listPending()` | "미동기" → "replica 미전송". |
| `markProjected(ids,"dgx-02")` | `ReplicaOutbox.markReplicated(ids,"dgx-02")` | 의미 재정의(projection→replica push). |
| (없음) | `AuthoritativeEventStore.head()/contains()/readAll()` | epoch/revision·import·검증용 신규. |

## backend 적합성 (A1 결정 재확인, 계약 관점)
| backend | AuthoritativeEventStore 적격? | 근거 |
| --- | --- | --- |
| localStorage | **부적격** | clear에 소실 → durable 불변식 위반. ReplicaOutbox fallback 용도로만(전송 상태는 재구축 가능). |
| IndexedDB | 적격(fallback) | clear 견딤. async. fsync 보장 약하나 outbox+authority 둘 다 수용. |
| OPFS | 적격(primary) | append-only+fsync(웹 최강, A1). |
| native SQLite/node:fs | **out of scope** | native shell 필요(A1 HOLD). |

## 계약 불변식 (정본)
```text
AuthoritativeEventStore:
  append-only · idempotent append(동일 id no-op) · no overwrite · no delete API
  durable backend only(localStorage 금지) · all async
  head()는 {epoch,revision,count} 단조(revision 감소 금지)
ReplicaOutbox:
  전송 상태만 추적 · authority와 직교 · 비움이 데이터에 영향 없음
경계:
  control-plane(승인 큐·정책)은 이 계약 밖(A1: DGX broker 가능)
  PREVIEW/SANDBOX/fixture/replay는 authoritative store 대상 아님(P9)
```

## non-goal (이번 A2)
```text
no adapter 구현(OPFS/IndexedDB 코드 없음) · no useDgxEventSyncController 재배선
no protocol type/schema/migration 변경 · no epoch/revision 발급 로직(Phase 3)
no authority flip · no WorkItem lifecycle · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A3 후보: import verifier 설계(서버 JSONL/SimpleMem export → AuthoritativeEventStore.readAll() parity, manifest hash 알고리즘 상세).
- A4 후보: cutover runbook(S0→S4 운영 절차 + epoch quarantine 판정 의사코드).
- Phase 1 코드(별도 overseer 승인 후): OPFS adapter가 `AuthoritativeEventStore` 구현, flag 뒤 shadow.

## 검증
- inspect-first: `useDgxEventSyncController.ts`(seam 단일 지점 + 4 소비자), `stage29LocalEventStore.ts:5-12`(현 인터페이스).
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The local authoritative store seam is now specified as a concrete, adapter-agnostic interface contract separating durable authority from the sync outbox. 이 문서는 *계약 설계* 완료를 뜻하며, durable adapter가 구현되었거나 store가 분리 배선되었다는 주장이 아니다. 실제 어댑터·재배선·epoch 발급은 전부 overseer 승인 후 Phase 1+ 코드 작업이다.
```text
A2 seam contract done (design only). no code/schema changed. STOP.
```
