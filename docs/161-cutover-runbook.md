# A4 MacBook Authority Cutover Runbook (design only)

> **상태**: 설계·문서 전용 (design only / 운영 절차서). **코드/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 cutover 실행 아님.**
> **선행**: A0 `docs/157`, A1 `docs/158`(cutover state machine S0→S4 + split-brain), A2 `docs/159`(store 계약), A3 `docs/160`(import verifier).
> **목표**: A1의 단일 atomic cutover state machine(S0→S4)을 **실행 가능한 운영 절차서**로 구체화한다. 각 상태의 진입 조건·검증·드레인·epoch quarantine 판정·ROLLBACK을 의사코드로 못 박는다. **이 문서는 절차 설계이며, cutover를 수행하지 않는다(수행은 overseer 결정 + Phase 4 코드).**

## 한 줄 요약
The MacBook authority cutover is now a step-by-step runbook with explicit drain gates, epoch quarantine logic, and rollback at every state.

## 실측: 절차가 의존하는 기존 신호 (정본)
runbook은 새 메커니즘을 발명하지 않고 현재 sync 신호를 게이트로 쓴다.
- **outbox 상태**: `Stage14EventSyncState{ status: "synced"|"syncing"|"queued"|"failed", outboxCount }` (`apps/desktop/src/runtime/stage14EventSync.ts:10-18`). `status=="synced" && outboxCount==0` = 드레인 완료 신호.
- **멱등 재전송 안전**: push 요청은 `idempotencyKey = "${clientId}:${sessionId}:${eventIds}"` (`:56`) + 서버 dedup(fingerprint/logical key, A0). → 드레인 재시도가 중복 확정을 만들지 않음.
- **서버 revision**: 현재 `serverRevision`(서버 발급). cutover 후 MacBook epoch/revision으로 교체(Phase 3). runbook은 cutover 직전 마지막 `serverRevision`을 baseline으로 기록.
- **import 검증**: A3 verifier(verifierHash + 불변식 I1~I6).

## state machine 운영 절차 (S0→S4, 의사코드)
A1의 상태를 절차로 전개. **DUAL_AUTHORITY 상태는 존재하지 않는다**(단일 atomic flip).

### S0 LEGACY (현행, 진입=기본)
```text
조건: DGX=authority(현행). MacBook AuthoritativeEventStore 미존재 또는 비활성.
점검: 정상 운영. 백업 가능 상태 확인(legacy JSONL read-only 복제본 확보).
다음: S1로 진입하려면 overseer GO + Phase 1(adapter)·Phase 2(import) 코드 머지 완료.
```

### S1 SHADOW_IMPORT (MacBook store를 import로 구축, authority 아님)
```text
조건: AuthoritativeEventStore(OPFS/IndexedDB) 활성, 단 SHADOW(읽기/검증 전용).
절차:
  1. legacy JSONL 스냅샷 freeze: sourceFileSha256 기록(이후 변경 감지).
  2. A3 verifier로 dry-run import → manifest 생성.
  3. SimpleMem export 정규화(불가 시 HOLD).
검증: manifest.invariants I1..I6 == pass, conflictCount==0.
실패: → S_ROLLBACK(원본 무변경).
주의: 이 동안 DGX가 여전히 authority. MacBook store는 write를 authoritative로 확정하지 않음.
```

### S2 VERIFY (parity 검증 + reconcile)
```text
절차:
  1. verifierHash(target legacy set) 재계산 == manifest.verifierHash.
  2. count parity: totalRecords == imported+duplicate+rejected.
  3. live drift 점검: S1 freeze 이후 DGX에 새 이벤트가 append됐는지(serverRevision 증가?).
     - 증가 → 증분 import(같은 verifier로) 후 재검증. (cutover 직전 0 drift까지 반복)
검증 GO: parity 성립 AND live drift==0(또는 증분 흡수 완료).
실패: → S_ROLLBACK.
```

