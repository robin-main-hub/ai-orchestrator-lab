# A15 Phase 2 Legacy Import — Execution Runbook (design only)

> **상태**: 설계·문서 전용 (design only). **코드/import 실행/protocol/schema/migration/EventStorage 동작 변경 없음. import 절차 설계이지 import 실행이 아니다.**
> **선행**: A3 `docs/160`(verifier 알고리즘 + 불변식 I1~I6 + manifest 스키마), A4 `docs/161`(cutover runbook S0→S4 — *flip*용, 본 문서와 구분), A7 `docs/164`(Phase 0~2는 부작용 없어 승인 후 안전 착수), A8 `docs/165`(target AuthoritativeEventStore 포맷), A14 `docs/171`(parity 리포트 스키마).
> **목표**: A3가 *검증 알고리즘*을 고정했다면, A15는 그 verifier를 실제로 돌리는 **운영 절차서**다. 기존 DGX JSONL(+SimpleMem export)을 MacBook `AuthoritativeEventStore`로 옮기는 단계를 dry-run→실 import→manifest GO 게이트→rollback 순서로 못 박는다. **이건 A4(flip cutover)와 다르다** — Phase 2 import는 부작용 없는 data 이행(authority 전환 아님, A7에서 "승인 후 안전 착수" 분류). **절차 설계이지 import 실행이 아니다.**

## 한 줄 요약
Phase 2 import is run as a four-stage operational procedure — preflight, dry-run parity, idempotent real append, manifest GO gate — where the source is never mutated and any invariant failure rolls back to a no-op, all gated on A3's deterministic verifier.

## A4와의 구분 (혼동 방지, 정본)
```text
A4 cutover runbook (docs/161)  = authority FLIP 절차(S0→S4, epoch-bump, DGX→MacBook 권위 전환). Phase 3~4, HARD GATE.
A15 import runbook (본 문서)    = legacy DATA 이행 절차(JSONL→MacBook store, 부작용 0). Phase 2, 승인 후 안전.
관계: import(A15)이 cutover(A4)보다 먼저. import은 권위를 안 옮긴다 — MacBook store에 legacy 이벤트를 채울 뿐(epoch=0).
      여전히 DGX가 durable authority(A0). flip은 별도(A4, overseer gate).
```

## 단계 0 — Preflight (착수 전 게이트)
```text
[ ] target AuthoritativeEventStore 어댑터 구현·머지됨(A8/A13 Phase 1 완료). 없으면 import 대상 없음 → HOLD.
[ ] source 스냅샷 고정: data/events/events.jsonl + 로테이션 세그먼트(events.<ms>.jsonl) 전부.
      sourceFileSha256 기록(A3 manifest). 스냅샷 후 source는 read-only 취급(import 중 추가 write 금지).
[ ] SimpleMem export(있으면) EventEnvelope로 결정론적 정규화 가능 확인. 불가 → HOLD(A3).
[ ] target store 초기 상태 기록: head()/readAll().length (사후 비교 기준).
[ ] 디스크 여유 확인: OPFS 쓰기 가능 + 세그먼트 로테이션 여유(A8 64MB/16).
전제: 이 단계는 read-only. 어떤 append도 안 함.
```

## 단계 1 — Dry-run Parity (실 append 없이 검증)
```text
목적: 실제 쓰기 전에 A3 verifier를 dry-run으로 돌려 GO 가능 여부를 먼저 본다.
1. source JSONL 전 라인 parseEventStorageRecord → 분류(valid/rejected). rejected는 lineNo+reason 기록(은폐 금지, A3).
2. normalize(event): legacyId=event.id, epoch=0, localSeq=(createdAt,id) 사전식 순번(A3 결정론).
3. dry-run import set 구성(실제 store.append 호출 0 — 메모리상 예측 set).
4. A14 ShadowParityReport 동형 산출:
     source set verifierHash vs (현 target legacy 부분) verifierHash.
     불변식 I1~I6 예측 + diffs 분류(missing/fingerprint_mismatch/duplicate).
5. verdict 산출:
     conflict(same_id_different_payload) > 0  → HOLD(예상 외, GO 차단).
     I1~I5 예측 fail               → HOLD(원인 manifest 기록).
     전부 pass                     → 단계 2 진행 가능.
산출물: dry-run manifest(invariants 예측 + verifierHash). 아직 데이터 미변경.
```

## 단계 2 — Real Import (멱등 append)
```text
전제: 단계 1 dry-run이 GO. target store는 append-only·idempotent(A2/A8 contains→skip).
for each event in sourceEvents (localSeq 순):
  if target.contains(event.id):
    if fingerprintEvent(target.read(id)) == sourceFingerprint[id]: duplicateCount++   // I3/I6 멱등
    else: conflictCount++  // 예상 외 — 즉시 중단 + rollback(단계 3)
  else:
    target.append(event); importedCount++
    # append 후 flush()까지가 durable 확정점(A8). flush 실패 → 미확정으로 간주, 재시도 안전(멱등).
재실행 안전: 중단 후 재실행해도 contains→duplicate로 흡수(over-import 무해, A3 I6).
            under-import(누락)은 단계 3 parity가 잡음.
```

