# Memory Adapter Spec

> **2026-06-15 rename**: 패키지 이름은 `@ai-orchestrator/simplememo` (이전 `@ai-orchestrator/memory`),
> 클래스는 `SimpleMemAdapter` (이전 `DgxSimpleMemMemoryAdapter`), `MockAdapter` (이전 `MockMemoryAdapter`).
> 본문은 spec 작성 당시 이름 그대로 둠(역사적 정확성). 코드 작업할 땐 새 이름 사용.
> 관련 커밋: `cf3f6d6`.

`MemoryAPI` (개념: docs/05, 로컬 구현: docs/18, DGX-02 authority + SimpleMem 배치: docs/28) 의 후속 단계. 추상 인터페이스가 LocalHeuristic / MementoMcp / DgxSimpleMem 3개 backend 를 일관된 contract 로 받도록 어댑터 계층을 명세한다. `LlmAdapter` (docs/24) 가 5개 provider 를 받는 패턴을 memory 쪽에도 동일하게 적용.

관련 문서: [`05-memory-memento.md`](05-memory-memento.md) (개념), [`13-event-store-permission-redaction.md`](13-event-store-permission-redaction.md) (Event Store + redaction), [`18-memento-mcp-structure-check.md`](18-memento-mcp-structure-check.md) (현재 구현 gap), [`24-provider-adapters.md`](24-provider-adapters.md) (LlmAdapter 패턴), [`28-simplemem-continuity-memory.md`](28-simplemem-continuity-memory.md) (DGX authority + PR-M0~M3 계획), [`29-permission-engine-spec.md`](29-permission-engine-spec.md) (F7 redaction pipeline), [`agents/memory_curator/`](../agents/memory_curator/) (페르소나).

## 1. 왜 지금 이 spec

protocol 에 `MemoryAPI` 인터페이스 (9 method) 와 `MemoryRecord` / `RecallQuery` / `MemoryContextPacket` 등 schema 는 이미 박혀 있다. 데스크톱 런타임에 `stage27MemoryApi` 가 로컬 deterministic adapter 로 구현해 두었다.

그러나 다음 단계인 **실 backend 연결** (Memento MCP server, DGX SimpleMem index) 을 만들 때 4개 질문에 합의된 답이 없다:

1. `MemoryAPI` 9 method 중 어느 것이 어댑터 책임이고 어느 것이 caller 책임인가? (예: `reflect()` 는 LLM 호출이 필요한데 어댑터가 LLM 을 알아야 하나)
2. 어댑터 간 trust 강제는 어디서 하나? (각 어댑터 내부 vs 공통 wrapper)
3. 실패 모드 분류는 `AdapterError` (provider 용 9 category) 와 같은 taxonomy 인가, 다른 taxonomy 인가?
4. Server 는 memory 호출을 어떻게 노출하나? (`/memory/*` endpoint vs 기존 endpoint 에 옵션)

이 4개를 닫지 않으면 PR-M2 (Mock SimpleMem) 다음 PR-M3 (실 MCP) 가 큰 인터페이스 변경을 동반하게 된다. 그래서 spec 부터.

## 2. 현재 상태 지도

| 항목 | 위치 | 상태 |
|---|---|---|
| `MemoryAPI` 인터페이스 (9 method) | `packages/protocol/src/index.ts:1145` | ✅ 박힘 |
| `MemoryRecord`, `RecallQuery`, `MemoryContextPacket`, `MemoryStats` etc. schema | `packages/protocol/src/index.ts` | ✅ 박힘 |
| `MemoryRelation`, `MemoryReflectionIssue`, `MemoryRecallPolicy` | 동일 | ✅ 박힘 |
| `memory_curator` 페르소나 enum 포함 | `packages/protocol/src/index.ts:226` | ✅ 박힘 |
| Local heuristic 구현 | `apps/desktop/src/runtime/stage6Memory.ts`, `stage27MemoryApi.ts` | ✅ 동작 (deterministic) |
| memory_curator SOUL/AGENTS | `agents/memory_curator/` | ✅ PR #48 |
| **MemoryAdapter 인터페이스** | — | ❌ 없음 (LlmAdapter 같은 추상화 부재) |
| Memento MCP 실 어댑터 | — | ❌ 없음 |
| DGX SimpleMem 어댑터 | — | ❌ 없음 (DGX 측 index 도 미배포) |
| Memory contract test fixtures | — | ❌ 없음 (`contractTestFixtures.ts` provider 만 있음) |
| `/memory/*` server endpoint | — | ❌ 없음 |
| `memory.archival_write.requested` 등 events (docs/28 §"Required Events") | 일부만 | ⚠ events 명세는 docs/28 에 있으나 Event Store schema 적용 미완 |

