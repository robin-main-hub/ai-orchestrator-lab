# A20 Shadow Compare Tool — ShadowParityReport Test Cases (design only)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님.**
> **선행**: A14 `docs/171`(ShadowParityReport/ShadowParityDiff 스키마 + verdict 규칙), A3 `docs/160`(fingerprintEvent/verifierHash + 불변식 I1~I6), A13 `docs/170`(PR-3 compare 도구), A18 `docs/175`·A19 `docs/176`(어댑터/controller 테스트 — 본 문서가 잇는 Phase 1 테스트 3단계 중 마지막).
> **목표**: A14가 *리포트 스키마*를 고정했다. A20은 그 스키마를 산출하는 **compare 도구(A13 PR-3)의 verdict 판정 로직**을 given/when/then vitest 케이스로 구체화한다. PARITY/DRIFT 판정·ShadowParityDiff 분류(I1~I3 위반)·결정론을 단위테스트로 못 박아, A13 PR-3가 회귀 0으로 머지 가능하게 한다. **테스트 명세 설계이지 compare 도구 구현이 아니다.**

## 한 줄 요약
The shadow compare tool is covered by given/when/then tests that assert PARITY only when verifierHashes match with zero diffs, and that every cache/adapter divergence yields the correct A3-invariant-classified ShadowParityDiff — deterministically and read-only.

## 실측: 재사용할 토대 (정본)
- A14 스키마: `ShadowParityReport{source,shadow(각 count/verifierHash),parity{verifierHashMatch,countMatch,invariants I1~I6},diffs[],verdict}` + `ShadowParityDiff{eventId,kind,source/shadowFingerprint}`(`docs/171`).
- A3 oracle: `fingerprintEvent=stableStringify`(`apps/server/src/index.ts:7494-7511`), `verifierHash=sha256(sort(perEvent).join("\n"))`(`docs/160:63-70`).
- 테스트 하니스: A18/A19 `makeFakeBackend`/`makeEvent`(고정 createdAt 시드). compare는 두 set(cache·adapter)을 입력받는 순수 함수로 테스트(부작용 0).
- no real network/DB(루프 안전): 두 set 모두 in-memory fixture.

## verdict 판정 케이스 (A14 verdict 규칙 → given/when/then)

### CP-1 PARITY: 동일 set → 일치
```text
given: cache set == adapter set == [e1,e2] (동일 fingerprint, 동일 순서 무관).
when:  compare(cacheSet, adapterSet).
then:  report.parity.verifierHashMatch === true
       report.parity.countMatch === true
       report.diffs.length === 0
       report.verdict === "PARITY"
근거: A14 "verdict=PARITY iff verifierHashMatch && countMatch && I1~I6 pass && diffs 0".
edge: 입력 순서만 다른 동일 set(adapter=[e2,e1]) → 여전히 PARITY(verifierHash는 sort라 순서 무관, A3 I5).
```

### CP-2 DRIFT(missing_in_shadow): cache에 있고 adapter에 없음 (I1 위반)
```text
given: cache=[e1,e2], adapter=[e1]   # e2 누락(어댑터 dual-write 누락 모사).
then:  verifierHashMatch === false; countMatch === false
       diffs == [{ eventId:"e2", kind:"missing_in_shadow", sourceFingerprint:fp(e2), shadowFingerprint:undefined }]
       parity.invariants.I1 === false   # no loss 위반
       verdict === "DRIFT"
근거: A14 missing_in_shadow=I1 위반. graduate 차단(A13 게이트).
```

### CP-3 DRIFT(missing_in_source): adapter에 있고 cache에 없음 (예상 외)
```text
given: cache=[e1], adapter=[e1,e2]   # 어댑터 초과 write(예상 외).
then:  diffs == [{ eventId:"e2", kind:"missing_in_source", sourceFingerprint:undefined, shadowFingerprint:fp(e2) }]
       verdict === "DRIFT"
근거: A14 missing_in_source(병행 write 초과). shadow 모드에서 비0이면 어댑터 append 경로 버그 신호.
```

### CP-4 DRIFT(fingerprint_mismatch): 양쪽 다 있으나 내용 다름 (I2 위반)
```text
given: cache=[e1(payload A)], adapter=[e1(payload B)]   # 같은 id 다른 payload.
then:  diffs == [{ eventId:"e1", kind:"fingerprint_mismatch", sourceFingerprint:fp(A), shadowFingerprint:fp(B) }]
       parity.invariants.I2 === false   # no mutation 위반
       verdict === "DRIFT"
근거: A14 fingerprint_mismatch=I2 위반. **shadow 모드에선 0이어야 정상**(같은 write 미러) → 비0=어댑터 버그.
```

### CP-5 DRIFT(duplicate_in_shadow): adapter set에 같은 id 2회 (I3 위반)
```text
given: adapter set에 e1이 2회(어댑터 dedup 실패 모사), cache=[e1].
then:  diffs 에 { eventId:"e1", kind:"duplicate_in_shadow" } 포함
       parity.invariants.I3 === false   # no dup 위반
       verdict === "DRIFT"
근거: A14 duplicate_in_shadow=I3 위반. A18 P1-2(idempotent append)가 정상이면 이 케이스 안 나옴 → 회귀 가드.
```

