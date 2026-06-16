# 103 — batchRemember Adapter Seam (Execution Stage B1)

## 한 줄

학습 루프의 distilled candidate / 승인된 evidence를 MemoryAPI 뒤쪽으로 **안전하게
넘길 수 있는 입구**(adapter seam). 입구일 뿐, 실제 저장/검색 index/runtime 활성화를
하지 않는다. mock/disabled가 기본 모드. 가짜 성공 0.

L8 protocol 계약(#530/#531/#532)이 다 닫힌 뒤 시작하는 **실행 단계**의 첫 슬라이스다.

```
실행 단계 순서:
  B1 (이 문서) — batchRemember adapter seam        ← 지금
  B2 — local SimpleMemo batch write 구현
  C1 — Mission failure → learning.failure.recorded
  C2 — verified/distilled → batchRemember
  C3 — memoryEval → skill activation manifest
  D1 — ERP Evidence bridge read-only candidate export
```

## 왜 B1만

`batchRemember → 실제 저장 → 검색 index → learning wiring → activation → next spawn`을
한 PR에 넣으면 어디서 틀어졌는지 못 가린다. B1은 **입구 경계만** 만든다 — C wiring이
가짜가 되지 않도록 안전한 adapter가 먼저 있어야 한다.

## 파일

- `packages/simplememo/src/batchRemember.ts`
- `packages/simplememo/src/batchRemember.test.ts` (19 tests)
- `packages/simplememo/src/index.ts` — export 추가

protocol은 건드리지 않는다(`MemoryInput`만 import).

## API

```ts
createBatchRememberAdapter(config): BatchRememberAdapter
planBatchRemember(candidates, config): { results, warnings, effectiveConfig }  // 순수
deriveBatchCandidateId(candidate): string  // 결정론적
```

candidate: `{ input: MemoryInput, sourceEventIds?, evidenceRefs?, initialTrust, origin }`
- `origin`: `learning_loop | evidence_bridge | manual | test_fixture`
- `initialTrust`: `suggested | candidate | unverified` (suggested-like만 — 자동 trusted 금지)

result: `{ mode, observed, acceptedCount, skippedCount, rejectedCount, results[], warnings, blockers, effectiveConfig }`

## 안전 불변선 (seam이 강제)

- **자동 trusted/active 승격 0** — result에 trustStatus/activationStatus/trusted/active 필드 자체가 없음
- **숨은 백그라운드 write 0** — 즉시 결정론적 반환
- **가짜 성공 0** — disabled/mock/placeholder는 `observed:false`
- source refs(`sourceEventIds` 또는 `evidenceRefs`) 없으면 → rejected(`no_source_refs`)
- 빈 content → rejected(`empty_content`)
- `maxBatchSize`(scan cap) 초과분 → skipped + warning
- HNSW 기본 off (`forceHnsw=false`); true여도 B1은 실제 index 안 켬(placeholder warning)
- soft RRF cutoff 기본 안전값(`rrfImportanceCutoff=0.05`, `rrfCutoffMode="soft"`)
- runtime activation / SimpleMem 서버 / ERP bridge / orchestrator wiring 0

## adapter 모드

| 모드 | 동작 | observed |
|---|---|---|
| `disabled` | accepted를 skipped(`adapter_disabled`)로 강등 | false |
| `mock` (기본) | 검증/분류만, 저장 시뮬레이션 | false |
| `local_simplememo` | placeholder — `write_path_not_implemented_b1` blocker | false |
| `dgx_simplememo_placeholder` | placeholder — 동일 | false |

rejected candidate는 모든 모드에서 정직하게 rejected 유지.

## 결정론

`deriveBatchCandidateId` = FNV-1a(`origin | title | content | sorted(refs)`). Date.now/랜덤 0.
같은 입력(refs 순서 무관) → 같은 id. `planBatchRemember`/adapter 출력도 같은 입력 → 같은 출력.

## 검증

- `batchRemember.test.ts`: 19 tests pass (B1-1 ~ B1-19)
  - 결정론 id / refs 순서 무관 / 검증(empty·no-refs·evidence alone) / scan cap / 순서 보존
  - HNSW off 기본 / soft cutoff 안전 / 모드별(mock/disabled/placeholder) observed:false
  - rejected 정직 유지 / 자동 승격 필드 없음 / 빈 배치 / effectiveConfig 정직
- 전체 simplememo vitest: 10 files / 190 tests pass
- `corepack pnpm typecheck`: 0 errors
- `corepack pnpm build`: green

## 명시적 비범위

- 실제 저장(local SimpleMemo write) **0** → B2
- Mission Orchestrator wiring **0** → C
- ERP Evidence bridge **0** → D
- 실제 SimpleMem 서버 / HNSW index 활성화 **0**
- runtime loader / 자동 memory activation **0**
- server route / UI / DB migration **0**
- 기존 테스트 skip/weaken **0**
