# A21 Phase 2 Import Verifier — Test Cases (design only)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님.**
> **선행**: A6 `docs/163`(P2-1~P2-10 *한 줄* 케이스), A3 `docs/160`(verifier 알고리즘 + 불변식 I1~I6 + manifest GO 조건), A15 `docs/172`(import 실행 runbook 4단계 + dry-run parity), A18 `docs/175`·A19·A20(Phase 1 테스트 트랙 — 본 문서가 Phase 2로 잇는다).
> **목표**: A6가 매트릭스에서 P2-* 케이스를 *한 줄씩만* 적었다. A21은 그 import verifier(I1~I6 + manifest GO/HOLD)를 **given/when/then + 결정론 fixture + 정확한 assertion**으로 구체화해 *바로 구현 가능한* 명세로 만든다. verifier는 순수 함수(legacy set + target set → manifest)라 테스트가 부작용 0 — Phase 2 import *실행*은 overseer 승인 후지만, **검증 로직 테스트 케이스 설계는 non-gated**(A7: Phase 0~2 부작용 없음). **테스트 명세 설계이지 테스트 구현이 아니다.**

## 한 줄 요약
The import verifier is now specified as given/when/then tests over deterministic legacy/target fixtures — each A3 invariant I1~I6, the GO/HOLD manifest decision, corruption visibility, and conflict detection turned into concrete assertions the verifier implementation must satisfy.

## 실측: 재사용할 토대 (정본)
- verifier 알고리즘(A3 `docs/160:28-61`): PARSE&CLASSIFY → SOURCE CANONICAL SET → IMPORT(멱등) → POST-IMPORT PARITY. 순수 결정 로직.
- oracle: `fingerprintEvent=stableStringify`(`apps/server/src/index.ts:7494-7511`), `verifierHash=sha256(sort(perEvent).join("\n"))`(`docs/160:63-70`), `fingerprintLogicalEventContent`(`:5822`), `parseEventStorageRecord`(`:7320-7322`, 손상 줄→undefined).
- 하니스: A18/A19/A20 `makeFakeBackend`/`makeEvent`(고정 createdAt 시드). target=A18 fake AuthoritativeEventStore. legacy source=JSONL 문자열 fixture.
- no real network/DB(루프 안전): legacy/target 둘 다 in-memory fixture, import append도 fake store.

## 불변식 테스트 케이스 (A6 P2-1~P2-10 → given/when/then)

### P2-1 no loss (I1)
```text
given: legacy=[e1,e2,e3] JSONL, target 빈 store.
when:  verify(legacy, target)  # dry-run 또는 실 append 후 parity.
then:  manifest.invariants.I1 === true
       ∀ id∈sourceById.keys: target.contains(id) OR id∈rejected   # 모든 유효 이벤트 안착
edge:  legacy 이벤트 1개를 target에서 누락시키면(주입) → I1===false, GO=false.
근거: A3 I1. 손실 0 증명.
```

### P2-2 no mutation (I2)
```text
given: legacy=[e1], target에 import 완료.
then:  fingerprintEvent(target.read("e1")) === sourceById["e1"]   # canonical 일치
       manifest.invariants.I2 === true
edge:  target의 e1 payload를 변형 주입 → fingerprintEvent 불일치 → I2===false.
근거: A3 I2. import이 내용 변형 0.
```

### P2-3 no dup (I3)
```text
given: legacy=[e1,e1] (동일 id 2회 in source).
when:  verify(legacy, target).
then:  target.readAll().filter(id=="e1").length === 1   # 멱등 append(A18 P1-2)
       manifest.duplicateCount >= 1; manifest.invariants.I3 === true
근거: A3 I3 + 멱등 append. 같은 id 두 번 안착 안 함.
```

### P2-4 accounted (I4)
```text
given: legacy=[e1,e2(valid), corrupt_line, e3(valid)] (4 레코드, 1 손상).
then:  manifest.totalRecords === 4
       manifest.importedCount + duplicateCount + rejectedCount === totalRecords   # 등식
       manifest.invariants.I4 === true
근거: A3 I4. 모든 레코드가 정확히 한 범주로 계수(누락·이중계수 0).
```

### P2-5 deterministic verifierHash (I5)
```text
given: 동일 target legacy set 두 번 verifierHash 계산.
then:  두 verifierHash 동일(순서·플랫폼 무관 — sort 적용, A3).
       import 순서를 섞어도(legacy 라인 순서 셔플) 같은 set이면 동일 hash.
       manifest.invariants.I5 === true
근거: A3 I5/verifierHash 규약. flaky 0.
```

### P2-6 idempotent re-import (I6)
```text
given: legacy 1회 import 완료한 target.
when:  같은 legacy 2회차 import.
then:  2회차 importedCount === 0; 전부 duplicateCount
       verifierHash(2회차 후) === verifierHash(1회차 후)   # 불변
       manifest.invariants.I6 === true
근거: A3 I6. 재실행 안전(A15 단계2 "재실행 안전").
```

