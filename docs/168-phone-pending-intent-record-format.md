# A11 Phone Pending-Intent — Record Format & Lifecycle (design only, flip-gated)

> **상태**: 설계·문서 전용 (design only). **코드/protocol/schema/migration/EventStorage/approval route 동작 변경 없음. flip-gated — Phase 5(cutover 후) 전에는 배선 금지.**
> **선행**: A1 `docs/158`(phone=stateless thin client, pending-intent→MacBook authoritative 변환), A5 `docs/162`(phone 직행 server-author = target 불일치, 증거 고정), A6 `docs/163`(P5 테스트), A10 `docs/167`(controller 재배선).
> **목표**: A5가 *부재*로 확정한 phone pending-intent 레이어의 **레코드 포맷·수명주기**를 설계한다. phone이 authoritative 결정을 직행 author하는 현 모델(`Approvals.tsx:54-69`)을, "phone=intent 제출 → MacBook=authoritative 변환 → DGX=projection"으로 바꿀 때의 데이터 형태를 못 박는다. **포맷 설계이지 배선이 아니며, flip(Phase 3+) 전에는 죽은 레이어라 구현 금지(A5).**

## 한 줄 요약
A phone approval becomes a PendingIntent — a non-authoritative request carrying the proposed decision — that only MacBook converts into an authoritative event; the format is specified now but must not be wired until after the authority flip.

## 실측: 현 phone 직행 author 경로 (정본) — 무엇을 바꾸나
- phone 결정: `decide()`가 `/approvals/grant`|`/approvals/reject`로 `{ sourceItemId, actor:"mobile", reason }` POST(`Approvals.tsx:58-62`). 응답=`{ approval, status }`(`:21-24`) — **서버가 즉시 authoritative 승인 이벤트 author**.
- 목록: `/approvals/list` GET → `{ approvals, queue, summary }`(`:9-19,46`). queue 항목=`ApprovalQueueItem{ sourceItemId, requestedBy, permissions, state, ... }`.
- A5 판정: 이 직행이 A1 target("phone pending-intent→MacBook authoritative 변환")과 불일치. **pending-intent 개념 자체가 없음**.
- 바꿀 것: phone POST의 *의미*를 "authoritative 결정 확정"에서 "intent 제출(제안)"으로. 페이로드는 거의 동일, **권위 해석만 분리**.

## PendingIntent 레코드 포맷 (제안 — flip 후 배선)
```text
PendingIntent = {
  intentId: string,            # 멱등 키(클라이언트 UUID). 재제출 dedup — 서버/MacBook이 같은 intentId 재author 금지.
  kind: "approval.decision",   # intent 종류(확장 가능: 향후 다른 phone write도 동일 틀)
  sourceItemId: string,        # 대상 승인 항목(현 payload 계승)
  proposedDecision: "grant" | "reject",   # phone이 *제안*하는 결정(현 grant/reject 경로 → 필드로)
  actor: "mobile",             # 제출 주체(현 actor 계승)
  reason: string,              # 현 reason 계승
  submittedAt: string,         # phone 제출 시각(ISO)
  deviceId: string             # 제출 기기(감사·rate)
}
저장면: phone은 stateless thin client(A1) → 로컬 durable 저장 안 함.
        intent는 제출 후 hub(현 서버 경유 OK, A1 control-plane은 DGX 가능) → MacBook 변환 큐로.
```
핵심: PendingIntent는 **결정이 아니라 결정 요청**이다. `proposedDecision`은 phone의 제안일 뿐, authoritative 확정이 아니다(아래 수명주기).

## 수명주기 (intent → authoritative, 상태 전이)
```text
[submitted]   phone이 intent 제출(hub 경유). 아직 authoritative 효력 0.
   │  MacBook(authoritative converter, Phase 3+ epoch 보유 노드)이 수신·검증:
   │    - sourceItemId가 실재·pending 상태인가?
   │    - 권한/정책 통과(승인 권한 보유 actor인가)?
   │    - intentId 미처리(멱등)?
   ▼
[accepted] → MacBook이 authoritative approval 이벤트 author(epoch+revision 부여, A8 store append)
   │           → DGX는 그 이벤트를 replica/projection 수신(A1).
   │           → /approvals/list가 projection을 읽어 phone에 반영.
   └─ [declined_by_authority] MacBook 검증 실패(권한 없음/이미 처리/만료) → intent 거부.
                              phone엔 사유 표시. **silent drop 금지**(A4 정신: 가시화).
멱등: 같은 intentId 재제출 → 이미 accepted면 no-op(중복 author 금지), declined면 동일 사유 반환.
손실: intent는 phone durable 아님 → 미확인 시 phone이 재제출(intentId로 안전). over-submit 안전(멱등), under는 사용자 재시도.
```
**권위 분리의 핵심(보안)**: phone이 `proposedDecision:"grant"`를 보내도 **MacBook 검증 전엔 승인 아님**. phone-asserted 결정을 final로 신뢰하지 않는다 — 현 server-owned author 가드(`index.ts:5837,7136-7140` 403)의 정신을 MacBook 변환자로 이관(권위는 여전히 단일 노드).

