# A16 Epoch Quarantine — Record Format & Resolution Lifecycle (design only, flip-gated)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage 동작 변경 없음. flip-gated — quarantine은 MacBook이 epoch 보유 노드일 때만 의미(Phase 3+). 배선 금지.**
> **선행**: A1 `docs/158`(epoch=split-brain quarantine 키), A4 `docs/161`(cutover runbook + quarantine *판정 트리* accept/stale/future), A3 `docs/160`(verifierHash·fingerprintEvent), A8 `docs/165`(store readAll).
> **목표**: A4가 quarantine **판정 트리**(같은 epoch→accept, 구 epoch→stale, 상위 epoch→future)만 못 박았다. A16은 그 판정 *결과*를 담는 **격리 레코드 포맷**과 **해소(resolution) 수명주기**를 설계한다. "보존+가시화, silent drop 금지"(A4)를 *어떤 레코드로, 어디에, 어떻게 검토·해소*하는지로 구체화한다. **포맷·수명주기 설계이지 quarantine 배선이 아니며, flip(Phase 3+) 전엔 죽은 레이어라 구현 금지(A4/A11 원칙).**

## 한 줄 요약
A quarantined event becomes a QuarantineRecord — the original event preserved verbatim plus the epoch-mismatch reason and a resolution state — that an overseer reviews and either reconciles into the current epoch or seals as rejected, never silently dropped.

## 실측: A4 판정 트리가 남기는 빈틈 (정본)
A4 `docs/161:85-98`은 결정만 한다 — **무엇으로 보존하는지는 미정**.
```text
A4가 고정:  if e.epoch==E accept / elif e.epoch<E quarantine("stale_epoch") / else quarantine("unknown_future_epoch")
A4 불변:    NEVER 승격, NEVER silent drop(보존+가시화).
A16이 채움: quarantine(e, reason) 호출이 *생성하는 레코드*의 형태 + 그 레코드의 해소 경로.
```
재사용: 격리는 새 직렬화 규약을 발명하지 않는다 — 원본 이벤트는 `fingerprintEvent`(A3 stableStringify)로 동일성 보존, store는 A8 append-only 모델 차용(격리도 append-only·삭제 없음).

## QuarantineRecord 레코드 포맷 (제안 — flip 후 배선)
```text
QuarantineRecord = {
  quarantineId: string,         # 멱등 키(클라/노드 UUID). 같은 이벤트 재격리 dedup.
  event: EventEnvelope,         # 원본 이벤트 *전문 보존*(변형 0 — A4 "보존" 충족, A3 fingerprint 동일성 유지).
  eventFingerprint: string,     # fingerprintEvent(event)(A3) — 재검토·중복판정 canonical 키.
  observedEpoch: number,        # 이벤트가 들고 온 e.epoch.
  localEpoch: number,           # 판정 시점 localAuthority.epoch (= E).
  reason: "stale_epoch" | "unknown_future_epoch",   # A4 판정 트리 결과와 1:1.
  sourceNode: string,           # 이벤트 출처(감사 — 어느 노드의 구/미래 generation인가).
  quarantinedAt: string,        # ISO. 격리 시각(감사용, fingerprint엔 미포함).
  resolution: QuarantineResolution   # 아래 수명주기.
}
저장면: 격리 store = append-only(삭제 금지, A4 "보존"). authoritative store와 분리된
        quarantine 네임스페이스(import의 epoch=0 격리와 동형 — 권위 set 오염 금지).
        backend는 A8과 동일(OPFS primary/IndexedDB fallback) 권장.
```
핵심: `event`는 **전문 보존**(요약·해시만 두지 않음) — 해소 시 현 epoch로 재author하려면 원본 페이로드가 필요(A4 "승격 금지"는 *지금 그대로 승격* 금지이지 *재검토 후 재author* 금지가 아님).

