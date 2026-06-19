# A24 Phase 3 Epoch / Quarantine — Test Cases (design only, flip-gated)

> **상태**: 설계·문서 전용 (design only / 테스트 명세서). **코드/테스트/protocol/schema/migration/EventStorage 동작 변경 없음. 실제 테스트 작성 아님. 🔒 flip-gated — 테스트가 검증하는 parser/classifier/quarantine 함수는 flip(Phase 3+) 후 overseer 승인 시에만 배선. 본 문서는 그 수용 기준을 미리 고정할 뿐 구현·배선을 승인하지 않는다.**
> **선행**: A6 `docs/163:52-60`(Phase 3 매트릭스 — P3-1~P3-6 *한 줄*), A17 `docs/174`(event-id `node:epoch:seq:uuid` 문법·tolerant parser), A16 `docs/173`(QuarantineRecord + resolution 수명주기), A4 `docs/161`(epoch 판정 트리 accept/stale/future), A22 `docs/179`(커버리지 맵 — Phase 3을 🔒flip-gated gap으로 식별).
> **목표**: non-gated 트랙(A18~A23)이 100% 상세화됐다. A24는 *flip-gated* 트랙의 첫 단계로 A6 P3-1~P3-6(한 줄)을 given/when/then으로 구체화한다. 검증 대상은 전부 **순수 함수**(A17 parser, A4 epoch classifier, A16 QuarantineRecord builder/resolution)라 테스트 자체는 부작용 0이지만, **이 함수들의 배선·emission은 flip 후**다(A16/A17이 못박은 "죽은 레이어 금지"). 따라서 본 문서는 *수용 기준 설계*이지 구현·배선·flip 승인이 아니다. **테스트 명세 설계이지 테스트 구현이 아니다.**

## 한 줄 요약
Phase 3 epoch/quarantine acceptance is specified as given/when/then tests over the pure A17 id-parser, A4 epoch-classifier, and A16 quarantine-record builder — asserting four-field parse, seq monotonicity, accept-on-equal-epoch, stale/future routed to quarantine (never silent-dropped), single-epoch revision atomicity, and the pending_review→reconciled|rejected lifecycle — all behind the flip gate so none of it is wired until overseer approval.

## 실측: 검증 대상 함수 (정본, A16/A17 포맷)
```text
parseEventId(s)  (A17 docs/174:29-39) → { form:"authoritative"|"legacy", node, epoch:Number, seq:Number|null, uuid, raw }
  - authoritative: 4-field colon split node:epoch:seq:uuid (`:`는 uuid 내부 부재라 분할 모호성 0).
  - legacy <prefix>_<uuid>: form:"legacy", node:"legacy", epoch:0, seq:null, raw 보존(재작성 0, Postel).
classifyEpoch(e, E)  (A4 docs/161 판정 트리) → "accept" | "stale_epoch" | "unknown_future_epoch"
  - e.epoch==E → accept / e.epoch<E → stale_epoch / e.epoch>E → unknown_future_epoch.
buildQuarantineRecord(e, reason, E, sourceNode)  (A16 docs/173:19-30) →
  { quarantineId(멱등), event(전문 보존), eventFingerprint(A3), observedEpoch, localEpoch:E, reason, sourceNode, quarantinedAt, resolution:{state:"pending_review"} }
resolve(record, decision)  (A16 docs/173:38-60) → resolution.state pending_review→reconciled(reconciledEventId)|rejected(note).
oracle: fingerprintEvent=stableStringify(`apps/server/src/index.ts:7494-7511`), verifierHash(`docs/160:63-70`).
no real network/DB: 전 함수 순수, in-memory fixture.
```

## P3 케이스 상세 (A6 P3-1~P3-6 → given/when/then)

### P3-1 event-id 파싱: 4-field 분해 + seq 단조
```text
given: authoritative id "macbook:3:00000000000000000017:550e8400-e29b-41d4-a716-446655440000".
when:  parseEventId(id).
then:  form==="authoritative"; node==="macbook"; epoch===3; seq===17; uuid==="550e8400-...".
       raw === 입력 문자열(무변경).
seq단조: 같은 (node,epoch)에서 발급된 두 id의 seq가 발급 순서대로 증가(seqN+1 > seqN).
edge-legacy: parseEventId("event_sync_push_<uuid>") → form:"legacy", epoch:0, seq:null, raw 보존(거부 0, A17 Postel).
edge-malformed: 콜론 3개지만 epoch 비숫자 → legacy로 폴백(throw 0, tolerant reader).
근거: A17 `docs/174:29-39` 문법·tolerant parser. 🔒 emission은 flip 후, parse는 legacy 공존 위해 양형 허용.
```