### S3 CUTOVER (atomic — 단일 시점 flip)
```text
PRE-DRAIN GATE(필수):
  - 모든 client outbox 드레인: Stage14 status=="synced" && outboxCount==0 (stage14EventSync.ts:10-18).
  - in-flight pending intent(phone/home) 드레인 또는 보류 표시.
  - 멱등 재전송으로 잔여 흡수(idempotencyKey 보장, :56).
  - drain 미완 → CUTOVER 진입 금지(HOLD).
ATOMIC FLIP(중첩 window 없음):
  t0: DGX를 read-only freeze(authoritative append 일시 정지).
  t1: epoch += 1. MacBook = authority(이 epoch 보유 유일 노드). DGX = replica/projection.
  t2: outbox 의미 전환 = "DGX replica push 큐"(A2 ReplicaOutbox).
  t3: conflict policy 명세 = macbook_authority_wins(코드 반영은 Phase 3/4).
원자성 근거: epoch bump가 단일 분기점. t0~t3 사이 어떤 노드도 두 번째 authoritative revision 발급 불가.
실패(중간 단절): → S_ROLLBACK(epoch bump 미완이면 자동, 완료면 명시 rollback).
```

### S4 POST_CUTOVER (정상 운영, DGX projection-only)
```text
조건: MacBook=authority, DGX=replica/projection.
절차:
  1. legacy JSONL read-only 봉인(삭제 금지, 영구 보존).
  2. DGX는 MacBook authoritative 이벤트(epoch+revision)만 replica 수신.
  3. phone/home = projection 열람 + pending intent 제출(authoritative 확정은 MacBook).
가역성: S4 봉인 전까지 rollback 가능. 봉인 후엔 정식 운영(rollback=새 마이그레이션 결정).
```

### S_ROLLBACK (어느 상태에서든)
```text
절차:
  - MacBook authority 주장 폐기(epoch 폐기).
  - DGX가 untouched legacy JSONL로 authority 재개(S0 복귀).
  - 데이터 손실 0: 원본 무변경(A1 불변식 "migration 전 원본 삭제 금지").
멱등: rollback 재실행 안전.
```

## epoch quarantine 판정 (split-brain 방지, 의사코드)
```text
INPUT: incoming event e (from any node), localAuthority = { epoch: E, revision: R }
DECIDE:
  if e.epoch == E:
     accept (정상 — 같은 authority generation)
  elif e.epoch < E:
     quarantine(e, reason="stale_epoch")     # 구 generation write — 보존+격리(drop 아님)
  else:  # e.epoch > E
     quarantine(e, reason="unknown_future_epoch")  # 미지의 상위 generation — 보존, overseer 검토
NEVER: stale/future epoch 이벤트를 authoritative로 승격.
NEVER: quarantine된 이벤트를 silent drop(보존+가시화 — 은폐 금지).
근거(A1): 현 epoch 보유 노드 유일. 다른 epoch write는 거부가 아니라 quarantine(손실 0).
```

## 드레인 게이트 체크리스트 (CUTOVER 직전, 운영자용)
```text
[ ] 모든 client Stage14 status == "synced", outboxCount == 0
[ ] pending intent(phone/home) 0 또는 명시 보류
[ ] live drift == 0 (S1 freeze 이후 DGX 신규 append 흡수 완료)
[ ] A3 verifierHash 재계산 일치
[ ] legacy JSONL read-only 복제본 확보(rollback 대비)
[ ] SimpleMem export 정규화 완료(또는 HOLD)
하나라도 미충족 → CUTOVER HOLD.
```

## non-goal (이번 A4)
```text
no cutover 실행 / no epoch bump / no DGX freeze (전부 Phase 4 운영 결정)
no AuthoritativeEventStore 구현(Phase 1) · no import 실행(Phase 2) · no epoch 발급 코드(Phase 3)
no protocol/schema/migration 변경 · no EventStorage 동작 변경
no authority flip · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A5 후보: offline/reconnect/phone operational truth 검증 설계(실제 offline 동작이 A1 target과 일치하는지 inspect 기준).
- phase별 상세 test plan(각 state 전이의 테스트 케이스 매트릭스).
- Phase 1+ 코드: overseer 승인 후 adapter/import/epoch/cutover 구현.

## 검증
- inspect-first: `apps/desktop/src/runtime/stage14EventSync.ts:10-18`(sync state), `:45-58`(idempotencyKey/push request). A1 state machine·A3 verifier 참조.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The MacBook authority cutover is now a step-by-step runbook with explicit drain gates, epoch quarantine logic, and rollback at every state. 이 문서는 *운영 절차 설계* 완료를 뜻하며, cutover가 수행되었거나 epoch가 bump되었다는 주장이 아니다. 실제 드레인·freeze·flip·봉인은 전부 overseer 결정 + Phase 4 코드 작업이다.
```text
A4 cutover runbook done (design only). no code/schema changed. no cutover performed. STOP.
```