이 spec 은 ❌ 행을 채우는 PR 들의 contract 를 박는다.

## 3. MemoryAdapter 인터페이스

`LlmAdapter` 가 `complete()` / `discoverModels()` 두 method + `AdapterRuntimeContext` 패턴으로 5 provider 를 받는다. Memory 도 같은 모양으로:

```ts
// packages/memory/src/adapter.ts (신규 워크스페이스 권장 — §11.1 결정)
export interface MemoryAdapter {
  /** 식별. server config 에서 adapter 선택용. */
  readonly profileId: string;
  /** "local_heuristic" | "memento_mcp" | "dgx_simplemem" | "mock" */
  readonly kind: MemoryAdapterKind;

  /** 9 method 중 어댑터가 직접 구현하는 5개. */
  recall(query: RecallQuery, ctx: MemoryAdapterContext): Promise<RecallResult[]>;
  remember(input: MemoryInput, ctx: MemoryAdapterContext): Promise<MemoryRecord>;
  memoryContext(query: RecallQuery, ctx: MemoryAdapterContext): Promise<MemoryContextPacket>;
  stats(ctx: MemoryAdapterContext): Promise<MemoryStats>;
  pin(recordId: string, ctx: MemoryAdapterContext): Promise<void>;
  forget(recordId: string, ctx: MemoryAdapterContext): Promise<void>;
  activateMemories(recordIds: string[], ctx: MemoryAdapterContext): Promise<void>;
  createRelations(recordIds: string[], ctx: MemoryAdapterContext): Promise<MemoryRelation[]>;

  /** Optional — adapter 가 reflection 을 backend 차원에서 지원하지 않으면 caller 가 LLM 호출 측에서 처리. */
  reflect?(sessionId: string, ctx: MemoryAdapterContext): Promise<Reflection>;
}

export type MemoryAdapterKind =
  | "local_heuristic"
  | "memento_mcp"
  | "dgx_simplemem"
  | "mock";

export type MemoryAdapterContext = {
  /** F2 evaluator 가 이미 통과한 PermissionDecision (memory_call action). */
  permissionDecision: PermissionDecision;
  /** 호출자 trust level (caller provider 의 trust 가 흘러옴). */
  callerTrustLevel: ProviderTrustLevel;
  /** Event Store append helper — 어댑터가 memory.* 이벤트 기록할 때. */
  appendEvent: (event: PermissionEvent | MemoryEvent) => Promise<void>;
  /** 사용자 abort signal. */
  abortSignal?: AbortSignal;
  /** Per-call timeout (ms). default 10_000. */
  timeoutMs?: number;
  /** Adapter 내부 에러를 caller 로그로 흘려보내는 hook (redaction 통과 후). */
  onAdapterError?: (error: MemoryAdapterError) => void;
};
```

### 3.1 핵심 결정: `reflect()` 는 optional

`reflect()` 는 LLM 호출이 필요한 작업 (세션 흐름 요약 → decisions / risks 추출). 어댑터가 LLM 을 알아야 한다는 건 layer violation. 두 가지 선택:

- 옵션 A: `reflect()` 를 어댑터에서 빼고 `MemoryReflectionService` 라는 별도 layer 가 LlmAdapter + MemoryAdapter 둘 다 받아서 처리
- 옵션 B: `reflect()` 를 어댑터 optional method 로 두고, 어댑터가 backend 차원에서 (예: Memento MCP 의 `reflect` tool) 지원하면 직접, 아니면 caller 가 LLM 으로 fallback

