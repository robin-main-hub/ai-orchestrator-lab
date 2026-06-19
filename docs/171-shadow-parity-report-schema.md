# A14 Shadow Parity Report — Compare-Tool Output Schema (design only)

> **상태**: 설계·문서 전용 (design only). **코드/flag/protocol/schema/migration/EventStorage 동작 변경 없음. compare 도구 구현도 아님 — 출력 스키마 설계.**
> **선행**: A3 `docs/160`(verifier 불변식 I1~I6 + verifierHash 규약), A6 `docs/163`(Phase 1 테스트 P1-*/P2-5/I5), A8 `docs/165`(AuthoritativeEventStore readAll), A13 `docs/170`(PR-3 compare 도구 + parity 리포트 — "silent 금지"만 명시, 스키마 미정).
> **목표**: A13 PR-3가 생성하는 **parity 리포트의 출력 스키마**를 못 박는다. A13은 "shadow 어댑터 readAll() vs cache를 verifierHash로 비교, 불일치 시 콘솔/리포트(silent 금지)"라 했지만 *무엇을 어떤 형태로* 내보내는지는 미정이었다. A14는 그 리포트 레코드를 결정론적 스키마로 고정해, graduate 게이트(A13)가 기계적으로 판정 가능하게 한다. **출력 스키마 설계이지 compare 도구 구현이 아니다.**

## 한 줄 요약
The shadow compare tool emits a deterministic ShadowParityReport — a verifierHash match verdict plus a per-event diff classified by A3's invariants — so the graduate gate is a machine-checkable artifact, never a silent console log.

## 실측: 재사용할 기존 비교 primitive (정본)
새 해시·diff 규약을 발명하지 않는다. A3가 고정한 결정론적 형태를 그대로 쓴다.
- **canonical fingerprint** = `fingerprintEvent(event) = stableStringify(event)`(`apps/server/src/index.ts:7494-7511`, 키 정렬·플랫폼 독립). per-event 동일성 기준(A3 I2).
- **verifierHash** = `sha256(sort(perEvent fingerprints).join("\n"))`(A3 `docs/160:63-70`). 입력 순서 무관·set 동일성. shadow 어댑터 set ↔ cache set 비교의 단일 스칼라.
- **불변식 I1~I6**(A3 `docs/160:19-26`): no loss/mutation/dup/accounted/deterministic/idempotent. parity diff는 이 분류 체계를 재사용(새 분류 금지).
- **비교 대상**: shadow 어댑터 `authStore.readAll()`(A8) vs 현 `LocalClientEventCache` 상태(A13 SHADOW 단계, cache=primary·어댑터=병행 write 축적).

## ShadowParityReport 레코드 포맷 (제안 — PR-3 출력)
```text
ShadowParityReport = {
  schemaVersion: 1,                  # 리포트 포맷 버전(향후 진화 대비, 비교 도구가 거부 판정)
  generatedAt: string,               # ISO. 리포트 생성 시각(감사용, verifierHash엔 미포함)
  flagState: "SHADOW" | "GRADUATE",  # A13 상태기 중 어느 단계에서 비교했나
  source: {                          # cache 측(현 primary)
    label: "local_client_event_cache",
    count: number,                   # cache 보유 이벤트 수
    verifierHash: string             # A3 규약, cache set
  },
  shadow: {                          # 어댑터 측(병행 write 축적)
    label: "authoritative_event_store",
    count: number,
    verifierHash: string             # A3 규약, 어댑터 set
  },
  parity: {
    verifierHashMatch: boolean,      # source.verifierHash == shadow.verifierHash (I5 핵심 판정)
    countMatch: boolean,             # source.count == shadow.count
    invariants: { I1:bool, I2:bool, I3:bool, I4:bool, I5:bool, I6:bool }  # A3 분류(정직 기록)
  },
  diffs: ShadowParityDiff[],         # 불일치 항목 — 일치 시 빈 배열(silent 아님, 빈 배열도 명시 출력)
  verdict: "PARITY" | "DRIFT"        # PARITY = verifierHashMatch && invariants 전부 pass && diffs 0
}
```
핵심: `verdict:"PARITY"`만이 A13 graduate 게이트("verifierHash(어댑터)==verifierHash(cache) 지속")를 충족한다. 단일 불일치라도 `DRIFT` → graduate 금지.