### P2-7 손상 줄 → rejected 가시화 (silent drop 금지)
```text
given: legacy에 비스키마/손상 줄 2개 포함.
when:  verify.
then:  parseEventStorageRecord → undefined인 줄이 manifest.rejected[] 에 {lineNo, reason} 으로 기록
       rejected.length === 2; 어떤 손상 줄도 silent drop 0(A3/A4 가시화).
근거: A3 "손상 줄 rejected 분류". 은폐 금지.
```

### P2-8 same_id_different_payload → conflict (GO 차단)
```text
given: legacy의 e1과 target의 기존 e1이 같은 id·다른 payload.
when:  verify.
then:  manifest.conflictCount >= 1 (reason=same_id_different_payload)
       manifest GO === false   # conflict>0이면 GO 차단(A3/A15)
근거: A3 IMPORT 단계 conflict 분기. 예상 외 충돌은 GO 막고 HOLD.
```

### P2-9 SimpleMem 비결정론 export → HOLD
```text
given: SimpleMem export가 EventEnvelope로 결정론적 정규화 *불가*(동일 입력 다른 출력 모사).
when:  normalize 시도.
then:  import 중단 신호(HOLD), manifest GO === false, reason 기록.
근거: A3/A15 "export 비결정론 → HOLD". 정규화 안정성 없으면 진행 금지.
```

### P2-10 verifierHash가 storedAt/revision 무관
```text
given: 동일 event set이되 storedAt·revision 메타만 다른 두 레코드 세트.
then:  verifierHash(setA) === verifierHash(setB)   # 메타 무관, event 내용만
근거: A3 verifierHash 규약 "storedAt/revision 제외". 노드별 메타 차이가 parity 깨지 않음.
```

## manifest GO/HOLD 분기 케이스 (A15 단계3 게이트)
```text
MG-1 GO: conflictCount==0 AND I1~I6 전부 pass AND I4 등식 AND verifierHash 재계산 일치 → GO=true.
MG-2 HOLD(conflict): MG-1에서 conflict>0만 주입 → GO=false, rollback 경로(A15 단계R) 신호.
MG-3 HOLD(invariant): I2 fail 주입 → GO=false.
MG-4 HOLD(hash mismatch): manifest.verifierHash != 재계산 → GO=false.
MG-5 rollback no-op: HOLD 후 rollback → target == 단계0 초기 상태(verifierHash 동일, A15 단계R).
     source(legacy JSONL fixture) 불변(A3: 원본 무변경).
근거: A3 GO 조건 + A15 단계3/단계R. 게이트가 기계 판정 가능.
```

## 결정론·격리 불변 (전 케이스 공통, 루프 안전)
```text
- legacy=JSONL 문자열 fixture, target=fake store. real OPFS/IndexedDB/네트워크/DB 0.
- verifier는 순수(legacy set + target → manifest). import append도 fake store(부작용 0).
- 고정 createdAt 시드 → normalize localSeq·fingerprint·verifierHash 재현(flaky 0).
- 어떤 케이스도 authority flip 신호 emit 안 함(import=epoch=0 data 이행, A15: 여전히 DGX authority).
- rejected/conflict는 사유 텍스트만, 페이로드 전문·secret 0.
```

## non-goal (이번 A21)
```text
no 테스트 구현 / no verifier 구현 / no import 실행 (Phase 2 코드=overseer 승인 후)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A22 후보: A-series 테스트 트랙 종합 인덱스(A18~A21 Phase1~2 + Phase3~5[HOLD] 테스트 문서 간 커버리지 맵 + A6 매트릭스 TC↔상세문서 추적표), 또는 Phase 3 epoch/quarantine 테스트 케이스 상세(A6 P3-* 구체화, 단 flip-gated 표기).
- Phase 2 코드(overseer 승인 후): verifier 구현 + 본 A21 명세대로 테스트.

## 검증
- inspect-first: A6 `docs/163:38-50`(P2-1~P2-10 매트릭스 — 본 문서가 확장), A3 `docs/160:19-26,28-61,63-70`(불변식·알고리즘·verifierHash·manifest GO), A15 `docs/172`(import runbook 4단계+rollback), `apps/server/src/index.ts:7494-7511,5822,7320-7322`(fingerprint/logical/parse oracle). A18 하니스 재사용. 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The import verifier is now specified as given/when/then tests (P2-1~P2-10 + MG-1~MG-5) over deterministic legacy/target fixtures, turning each A3 invariant, the GO/HOLD manifest decision, corruption visibility, and conflict detection into concrete assertions. 이 문서는 *import verifier 테스트 케이스 설계* 완료를 뜻하며, 테스트가 작성되었거나 verifier가 구현되었다는 주장이 아니다. 실제 테스트·verifier·import은 overseer 승인 후 Phase 2 코드이고, 이 단계는 authority flip이 아니다(import=epoch=0 data 이행, 여전히 DGX durable authority).
```text
A21 phase 2 import verifier test cases done (design only). P2-1~P2-10 + MG-1~MG-5 given/when/then, I1~I6 + GO/HOLD, deterministic pure verifier, source immutable. no tests/code. not a flip. STOP.
```
