# A25 Phase 4 Cutover State-Machine — Test Cases (design only, flip-gated)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님. 🔒 flip-gated — 본 테스트가 검증하는 cutover 전이 판정은 *순수 결정 함수*로 단위테스트 가능하나, 그 판정이 구동하는 실제 드레인·DGX freeze·epoch bump·flip 실행은 Phase 4 overseer 결정. 본 문서는 수용 기준을 미리 고정할 뿐 cutover 실행·flip을 승인하지 않는다.**
> **선행**: A6 `docs/163:62-87`(Phase 4 매트릭스 P4-1~P4-6 + S0→S4 state 전이 *한 줄*), A4 `docs/161`(cutover state machine 운영 절차 S0→S4 + S_ROLLBACK + PRE-DRAIN GATE), A1 `docs/158`(단일 atomic flip·DUAL_AUTHORITY 부재), A3 `docs/160`(import verifier I1~I6), A24 `docs/181`(Phase 3 epoch 판정 — S3 epoch bump의 선행), A22 `docs/179`(Phase 4=🔒flip-gated gap).
> **목표**: A24가 Phase 3(epoch/quarantine)을 상세화했다. A25는 그 위에 얹히는 **Phase 4 cutover state machine**(S0→S4 + S_ROLLBACK)의 전이 판정을 given/when/then으로 못 박는다. 검증 대상은 **순수 전이 함수**(현 상태 + 게이트 입력 → 다음 상태 | HOLD | ROLLBACK)라 부작용 0 단위테스트 가능 — 단 그 판정이 *구동하는* 실제 flip은 overseer 게이트. **테스트 명세 설계이지 cutover 실행도 테스트 구현도 아니다.**

## 한 줄 요약
The MacBook-authority cutover state machine is specified as given/when/then tests over a pure transition function — each S0→S4 edge gated (overseer GO, manifest I1~I6, zero live drift, PRE-DRAIN synced&&outbox0, atomic epoch bump) and S_ROLLBACK reachable from any state with lossless idempotent return to S0 — all behind the flip gate so no real drain/freeze/bump is performed.

## 실측: 검증 대상 (정본, A4 state machine)
```text
transition(state, gates) → nextState | "HOLD" | "S_ROLLBACK"   # 순수 결정 함수(부작용 0)
상태: S0 LEGACY → S1 SHADOW_IMPORT → S2 VERIFY → S3 CUTOVER(atomic) → S4 POST_CUTOVER. (+ S_ROLLBACK)
게이트 입력(A4):
  - overseerGO: boolean (S0→S1 필수)
  - phase12Merged: Phase1 adapter + Phase2 import 코드 머지 플래그
  - manifest: { invariants I1~I6, conflictCount } (S1→S2, A3 verifier 산출)
  - liveDrift: number (S1 freeze 이후 DGX 신규 append 수, S2→S3은 0 필수)
  - drainState: { status:"synced"|"syncing"|"queued"|"failed", outboxCount } (S3 PRE-DRAIN GATE)
  - epochBump: { committed:boolean, authoritativeNodeCount } (S3 atomic flip)
불변: DUAL_AUTHORITY 상태 부재(A1) — 어떤 시점에도 authoritative 노드 정확히 1.
oracle: drain 완료 = status=="synced" && outboxCount==0 (`stage14EventSync.ts:10-18`).
no real network/DB: 전이 함수 순수, in-memory 게이트 fixture.
```

## P4 케이스 상세 (A6 P4-1~P4-6 → given/when/then)

### P4-1 PRE-DRAIN GATE: 드레인 미완이면 CUTOVER 진입 금지
```text
given: state=S2(VERIFY 통과 직전). drainState={status:"queued",outboxCount:3}.
when:  transition(S2→S3 시도).
then:  진입 거부 → "HOLD"(S2 잔류). S3 CUTOVER 미진입.
       오직 status=="synced" && outboxCount==0 일 때만 S3 진입 허용.
edge:  status:"synced" but outboxCount:1 → 여전히 HOLD(두 조건 AND).
근거: A4 `docs/161:52-56` PRE-DRAIN GATE. drain 미완 flip = 미전송 이벤트 유실 위험 → 차단.
```