## QuarantineResolution 수명주기 (격리 → 해소, 상태 전이)
```text
QuarantineResolution = {
  state: "pending_review" | "reconciled" | "rejected",
  resolvedAt?: string,
  resolvedBy?: string,          # overseer 식별(감사).
  note?: string,                # 사유(가시화 — 은폐 금지).
  reconciledEventId?: string    # reconciled일 때, 현 epoch로 새로 author된 이벤트 id.
}

[pending_review]  격리 직후 기본. authoritative 효력 0. UI/리포트에 항상 노출(silent 금지, A4).
   │  overseer 검토(자동 승격 금지 — 사람 판단 게이트):
   │    stale_epoch: 구 generation write. 이미 현 epoch에 동일 논리 이벤트 있나?
   │       (fingerprintLogicalEventContent 비교, A3 :5822) → 있으면 중복이라 reject.
   │       없고 유효하면 현 epoch로 재author 대상.
   │    unknown_future_epoch: 미지의 상위 generation. split-brain 의심 →
   │       해당 epoch 출처 규명 전까지 pending 유지(섣부른 reconcile 금지).
   ▼
[reconciled] → overseer가 현 epoch(E)로 *새* 이벤트 author(reconciledEventId 부여, A8 append).
   │            원본 event는 격리 store에 그대로 보존(이력). 새 이벤트만 authoritative.
   │            멱등: 같은 quarantineId 재해소 → 이미 reconciled면 no-op(중복 author 금지).
   └─ [rejected] overseer가 무효 판정(중복/위조/만료). 사유(note) 기록. 원본 보존(삭제 0).
                 재격리(같은 fingerprint) → 기존 rejected 레코드 참조, 재author 안 함.
```
**보안 핵심(A4 정신 계승)**: 어떤 상태 전이도 stale/future epoch 이벤트를 *그대로* authoritative로 승격하지 않는다. reconcile은 **현 epoch로의 명시적 재author**(overseer 게이트)뿐 — epoch 위조로 권위 탈취 불가.

## A4 판정 트리 → QuarantineRecord 매핑 (연속성)
| A4 판정(`docs/161:89-94`) | QuarantineRecord.reason | 초기 resolution.state |
| --- | --- | --- |
| `e.epoch == E` | (격리 안 함 — accept) | — |
| `e.epoch < E` | `stale_epoch` | `pending_review` |
| `e.epoch > E` | `unknown_future_epoch` | `pending_review` |
→ A4의 `quarantine(e, reason)` 호출이 본 레코드를 append. 판정 로직은 A4 그대로, A16은 *산출물 형태*만 추가.

## 왜 지금 배선하지 않나 (flip gate, A4/A11 재확인)
```text
quarantine은 localAuthority.epoch이 의미를 가질 때 = MacBook이 epoch 보유 authority일 때만 작동.
현재 durable authority=DGX(A0), epoch 개념 미발급. MacBook epoch 발급=Phase 3.
flip 전 quarantine을 배선하면:
  - 비교할 localEpoch(E)가 없음 → 모든 이벤트가 trivially accept이거나 무의미 격리.
  - 즉 DGX-authority 모델에 죽은 레이어(A11 phone pending-intent와 동형 상황).
→ 본 문서는 레코드 포맷·해소 수명주기만 고정. 실제 quarantine store·검토 UI·reconcile author는
  Phase 3(epoch 발급) 이후 + overseer 승인. A6 매트릭스의 epoch quarantine 테스트가 수용 기준.
```

## non-goal (이번 A16)
```text
no quarantine store/검토 UI/reconcile author 구현 (flip 후 Phase 3+)
no epoch 발급 코드(Phase 3) · no cutover 실행(Phase 4)
no protocol type/schema/migration 변경 · no EventStorage 동작 변경
no authority flip · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A17 후보: Phase 1 어댑터 단위테스트 케이스 상세(A6 P1-* 구체화 — append/read/readAll/contains/idempotent 케이스), 또는 epoch event-id 포맷(`macbook:epoch:seq:uuid`, A1) 파싱·검증 규약 상세.
- Phase 3+ 코드(overseer 승인·flip 후): quarantine store + 검토 흐름 + reconcile author.

## 검증
- inspect-first: A4 `docs/161:85-98`(quarantine 판정 트리 — 본 문서가 보강), A1 `docs/158`(epoch split-brain), A3 `docs/160:5822`(logical key 중복판정)·`:7494-7511`(fingerprint), A8 `docs/165`(append-only store). 새 primitive 0.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
A quarantined event becomes a QuarantineRecord — the original event preserved verbatim plus the epoch-mismatch reason and a resolution state (pending_review → reconciled | rejected) — that an overseer reviews and either reconciles into the current epoch or seals as rejected, never silently dropped or directly promoted. 이 문서는 *격리 레코드 포맷·해소 수명주기 설계* 완료를 뜻하며, quarantine이 구현되었거나 배선되었다는 주장이 아니다. 배선은 flip(Phase 3+) 후 overseer 승인 작업이고, 그 전엔 죽은 레이어라 금지(A4/A11).
```text
A16 epoch quarantine record format & resolution lifecycle done (design only, flip-gated). QuarantineRecord + pending_review→reconciled|rejected, no silent drop/promote. no code. STOP.
```
