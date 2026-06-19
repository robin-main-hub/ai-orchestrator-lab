# A9 ReplicaOutbox — Persistence Format & Recovery Spec (design only)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음. outbox 어댑터 구현 아님.**
> **선행**: A1 `docs/158`(store⟂outbox 분리), A2 `docs/159`(`ReplicaOutbox` 계약: enqueue/listPending/markReplicated), A6 `docs/163`(Phase 1 테스트), A8 `docs/165`(`AuthoritativeEventStore` 파일 포맷 — 본 문서는 그 짝).
> **목표**: A2가 *계약*만 정한 `ReplicaOutbox`의 **영속 포맷·복구 규약**을 못 박는다. A8이 authoritative store(권위 데이터)를 명세했으니, A9는 그 짝인 outbox(전송 상태)를 명세한다. 핵심은 outbox가 **이벤트 페이로드를 복제 저장하지 않고 참조(eventId)+전송 상태만** 들고, 손실 시 authoritative store에서 재유도된다는 점. **포맷 설계이지 구현이 아니다.**

## 한 줄 요약
The ReplicaOutbox persists only event-id references plus per-target replication state (never event payloads), so it can use localStorage, shrinks the secret-redaction surface to zero, and is fully rebuildable from the authoritative store after loss.

## 실측: 현재 혼합 구조 (정본) — 무엇을 가르나
현 단일 store는 권위와 전송 상태를 **한 레코드에 혼합**한다.
- `StoredClientCachedEvent = { event: EventEnvelope; projectedTo: Partial<Record<ProjectionTarget,string>> }` (`stage29LocalEventStore.ts:21-24`). 한 레코드가 (i) event 페이로드(권위) + (ii) `projectedTo`(target→전송시각, 전송 상태)를 동시에 보유.
- `listUnsynced()`는 `!record.projectedTo["dgx-02"]` 필터(`:71-76`) = "아직 전송 안 됨" 판정. `markProjected`는 `projectedTo[target]=ISO시각` 기록(`:77-93`).
- dedup은 `event.id` 키로 `projectedTo` 맵을 **병합**(`:198-224`) — 멱등성 precedent.
- 페이로드가 localStorage에 들어가므로 **비밀 redaction**(`:97-158`)이 필요했다.
- A2 분리: `projectedTo`의 전송-상태 부분만 `ReplicaOutbox`로, `event` 권위 부분은 `AuthoritativeEventStore`(A8)로.

## ReplicaOutbox 영속 포맷 (참조 + 전송 상태만)
```text
저장 키: "ai-orchestrator:replica-outbox:<clientId>"  (현 단일 localStorage 키 패턴 계승)
ReplicaOutboxState = {
  version: 1,
  clientId: string,
  entries: ReplicaOutboxEntry[]
}
ReplicaOutboxEntry = {
  eventId: string,                              # 참조만 — 페이로드 복제 없음
  replicatedTo: Partial<Record<ReplicaTarget,string>>,  # target→전송완료 ISO시각 (현 projectedTo 계승, 의미 재정의)
  enqueuedAt: string
}
ReplicaTarget = "dgx-02"   # A2: "authority projection"→"replica push"로 의미 재정의 (flip 후)
```
**불변식(A2)**:
- entries는 **eventId만** 보유 → 페이로드 0 → **비밀 redaction 불필요**(저장면에 민감 데이터 부재). A8 authoritative store가 페이로드 redaction 책임을 단독 보유.
- `markReplicated(ids,target)` = 해당 entry `replicatedTo[target]=now`. dedup은 eventId 키로 `replicatedTo` 맵 병합(현 `mergeCachedEventRecords` 패턴 계승).
- outbox 비움/손상이 **권위 데이터에 영향 0**(A2: 전송≠확정).

## 메서드 → 영속 연산 매핑 (A2 계약)
| A2 메서드 | 영속 연산 | 비고 |
| --- | --- | --- |
| `enqueue(eventId)` | entry 없으면 `{eventId, replicatedTo:{}, enqueuedAt:now}` 추가 | 멱등: 이미 있으면 no-op |
| `listPending()` | `entries.filter(e => !e.replicatedTo["dgx-02"])` 의 eventId | 현 `listUnsynced` 판정 계승(페이로드 대신 id) |
| `markReplicated(ids,target)` | 매칭 entry `replicatedTo[target]=now` | 현 `markProjected` 계승, 의미=replica push |