### P3-2 epoch==E → accept
```text
given: localEpoch E=5. event e.epoch=5.
when:  classifyEpoch(e, 5).
then:  === "accept"  # 정상 generation → authoritative 경로(quarantine 아님).
       buildQuarantineRecord 호출 0(accept는 격리 레코드 생성 안 함).
근거: A4 판정 트리 accept 분기. 같은 generation write는 통과.
```

### P3-3 epoch<E → quarantine(stale_epoch, drop 아님)
```text
given: localEpoch E=5. e.epoch=4(구 generation).
when:  classifyEpoch(e,5) → "stale_epoch"; buildQuarantineRecord(e,"stale_epoch",5,node).
then:  record.reason==="stale_epoch"; record.observedEpoch===4; record.localEpoch===5;
       record.resolution.state==="pending_review"; record.event===e(전문 보존, 삭제 0);
       record.eventFingerprint===fingerprintEvent(e).
       authoritative set에 e 승격 0(격리 store 별 네임스페이스).
근거: A4/A16. 구 epoch write를 *버리지 않고* 격리·가시화(silent drop 금지).
```

### P3-4 epoch>E → quarantine(unknown_future_epoch)
```text
given: localEpoch E=5. e.epoch=6(미지의 상위 generation — split-brain 의심).
when:  classifyEpoch(e,5) → "unknown_future_epoch"; buildQuarantineRecord(...,"unknown_future_epoch",...).
then:  record.reason==="unknown_future_epoch"; resolution.state==="pending_review";
       record.event 전문 보존; authoritative 승격 0.
근거: A4/A16. 상위 epoch는 권위 탈취 위험 → 자동 수용 금지, overseer 검토 표식.
```

### P3-5 NEVER silent drop: epoch-mismatch 전부 격리 집합에 포함
```text
given: 입력 이벤트 배치 [e(epoch4), e(epoch5=accept), e(epoch6), e(epoch3)] (E=5).
when:  각 classifyEpoch → 비-accept는 buildQuarantineRecord.
then:  quarantine 집합.length === 3 (epoch4,6,3 전부 — accept 1건 제외).
       drop된(어디에도 없는) 이벤트 0. accounted: input == accepted + quarantined.
       모든 quarantineId 고유·멱등(같은 e 재격리 → 동일 quarantineId, 중복 레코드 0).
근거: A4 P3-5 "NEVER silent drop". A21 I4(accounted)의 epoch 버전 — 누락·이중계수 0.
```

### P3-6 단일 epoch revision 원자성: 두 번째 authoritative 발급 불가
```text
given: 두 노드가 동시에 authoritative revision(epoch bump) 발급 시도.
when:  발급 경합.
then:  정확히 하나만 authoritative(단일 epoch 보유자) — 나머지 시도는 거부 또는 자신을 quarantine 대상으로.
       authoritative 노드 수 === 1 (DUAL_AUTHORITY window 부재, A1 원자성).
       진 쪽의 write는 unknown_future/stale로 분류돼 격리(승격 0).
근거: A1 원자성 + A4. 동시 발급 = split-brain → 단일 권위 불변(이게 flip의 핵심 안전 속성).
주의: 🔒 이 케이스는 실제 epoch 발급(Phase 3)을 전제 — 발급 로직 배선은 overseer 승인 후. 본 명세는 *발급되면 만족해야 할* 불변만 고정.
```

