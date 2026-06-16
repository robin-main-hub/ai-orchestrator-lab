# Server Learning Failure Append Gate (LINE D)

상태: **DISABLED BY DEFAULT. 자동 append 미연결.** 이 문서는 미래에 `learning.failure`
이벤트의 자동 append를 켜기 위해 **먼저** 갖춰야 할 안전장치(게이트 + idempotency)를
설명한다. 이번 라인은 결정 헬퍼 + 문서 + 테스트만 추가한다. 새 live route 0, 자동 실행 0,
DB migration 0, 외부 전송 0.

## 무엇을 추가했나

- `apps/server/src/learning/learningFailureIdempotency.ts` — 순수 idempotency 헬퍼.
  실패의 evidence anchor(`verificationReportId` 우선, 없으면 `sandboxErrorCardId`) +
  `missionId`에서 결정론적 key(`lf:<missionId>:<anchor>`)를 만든다. `Date.now`/랜덤/I/O 0.
- `apps/server/src/learning/learningFailureGate.ts` — `LearningFailureGateConfig`
  (`enabled: boolean`, 기본 false) + `shouldAppendLearningFailure(input)`.
  **결정만 한다. 절대 append 하지 않는다.**

## idempotency / dedup 규칙

- key는 **관측된 실패의 anchor**에서만 파생된다. 같은 verification report(또는 같은
  sandbox error card)는 항상 같은 key를 만든다 → 같은 관측 실패는 두 번 append 되지 않는다.
- anchor 우선순위는 `deriveLearningFailureEvent`와 동일(verification 우선). 두 산출물이 모두
  있어도 한 가지 key로 수렴해 중복을 막는다.
- "이미 본 key" 판정은 `SeenIdempotencyKeys.has(key)` 인터페이스로 호출자가 주입한다.
  미래 route는 이를 EventStorage의 기존 이벤트 스캔(예: `learning.failure.recorded`
  envelope id) 또는 인메모리 dedup으로 구현하면 된다. 헬퍼는 저장 방식을 모른다.

## 결정 순서 (`shouldAppendLearningFailure`)

1. `config.enabled === false` → `{ append: false, reason: "disabled" }` (기본 경로)
2. 근거 없음/unobserved (`deriveLearningFailureEvent` → null) → `"no-observed-evidence"`
3. anchor에서 key 못 뽑음(방어적) → `"no-idempotency-key"`
4. 이미 본 key → `{ append: false, reason: "duplicate", idempotencyKey }`
5. 그 외 → `{ append: true, reason: "append", idempotencyKey, event }`

## 미래의 enabling path (아직 미연결)

게이트를 켜는 것은 **owner의 명시적 결정**이다(설정에서 `enabled: true` 주입). 코드 머지만으로
켜지지 않는다. 켤 때의 seam은 다음과 같다 — **이번 PR에는 구현하지 않는다**:

```
missionStore.commit(missionId, envelopes)
  → deps.appendEvents(...)           // 기존 storage 커밋
  → deps.onEventsCommitted(...)      // 관측 전용 훅 (현재 SSE broadcast)
```

`onEventsCommitted`는 **관측 전용**이며 "여기서 새 이벤트를 append하면 안 된다(루프 방지)"가
명시되어 있다. 따라서 자동 append는 이 훅이 아니라 **별도의 명시적 route 단계**에서만
이뤄져야 한다. 미래 route의 의도된 형태:

```ts
const decision = shouldAppendLearningFailure({
  config: gateConfig,            // owner가 enabled:true로 주입했을 때만
  verification, errorCard,
  seen,                          // EventStorage 기반 dedup
  now,
});
if (decision.append) {
  const envelope = learningFailureEnvelope(decision.event!, now); // projector(E)
  await missionStore /* explicit append path */;                  // route 책임
  // 성공 후 decision.idempotencyKey를 dedup 기록에 반영
}
```

핵심: 게이트는 **결정**, projector(LINE E)는 **envelope 매핑**, 실제 **append는 route**.
세 책임이 분리돼 있어 enabled를 켜기 전까지 어떤 자동 append도 일어나지 않는다.

## 소유 / 활성화 권한

> LINE P: owner/enablement 계약(WHO/WHEN + audit event shape + 전환 조건)은
> [`LEARNING_FAILURE_ENABLEMENT_CONTRACT.md`](./LEARNING_FAILURE_ENABLEMENT_CONTRACT.md)에서
> 정식화한다. 기본 disabled는 owner의 명시적 flip + audit 전까지 유지되며 자동 flip 경로는 없다.

- 활성화 결정 owner: AI Orchestrator Lab 유지보수자(설정 주입 + route 연결 PR 승인).
- 기본값은 `enabled: false`. 켜려면 (a) owner가 설정에서 enabled를 켜고,
  (b) 별도 PR로 위 seam의 route 단계를 명시적으로 연결해야 한다.
- 루프 가드: `onEventsCommitted`에서의 append는 금지. 자동 append는 명시적 route에서만.

## 불변선 (테스트로 보장 — `learningFailureGate.test.ts`)

- `enabled` 기본 false.
- disabled → 항상 `append:false`.
- 근거 없음/unobserved → `append:false`.
- enabled + 새 key → `append:true` (+ key + event).
- 같은 key 두 번째 → `append:false` (duplicate).
- idempotency key 결정론적(같은 anchor → 같은 key, anchor 없으면 null).
- 게이트는 어떤 append/side effect/background job도 하지 않는다(결정 전용).