## 복구 규약 (손실 시 authoritative store에서 재유도)
outbox는 **재구축 가능 캐시**라 durable 등급이 authoritative store보다 낮아도 된다(A2: localStorage 허용).
```text
손실/clear/손상 감지: parse 실패 또는 키 부재 → 빈 outbox로 시작.
재유도(rebuild):
  pending = AuthoritativeEventStore.readAll().ids  −  {이미 replica 확정 알려진 ids}
  "이미 확정"의 권위 출처:
    (a) DGX replica가 확인응답한 last-known set(서버 dedup/idempotencyKey로 안전, A0), 또는
    (b) 불확실하면 전부 pending으로 두고 재전송 — idempotencyKey(clientId:sessionId:eventIds, stage14EventSync.ts:56)
        + 서버 dedup이 **중복 확정을 만들지 않음**(A0/A4). 즉 over-send는 안전, under-send만 위험.
원칙: outbox 손실의 안전한 기본값 = "전부 미전송 가정 후 재전송"(over-send). 멱등성이 손실을 흡수.
NEVER: outbox 손실을 "전송 완료"로 가정(under-send=projection 누락 위험).
```
근거: A8 authoritative store가 진짜 권위라 outbox는 언제든 그로부터 재구성 가능 → outbox durable 등급을 낮춰도 손실 0.

## durable 등급 (A2 재확인, 포맷 관점)
| backend | ReplicaOutbox 적격? | 근거 |
| --- | --- | --- |
| localStorage | **적격**(권장) | 재유도 가능하므로 clear 소실 허용. 동기 get/set 단순. 페이로드 없어 용량 작음. |
| IndexedDB | 적격(대용량 시) | entries 많을 때. 그러나 localStorage로 충분(id만). |
| OPFS | 과함 | authoritative store(A8) 전용으로 충분. outbox엔 불필요. |

## 결정론·테스트 연결 (A6)
- `listPending()` 출력 = enqueue 순서 안정 정렬(`enqueuedAt`,`eventId`) → 결정론적.
- A6 적용: P0-2(sync state 전이 보존), 그리고 outbox 멱등(`enqueue` 두 번=한 entry), `markReplicated` 후 pending 제외 = 현 `stage29LocalEventStore.test.ts:42-51,122-130` 케이스를 id-기반으로 이식.
- 복구 테스트(신규): outbox clear 후 rebuild → pending이 authoritative readAll과 일치(over-send 안전성), in-memory fake로 검증.

## 보안 부수효과 (명시)
페이로드를 outbox에서 제거하면 **비밀 노출면이 줄어든다**: 현재는 outbox localStorage에 redact된 페이로드가 남지만(`:70-104` 테스트), A9 분리 후 outbox엔 eventId만 → redaction 대상 0. 페이로드 redaction은 A8 authoritative store 한 곳으로 집중(책임 단일화).

## non-goal (이번 A9)
```text
no outbox/store 어댑터 구현 (Phase 1) · no useDgxEventSyncController 재배선
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A10 후보: useDgxEventSyncController 재배선 설계(현 4-메서드 호출부 → AuthoritativeEventStore+ReplicaOutbox 두 계약 주입 매핑, Phase 1 slot-in 절차), 또는 phone pending-intent 레코드 포맷(A5 gap, flip-gated).
- Phase 1 코드(overseer 승인 후): localStorage ReplicaOutbox 어댑터 + OPFS AuthoritativeEventStore(A8) 동시 구현.

## 검증
- inspect-first: `stage29LocalEventStore.ts:21-24`(혼합 레코드), `:71-93`(listUnsynced/markProjected), `:198-224`(eventId dedup+merge), `:97-158`(redaction). `stage14EventSync.ts:56`(idempotencyKey 재전송 안전). A2 계약·A8 짝 참조.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The ReplicaOutbox persists only event-id references plus per-target replication state, so it can use localStorage, has zero secret-redaction surface, and is rebuildable from the authoritative store after loss. 이 문서는 *영속 포맷·복구 설계* 완료를 뜻하며, outbox 어댑터가 구현되었거나 재배선되었다는 주장이 아니다. 실제 어댑터·재배선은 overseer 승인 후 Phase 1 작업이다.
```text
A9 ReplicaOutbox persistence spec done (design only). id-only refs, rebuildable, no code. STOP.
```