**Recommend B**. Memento MCP 같은 외부 서버는 자체 reflection tool 을 갖고 있을 수 있고, LocalHeuristic 어댑터는 이 method 안 구현하면 caller 가 LLM fallback. optional 이라 호환 부담 0.

## 4. Per-adapter wire 매핑

### 4.1 LocalHeuristicMemoryAdapter

현재 `stage6Memory.ts` + `stage27MemoryApi.ts` 의 deterministic 로직을 그대로 어댑터로 wrap.

```ts
// packages/memory/src/localHeuristicAdapter.ts
export class LocalHeuristicMemoryAdapter implements MemoryAdapter {
  constructor(private readonly store: LocalMemoryStore) {}
  readonly kind = "local_heuristic" as const;
  // ... 기존 stage27MemoryApi 의 method 호출 위임
}
```

- 의존: in-process JSON store (이미 `stage6Memory` seed 가 그 모양)
- 영속화: 없음 (런타임 메모리). offline-only / fallback 용도
- recall 알고리즘: tag overlap + recency + pinned 우선 + trust level filter
- 모든 trusted memory 대상, untrusted 는 `includeUntrusted: true` 일 때만
- `reflect()` 미구현 → caller 가 LLM fallback

### 4.2 MementoMcpMemoryAdapter