## quarantine 해소 수명주기 케이스 (A16 resolution → given/when/then)
```text
QR-1 pending 기본: buildQuarantineRecord 직후 resolution.state==="pending_review", authoritative 효력 0, 리포트 노출(silent 0).
QR-2 reconciled: resolve(record,{decision:"reconcile",by:overseer}) → 현 epoch E로 *새* 이벤트 author,
     reconciledEventId 부여(A8 append). 원본은 격리 store 보존(삭제 0). authoritative set엔 *새* id만(원본 stale id 승격 0).
QR-3 rejected: resolve(record,{decision:"reject",note}) → state="rejected", note 기록, 원본 보존.
QR-4 멱등 재해소: 이미 reconciled인 record 재-resolve → no-op(중복 author 0, 같은 reconciledEventId 유지).
     이미 rejected에 같은 fingerprint 재격리 → 기존 rejected 참조, 재author 0.
QR-5 승격 금지 불변: 어떤 전이도 stale/future epoch 이벤트를 *그대로* authoritative 승격 안 함 —
     reconcile=현 epoch 재author(overseer 게이트)만이 유일 진입. epoch 위조로 권위 탈취 불가.
근거: A16 `docs/173:38-60` 수명주기. 🔒 resolve 배선은 flip 후 overseer 도구.
```

## 결정론·격리 불변 (전 케이스 공통, 루프 안전)
```text
- parseEventId/classifyEpoch/buildQuarantineRecord/resolve 전부 순수 함수 — real network/DB/OPFS 0.
- 고정 fixture(고정 epoch·seq·createdAt 시드) → fingerprint·quarantineId 재현(flaky 0).
- 🔒 본 문서 어디서도 epoch 발급·emission·배선을 승인하지 않음 — flip(Phase 3+) overseer 게이트 유지.
- quarantine 레코드는 event 전문 보존하되 리포트/diff엔 fingerprint·사유만(페이로드 노출은 격리 store 한정, A9/A16 정신).
- authoritative 승격은 오직 overseer reconcile(현 epoch 재author) — 테스트가 자동 승격 경로 부재를 못박음.
```

## non-goal (이번 A24)
```text
no 테스트 구현 / no parser·classifier·quarantine 구현 / no epoch 발급·emission 배선 (전부 flip 후 overseer 승인)
no authority flip 실행 · no Phase 4 cutover · no Phase 5 phone intent
no protocol/schema/migration 변경 · no EventStorage(서버) 동작 변경
no WorkItem · no native shell · no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A25 후보(🔒 flip-gated): Phase 4 cutover state-machine 테스트 상세(P4-1~6 + S0→S4 전이 + S_ROLLBACK, A4 `docs/161` 위 — PRE-DRAIN GATE·atomic flip·drift 흡수·rollback 무손실), 또는 Phase 5 phone intent 변환 테스트(P5-1~4, A11 `docs/168` 위).
- overseer 승인 후 Phase 0~2 코드: A8/A9 어댑터 + A10 재배선 + A13 PR-1~4(baseline freeze=회귀 게이트). Phase 3+ 코드는 flip 승인이 선결.

## 검증
- inspect-first: A6 `docs/163:52-60`(P3-1~6 매트릭스), A17 `docs/174:18-39`(id 문법·tolerant parser)·A16 `docs/173:19-70`(QuarantineRecord·resolution·A4 매핑)·A4 `docs/161`(epoch 판정 트리), A22 `docs/179`(Phase 3=flip-gated gap), `apps/server/src/index.ts:7494-7511`(fingerprint oracle). 새 primitive·새 케이스 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드/테스트 변경 0.

## 완료 문구 (과장 금지)
Phase 3 epoch/quarantine acceptance is specified (P3-1~P3-6 + QR-1~QR-5) as given/when/then tests over the pure A17 id-parser, A4 epoch-classifier, and A16 quarantine-record builder/resolution: four-field parse + seq monotonicity, accept-on-equal-epoch, stale/future routed to quarantine never silent-dropped, single-epoch revision atomicity, and the pending_review→reconciled|rejected lifecycle with no direct promotion. 이 문서는 *flip-gated 테스트 케이스 설계* 완료를 뜻하며, 테스트가 작성되었거나 parser/classifier/quarantine·epoch 발급이 구현·배선되었다는 주장이 아니다. 본 문서는 그 어떤 구현·emission·flip도 승인하지 않으며(🔒 overseer 게이트 유지), 이 단계는 authority flip이 아니다(여전히 DGX durable authority).
```text
A24 phase 3 epoch/quarantine test cases done (design only, flip-gated). P3-1~6 + QR-1~5 given/when/then over pure parser/classifier/quarantine, accept/stale/future + no silent drop + single-epoch atomicity + reconcile lifecycle. no tests/code/wiring. not a flip. STOP.
```
