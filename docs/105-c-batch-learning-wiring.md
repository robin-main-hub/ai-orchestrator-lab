# 105 — C Batch: Learning Loop Wiring (C1~C3)

## 한 줄

L8 protocol 계약(#530~#532) + batchRemember(#533/#534)을 **계약 레벨에서 end-to-end로
연결**한 3-PR 묶음(SPEED MODE). 실패 → 학습 → 기억 저장 → eval → runtime manifest가
순수 함수 다리로 이어졌다. 단, 아직 어떤 server/orchestrator도 이 다리들을 *자동으로*
호출하지 않는다 — 모두 명시적 호출 + 명시적 writer/evidence 주입을 요구한다.

```
실패 발생
  → [C1] learning.failure.recorded (evidence-gated)
  → LearningLoop: 조사 → 가설 → 검증 → 증류
  → [C2] distilled candidate → batchRemember (suggested-gated, injected writer)
  → [C3] memoryEval → skill runtime manifest (eval-gated)
  → next agent spawn은 manifest만 참고 (실제 load는 후속)
```

## PR 트랙 (모두 main merged)

| PR | merge | 내용 |
|---|---|---|
| #535 | `d51e548` | C1 — mission failure → learning.failure.recorded (pure mapper, evidence-gated) |
| #536 | `4b505a1` | C2 — distilled learning candidate → batchRemember (suggested-gated) |
| #537 | `24fde58` | C3 — memoryEval → skill runtime activation manifest (eval-gated) |

## C1 — `packages/protocol/src/learningLoopWiring.ts`

VerificationReport / SandboxErrorCard → `learning.failure.recorded` 이벤트(순수 mapper).
- `deriveLearningFailureFromVerification` — failed/blocked **AND observed=true**만
- `deriveLearningFailureFromErrorCard` — truthStatus=observed **AND** status failed/timeout/blocked
- `deriveLearningFailureEvent` — 통합, verification 우선, evidence 없으면 null
- real evidence(errorCardId 또는 verificationReportId) 없으면 emit 0. 가짜 observed 학습 0.

## C2 — `packages/simplememo/src/learningBatchRemember.ts`

검증된 증류 후보(`DistilledLearningCandidate`) → B2 `executeLocalBatchWrite`.
- `distilledCandidateToMemoryInput` — lesson → reflection/learning memory, `trustLevel=limited`
- `buildBatchRememberCandidatesFromLearning` — `trustStatus==="suggested"`만, origin=`learning_loop`
- `executeLearningBatchRemember` — writer 주입 시 실제 local write, 없으면 observed:false
- 자동 trusted/active 승격 0, evidenceRefs 없으면 writer 호출 0.

## C3 — `packages/protocol/src/learningRuntimeManifest.ts`

skill activation contract(#532) + memoryEval(#531) → eval-gated runtime manifest.
- `buildLearningRuntimeManifest` — activation 계약 통과 + eval verdict 게이트
  - eval fail → blocked(`eval_failed`), active여도 차단
  - eval warning → loadable 유지 + `evalWarned=true` (fake pass 0)
  - evalRunId 있는데 report 없음 → 보수적 차단
  - waiver(evalRunId 없음) → eval 게이트 면제
- `isLearningSkillLoadable` — 단일 skill 편의
- quarantined/suggested/no-eval-basis는 여전히 차단. 결정론적 order.

## 안전 불변선 (C Batch 전체 유지)

- 가짜 observed 0 / 자동 trusted·active 승격 0 / 자동 runtime load 0
- 자동 외부 발송 0 / 자동 GitHub write·merge 0 (각 PR 외) / DB migration 0
- secret 노출 0 / SimpleMem·DGX 원격 서버 0 / 숨은 백그라운드 0
- 모든 다리는 명시적 호출 + 명시적 writer/evidence/eval 주입 요구
- 기존 테스트 skip/weaken 0

## 검증 (각 PR CI green + 매 PR 안전벨트)

- C1: 14 tests / C2: 10 tests / C3: 14 tests
- 전체 protocol vitest: 20 files / 211 tests pass
- 전체 simplememo vitest: 11 files / 213 tests pass
- root typecheck 0 errors / root build green / secret scan pass

## 아직 안 된 것 (의도)

- server/orchestrator가 이 다리들을 **자동 호출하는 wiring** — 별도 실행 PR (server route 필요)
- 실제 runtime skill load / agent spawn 시 manifest 주입
- 실제 SimpleMem/DGX writer 구현 (B2 writer 인터페이스만 있음)
- ERP Evidence bridge (D Batch)

## 다음 배치

- **D Batch** — ERP Evidence bridge (approved/published EvidenceLink → batchRemember async)
- E/F/G — Assistant Inbox / Evidence UI / DGX continuity / polish
