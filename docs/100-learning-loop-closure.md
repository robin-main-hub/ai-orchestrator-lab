# 100 — Learning Loop Closure (Orchestration OS L8, PR 1)

## 한 줄

검증 실패를 *제도적으로* 학습으로 바꾸는 순수 protocol 상태머신:
`Fail → Investigate → Verify → Distill → Consult`. 기존 seam(SandboxErrorCard /
VerificationReport / SelfCorrection / SkillArchive) 뒤에 붙고, EventStorage 단일
진실 위에서 이벤트로만 산다. 새 DB·UI 없음.

이건 L8 3-PR 스택의 첫 번째다:

1. **PR 1 (이 문서)** — Learning State Machine (`learningLoop.ts`)
2. PR 2 — Memory Eval Harness (`memoryEval.ts`)
3. PR 3 — Skill/Memory Runtime Activation Contract (`skillArchive.ts` 확장)

## 왜

지금까지 실패가 나면 `SandboxErrorCard` + bounded `SelfCorrection`까지는 있었지만,
"실패 → 조사 → 가설 검증 → 증류 → 다음 미션에서 consult"가 **하나의 강제 상태머신**으로
닫혀 있지 않았다. 그 결과 검증 안 된 추측이 지식으로 새어 들어갈 여지가 있었다.

핵심 원칙:

> 실패는 자동으로 지식이 되지 않는다.
> 검증된 실패만 학습 후보가 된다.

## 파일

- `packages/protocol/src/learningLoop.ts`
- `packages/protocol/src/learningLoop.test.ts` (18 tests)
- `packages/protocol/src/index.ts` — export 추가

## 상태

```
failed → investigating → hypothesis_recorded → verified → distilled → consulted
                                              ↘ rejected (증류 불가, 터미널)
```

## 이벤트 (EventStorage)

| type | payload | 효과 |
|---|---|---|
| `learning.failure.recorded` | `{ failure }` | 루프 오픈 (stage=failed) |
| `learning.investigation.started` | `{ investigation }` | read-only 조사 기록 |
| `learning.hypothesis.recorded` | `{ hypothesis }` | 가설 추가 |
| `learning.hypothesis.verified` | `{ verification }` | 검증됨 → 증류 가능 |
| `learning.hypothesis.rejected` | `{ verification }` | 거절됨 → 증류 불가 |
| `learning.distillation.candidate_created` | `{ candidate }` | suggested 증류 후보 |
| `learning.consult.completed` | `{ consult }` | 다음 미션 consult 완료 |
| `learning.consult.skipped` | `{ consult }` | consult 스킵(사유 필수) |

리듀서: `deriveLearningLoopState(events): LearningLoopRecord[]` — append 순서대로
적용. 잘못된 payload는 `safeParse`가 거른다(루프를 전진시키지 않음).

## 강제되는 불변식

1. **실패 기록은 근거가 있어야 한다** — `sandboxErrorCardId` 또는
   `verificationReportId` 없이는 `learningFailureSchema`가 거부. 추측 실패는 루프를
   못 연다.
2. **조사는 read-only 역할만** — `investigatorRole ∈ {investigator, verifier,
   reviewer}`. builder/coder는 스키마에서 거부(조사자는 고치지 않는다).
3. **증류는 검증된 가설을 요구한다** — 증류 후보의 `hypothesisId`가 검증된 가설이
   아니면 리듀서가 무시.
4. **거절된 가설은 증류되지 않는다** — `hypothesisId`가 rejected 목록에 있으면 무시.
5. **consult skipped에는 사유 필수** — `outcome=skipped`인데 `skipReason`이 비면
   스키마가 거부.
6. **observed 주장은 근거를 요구한다** — `truthStatus=observed`인 검증은
   `evidenceRefs`가 비면 거부(가짜 관측 금지).

추가 안전: 증류 후보 `trustStatus`는 `z.literal("suggested")`로 고정 — 자동
trusted/active 승격 경로가 타입 레벨에서 없다(curator/eval은 PR 3).

## 검증

- `learningLoop.test.ts`: 18 tests pass (L1~L18, 6개 불변식 + 진행/멱등/다중 루프)
- `pnpm --filter @ai-orchestrator/protocol typecheck`: pass
- `pnpm --filter @ai-orchestrator/protocol build`: pass

## 명시적 비범위 (후속)

- 서버 projector / route 0 (이 PR은 pure protocol + tests)
- UI 0
- PR 2 Memory Eval / PR 3 Activation Contract 미구현
- `learning.*` 이벤트를 실제 mission 실패에서 emit하는 wiring은 후속 (서버에서
  `mission.error_card.recorded` → `learning.failure.recorded` 투영)
