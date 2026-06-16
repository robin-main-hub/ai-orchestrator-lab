# 101 — Memory Eval Harness (Orchestration OS L8, PR 2)

## 한 줄

기억 검색 결과를 **재판하는 순수 계측기**. "기억을 많이 저장했는가"가 아니라
"검색 결과가 옳은가"를 결정론적으로 채점한다. 실제 recall 엔진을 구현하지 않고,
이미 나온 retrieval 결과(`memoryId` + `rank`)를 받아 점수/판정만 낸다. 기억을
승격·활성화하지 않는다(그건 PR 3).

L8 3-PR 스택의 두 번째:

1. PR 1 — Learning State Machine (`learningLoop.ts`) ✅ #530
2. **PR 2 (이 문서)** — Memory Eval Harness (`memoryEval.ts`)
3. PR 3 — Skill/Memory Runtime Activation Contract (후속)

## 왜

지금까지 메모리 품질은 "검색이 좋아진 것 같음"이라고밖에 말할 수 없었다. 이 하네스
이후엔 채점표로 말할 수 있다:

```
recall@5 = 0.8
forbiddenHitRate = 0
staleHitRate = 0.1
contradictedHitIds = []
```

SimpleMem / Memento가 "기억 좋아졌다"를 주장하려면 먼저 이 채점기가 있어야 한다.

## 파일

- `packages/protocol/src/memoryEval.ts`
- `packages/protocol/src/memoryEval.test.ts` (23 tests)
- `packages/protocol/src/index.ts` — export 추가

## API

```ts
evaluateMemoryRecall(input: MemoryEvalInput): MemoryEvalReport
evaluateMemoryRecallBatch(inputs): { reports, summary: MemoryEvalMetricSummary }
```

입력: `expectedMemoryIds`, `forbiddenMemoryIds?`, `retrieved[{memoryId, rank, score?}]`,
`recordsById?`, `relations?`, `k?`, `now?`, `staleAfterDays?`, `strictStaleness?`.

출력: `recallAtK`(expected 비면 null), `expectedHitIds`, `missingExpectedIds`,
`forbiddenHitIds` + `forbiddenHitRate`, `staleHitIds` + `staleHitRate`,
`contradictedHitIds`, `supersededHitIds`, `unknownRetrievedIds`, `verdict`,
`blockers`, `warnings`.

## 채점 규칙 (전부 결정론적, 순수)

| 분류 | 조건 | 결과 |
|---|---|---|
| forbidden/unsafe | 명시적 `forbiddenMemoryIds`, `tombstonedAt` 있음, `activationState=quarantined` | **fail (blocker)** |
| stale | `activationState=inactive`, 또는 freshness 초과(`now` + `staleAfterDays`) | warning (기본) / `strictStaleness`면 fail |
| contradicted | retrieved 기억이 `contradicts` 관계에 걸림 | warning (separate 보고) |
| superseded | retrieved 기억이 `supersedes`의 `toRecordId`(대체당함) | warning (separate 보고) |
| unknown | `recordsById`에 없는 retrieved id | warning (crash 아님) |
| answerable empty | expected 있는데 top-k에서 0건 | **fail** |

추가 불변:
- 중복 retrieved id는 recall을 부풀리지 못한다 — `memoryId`로 dedupe, 최저 rank 유지.
- rank 순서가 @k를 결정한다 (rank asc 상위 k).
- expected 비면 `recallAtK = null` (0 나눗셈 금지). 단 forbidden hit이 있으면 여전히 fail.
- forbidden과 tombstoned/quarantined가 겹쳐도 forbidden으로만 분류(이중 카운트 금지).
- verdict 우선순위: **fail > warning > pass**.

## 검증

- `memoryEval.test.ts`: 23 tests pass (M1~M23)
  - recall@k / dedupe / rank order
  - forbidden / tombstoned / quarantined → fail
  - inactive·freshness stale → warning, strict → fail
  - contradicts / supersedes 분리 보고
  - unknown id warning / 빈 expected null / answerable empty fail / verdict priority / batch
- 전체 protocol vitest: 18 files / 164 tests pass
- `corepack pnpm typecheck`: 0 errors
- `corepack pnpm build`: green

## 명시적 비범위

- `learningLoop.ts` 수정 0 (index export만)
- MemoryRecord schema 변경 0
- activationState 변경 0 / SkillArchive runtime activation 0 (PR 3)
- SimpleMem 연동 0, 실제 recall 엔진 0
- DB / UI / server route 0