### P4-2 멱등 재전송: idempotencyKey 잔여 흡수, 중복 확정 0
```text
given: S3 진입 직전 잔여 재전송(같은 idempotencyKey `${clientId}:${sessionId}:${ids}` 재-push).
when:  서버 dedup 경로.
then:  target 중복 확정 0(같은 key는 한 번만 안착, A0 dedup).
       재전송 N회 → target count 불변(멱등).
근거: A4 P4-2 + A0 dedup. 드레인 마무리 단계의 재전송이 중복 만들지 않음(verifierHash 안정).
```

### P4-3 atomic flip: DUAL_AUTHORITY window 부재
```text
given: S3 CUTOVER, epoch bump 실행.
when:  t0(DGX read-only freeze) → t1~t3(epoch bump) 구간 관찰.
then:  epoch bump 전후 authoritativeNodeCount === 1 (정확히 하나).
       DUAL_AUTHORITY(2 노드 동시 권위) 상태 도달 불가 — 전이 함수가 그 상태를 표현조차 안 함.
       bump 미완이면 authority는 여전히 DGX(S0측), 완료면 MacBook — 중간값 없음(atomic).
근거: A1/A4 단일 atomic flip. epoch bump가 단일 분기점(A24 P3-6 원자성과 동일 불변).
```

### P4-4 live drift 흡수: S1 freeze 이후 신규 append 증분 import 후 재검증
```text
given: state=S2. liveDrift=4(S1 freeze 후 DGX 신규 4건).
when:  transition(S2→S3 시도).
then:  liveDrift>0 → S3 진입 금지, S2 잔류(증분 import 후 같은 verifier 재검증).
       증분 흡수 → liveDrift=0 재달성 시에만 S2→S3 게이트 통과.
       GO 조건 = parity 성립 AND liveDrift==0.
근거: A4 `docs/161:44-46` S2 drift 점검. cutover 직전까지 0 drift 반복(라이브 데이터 유실 0).
```

### P4-5 S_ROLLBACK 무손실: 원본 legacy JSONL 무변경
```text
given: 어느 상태(S1/S2/S3)에서 S_ROLLBACK 호출.
when:  rollback 실행.
then:  legacy JSONL fingerprint/sourceFileSha256 === cutover 시작 전 값(원본 불변).
       import분만 무효화, DGX가 untouched legacy로 authority 재개(S0 복귀).
       손실 0(rollback 후 legacy set 완전).
근거: A4 `docs/161:76-80` S_ROLLBACK. 원본 read-only 스냅샷이라 어떤 rollback도 source 안 건드림.
```

### P4-6 rollback 멱등: 재실행 안전
```text
given: S_ROLLBACK 1회 실행 후 상태.
when:  S_ROLLBACK 재호출.
then:  2회차 후 상태 === 1회차 후 상태(동일 S0, 원본 불변).
       rollback 재실행이 추가 부작용 0(멱등).
근거: A4 `docs/161:82` rollback 멱등. 부분 실패·재시도 안전.
```

## state 전이 케이스 (A6 §state machine → given/when/then)
```text
ST-1 S0→S1: overseerGO==true && phase12Merged==true → S1. 둘 중 하나라도 false → S0 유지(진입 금지).
ST-2 S1→S2: manifest.I1~I6 전부 pass && conflictCount==0 → S2. 실패(invariant fail 또는 conflict>0) → S_ROLLBACK.
ST-3 S2→S3: parity 성립 && liveDrift==0 → S3. liveDrift>0 → S2 잔류(P4-4). PRE-DRAIN 미통과 → HOLD(P4-1).
ST-4 S3→S4: PRE-DRAIN GATE 통과 && epochBump.committed && authoritativeNodeCount==1 → S4. drain 미완/중간 단절 → S_ROLLBACK.
ST-5 any→S_ROLLBACK: S1/S2/S3 어디서든 호출 가능. rollback 후 S0 복귀·손실 0(P4-5)·멱등(P4-6).
ST-6 S4 봉인 후: rollback=새 마이그레이션 결정(자동 전이 아님). 봉인 전까진 가역(A4 :73).
근거: A6 §state 전이표 + A4 각 상태 진입/실패 경로. 전이 함수가 기계 판정(사람 눈대중 아님).
```

