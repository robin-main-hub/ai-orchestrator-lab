# Learning Failure Gate — Enablement Contract (LINE P)

상태: **DISABLED BY DEFAULT. 자동 append 미연결. 어떤 코드 경로도 자동으로 flip하지 않는다.**

이 문서는 `learning.failure` 게이트의 **preview → append 전환**을 누가(WHO) / 언제(WHEN) /
어떤 조건에서 켤 수 있는지를 **계약(contract)** 으로 못박는다. 기존
[`SERVER_LEARNING_FAILURE_GATE.md`](./SERVER_LEARNING_FAILURE_GATE.md)(게이트 결정 헬퍼 +
idempotency + preview route)를 **확장**하며 모순되지 않는다. 이번 라인은 순수 헬퍼 +
이 문서 + 테스트만 추가한다. live route 자동 flip 0, DB migration 0, 외부 전송 0, append/emit 0.

## 추가물

- `apps/server/src/learning/learningFailureEnablement.ts`
  - `LearningFailureEnablementContract` — owner 계약 타입.
  - `defaultLearningFailureEnablement()` — 비활성 기본 계약.
  - `evaluateEnablement(contract, { decision, observedEvidence })` — append가 **허용될지**
    판정 + **DESCRIBED** audit record 반환. **append/emit/side-effect 0.**

## 책임 분리 (이전 라인과의 관계)

```
shouldAppendLearningFailure(...)   // LINE D — "append 해도 되나?" 게이트 결정 (순수)
        │  decision { append, reason, idempotencyKey, event }
        ▼
evaluateEnablement(contract, ...)  // LINE P — owner 계약 레이어 (순수)
        │  { allowed, reason, auditEvent(emitted:false) }
        ▼
(미래) explicit server route        // 실제 append + 실제 audit emit (이번 PR 아님)
```

게이트가 `append:true`여도 계약이 disabled면 `allowed:false`. 계약은 게이트 위에 얹는
**추가 잠금**이지 게이트를 대체하지 않는다.

## owner / WHO

- **owner**: AI Orchestrator Lab 유지보수자(기본 식별자 `"lab_maintainer"`).
  설정 주입 + route 연결 PR 승인 권한.
- 활성화는 **owner의 명시적 결정**이다. 코드 머지만으로 켜지지 않는다.
- `enabled=true`로 켤 때 `enabledBy`(누가) / `enabledAt`(언제) / `scope`(어디까지)를
  채워 audit에 남긴다.

## preview → append 전환 조건 (WHEN) — `evaluateEnablement`

`allowed:true`는 **다음이 모두 참**일 때만 반환된다:

1. `contract.enabled === true` — owner가 명시적으로 켬. 아니면 `"contract_disabled"`.
2. `decision.append === true` — 게이트(LINE D)가 append를 권함. 아니면 `"gate_declined_append"`.
3. `observedEvidence === true` — 관측 근거 확인(**requireObservedEvidence**, 항상 강제).
   아니면 `"no_observed_evidence"`. (미지정 시 false로 간주.)
4. `decision.idempotencyKey` 존재 — **requireIdempotency**, 항상 강제.
   아니면 `"no_idempotency_key"`.

하나라도 어기면 `allowed:false` + 해당 reason. 기본 계약(disabled)은 **항상** `allowed:false`.

### 끌 수 없는 불변선

`requireObservedEvidence` / `requireIdempotency` / `auditRequired` 는 타입상 **literal `true`**
로 고정되어 생성 시점에 끌 수 없다(false 주입 = 컴파일 에러). 즉 "근거 없이" 또는
"idempotency 없이" 또는 "audit 없이" append를 허용하는 계약은 만들 수 없다.

## audit event shape

`evaluateEnablement`는 **DESCRIBED** audit record를 항상 반환한다. 이는 묘사일 뿐
**emit/저장되지 않는다**(`emitted: false`). 실제 audit 기록은 미래 route의 책임이다.

```ts
{
  kind: "learning.failure.enablement.evaluated",
  owner: string,
  enabled: boolean,
  enabledBy?: string,
  scope?: string,
  gateAppend: boolean,                 // 계약 이전, 게이트의 append 결정
  gateReason: LearningFailureGateDecision["reason"],
  observedEvidence: boolean,
  idempotencyKey?: string,
  allowed: boolean,
  reason: "contract_disabled" | "gate_declined_append"
        | "no_observed_evidence" | "no_idempotency_key" | "allowed",
  emitted: false                       // 이 audit은 묘사일 뿐 emit되지 않았음
}
```

## default disabled stays until owner explicitly flips + audit

- 기본값은 `enabled: false`이며, **owner가 명시적으로 `enabled:true`(+ `enabledBy`/`enabledAt`)를
  주입**하기 전까지 유지된다.
- **어떤 코드 경로도 이 계약을 자동으로 flip하지 않는다.** `onEventsCommitted`(관측 전용 훅)
  포함 모든 자동 경로에서 enabled 전환 금지(루프 가드).
- 켜더라도 실제 append는 이 모듈이 아니라 **별도의 명시적 route 단계**에서만 일어난다
  (이번 PR에는 구현하지 않는다).

## 불변선 (테스트로 보장 — `learningFailureEnablement.test.ts`)

- 기본 계약 `enabled=false` → `evaluateEnablement` 항상 `allowed:false`.
- `allowed:true`는 enabled + gate append + observed + idempotency key 모두일 때만.
- unobserved → enabled여도 `allowed:false`.
- gate append=false → `allowed:false`.
- idempotency key 없음 → `allowed:false`.
- `requireObservedEvidence`/`requireIdempotency`/`auditRequired` 항상 true(끌 수 없음).
- 헬퍼는 append/emit/store side-effect 0(주입 sink가 있어도 절대 호출 안 됨).
- audit record는 묘사되어 반환될 뿐 emit되지 않음(`emitted:false`).