## ShadowParityDiff 레코드 (불일치 분류 — A3 불변식에 정합)
```text
ShadowParityDiff = {
  eventId: string,                   # 대상 이벤트 id
  kind:                              # A3 불변식 위반 종류와 1:1
      "missing_in_shadow"            # cache엔 있고 어댑터엔 없음 → I1(no loss) 위반
    | "missing_in_source"            # 어댑터엔 있고 cache엔 없음 → 예상 외(병행 write 초과)
    | "fingerprint_mismatch"         # 양쪽 다 있으나 fingerprintEvent 불일치 → I2(no mutation) 위반
    | "duplicate_in_shadow",         # 어댑터 set에 같은 id 2회 → I3(no dup) 위반
  sourceFingerprint?: string,        # cache 측 fingerprintEvent(있을 때만)
  shadowFingerprint?: string         # 어댑터 측(있을 때만)
}
저장면: diff는 페이로드 전문 미포함 — fingerprint(stableStringify 결과)만.
        (A9 정신: 참조·해시만, 비밀 redaction 면 최소화. 페이로드는 store가 단독 보유.)
```
주의: `fingerprint_mismatch`는 **shadow 모드에서 0이어야 정상**이다(같은 write 미러링이므로). 비0이면 어댑터 append 경로 버그 신호 → DRIFT로 graduate 차단(회귀 가드).

## 판정 결정론 (왜 기계 판정 가능한가)
```text
verdict = PARITY  iff
    parity.verifierHashMatch == true        # set 동일성(A3 I5, 순서·플랫폼 무관)
    AND parity.countMatch == true
    AND ∀ I∈{I1..I6}: invariants[I] == true
    AND diffs.length == 0
그 외 = DRIFT.
결정론: 입력(두 set)이 같으면 fingerprintEvent·verifierHash가 같은 출력(A3 stableStringify) →
        리포트의 verifierHashMatch/diffs/verdict도 재계산 시 동일. flaky 판정 없음.
silent 금지(A4 정신): diffs 0이어도 리포트는 항상 생성·출력(verdict:PARITY 명시).
        "조용히 통과"가 아니라 "PARITY를 증거로 남김". DRIFT는 diffs로 원인 가시화.
```

## graduate 게이트 연결 (A13 체크리스트 → 리포트 필드)
| A13 graduate 게이트(`docs/170:50-58`) | ShadowParityReport 필드 |
| --- | --- |
| dual-write parity: verifierHash(어댑터)==verifierHash(cache) 지속 | `parity.verifierHashMatch==true` (연속 리포트 전부) |
| I1~I4 위반 0 | `parity.invariants.{I1,I2,I3,I4}` 전부 true, `diffs` 빈 배열 |
| I5(deterministic) | 동일 입력 재실행 시 `source/shadow.verifierHash` 불변 |
| 하나라도 미충족 → GRADUATE 금지 | `verdict=="DRIFT"`면 게이트 fail |
→ graduate 결정이 사람 눈대중 콘솔 로그가 아니라 **`verdict` 필드 + 연속 PARITY 리포트**라는 기계 판정 가능 산출물로.

## dev 전용 경계 (프로덕션 동작 무변, A13 재확인)
```text
- PR-3 compare 도구는 dev 전용(A13). 리포트는 진단 산출물이지 런타임 동작 변경 0.
- 리포트 생성은 read-only: source.readAll·shadow.readAll만(쓰기 0, append 0).
- flagState=="SHADOW"에서 cache가 여전히 primary — 리포트는 어떤 fallback/전환도 트리거 안 함.
- generatedAt 등 타임스탬프는 verifierHash 입력에서 제외(A3: 메타데이터는 동일성 기준 아님).
```

## non-goal (이번 A14)
```text
no compare 도구 구현 / no 어댑터 구현 / no 리포트 emit 코드 (PR-3 = overseer 승인 후 Phase 1)
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A15 후보: Phase 2(import) 실행 runbook(A3 verifier dry-run→실 import 절차, manifest GO 게이트 운영 단계), 또는 epoch quarantine 판정 의사코드 상세(A4 보강).
- Phase 1 코드(overseer 승인 후): A13 PR-1~4 + 본 A14 스키마대로 PR-3 리포트 emit.

## 검증
- inspect-first: `apps/server/src/index.ts:7494-7511`(fingerprintEvent/stableStringify 재사용), A3 `docs/160:19-26,63-70`(불변식·verifierHash 규약), A13 `docs/170:28-30,50-58`(PR-3 compare·graduate 게이트), A8 `docs/165`(readAll). 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
The shadow compare tool emits a deterministic ShadowParityReport — a verifierHash match verdict plus a per-event diff classified by A3's invariants — so the graduate gate is a machine-checkable artifact, never a silent console log. 이 문서는 *출력 스키마 설계* 완료를 뜻하며, compare 도구나 리포트 emit이 구현되었다는 주장이 아니다. 실제 도구는 overseer 승인 후 A13 PR-3 Phase 1 작업이고, 이 단계는 authority flip이 아니다(여전히 DGX durable authority).
```text
A14 shadow parity report schema done (design only). deterministic verdict (PARITY/DRIFT), per-event diff by A3 invariants, dev-only read-only. no code. STOP.
```