## 현 payload → PendingIntent 매핑 (최소 델타)
| 현 필드(`Approvals.tsx:58-62`) | PendingIntent | 비고 |
| --- | --- | --- |
| 엔드포인트 grant/reject | `proposedDecision: "grant"\|"reject"` | 두 라우트 → 한 intent 필드 |
| `sourceItemId` | `sourceItemId` | 그대로 |
| `actor:"mobile"` | `actor:"mobile"` | 그대로 |
| `reason` | `reason` | 그대로 |
| (없음) | `intentId` | 신규 — 멱등 키(클라 UUID) |
| (없음) | `kind`,`submittedAt`,`deviceId` | 신규 — 종류·감사 메타 |
→ phone UI 변화 최소: `decide()`가 단일 `/intents` 제출로, grant/reject는 `proposedDecision` 필드. 응답은 "제출됨"(accepted 여부는 projection 폴링/푸시로).

## 왜 지금 배선하지 않나 (flip gate, A5 재확인)
```text
pending-intent는 MacBook이 authoritative 변환자일 때만 의미를 가진다.
현재 durable authority = DGX(A0). MacBook authoritative 승격 = Phase 3(epoch 발급)+Phase 4(cutover).
flip 전에 phone→intent로 바꾸면:
  - 받아줄 MacBook authoritative 변환자가 없음 → intent가 갈 곳이 DGX server-author뿐
  - 즉 현 직행과 동일해지거나, DGX-authority 모델과 모순되는 죽은 레이어
→ 본 문서는 포맷·수명주기만 고정. 실제 /intents 라우트·변환자·phone UI 변경은 Phase 5(flip 후).
A6 P5-1~P5-4가 이 포맷의 수용 테스트.
```

## non-goal (이번 A11)
```text
no /intents 라우트 / no phone UI 변경 / no approval route 동작 변경 / no 변환자 구현 (Phase 5)
no protocol type/schema/migration 변경 · no EventStorage 동작 변경
no authority flip · no epoch 발급(Phase 3) · no WorkItem · no native shell
no real network/secret/DB write/runner dispatch/external send/patch apply · generic only
```

## 다음 미완 증분 (A-series 트랙, 본 PR 아님)
- A12 후보: Phase 1 어댑터 PR 묶음 순서/shadow rollout 플래그 설계(부작용 없는 구조 분리의 머지 시퀀스), 또는 home_pc 클라이언트 operational truth(A5는 phone만 — home_pc 경로 미검증).
- Phase 5 코드(flip 후, overseer 승인): /intents 라우트 + MacBook 변환자 + phone UI intent 제출.

## 검증
- inspect-first: `apps/mobile/src/screens/Approvals.tsx:21-24,46,54-69`(현 직행 author payload/응답), A5 `docs/162`(부재 증거), A1 phone 설계, A6 P5 참조. 서버 403 가드(A1/A5 인용)는 재인용.
- docs-only이므로 빌드 산출물 변화 없음. 코드 변경 0.

## 완료 문구 (과장 금지)
A phone approval becomes a PendingIntent — a non-authoritative request carrying the proposed decision — that only MacBook converts into an authoritative event; the format is specified now but must not be wired until after the authority flip. 이 문서는 *레코드 포맷·수명주기 설계* 완료를 뜻하며, intent 레이어가 구현되었거나 phone 경로가 바뀌었다는 주장이 아니다. 배선은 flip 후 Phase 5 작업이고, 그 전엔 죽은 레이어라 금지(A5).
```text
A11 phone pending-intent record format done (design only, flip-gated). no route/UI/code change. STOP.
```
