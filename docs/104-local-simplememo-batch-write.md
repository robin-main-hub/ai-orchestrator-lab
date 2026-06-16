# 104 — local SimpleMemo batch write (Execution Stage B2)

## 한 줄

B1 입구(adapter seam) 뒤에 **주입된 local writer**로 accepted candidate를 실제로
write하는 async 경로. writer가 없으면 절대 성공 처리하지 않는다. 아직 어떤
orchestrator도 자동으로 이 경로를 호출하지 않는다(그건 C).

```
B1 (#533) — batchRemember adapter seam (plan only, no write)   ✅
B2 (이 문서) — local writer 주입 실제 write                     ← 지금
C1 — Mission failure → learning.failure.recorded
C2 — verified/distilled → batchRemember
C3 — memoryEval → skill activation manifest
D1 — ERP Evidence bridge
```

## 무엇이 추가됐나

B1의 sync `batchRemember`(plan-only, placeholder)는 **그대로 둔다**(B1-14가 검증 중).
B2는 순수 additive async 함수를 더한다:

```ts
executeLocalBatchWrite({ candidates, writer?, config? }): Promise<LocalBatchWriteResult>

interface LocalSimpleMemoWriter {
  remember(input: MemoryInput, candidateId: string): Promise<LocalSimpleMemoWriteResult>;
}
type LocalSimpleMemoWriteResult =
  | { ok: true; memoryId?: string }
  | { ok: false; errorCode?: string; reason?: string };
```

흐름: `planBatchRemember(accepted only) → writer.remember(순차) → per-candidate 결과`

## 파일

- `packages/simplememo/src/batchRemember.ts` — `executeLocalBatchWrite` + 타입 (append)
- `packages/simplememo/src/batchRemember.test.ts` — 13 tests 추가 (B1 19 그대로)
- `packages/simplememo/src/index.ts` — export 추가

## 안전선 (B2 핵심)

| 룰 | 구현 |
|---|---|
| writer 미주입이면 절대 성공 처리 0 | accepted → skipped(`local_writer_missing`), observed:false, blocker |
| accepted만 writer 호출 | rejected/skipped는 writer 호출 0 (B2-3,4,5) |
| writeObserved:true는 실제 ok일 때만 | writer가 `{ok:true}` 반환 시에만 |
| 한 candidate 실패가 배치 전체 성공으로 안 됨 | partial 정직 표기 — failedCount 별도 (B2-6) |
| writer throw 격리 | candidate 단위 `writer_threw`, 배치 crash 0 (B2-7) |
| 전부 실패 → observed:false | writtenCount 0 (B2-8) |
| 결정론적 id 유지 | B1 `deriveBatchCandidateId` 그대로 (B2-9) |
| candidateId를 멱등 키로 writer에 전달 | (B2-12) |
| 자동 trusted/active 승격 0 | result에 trust/activation 필드 없음 (B2-10) |
| HNSW 기본 off, B2도 index 안 켬 | forceHnsw=true여도 warning만 (B2-11) |
| 숨은 백그라운드 0 | 순차 await, 즉시 반환 |

batch-level `observed` = writer 존재 && writtenCount > 0.

## 검증

- `batchRemember.test.ts`: 32 tests pass (B1 19 + B2 13, B2-1~B2-13)
- 전체 simplememo vitest: 10 files / 203 tests pass
- `corepack pnpm typecheck`: 0 errors
- `corepack pnpm build`: green
- 기존 테스트 skip/weaken 0

## 명시적 비범위

- learningLoop 자동 호출 0 → C2
- Mission Orchestrator wiring 0 → C
- ERP Evidence bridge 0 → D
- 실제 SimpleMem/DGX 원격 서버 0, HNSW/index 활성화 0
- runtime activation 0, server route / UI / DB 0
- protocol 변경 0 (MemoryInput만 import)

## B2 이후 상태

> 학습 후보/증거 후보를 local SimpleMemo에 실제로 저장할 수 있는 adapter가 생겼다.
> 하지만 아직 어떤 orchestrator도 자동으로 이 adapter를 호출하지 않는다.