## 단계 3 — Manifest GO 게이트 (사후 검증)
```text
import 후 A3 verifier를 실측 target에 대해 재실행(dry-run 아님):
  targetLegacy = target.readAll() 중 epoch==0 부분.
  I1 (no loss)     : ∀ sourceById.key ∈ targetLegacy.ids  OR  rejected에 기록.
  I2 (no mutation) : ∀ id: fingerprintEvent(targetLegacy[id]) == sourceFingerprint[id].
  I3 (no dup)      : targetLegacy에 같은 id 2회 없음.
  I4 (accounted)   : totalRecords == importedCount + duplicateCount + rejectedCount.
  I5 (deterministic): verifierHash 재계산 동일.
  I6 (idempotent)  : 한 번 더 import 시도 → 신규 0, verifierHash 불변.
manifest 기록(A3 스키마): sourcePath/Sha256, count들, rejected[], epochAssigned=0,
  localSeqRange, startedAt/finishedAt, verifierHash, invariants{I1..I6: pass|fail}.
GO  : conflictCount==0 AND invariants 전부 pass AND I4 등식 성립 AND verifierHash 일치.
       → import 확정(legacy 이벤트가 MacBook store에 안착, 여전히 DGX authority).
HOLD: 하나라도 fail → 단계 R rollback. manifest에 실패 불변식 정직 기록.
```

## 단계 R — Rollback (실패 시 no-op 복귀)
```text
원칙: source는 단 한 번도 변경 안 됨(A3) → rollback = target의 import분만 무효화.
방법(택1, 부작용 없는 쪽):
  (a) import을 별도 epoch 네임스페이스/세그먼트에 격리 append했으면 → 해당 세그먼트 폐기(legacy 부분만).
  (b) 격리 안 했으면 → target store를 단계 0 스냅샷(readAll().length 기준)으로 재구성.
검증: rollback 후 target.readAll() == 단계 0 초기 상태(verifierHash 동일).
멱등: rollback 자체도 재실행 안전(이미 제거된 것 재제거=no-op).
주의: rollback은 DGX source를 절대 건드리지 않음 — authority(DGX)는 import/rollback과 무관하게 불변.
```

## 안전 경계 재확인 (이 runbook이 넘지 않는 선)
```text
- authority FLIP 아님: import은 epoch=0 legacy 데이터를 MacBook store에 채울 뿐. durable authority=DGX 유지(A0).
  MacBook authoritative 승격은 A4 cutover(Phase 3~4, overseer gate)에서 별도로.
- source 불변: DGX JSONL은 read-only 스냅샷. import/rollback이 원본을 변경 0.
- protocol/schema/migration 무변경: EventEnvelope 형식 그대로, 서버 동작 무관.
- no real network/secret/DB: import은 로컬 JSONL→OPFS. 외부 전송·DB write·러너 0.
- 본 문서는 import을 실행하지 않음 — 절차·게이트만 고정. 실 import은 overseer 승인 후 Phase 2 코드.
```

## non-goal (이번 A15)
```text
no import 실행 / no verifier 구현 / no append 코드 (Phase 2 = overseer 승인 후)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip(A4 cutover) · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A16 후보: epoch quarantine 판정 의사코드 상세(A4 보강 — stale/future epoch 격리 규칙 구체화), 또는 Phase 1 어댑터 단위테스트 케이스 상세(A6 P1-* 구체화).
- Phase 2 코드(overseer 승인 후): verifier 구현 + 본 runbook대로 dry-run→실 import 도구.

## 검증
- inspect-first: A3 `docs/160`(verifier 알고리즘·manifest·I1~I6), A4 `docs/161`(구분되는 cutover), A8 `docs/165`(target store readAll/contains/append/flush), A14 `docs/171`(parity 리포트 동형). `apps/server/src/index.ts:7494-7511`(fingerprintEvent), `:827-831`(record), `:7320-7322`(parse) 재인용. 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
Phase 2 import is specified as a four-stage operational procedure — preflight, dry-run parity, idempotent real append, manifest GO gate — with a no-op rollback and an unmodified source, all gated on A3's deterministic verifier. 이 문서는 *import 운영 절차 설계* 완료를 뜻하며, import가 실행되었거나 verifier가 구현되었다는 주장이 아니다. 실제 도구·실행은 overseer 승인 후 Phase 2 코드이고, 이 단계는 authority flip이 아니다(import은 epoch=0 data 이행, 여전히 DGX durable authority).
```text
A15 phase 2 import execution runbook done (design only). preflight→dry-run→idempotent append→manifest GO gate, no-op rollback, source immutable. not a flip. no code. STOP.
```