## 결정론·격리 불변 (전 케이스 공통, 루프 안전)
```text
- transition()은 순수 함수(상태+게이트 입력→다음 상태) — real 드레인/freeze/bump/네트워크/DB 0.
- 게이트 fixture는 고정값(고정 drainState·liveDrift·manifest) → 전이 결정 재현(flaky 0).
- 🔒 본 문서 어디서도 cutover 실행·epoch bump·DGX freeze·flip을 승인하지 않음 — Phase 4 overseer 게이트 유지.
- DUAL_AUTHORITY 부재가 전 케이스 불변(authoritativeNodeCount==1) — split-brain 표현 불가가 설계 자체.
- rollback은 원본 read-only 스냅샷 기준 → source(legacy JSONL) 절대 불변(A4/A15 정합).
```

## non-goal (이번 A25)
```text
no 테스트 구현 / no 전이 함수·cutover 구현 / no epoch bump·DGX freeze·drain 실행 (전부 Phase 4 overseer 승인)
no authority flip 실행 · no Phase 5 phone intent
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no WorkItem · no native shell · no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A26 후보(🔒 flip-gated): Phase 5 phone pending-intent → authoritative 변환 테스트 상세(P5-1~4, A11 `docs/168` PendingIntent 포맷 + A5 위 — intent 제출·MacBook 변환자·DGX projection-only·intent 손실 0). 이로써 flip-gated 테스트 트랙(Phase 3·4·5) 전부 상세화 완결.
- overseer 승인 후 코드: Phase 0~2(A8/A9 어댑터+A10 재배선+A13 PR-1~4, baseline freeze=회귀 게이트) → flip 승인 시 Phase 3~5.

## 검증
- inspect-first: A6 `docs/163:62-87`(P4-1~6 + state 전이표), A4 `docs/161:17-82,102-106`(S0→S4 절차·PRE-DRAIN GATE·S_ROLLBACK·드레인 신호), A1 `docs/158`(단일 atomic flip), `stage14EventSync.ts:10-18`(drain 신호 oracle), A24 `docs/181`(P3-6 원자성 선행). 새 primitive·새 케이스 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
The MacBook-authority cutover state machine is specified (P4-1~P4-6 + ST-1~ST-6) as given/when/then tests over a pure transition function: PRE-DRAIN gate (synced&&outbox0), idempotent resend with zero duplication, atomic flip with no DUAL_AUTHORITY window, live-drift absorption to zero before S3, lossless idempotent S_ROLLBACK from any state, and every S0→S4 edge machine-decidable. 이 문서는 *flip-gated 전이 테스트 케이스 설계* 완료를 뜻하며, 테스트가 작성되었거나 전이 함수·cutover·epoch bump가 구현·실행되었다는 주장이 아니다. 본 문서는 그 어떤 cutover 실행·flip도 승인하지 않으며(🔒 overseer 게이트 유지), 이 단계는 authority flip이 아니다(여전히 DGX durable authority).
```text
A25 phase 4 cutover state-machine test cases done (design only, flip-gated). P4-1~6 + ST-1~6 given/when/then over pure transition fn, PRE-DRAIN gate + atomic flip(no DUAL_AUTHORITY) + drift absorption + lossless idempotent rollback. no tests/code/execution. not a flip. STOP.
```