### CP-6 복합 diff: 여러 위반 동시 → 전부 분류 (silent 금지)
```text
given: cache=[e1,e2,e3(A)], adapter=[e1,e3(B),e4]   # e2 누락 + e3 변형 + e4 초과.
then:  diffs 3건: missing_in_shadow(e2) + fingerprint_mismatch(e3) + missing_in_source(e4)
       verdict === "DRIFT"; 어떤 위반도 누락 없이 diffs에 전부 표기(A14 silent 금지).
근거: A14 "diffs 0이어도 리포트 항상 생성, DRIFT는 diffs로 원인 가시화".
```

### CP-7 빈 set PARITY: 둘 다 비어있음
```text
given: cache=[], adapter=[].
then:  verifierHashMatch === true(빈 set 동일), diffs.length===0, verdict==="PARITY".
edge:  cache=[] / adapter=[e1] → missing_in_source(e1), DRIFT(빈 cache에 어댑터만 write).
근거: 경계값 안전(빈 부팅 직후 비교). A18 P1-5 edge(빈 부팅)와 정합.
```

## 결정론·read-only 케이스 (A14 dev-only 경계)

### CP-8 결정론: 같은 입력 → 같은 리포트
```text
given: 동일 (cacheSet, adapterSet) 두 번 compare.
then:  두 report의 source/shadow.verifierHash·diffs·verdict 동일(flaky 0).
       generatedAt만 다름(타임스탬프는 verifierHash·verdict 입력 아님, A14/A3).
근거: A14 "결정론: 입력 같으면 fingerprintEvent·verifierHash 같은 출력 → verdict 재현".
```

### CP-9 read-only: compare가 어느 set도 변경 안 함
```text
given: compare(cacheSet, adapterSet) 호출.
then:  호출 후 cacheSet·adapterSet 둘 다 unchanged(append/remove 0).
       어떤 fallback/전환 트리거 0(A13: SHADOW에서 cache 여전히 primary).
근거: A14 "리포트 생성은 read-only: readAll만, 쓰기 0". 진단 산출물이지 동작 변경 0.
```

## graduate 게이트 연결 (A13 → 연속 PARITY)
```text
CP-G 연속 PARITY: N회 연속 compare 전부 verdict==="PARITY"여야 graduate 가능(A13).
     단 한 번 DRIFT → graduate 차단(SHADOW 잔류). 테스트: PARITY×N 후 DRIFT 1회 주입 → 게이트 fail 신호.
근거: A13 graduate 게이트 "verifierHash 지속 일치". A14 verdict 필드가 기계 판정 입력.
```

## 결정론·격리 불변 (전 케이스 공통, 루프 안전)
```text
- 두 set 모두 in-memory fixture(고정 createdAt 시드) — real OPFS/IndexedDB/네트워크/DB 0.
- compare는 순수 함수(입력 set→report). 부작용·외부 전송·러너 0.
- 어떤 케이스도 authority flip 신호 emit 안 함(compare는 dev 진단, cache=primary 유지).
- diffs는 fingerprint(stableStringify 결과)만 담음 — 페이로드 전문·secret 0(A14/A9 정신).
```

## non-goal (이번 A20)
```text
no 테스트 구현 / no compare 도구 구현 / no 리포트 emit 코드 (A13 PR-3 = overseer 승인 후 Phase 1)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A21 후보: Phase 2 import 테스트 케이스 상세(A6 P2-* 구체화 — verifier I1~I6 + manifest GO/HOLD 분기 given/when/then), 또는 A-series 테스트 트랙 종합 인덱스(A18/A19/A20 + Phase 2~5 테스트 문서 간 커버리지 맵).
- Phase 1 코드(overseer 승인 후): A13 PR-3 compare 도구 + 본 A20 명세대로 테스트.

## 검증
- inspect-first: A14 `docs/171`(ShadowParityReport/Diff 스키마·verdict 규칙·diff kind→불변식 매핑), A3 `docs/160:19-26,63-70`(I1~I6·verifierHash), A13 `docs/170:28-30,50-58`(PR-3·graduate 게이트), `apps/server/src/index.ts:7494-7511`(fingerprint oracle). A18/A19 하니스 재사용. 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The shadow compare tool is covered by given/when/then tests (CP-1~CP-9 + CP-G) asserting PARITY only on matching verifierHashes with zero diffs, correct A3-invariant-classified ShadowParityDiffs for every divergence, determinism, and read-only behavior. 이 문서는 *compare 도구 테스트 케이스 설계* 완료를 뜻하며, 테스트가 작성되었거나 도구가 구현되었다는 주장이 아니다. 실제 테스트·도구는 overseer 승인 후 A13 PR-3 Phase 1 작업이고, 이 단계는 authority flip이 아니다(compare=dev 진단, 여전히 DGX durable authority).
```text
A20 shadow compare tool test cases done (design only). CP-1~9 + CP-G given/when/then, PARITY/DRIFT verdict + A3-invariant diff classification, deterministic read-only. no tests/code. not a flip. STOP.
```
