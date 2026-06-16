# 102 — Skill Runtime Activation Contract (Orchestration OS L8, PR 3)

## 한 줄

curator 승인(보관 가치)과 runtime 활성화(다음 agent가 실제로 써도 됨)를 **분리**한다.
`trustStatus`만으로는 절대 runtime load되지 않고, `pinned`도 eval을 자동 우회하지 않는다.
런타임에 로드 가능한 skill 후보의 조건을 계약으로 고정하고, 결정론적 manifest를
빌드한다. 실제 runtime loader는 비범위(후속 실행 단계).

L8 3-PR 스택의 세 번째(마지막):

1. PR 1 — Learning State Machine (`learningLoop.ts`) ✅ #530
2. PR 2 — Memory Eval Harness (`memoryEval.ts`) ✅ #531
3. **PR 3 (이 문서)** — Skill Runtime Activation Contract (`skillArchive.ts` 확장)

## 왜

지금까지 `SkillArchive`는 `suggested → curator_approved/pinned/rejected`까지만 있었다.
curator가 승인하면 그게 곧 "다음 agent가 써도 된다"로 흘러갈 위험이 있었다. 이 PR이
그 둘을 **다른 축**으로 분리한다:

> curator approval = 이 지식은 보관 가치가 있다
> runtime activation = 다음 agent가 실제로 runtime에 올려도 된다

## 두 축 (절대 섞지 않음)

| 축 | 값 | 도메인 |
|---|---|---|
| `SkillTrustStatus` (기존) | suggested / curator_approved / rejected / pinned | curator 판단 |
| `SkillActivationStatus` (신규) | inactive / eval_pending / eval_passed / active / quarantined | runtime 계약 |

**주의**: 이 `SkillActivationStatus`는 `MemoryRecord.activationState`(memory recall 쪽
상태)와 **다른 축**이며 그 타입을 재사용하지 않는다. 이름이 비슷해도 의미가 다르다.

`eval_passed ≠ active` — 평가를 통과한 것과 runtime에 올리기로 결정한 것은 분리.

## 파일

- `packages/protocol/src/skillArchive.ts` — 확장 (기존 함수/스키마 변경 0, append만)
- `packages/protocol/src/skillArchive.test.ts` — 19 tests 추가 (기존 8 그대로)
- `index.ts` — `skillArchive.js`가 이미 `export *` 이므로 자동 노출

## 계약 — `isSkillRuntimeLoadable`

runtime load 가능 조건 (모두 만족):

1. `trustStatus ∈ {curator_approved, pinned}`
2. `activationStatus === "active"`
3. `evalRunId` 또는 `evalWaiverReason` 중 하나 존재 (**pinned도 자동 면제 없음**)
4. `quarantined`가 아님 (격리는 pinned여도 무조건 차단)

`loadable=false`면 `reasons[]`에 막은 사유(`not_trusted` / `not_active` /
`no_eval_basis` / `quarantined`)를 채운다. waiver로 들어온 항목은 `waived=true`로 표식.

| trustStatus | activationStatus | evalRunId/waiver | loadable |
|---|---|---|---|
| curator_approved | active | evalRunId | ✅ |
| pinned | active | evalRunId | ✅ |
| pinned | active | (없음) | ❌ no_eval_basis |
| pinned | active | waiver | ✅ (waived) |
| suggested | active | evalRunId | ❌ not_trusted |
| rejected | * | * | ❌ |
| curator_approved | inactive/eval_pending/eval_passed | * | ❌ not_active |
| pinned | quarantined | evalRunId | ❌ quarantined |

## 전이 함수 (순수)

- `isSkillEvalEligible(candidate, activation)` — curator_approved/pinned & not quarantined
- `markSkillEvalPending(activation, now)` — eval 대기 (격리면 no-op)
- `markSkillEvalPassed(activation, evalRunId, now)` — eval 통과 (격리면 no-op)
- `activateSkill(activation, { activationScope?, evalWaiverReason?, now })` —
  **eval_passed + eval 근거**가 있을 때만 active로 전이, 아니면 no-op (자동 승격 금지)
- `quarantineSkill(activation, reason, now)` — 격리 (이후 모든 전이 no-op)
- `initialSkillActivation(candidateId)` — inactive 기본

## Manifest — `buildSkillRuntimeManifest`

결정론적:
- `Date.now`/랜덤 없음 — 같은 입력 → 같은 출력 (입력 순서 무관)
- `candidateId` asc 안정 정렬
- 중복 candidateId는 첫 등장만 유지(결정론적 dedupe)
- activation 레코드 없는 candidate는 inactive로 간주 → blocked(not_active)
- `scope` 주어지면 `activationScope` 불일치 항목은 loadable에서 제외
- 출력: `{ scope?, loadable: SkillRuntimeManifestEntry[], blocked: { candidateId, reasons }[] }`

## 검증

- `skillArchive.test.ts`: 27 tests pass (기존 8 + 신규 19, S1~S19)
  - S2~S9 loadability 매트릭스 (pinned-no-bypass / quarantine-always-blocks 포함)
  - S10~S13 전이 함수 (no-op 보장, 격리 후 전이 차단)
  - S14~S19 manifest (결정론 / 순서 무관 동일 / 중복 dedupe / scope 필터 / 빈 입력)
  - S1 `MemoryRecord.activationState` 재사용 안 함 명시 검증
- 전체 protocol vitest: 18 files / 183 tests pass
- `corepack pnpm typecheck`: 0 errors
- `corepack pnpm build`: green

## 명시적 비범위 (후속 실행 단계)

- 실제 runtime loader 구현 0 (이 PR은 계약 + manifest builder까지)
- `learningLoop.ts` 수정 0, `memoryEval.ts` 수정 0
- `MemoryRecord` schema / `activationState` 변경 0
- SimpleMem 연동 0, server route 0, UI 0, DB 0
- mission orchestrator wiring(consult gate / failure→learning / activation 주입)은
  protocol 계약(PR1~3)이 다 닫힌 뒤 별도 실행 PR로

## L8 최종 의미

```
실패 → 조사 → 검증 → 학습 후보 → 기억 평가 → 런타임 활성화 계약
 PR1   PR1    PR1     PR1         PR2          PR3
```

protocol 계약 3개가 모두 닫혔다. 다음은 이 계약들을 orchestrator runtime에 연결하는
실행 단계 — 단, 모든 async/learning/activation은 EventStorage + eval/approval 계약
아래에서만.
