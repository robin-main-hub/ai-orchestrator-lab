# A6 Authority Migration Test Plan Matrix (design only)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님.**
> **선행**: A0 `docs/157`, A1 `docs/158`(Phase 0~5 + cutover S0→S4), A2 `docs/159`(store 계약), A3 `docs/160`(verifier I1~I6), A4 `docs/161`(runbook + epoch quarantine), A5 `docs/162`(operational truth).
> **목표**: A1의 Phase 0~5 / cutover state machine / A3 불변식 / A4 epoch quarantine을 **phase별·불변식별 테스트 케이스 매트릭스**로 못 박는다. 각 Phase 코드가 머지되기 위해 *어떤 테스트가 무엇을 증명해야 하는지*를 결정론적으로 명세한다. **테스트 명세 설계이지 테스트 구현이 아니다.**

## 한 줄 요약
Each migration phase now has an explicit test-case matrix tying A2 contracts, A3 invariants, and A4 epoch quarantine to concrete vitest assertions — specifying what must pass before any phase code merges.

## 실측: 재사용할 기존 테스트 토대 (정본)
새 테스트 프레임워크를 도입하지 않는다. 현 vitest 패턴을 그대로 쓴다.
- **프레임워크**: vitest (`import { describe, expect, it } from "vitest"`). async store 테스트는 `await store.append(...)` 패턴 — `stage29LocalEventStore.test.ts:31-141`이 정본 예시.
- **in-memory storage adapter 패턴**: `Map<string,string>`를 `getItem/setItem/removeItem`로 감싼 어댑터(`stage29LocalEventStore.test.ts:53-68`) — durable backend 없이 계약 동작을 단위 테스트하는 기존 방식. OPFS/IndexedDB 어댑터 테스트도 동일하게 in-memory fake로 시작.
- **sync state 테스트 토대**: `stage14EventSync.test.ts`(드레인 상태 전이), `stage34ApprovalServer.test.ts`(승인 경로).
- **결정론 toolkit**: A3 `fingerprintEvent=stableStringify`(`apps/server/src/index.ts:7494-7511`) — verifierHash 테스트의 oracle.
- **no real network 원칙**(루프 안전 경계): 모든 케이스는 fake adapter / in-memory / 결정론적 fixture. real fetch/DB write/runner dispatch 없음.

## Phase별 테스트 매트릭스 (A1 Phase 0~5)
각 Phase는 아래 케이스가 **전부 green**이어야 머지(GO). 코드는 overseer 승인 후.

### Phase 0 — Baseline freeze (코드 0, 회귀 가드)
| TC | 케이스 | 증명 | assert(개략) |
| --- | --- | --- | --- |
| P0-1 | 현 `LocalClientEventCache` 4메서드 회귀 | A2 매핑 전 동작 보존 | 기존 `stage29` 테스트 전부 green 유지 |
| P0-2 | 현 sync state 전이 보존 | A4 드레인 게이트 신호 안정 | `status` 전이 `queued→syncing→synced` 불변 |

### Phase 1 — AuthoritativeEventStore adapter (shadow, authority 아님)
| TC | 케이스 | 증명(계약/불변식) | assert |
| --- | --- | --- | --- |
| P1-1 | append-only: 기존 레코드 변경/삭제 API 부재 | A2 불변식 | 계약에 `update`/`delete` 메서드 없음(타입 레벨) |
| P1-2 | idempotent append: 동일 id 재-append = no-op | A2 / I3 | `append(e); append(e)` 후 `readAll().length==1` |
| P1-3 | `head()` 단조: revision 감소 없음 | A2 불변식 | 연속 append 후 `head().count` 단조 증가 |
| P1-4 | `contains(id)` 정확성 | A2(import 판정용) | 존재=true, 미존재=false |
| P1-5 | durable backend: clear 견딤(fake OPFS/IndexedDB) | A2 durable 불변식 | adapter 재생성 후 `readAll()` 보존 |
| P1-6 | localStorage backend 거부 | A2(localStorage 부적격) | localStorage adapter는 AuthoritativeStore로 주입 불가(가드/타입) |
| P1-7 | shadow 격리: Phase1 store가 authority 주장 안 함 | A1(shadow) | DGX 여전히 authority — flip 신호 0 |

### Phase 2 — Import + verifier (멱등 parity)
| TC | 케이스 | 증명(I1~I6) | assert |
| --- | --- | --- | --- |
| P2-1 | no loss: 원본 모든 유효 이벤트 target 존재 | I1 | `sourceById.keys ⊆ targetSet.ids ∪ rejected` |
| P2-2 | no mutation: canonical fingerprint 일치 | I2 | `fingerprintEvent(target[id])==sourceById[id]` |
| P2-3 | no dup: 같은 id 두 번 없음 | I3 | `targetSet.ids` 고유 |
| P2-4 | accounted: count 등식 | I4 | `total==imported+duplicate+rejected` |
| P2-5 | deterministic verifierHash | I5 | 재계산 `verifierHash` 동일(순서·플랫폼 무관) |
| P2-6 | idempotent re-import | I6 | 2회차 import 신규 0·전부 duplicate·hash 불변 |
| P2-7 | 손상 줄 → rejected 가시화(silent drop 금지) | A3 | `parseEventStorageRecord` undefined → `rejected[]`에 lineNo/reason |
| P2-8 | same_id_different_payload → conflict(GO 차단) | A3 | conflict>0이면 manifest GO=false |
| P2-9 | SimpleMem 비결정론 export → HOLD | A3 | 정규화 실패 시 import 중단·HOLD 신호 |
| P2-10 | verifierHash가 storedAt/revision 무관 | A3 규약 | 두 메타만 다른 동일 event set → 동일 hash |