Memento MCP (https://github.com/JinHo-von-Choi/memento-mcp 또는 호환 구현) 의 표준 tools 7개 활용.

| MemoryAdapter method | Memento MCP tool | 비고 |
|---|---|---|
| `recall` | `recall` | filter (layer/scope/kind/trust) 를 MCP query params 로 매핑 |
| `remember` | `remember` | content + metadata (layer/scope/kind/source/trust) 전달 |
| `memoryContext` | `memory_context` | recall + 선택된 record id 들을 prompt-ready packet 으로 묶음 |
| `stats` | `stats` | health 지표 직접 매핑 |
| `pin` | (n/a) — Memento MCP 미지원? §11.4 확인 | 미지원이면 어댑터가 자체 sidecar table 유지 |
| `forget` | (n/a) — tombstone 처리 | 어댑터가 `remember` 로 tombstone record 작성 + projection 단에서 제외 |
| `activateMemories` | `activate_memories` | inactive → active 전환 |
| `createRelations` | `create_relations` | memory graph edge 작성 |
| `reflect` | `reflect` | duplicate/contradiction/stale 후보 리턴 |

연결: MCP transport 는 보통 stdio (subprocess) 또는 HTTP. 어댑터 옵션:

```ts
type MementoMcpAdapterOptions = {
  profileId: string;
  /** subprocess command (stdio MCP) — e.g. "node /path/memento-mcp/dist/index.js" */
  command?: string;
  /** OR HTTP endpoint (HTTP MCP) — e.g. "http://localhost:3030/mcp" */
  httpEndpoint?: string;
  /** MCP server 가 self-host 라 보통 인증 없음. reverse-proxy 뒤면 secret 주입. */
  secret?: string;
  /** Memento server 가 사용하는 DB 식별 (multi-tenant 지원 서버용). */
  workspaceId?: string;
  /** Request timeout. */
  timeoutMs?: number;
};
```

### 4.3 DgxSimpleMemMemoryAdapter

DGX-02 에 호스팅되는 SimpleMem index (docs/28 §"SimpleMem Placement") 을 조회. SimpleMem 은 **derived index** 라서 `remember` / `forget` / `activateMemories` 는 직접 처리하지 않고 → DGX Event Store 에 intent 이벤트만 발행, Memory Curator (사람 또는 페르소나) 가 promotion.

| MemoryAdapter method | 동작 |
|---|---|
| `recall` | DGX SimpleMem HTTP query — semantic/lexical 결합. trust filter 강제 |
| `remember` | `memory.archival_write.requested` 이벤트 발행. **즉시 record 생성 안 함** — `MemoryRecord` 는 promotion 후에야 권한 부여 |
| `memoryContext` | recall 결과 + Active record IDs 만 packet 으로 |
| `stats` | DGX SimpleMem stats endpoint |
| `pin` | DGX Event Store `memory.pin.requested` → Curator 승인 |
| `forget` | DGX Event Store `memory.forget.requested` → Curator 승인 + tombstone projection |
| `activateMemories` | `memory.activate.requested` 이벤트 |
| `createRelations` | `memory.relation.created` 이벤트 (즉시 적용) |
| `reflect` | DGX SimpleMem reflection service (있다면) 또는 미지원 → LLM fallback |

이 어댑터의 핵심 의미: **"쓰기" 가 즉시 적용되지 않는다**. 어댑터 method 호출은 intent 만 만들고, 실 promotion 은 Memory Curator 가 별도 단계로 결정. 이 비대칭성은 caller 가 인지해야 함 (return type 으로 표현 — §11.3).

### 4.4 MockMemoryAdapter

테스트용. `MockLlmAdapter` 와 같은 패턴. 모든 method 가 미리 주입된 fixture 반환. contract test 용.

## 5. AdapterError taxonomy (memory 전용)

Provider 의 `AdapterError` 9 category 를 그대로 쓰지 않고, memory 도메인에 맞는 별도 taxonomy:

```ts
export type MemoryAdapterErrorCategory =
  | "permission_denied"     // F2 evaluator 가 거부 (memory_call 권한 없음 또는 trust mismatch)
  | "trust_violation"        // untrusted source 가 trusted recall 요청 (caller bug)
  | "not_found"              // recordId 가 존재 안 함 (pin/forget 대상)
  | "stale_revision"         // optimistic lock 실패 (pin 시 동시 수정)
  | "backend_unavailable"    // MCP server 죽음 / SimpleMem index 미배포
  | "backend_timeout"        // backend 응답 없음
  | "schema_mismatch"        // backend 가 보낸 record 가 MemoryRecord schema 불일치 (Memento MCP 버전 diff)
  | "quota_exceeded"         // backend quota 초과 (Memento 가 multi-tenant 일 때)
  | "redaction_required"     // remember 내용에 secret 패턴 — F7 redaction 미통과
  | "promotion_pending"      // DgxSimpleMem 쓰기 요청 → intent 만 만들고 즉시 반환 (실 error 아님, 신호용)
  | "unknown";

export class MemoryAdapterError extends Error {
  constructor(
    public readonly category: MemoryAdapterErrorCategory,
    message: string,
    public readonly meta?: {
      recordId?: string;
      backendStatus?: number;
      retryAfterSec?: number;
      providerRawSnippet?: string;
    },
  ) {
    super(message);
  }
}
```

**Provider 의 9 category 와 다른 부분**:
- `auth` / `credential_expired` / `refresh_required` 가 빠짐 — memory backend 는 보통 self-host (Memento MCP localhost, DGX SimpleMem internal)
- `permission_denied` / `trust_violation` 신규 — memory 만의 access control
- `promotion_pending` 신규 — DgxSimpleMem 의 비대칭성 표현
- `redaction_required` 신규 — F7 outbound (memory 에 secret 기록 금지) 강제

## 6. Trust enforcement 배치

각 어댑터가 자체로 trust check 하면 일관성 위험. 공통 wrapper 권장:

```ts
// packages/memory/src/trustEnforcedAdapter.ts
export function withTrustEnforcement(inner: MemoryAdapter, policy: TrustPolicy): MemoryAdapter {
  return {
    profileId: inner.profileId,
    kind: inner.kind,
    async recall(query, ctx) {
      // 1. caller trust level 별로 includeUntrusted 강제
      const safeQuery = enforceUntrustedFilter(query, ctx.callerTrustLevel, policy);
      const results = await inner.recall(safeQuery, ctx);
      // 2. 결과 record 들의 trust 가 caller 가 받을 자격 있는지 다시 확인
      return results.filter((r) => canCallerSee(r.record.trustLevel, ctx.callerTrustLevel, policy));
    },
    async remember(input, ctx) {
      // 3. caller 가 trusted 가 아니면 trustLevel 강제 다운그레이드
      const safeInput = enforceTrustWrite(input, ctx.callerTrustLevel, policy);
      // 4. F7 redaction: content 에 secret 패턴이 있으면 throw "redaction_required"
      assertNoSecret(safeInput.content);
      return inner.remember(safeInput, ctx);
    },
    // ... 나머지 method 동일 패턴
  };
}
```

caller 가 어댑터를 직접 받지 않고 항상 `withTrustEnforcement(...)` 를 거친 어댑터를 받음. 어댑터 자체는 backend wire 만 책임.

`TrustPolicy` 의 구체 룰은 docs/29 (Permission engine) 와 동일 매트릭스에서 파생 — 단일 출처 유지.

## 7. Contract test fixtures

`packages/memory/src/contractTestFixtures.ts` 신규. `packages/providers/src/contractTestFixtures.ts` 패턴 그대로:

```ts
export type MemoryContractExpectation = {
  name: string;
  // 어떤 호출이 어떤 error category 또는 결과를 내야 하는지
};

export const MEMORY_CONTRACT_HAPPY_RECALL: MemoryContractExpectation = {
  name: "happy recall",
  expectedResultCount: { min: 1 },
  expectedRecordIds: ["record_seed_001"],
};

export const MEMORY_CONTRACT_UNTRUSTED_FILTERED: MemoryContractExpectation = {
  name: "untrusted records hidden from default recall",
  // includeUntrusted: false → untrusted record 안 나옴
};

export const MEMORY_CONTRACT_TRUST_VIOLATION: MemoryContractExpectation = {
  name: "untrusted caller cannot recall trusted memory",
  expectedError: "trust_violation",
};

export const MEMORY_CONTRACT_REDACTION_REQUIRED: MemoryContractExpectation = {
  name: "remember with secret pattern raises redaction_required",
  expectedError: "redaction_required",
};

export const MEMORY_CONTRACT_PROMOTION_PENDING: MemoryContractExpectation = {
  name: "DgxSimpleMem remember returns promotion_pending without immediate record",
  expectedError: "promotion_pending",
  // 어댑터가 intent event 발행했는지 확인
};

export const MEMORY_CONTRACT_BACKEND_UNAVAILABLE: MemoryContractExpectation = {
  name: "MCP server down → backend_unavailable",
  expectedError: "backend_unavailable",
};

export function assertMemoryContract(actual: unknown, expected: MemoryContractExpectation): void {
  // ...
}
```

각 어댑터마다 `<name>Adapter.contract.test.ts` 가 위 6 fixture 를 통과해야 머지 가능.

## 8. Server endpoint surface

server 가 memory 호출을 외부 (desktop / mobile / external ingress) 에 노출하려면 endpoint 필요. permission gate 와 같은 흐름:

```
POST /memory/recall                — body: RecallQuery
POST /memory/remember              — body: MemoryInput
GET  /memory/context?sessionId=... — query: RecallQuery
GET  /memory/stats
POST /memory/pin                   — body: { recordId }
POST /memory/forget                — body: { recordId, reason }
POST /memory/activate              — body: { recordIds: string[] }
POST /memory/relations             — body: { recordIds: string[] }
POST /memory/reflect               — body: { sessionId }
```

모든 endpoint:
- Bearer auth (기존 `requireAuth` 미들웨어)
- Zod validation (`memoryRecallQuerySchema`, `memoryInputSchema` 등 신규 또는 protocol 에서 import)
- F2 permission gate 통과 (action: `memory_call`)
- 1MB body limit
- secret redact for log

기존 `/provider-completions/stream` (docs/31) 처럼 streaming 은 불필요 — recall 결과가 보통 작음 (10~50 record). 단, `memoryContext` 가 큰 packet 을 만들면 SSE 고려 (§11.5).

## 9. Permission engine + memory_curator 페르소나 통합

### 9.1 F2 evaluator 에 `memory_call` action 추가

docs/29 의 `PermissionAction` enum 에 `memory_call` 이 이미 있는지 확인 필요. 없으면 F-extra PR 로 추가:

```ts
type PermissionAction =
  | "provider_call"
  | "remote_run"
  | ...
  | "memory_call"   // ← 신규 또는 기존 확인
  | "memory_write_request"  // ← DgxSimpleMem 의 archival_write 요청
  | "memory_promote"        // ← Memory Curator 가 archival_write 승인
  | "memory_forget";        // ← forget 요청 (destructive)
```

memory 도메인에는 4개 action 이 합리적. promote / forget 은 별도 — 더 높은 trust level + 2FA 요구 가능.

### 9.2 F7 Redaction pipeline 과 memory 의 관계

F7 (5-stage redaction) 의 stage 중 memory 입력/출력에 해당하는 게 있음:

| F7 stage | Memory 와의 관계 |
|---|---|
| `prompt_inject` | memoryContext 가 prompt 에 들어가기 직전 — secret 패턴 필터 |
| `pre_persist` | `remember()` 가 backend 에 쓰기 직전 — secret 패턴 거부 |
| `pre_backup` | memory snapshot 이 Obsidian/Notion projection 으로 export 되기 직전 — 추가 필터 |

`MemoryAdapter` 의 `remember()` 안에서 `assertNoSecret` 는 `pre_persist` 단계 구현. 기존 `redactSecretsForLog` 로직 재사용.

### 9.3 memory_curator 페르소나 호출 시점

[`agents/memory_curator/AGENTS.md`](../agents/memory_curator/AGENTS.md) 가 페르소나 책임을 정의. 이 spec 은 **언제 페르소나가 호출되는지** 의 trigger 를 정한다:

| Trigger | 동작 |
|---|---|
| `memory.archival_write.requested` 이벤트 발생 (DgxSimpleMem 어댑터에서) | 페르소나가 후보 검토 → promote / reject 결정 |
| `MemoryReflectionIssue` 의 `kind: "duplicate"` 또는 `"contradiction"` 가 새로 발견 | 페르소나가 merge / 보존 결정 |
| 사용자가 명시 호출 ("이거 기억해줘") + 후보가 patterns 보다 단발성 | 페르소나가 사용자에게 "정말 기억할까요" 확인 |
| `untrusted` source 의 memory 가 `active` 로 승격 요청 | 페르소나가 출처 검토 + 사용자 승인 요청 |
| Memory Inspector UI 의 manual 호출 (사용자가 "이거 큐레이터 의견 들어줘" 버튼) | 페르소나가 record 에 대한 분류 + 보관 기간 제안 |

페르소나 호출 자체도 LLM 호출 (= `provider_call` action 통과 필요). 자동 호출은 `provider_call` budget 안에서. 무한 호출 방지를 위해 (페르소나 메타 룰): "확인 질문" 자체는 기억 안 함.

## 10. Rollout 단계 (PR 분할)

| Phase | PR 내용 | 의존 | 담당 (제안) |
|---|---|---|---|
| **M1** | `packages/memory/` 워크스페이스 + `MemoryAdapter` 인터페이스 + `MemoryAdapterError` + `MockMemoryAdapter` + contract fixtures (6개) | 0 | Claude |
| **M2** | `LocalHeuristicMemoryAdapter` — 기존 stage27MemoryApi 를 어댑터로 wrap + contract test 통과 | M1 | Claude |
| **M3** | `withTrustEnforcement` wrapper + 단위 테스트 | M1 | Claude |
| **M4** | server `/memory/*` endpoint 7개 + Bearer + Zod + F2 gate + 1MB limit | M1 + Codex F2 머지 | Codex |
| **M5** | `MementoMcpMemoryAdapter` (stdio MCP transport) + contract test + smoke script | M1~M3 | Claude |
| **M6** | `DgxSimpleMemMemoryAdapter` + intent event mapping + contract test | M1~M3 + DGX SimpleMem 배포 | Claude (어댑터) + Codex (DGX 배포) |
| **M7** | memory_curator 페르소나 호출 trigger 구현 — `memory.archival_write.requested` 이벤트 → 자동 페르소나 호출 (provider_call budget 안에서) | M5 또는 M6 + #48 머지 + debate engine 기본 wiring 머지 | Claude |
| **M8** | Memory Inspector UI 에 어댑터 kind 표시 + manual curator 호출 버튼 | M4 + M7 | Codex (desktop) + Codex (mobile) |
| **M9** (optional) | `MemoryContextPacket` 큰 경우 streaming endpoint (`POST /memory/context/stream`) | M4 + docs/31 streaming P5 머지 | Codex |

각 단계는 default 가 LocalHeuristic 폴백이라 backend 미배포 상태에서도 모든 caller 가 동작. backend 가 들어오면 server config 로 어댑터 교체 (`MEMORY_ADAPTER=memento_mcp`).

## 11. 결정점

### 11.1 새 워크스페이스 `packages/memory` vs 기존 `packages/providers` 에 동거
**Recommend 새 워크스페이스**. providers 는 LLM 호출 책임이고 memory 는 다른 도메인. 같은 워크스페이스에 두면 trust enforcement / error taxonomy / contract fixtures 가 섞여서 변경 비용 큼.

### 11.2 `reflect()` 어댑터 책임 vs 별도 service
**Recommend optional method on adapter** (§3.1). 옵션 B.

### 11.3 DgxSimpleMem 의 `remember()` 반환 타입
- 옵션 a: 정상 `MemoryRecord` 반환 (caller 가 `record.id` 사용 가능하지만 실제로는 promotion 전 — 잘못된 가정)
- 옵션 b: `Promise<MemoryRecord>` 가 즉시 `promotion_pending` error throw → caller 는 intent event id 만 받음
- 옵션 c: return type 을 union 으로 — `Promise<MemoryRecord | { status: "pending", intentEventId: string }>`
- **Recommend b**. 옵션 c 는 caller 가 분기 처리 필수라 호환성 부담. 옵션 a 는 정확성 잃음. 옵션 b 는 caller 가 try/catch 로 명시 분기 + 정상 흐름은 단순.

### 11.4 Memento MCP 의 `pin` 미지원 시 대안
- 옵션 a: 어댑터가 자체 sidecar table 유지 (Memento MCP record 옆에 pin 상태만 별도 저장)
- 옵션 b: pin 을 Memento MCP 의 metadata 필드로 매핑 (Memento 가 metadata 지원하면)
- 옵션 c: pin 미지원 backend 는 `pin()` method 가 `not_supported` error throw
- **Recommend b 우선, b 미지원이면 a**. c 는 caller UX 깸 (Memento 골랐다고 pin 못쓰면 사용자 헷갈림).

### 11.5 `memoryContext` 큰 packet streaming
- v1 buffered (`POST /memory/context`), 응답이 X KB 넘으면 streaming endpoint 추가 (M9)
- **Recommend buffered 우선**. 실 사용에서 context packet 이 1MB 넘는 경우 거의 없음. M9 는 optional, ROI 보고 결정.

### 11.6 trust level 강제: caller 책임 vs adapter 책임
- adapter 자체: §6 의 `withTrustEnforcement` wrapper (recommend)
- caller 책임: 각 호출 site 가 trust 검증
- **Recommend wrapper**. caller 검증은 빠뜨리기 쉽고, 새 caller 가 추가될 때마다 검증 누락 위험.

### 11.7 `forget` 의 secret storage 처리
docs/05 §"Forget 정책" 에 명시: "secret 은 secret storage 에서 실제 삭제한다." 어댑터 책임 범위:
- 옵션 a: `forget()` 가 secret storage 도 같이 호출 (어댑터가 secret storage adapter 의존)
- 옵션 b: `forget()` 는 memory record tombstone 만, secret storage 삭제는 caller (또는 별도 cleanup job)
- **Recommend b**. layer 분리. forget 이벤트 발행하고, secret storage 청소는 별도 worker / cron 이 이벤트 구독해서 처리.

### 11.8 `pin` / `forget` / `activate` 가 동기 vs 비동기
DgxSimpleMem 에서는 Curator 승인이 필요해 비동기. LocalHeuristic / MementoMcp 에서는 즉시 가능.
- 옵션 a: 어댑터 별로 sync/async 다름 (caller 가 어댑터 종류 알아야 함)
- 옵션 b: 모두 Promise 반환, 비동기 backend 는 `promotion_pending` error (§11.3 패턴) 일관 적용
- **Recommend b**. 일관성 우선.

### 11.9 Event Store schema 에 추가할 memory events
docs/28 §"Required Events" 의 10개:
```
memory.core.updated
memory.archival_write.requested
memory.archival_write.promoted
memory.archival_write.rejected
memory.index.requested
memory.index.completed
memory.index.skipped
memory.index.failed
memory.memento.snapshot.created
memory.client_input.pending
memory.client_input.synced
```
+ 이 spec 추가: `memory.pin.requested`, `memory.pin.granted`, `memory.forget.requested`, `memory.forget.granted`, `memory.activate.requested`, `memory.relation.created`, `memory.reflect.completed`

**Recommend**: M1 PR 에서 protocol 의 EventSchema enum 에 위 17개 다 추가 (cost 작고 일관성 큼). Codex 의 permission events 와 같은 패턴.

## 12. 보안 / 감사 체크리스트

[`docs/30-security-audit-checklist.md`](30-security-audit-checklist.md) 에 신규 §X "Memory adapters" 추가 (M4 PR 에 포함):

- [ ] `/memory/*` 7개 endpoint 모두 Bearer auth 적용
- [ ] `MemoryInput.content` 가 server 에 도착하기 전 1MB limit
- [ ] `remember()` 가 secret 패턴 포함하면 `redaction_required` error (F7 pre_persist)
- [ ] `recall()` 결과 trust filter 가 caller trust level 별 적용 (`withTrustEnforcement` 통과)
- [ ] untrusted source 가 trusted memory 를 자동으로 recall 못함
- [ ] `forget()` 가 secret storage cleanup 이벤트 발행
- [ ] Memento MCP subprocess 가 죽을 때 child process orphan 안 됨
- [ ] DgxSimpleMem 호출의 HTTP request 가 `redactSecretsForLog` 통과
- [ ] memory event 가 Event Store 에 기록될 때 source eventId 매핑 정확
- [ ] memory_curator 페르소나 LLM 호출이 `provider_call` budget 안에서 (무한 호출 방지)

## 13. 후속 / 미정

위 11개 결정점에 대해 user / codex 회신 필요. 9 개 다 추천안 있고, 추천안 그대로 가도 M1 즉시 시작 가능.

추천안 그대로 합의되면 다음 PR 은 **M1 (Claude, `packages/memory` 워크스페이스 + 인터페이스 + Mock + fixtures)**. 의존 0, 기존 코드 변경 0. 그 뒤 M2, M3 는 Claude 단독으로 평행 진행. M4 는 Codex F2 머지 후 시작 가능 → debate engine 진입과 같은 시점.

## 14. 글로서리

| 용어 | 정의 |
|---|---|
| MemoryAdapter | 이 spec 이 정의하는 신규 인터페이스. backend 별 구현 (LocalHeuristic / MementoMcp / DgxSimpleMem) 의 공통 contract |
| MemoryAPI | protocol 에 이미 있는 9-method 인터페이스 (caller 가 보는 surface) |
| MemoryRecord | 영속화된 memory 의 atomic unit (id + content + trust + layer + ...) |
| MemoryContextPacket | 한 conversation/agent 호출 직전에 prompt 에 주입할 memory 묶음 |
| MemoryReflectionIssue | duplicate / contradiction / stale 등 정리 후보 |
| SimpleMem | DGX-02 에 호스팅되는 derived retrieval index (벡터 + 키워드 결합) |
| Memento MCP | 외부 표준 MCP server (Memento 명세 따름) |
| LocalHeuristic | in-process deterministic adapter (tag overlap + recency). 오프라인/폴백용 |
| Memory Curator | 페르소나 (`agents/memory_curator/`) + 자동 trigger 기반 큐레이션 service |
| Promotion | archival_write 요청을 실 MemoryRecord 로 승격하는 절차 (Curator 가 결정) |
| Tombstone | forget 처리된 record 의 placeholder. 실 삭제 대신 projection 에서만 제외 |
| Trust enforcement | caller trust level vs record trust level 매트릭스 적용 (자동 recall 차단 등) |
| Quarantine | untrusted active memory 의 격리 상태. 명시 activate 전까지 recall 안 됨 |

---

이 spec 은 `docs/05` (개념) + `docs/18` (현재 gap) + `docs/28` (DGX authority + PR-M0~M3) 위에 어댑터 contract 한 층을 더 박는다. 머지된 코드가 아닌 합의 문서. 회신 받으면 M1 PR 즉시 시작.
