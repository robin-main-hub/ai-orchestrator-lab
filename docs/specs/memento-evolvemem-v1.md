# Memento × EvolveMem v1 — implementation spec

> **상태**: ✅ ready to implement · **owner**: Codex (다음 라운드) · **layer**: protocol + runtime
> **source paper**: [EvolveMem: Self-Evolving Memory Architecture via AutoResearch for LLM Agents](https://arxiv.org/abs/2605.13941) (arXiv:2605.13941v1, May 2026)
> **reference code**: [aiming-lab/SimpleMem](https://github.com/aiming-lab/SimpleMem)
> **related decisions**: `docs/design-decisions.md` §10 (migration priority), `docs/05-memory-memento.md` (legacy spec)

---

## 0. 한 줄 요약

EvolveMem 논문의 핵심 아이디어 중 **AutoResearch 루프를 제외한 4가지** 를 Memento 에 이식. 단일 branch + 단일 PR. UI 작업 없음 (Claude 영역).

이식 대상:
1. Memory unit schema 풍부화 (7개 신규 optional 필드)
2. Multi-view fusion (BM25 lexical + metadata + RRF) — semantic view 는 stub
3. Importance decay + entity reinforcement
4. Raw recall log 적재 (.jsonl, AutoResearch v2 의 입력)

명시적 비목표 (v2 로 미룸):
- diagnose → propose → guard 의 self-evolution 루프 자체
- semantic embedding view 활성화 (embedding provider 결정 후)
- Memento panel UI 의 새 필드 표시 (Claude 영역)

---

## 1. EvolveMem 논문 핵심 요약

논문의 진짜 노벨티는 "기억을 더 잘 저장" 이 아니라 **"검색 설정 자체가 LLM 진단 루프로 진화"**.

- 기존 메모리 시스템 (Mem0, MemGPT, MemoryBank, SimpleMem) 은 stored content 만 진화, retrieval infrastructure (scoring functions, fusion weights, context budgets, answer styles) 는 deployment 시점에 고정.
- EvolveMem 은 retrieval config 전부를 evolvable action space 로 노출 + LLM-powered diagnose 모듈이 per-question failure log 를 읽고 config delta 제안 + guarded meta-analyzer 가 revert-on-regression 으로 안전하게 적용.
- 결과: LoCoMo 벤치 F1 0.305 → 0.543 (R0 → R7), **78% 상대 개선**, MemBench accuracy +18.9%.
- 사람 개입 0. 7 round 안에 자동 수렴.

우리는 이 중 **infrastructure 진화 루프는 보류**, 그 루프가 가동되기 위한 **데이터/스키마 기반 4가지만 먼저 깔아둠**. log 만 적재해두면 v2 에서 진화 루프 추가가 직접 가능.

---

## 2. Memory placement contract (필수 명문화)

EvolveMem 논문 Appendix F (Prompt Catalog) 가 사용하는 모든 user prompt 가 **일관되게 다음 순서**:

```
Question: {question}
Context:
{retrieved memories}
Rules: ...
```

흔한 RAG 튜토리얼의 "context 먼저, 질문 나중" 의 **정반대**.

근거: LLM 이 question 을 working memory 에 먼저 올려두고 context 를 스캔해야 attention 가중치가 정밀하게 걸림. context 먼저 던지면 무엇을 찾을지 모른 채 처음 부분에 anchor 됨.

### 우리 적용 규칙

| 위치 | 무엇이 들어감 |
|---|---|
| **System prompt (TOP)** | persona + pinned + trusted layer 기억. 거의 안 바뀌는 것만. |
| **User message** | (1) Question, (2) 아래에 동적 recall context, (3) 그 아래 rules |
| **Assistant turn** | memory injection 안 함 |

### 코드 계약

memory 를 prompt 에 합성하는 모든 진입점에 다음 주석:

```ts
// Memento placement: design-decisions §12 — Context BELOW Question
```

`design-decisions.md` 에 §12 (Memory placement contract) 신규 섹션 추가 — 본 문서 §2 를 헌장 형태로 옮김.

---

## 3. Schema 확장

대상: `packages/protocol/src/index.ts` 의 `memoryRecordSchema` (현재 라인 1552 근처).

### 변경 원칙

- **신규 필드는 전부 optional**. 기존 required 필드 0개 변경.
- 위치: 기존 필드 뒤, `pinned` 위.
- Backup projection · replay · 다른 controller 가 전부 backward compat 유지되어야 함.

### 신규 필드

```ts
losslessRestatement: z.string().optional(),  // 대명사 금지, 절대 날짜. EvolveMem SSC 핵심
keywords: z.array(z.string()).optional(),    // BM25 view 입력. LLM 이 추출한 단어만
entities: z.array(z.string()).optional(),    // 객체/제품/장소
persons: z.array(z.string()).optional(),     // 사람 이름
topic: z.string().optional(),                // 단일 phrase
importance: z.number().min(0).max(1).optional(),       // 0~1. 초기 0.5. 사용자 pinned 와 별개
entityReinforcement: z.number().min(0).optional(),     // 누적 score. 초기 0
```

### 필드별 존재 이유

| 필드 | 왜 필요 |
|---|---|
| `keywords` | BM25 view 의 입력. content 전체 토크나이즈하면 noise 큼; LLM 이 추출한 keyword 만 색인하면 noise 1/10, recall precision 2~3 배. |
| `entities` / `persons` | structured-metadata view 의 입력. "Maomao 가 한 말 다 보여줘" 같은 entity-based query 가 즉시 통과. |
| `topic` | clustering · stale 감지 보조. |
| `importance` | pinned 와 별개. pinned = 사용자가 명시, importance = 자동 (decay + reinforce). |
| `entityReinforcement` | 같은 entity 가 다시 등장할 때마다 += 0.1. 자주 언급되는 entity 관련 기억이 자동으로 위로 떠오름. |
| `losslessRestatement` | recall 시 LLM 에게 던지는 건 이 필드. content (원문) 는 너무 길고 모호함. EvolveMem 의 SSC (Semantic Structured Compression) 핵심 원리. |

### RecallResult 도 확장

같은 파일의 `RecallResult` 에 fusion 결과 노출용 optional 필드 추가:

```ts
fusionDetail?: {
  views: Array<{ view: "lexical" | "semantic" | "metadata"; rank: number; rawScore: number }>;
  fusionMode: "rrf" | "sum" | "weighted_sum";
};
```

기존 `score: number` 는 유지. fusion 결과가 그 score 에 들어감.

---

## 4. Multi-view 검색 모듈

신규 파일: `apps/desktop/src/runtime/memoryViews.ts`. ~250 LOC 예상. 순수 함수, 의존성 0.

### Export 시그너처

```ts
export type ViewResult = { recordId: string; rank: number; rawScore: number };
export type FusionResult = { recordId: string; fusedScore: number; viewBreakdown: ViewResult[] };

export function lexicalView(
  query: string,
  records: MemoryRecord[],
  k: number,
): ViewResult[];

export function semanticView(
  query: string,
  records: MemoryRecord[],
  k: number,
): ViewResult[];

export function metadataView(
  query: string,
  records: MemoryRecord[],
  k: number,
  extracted: { persons: string[]; entities: string[] },
): ViewResult[];

export function rrfFuse(viewResults: ViewResult[][], k?: number): FusionResult[];
```

### 각 view 구현 메모

**`lexicalView` (BM25 직접 구현, ~50줄)**

- 논문 기본 상수: k1=1.5, b=0.75
- doc length avg 는 records 전체의 `keywords.length` 평균 (없으면 content token 수 평균)
- IDF: `Math.log((N - df + 0.5) / (df + 0.5) + 1)` (양수 보정)
- 한 record 의 `keywords` 가 비어 있으면 `content` 를 `/\s+/` split + lowercase 해서 fallback token 으로 사용
- ko / en 둘 다 단순 whitespace split 으로 충분 (한국어 형태소 분석기 도입 X — v2)

**`semanticView` (STUB)**

- `return [];` 만. 함수 시그너처와 호출 위치만 박아두고 향후 활성 대비.
- 절대 sentence-transformer / faiss / 임베딩 npm 패키지 도입 금지.

**`metadataView`**

- score = `|query.entities ∩ record.entities| + |query.persons ∩ record.persons|`
- 매칭 record 만 반환 (score > 0)
- top-k 잘라서 반환

**`rrfFuse` (Reciprocal Rank Fusion)**

- 논문 정의: `score(record) = Σ_v 1/(k + rank_v(record))`
- 기본 k=60 (논문 기본)
- 같은 record 가 여러 view 에 등장하면 rank 합산
- score-scale 차이에 robust — 한 view 가 score 1000, 다른 view 0.01 이어도 rank 기반이라 결과 동일

---

## 5. Stage6Memory 통합

대상: `apps/desktop/src/runtime/stage6Memory.ts`.

### 기존 recall path 교체 (시그너처 유지)

```
1. 입력 query 에서 persons/entities 추출
   — 간단히: query 의 capitalize 단어 + seed 의 known entity lookup
   — LLM 호출 X, 정규식 + 사전 매칭만
2. 3개 view 각각 top-k 호출 (상수: k_lex=10, k_sem=10, k_meta=10)
3. rrfFuse 호출
4. fused top-B 잘라서 결과로 반환 (상수: B_ctx=8)
5. 각 결과의 score 필드에 fused score 매핑, fusionDetail 채움
```

**기존 함수 시그너처** (`Stage6MemoryInspector`, `Stage6RememberInput`, `Stage6MemorySnapshotInput` 등) **변경 금지**. 내부 구현만 교체.

### Reconcile pass (신규)

별도 함수 또는 기존 reconcile 호출 안에:

- **Importance decay**: 호출당 1회 (tick). 모든 record 의 `importance = max(0.1, importance - 0.01)`. 초기값 없으면 0.5 로 처음 진입.
- **Entity reinforcement**: 현재 recall query 의 entities/persons 와 매칭되는 record 의 `entityReinforcement = min(5.0, entityReinforcement + 0.1)`.
- 최종 ranking 시:
  ```
  s = fusedScore + 0.2 * importance + 0.1 * entityReinforcement
  ```
  가중치는 모듈 상수로.

---

## 6. Raw recall log

대상: 매 recall 호출마다 jsonl append.

### 경로

`apps/desktop/.cache/memento_recall_log.jsonl`

`apps/desktop/.gitignore` (없으면 생성) 에 `.cache/` 추가.

### Line schema

```jsonc
{
  "ts": "ISO-8601",
  "sessionId": "...",
  "query": "...",
  "extractedEntities": ["..."],
  "extractedPersons": ["..."],
  "viewSizes": { "lexical": 10, "semantic": 0, "metadata": 4 },
  "returned": [
    {
      "recordId": "...",
      "fusedScore": 0.42,
      "viewBreakdown": [
        { "view": "lexical", "rank": 1, "rawScore": 3.2 }
      ]
    }
  ],
  "policy": { "autoRecallAllowed": true, "reason": "..." }
}
```

### 구현 노트

- `fs.appendFileSync` 사용. 디렉토리 없으면 mkdir -p 후 append.
- 한 줄당 `JSON.stringify(...) + "\n"`.
- 실패 시 `console.warn` 만, **throw X** — recall 자체는 성공해야 함.
- 테스트 환경 (vitest) 에서는 env `MEMENTO_RECALL_LOG_DISABLED=1` 이면 skip — 테스트 실행이 jsonl 더럽히지 않도록.

### v2 활용 예고

이 로그가 EvolveMem 의 AutoResearch 루프 입력이 됨. v2 에 추가될 diagnose 모듈이 이 jsonl 을 읽고 per-question failure pattern 을 분류, retrieval config delta 제안.

---

## 7. Seed 데이터 마이그레이션

대상: `apps/desktop/src/seeds/` 아래 모든 memory 관련 seed (`conversation.ts` 의 memory record, `debateMockData.json` 의 memory 등).

각 record 에 신규 필드 채워넣기:

| 필드 | 채우는 법 |
|---|---|
| `keywords` | title + content 에서 추출한 핵심 단어 3~7개. ko/en 혼용 OK. |
| `entities` | 등장하는 객체/제품/장소 이름. |
| `persons` | 등장 사람 이름. |
| `topic` | 한 줄 phrase. |
| `losslessRestatement` | "&lt;persons&gt; 가 &lt;when&gt; &lt;where&gt; 에서 &lt;what&gt;" 풀어쓴 한 문장. |
| `importance` | 0.5 기본. 특별히 중요 표시된 건 0.7. |
| `entityReinforcement` | 0. |

모든 seed 가 빠짐없이 채워져야 함. optional 이지만 default 값을 명시적으로 부여하는 게 검색 품질에 즉시 영향.

우선순위:
1. `apps/desktop/src/seeds/conversation.ts` 의 memory seed 전체
2. `debateMockData.json` 의 memory 관련
3. 그 외

17 persona 의 모든 seed 채워야 함. 자동 추출이 어려우면 합리적 best guess 로 채워 넣을 것 (퀄리티는 후속 보강).

---

## 8. 테스트

### 신규 파일: `apps/desktop/src/runtime/memoryViews.test.ts`

최소 5개 case:

1. `lexicalView` 가 keyword 정확 매칭 record 를 1위로 반환
2. `metadataView` 가 entity 교집합 score 로 정렬
3. `semanticView` 는 빈 배열 반환 (stub 확인)
4. `rrfFuse` 가 동일 record 가 여러 view 에 등장 시 rank 합산 (논문 Eq. 검증)
5. `rrfFuse` 가 view 마다 score scale 달라도 robust — 한 view score 1000, 다른 view 0.01 이어도 rank 기반이라 결과 동일

### 추가: `apps/desktop/src/runtime/stage6Memory.test.ts`

2개 case 추가:

6. importance decay tick 후 모든 record 의 importance 가 0.01 감소 (floor 0.1 미만 X)
7. entity reinforcement: recall query 에 "Maomao" 포함 시, persons 에 "Maomao" 가진 record 의 entityReinforcement 가 += 0.1

### 기존 테스트

22 file / 92 test 전체 통과 유지. 새 필드 때문에 깨지는 기존 테스트는 fixture 에 default 값 (`importance: 0.5`, `entityReinforcement: 0` 등) 추가해서 살리고, 테스트 의도는 보존.

---

## 9. 작업 순서 (단일 branch, 한 번에 처리)

branch: `codex/desktop-memento-evolvemem-uplift`

각 단계 끝나면 typecheck + vitest 통과 확인 후 다음 단계.

```bash
cd apps/desktop && node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
cd apps/desktop && node ../../node_modules/vitest/vitest.mjs run --passWithNoTests
```

순서:

1. Schema 확장 (§3) — 가장 침범적, 빨리 끝내야 type error 발견
2. `memoryViews.ts` 신규 (§4) — 의존성 0, 순수 함수
3. `stage6Memory.ts` 통합 (§5) — 기존 시그너처 유지
4. raw log (§6)
5. seed 마이그레이션 (§7)
6. doc 추가 (§2 → `design-decisions.md` §12 신규 섹션)
7. 테스트 추가 (§8)
8. gitignore

의미 단위로 3~5 commit. push + PR 생성.

### PR body 형식 (한국어)

```markdown
## Summary
- EvolveMem (arXiv:2605.13941) 의 schema 풍부화 + multi-view fusion + raw recall log + placement contract 4가지 이식
- AutoResearch 루프는 v2 보류 — log 적재까지만

## Schema 변경
- MemoryRecord 에 7개 optional 필드 추가 (losslessRestatement / keywords / entities / persons / topic / importance / entityReinforcement)
- 기존 필드 0개 변경 — backward compat 100%

## Runtime
- memoryViews.ts 신규 (BM25 lexical + metadata filter + RRF fusion. semantic view 는 stub)
- stage6Memory.ts 가 새 fusion 호출 + importance decay + entity reinforcement
- recall 호출마다 .cache/memento_recall_log.jsonl 적재

## Doc
- design-decisions.md §12 신규: Memory placement contract (Context BELOW Question 명문화)

## Test
- memoryViews.test.ts 신규 5 case
- stage6Memory.test.ts +2 case (decay, reinforce)
- 기존 92 test 전체 통과 유지

## NOT in this PR (의도적)
- AutoResearch 루프 (diagnose/propose/guard) — v2
- semantic embedding view 활성화 — provider 결정 후
- Memento panel UI 의 새 필드 표시 — Claude 작업 영역
```

---

## 10. 제약사항 (DO NOT)

이 8가지 중 하나라도 어기면 PR 거부.

1. ❌ **AutoResearch 루프 (diagnose/propose/guard) 구현 금지.** raw log 적재까지만. v2.
2. ❌ **새 npm 의존성 추가 금지.** BM25 는 50줄로 직접 구현 가능. `lunr` / `elasticlunr` / `sentence-transformers` / 임베딩 라이브러리 등 일체 금지.
3. ❌ **`MemoryRecord` 의 기존 required 필드 변경 금지.** 새 필드는 전부 optional. `id / title / content / sourceChannel / trustLevel / pinned / createdAt / layer` 같은 기존 필드의 type / required 상태 절대 바꾸지 말 것 — backup projection / replay / 다른 controller 가 깨짐.
4. ❌ **UI 작업 금지.** `apps/desktop/src/components/EvolveMementoPanel.tsx` (구 `MementoPanel.tsx`, "EvolveMemento" 로 unified rename 됨) 및 `.memento-v2__*` CSS 절대 건드리지 말 것 (Claude 의 작업 영역, 충돌 발생). `MementoInspectorPanel.tsx` (legacy) 도 마찬가지로 보존.
5. ❌ **semantic embedding view 활성화 금지.** stub function (`return []`) 으로 둘 것. embedding provider 결정이 별도 일.
6. ❌ **Context 를 Question 위에 두는 prompt 작성 금지.** 논문 Appendix F 전부 일관되게 `Question:` 먼저, `Context:` 아래. 어떤 prompt template 짤 때든 이 순서.
7. ❌ **기존 테스트 비활성화 / skip / 삭제 금지.** 새 필드 때문에 깨지는 테스트는 fixture 에 default 값 추가해서 살릴 것.
8. ❌ **`apps/desktop/src/App.tsx`, `apps/desktop/src/runtime/stage4Runtime.ts`, `stage35DelegationRuntime.ts` (Codex delegation runtime) 건드리지 말 것.** controller layer 만 손대고 runtime / app 진입점은 그대로.

---

## 11. 막혔을 때 행동 지침

- **type error 가 5분 이상 안 풀리면** → 가장 최근 commit 으로 git stash 하고 단계 다시 시도. 임시방편으로 `as any` 캐스팅 절대 금지 (PR 거부됨).
- **테스트가 새 필드 때문에 깨지면** → 그 테스트의 fixture 에 새 필드 default 값 추가. 테스트 의도는 보존.
- **seed 데이터가 너무 많아 막막하면** → §7 의 우선순위 따르고, 자동 추출 어려운 건 best guess 로 채워 넣을 것.
- **AutoResearch 루프 구현 욕망이 들면** → 무시. v2.
- **새 라이브러리 설치하고 싶어지면** → 무시. 직접 구현.

---

## 12. 성공 기준

다음 6개 전부 true 면 성공:

1. `tsc --noEmit` exit 0
2. `vitest run` 전체 통과 (22 file + 신규 / 92 test + 신규)
3. `git diff main..HEAD` 가 `apps/desktop/src/components/` 아래 어떤 파일도 변경 X (UI 영역 보호)
4. `package.json` 의 dependencies / devDependencies 변경 X
5. `docs/design-decisions.md` 에 "§12" 헤더 존재 + "Context BELOW Question" 문구 존재
6. PR 가 `robin-main-hub/ai-orchestrator-lab` 에 생성됨, body 에 위 §9 형식 포함

---

## 13. 예상 효율 (왜 가치 있는가)

EvolveMem 논문 수치 + 우리 컨텍스트 환산:

- **LoCoMo 벤치**: SimpleMem 0.432 F1 → EvolveMem 0.543 F1 = +25.7% (with AutoResearch). 우리는 AutoResearch 빼고도 schema + multi-view 만으로 SimpleMem 수준 (~0.432) 까지 갈 수 있음. 현재 단일-view 는 SimpleMem 이전 (MemGPT 0.404) 수준이라 가정하면 **+7~10% recall accuracy**.
- **Token 사용량**: 논문 Appendix D.3 에 30x 감소 언급. 우리는 `losslessRestatement` (50~150 tokens) 만 prompt 에 넣고 `content` (500+ tokens) 는 안 넣음 → **3~5x token 절감**. 비용 직결.
- **사용자 체감**: 가장 큰 효과는 "Maomao 가 했던 말" / "지난 미팅 결정" 같은 entity/temporal query 의 정확도. 현재 단일 fuzzy score 는 이 두 query type 에서 실패율 높음.
- **v2 unlock**: raw log 적재로 AutoResearch 루프 추가가 데이터 변경 0 으로 가능해짐. 다음 라운드 작업의 base.

---

## 14. v2 예고 (이 PR 의 scope 아님, 미리 보기만)

이 PR 완료 후 v2 (별도 spec) 에서 추가될 항목:

1. **AutoResearch 루프**: raw log 를 입력으로 LLM 진단 모듈이 retrieval config delta 제안, guarded meta-analyzer 가 revert-on-regression 으로 적용. 7 round 안에 수렴.
2. **Semantic embedding view 활성화**: embedding provider 결정 (DGX local? OpenAI? bge-base?) 후 `semanticView` stub 을 실제 구현으로 교체.
3. **Query decomposition** (논문 Eq. 11): multi-hop question 을 LLM 으로 single-hop sub-question 들로 분할, 결과 RRF 병합.
4. **Adversarial entity-swap** (논문 Eq. 10): query 에서 person 이름 제거 후 topic 만으로 parallel 검색, union.
5. **Answer verifier 2-pass**: 우리 `verifier` persona (Makise) 를 low-confidence 응답의 second-pass reviewer 로 wire. 논문의 `enable_answer_verification` 와 1:1 매핑.
6. **Memento panel UI**: 새 필드 (importance bar, entity chips, topic, fusion view breakdown) 표시 — Claude 작업 영역.

각 항목은 별도 PR / spec.