### Phase 3 — epoch/revision 발급 (**HOLD gate — overseer 승인 전 테스트만 설계, 구현 금지**)
| TC | 케이스 | 증명 | assert |
| --- | --- | --- | --- |
| P3-1 | event-id 형식 `macbook:epoch:seq:uuid` | A1 | 파서가 4-튜플 분해, seq 단조 |
| P3-2 | epoch quarantine: `e.epoch==E` accept | A4 | 정상 generation 승인 |
| P3-3 | `e.epoch<E` → quarantine(stale, drop 아님) | A4 | quarantine 보존·가시화, authoritative 승격 0 |
| P3-4 | `e.epoch>E` → quarantine(unknown_future) | A4 | 보존·overseer 검토 표식 |
| P3-5 | NEVER silent drop | A4 | quarantine 집합이 입력 epoch-mismatch 전부 포함 |
| P3-6 | 두 번째 authoritative revision 발급 불가(단일 epoch 보유) | A1 원자성 | 동시 두 노드 발급 시도 → 하나만 authoritative |

### Phase 4 — cutover 실행 (**HOLD gate — overseer 결정 + 드레인 후만**)
| TC | 케이스 | 증명(S0→S4) | assert |
| --- | --- | --- | --- |
| P4-1 | PRE-DRAIN GATE: `status=="synced"&&outboxCount==0` 아니면 CUTOVER 진입 금지 | A4 | drain 미완 → flip 차단(HOLD) |
| P4-2 | 멱등 재전송: idempotencyKey 잔여 흡수, 중복 확정 0 | A4 / A0 dedup | 재-push 후 target 중복 0 |
| P4-3 | atomic flip: DUAL_AUTHORITY window 부재 | A1/A4 | epoch bump 전후 authority 노드 정확히 1 |
| P4-4 | live drift 흡수: S1 freeze 이후 신규 append 증분 import | A4 S2 | drift>0 → 증분 후 재검증, GO는 drift==0 |
| P4-5 | S_ROLLBACK 무손실: 원본 JSONL 무변경 | A4 | rollback 후 legacy set fingerprint 불변 |
| P4-6 | rollback 멱등: 재실행 안전 | A4 | 2회 rollback 동일 상태 |

### Phase 5 — phone pending-intent → authoritative 변환 (**flip 후만, A5 gap**)
| TC | 케이스 | 증명(A5) | assert |
| --- | --- | --- | --- |
| P5-1 | phone이 pending-intent 제출(authoritative 직행 아님) | A5 | mobile write가 intent 레코드, 즉시 authoritative 확정 0 |
| P5-2 | MacBook이 intent→authoritative 변환자 | A1/A5 | 변환 후에만 epoch+revision 부여 |
| P5-3 | DGX는 projection/replica만(승인 author 금지) | A1 | server-owned author 경로 제거(flip 후) |
| P5-4 | intent 손실 0(드레인/재연결) | A5 | offline intent도 재연결 시 변환 큐 유지 |

## cutover state 전이 테스트 (S0→S4, 상태 머신)
| 전이 | 진입 조건 테스트 | 실패 경로 테스트 |
| --- | --- | --- |
| S0→S1 | overseer GO + Phase1/2 머지 플래그 | 미충족 시 S0 유지 |
| S1→S2 | manifest I1~I6 pass, conflict==0 | 실패 → S_ROLLBACK(원본 무변경) |
| S2→S3 | parity 성립 + live drift==0 | drift>0 → S2 잔류(증분 반복) |
| S3→S4 | PRE-DRAIN GATE 통과 + atomic epoch bump | drain 미완/단절 → S_ROLLBACK |
| any→S_ROLLBACK | 어느 상태서든 호출 가능 | rollback 후 S0 복귀·손실 0 |

## 안티-회귀 가드 (operational truth 보존, A5)
이미 일치하는 축이 **flip 작업 중 깨지지 않음**을 가드한다.
| TC | 케이스 | 근거 |
| --- | --- | --- |
| G-1 | offline append: full POST 실패 시 `status:"queued"` 보존 | A5 offline ✅ |
| G-2 | 로컬 확정 후 push 순서 보존(`append`→push) | A5 / `useDgxEventSyncController` |
| G-3 | reconnect drain 멱등(idempotencyKey) 보존 | A5 drain ✅ |
| G-4 | 부분 동기 → `status:"failed"` conflict review 보존 | A5 / `stage14EventSync` |

## non-goal (이번 A6)
```text
no 테스트 구현 / no 코드 / no Phase 1+ 착수 (전부 overseer 승인 후)
no protocol/schema/migration 변경 · no EventStorage 동작 변경
no authority flip · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A7 후보: A-series 종합 ledger(A0~A6 한 장부 + 최종 GO/HOLD 매트릭스 + overseer 결정 대기 항목 명시).
- Phase 0+ 테스트/코드: overseer 승인 후 본 매트릭스대로 구현.

## 검증
- inspect-first: `stage29LocalEventStore.test.ts:31-141`(vitest async store + in-memory adapter 패턴), `stage14EventSync.test.ts`(드레인 상태), `apps/server/src/index.ts:7494-7511`(fingerprint oracle). A1~A5 설계 참조.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
Each migration phase now has an explicit test-case matrix tying A2 contracts, A3 invariants, and A4 epoch quarantine to concrete vitest assertions. 이 문서는 *테스트 명세 설계* 완료를 뜻하며, 테스트가 작성되었거나 Phase 코드가 구현되었다는 주장이 아니다. Phase 3/4/5는 overseer 결정 게이트라 매트릭스만 고정하고 구현은 HOLD.
```text
A6 test plan matrix done (design only). no tests/code written. Phase3+ HOLD-gated. STOP.
```
