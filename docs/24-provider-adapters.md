# Provider Adapter Interface (proposal)

분업 트리거: Codex가 압축을 끝내고 packages/providers 어댑터 5개에 들어가기 직전, Claude가 미리 정리해 둔 제안서.  
목표는 Codex가 첫 번째 어댑터(DGX vLLM)를 짤 때 합의 라운드 1턴으로 끝내는 것. 본 문서는 결정문이 아니라 제안 + 결정 필요 항목 모음이다.

## 1. 목적

- 지금 `packages/providers`에 정의만 있고 어디서도 호출되지 않는 `ProviderAdapter`를, 서버와 데스크톱이 실제 LLM 호출에 쓰는 **단일 진입점**으로 만든다.
- `apps/server/src/index.ts`가 직접 fetch로 OpenAI/Anthropic/vLLM을 호출하고 있는 코드를 어댑터 호출로 단계적으로 옮긴다.
- 1차 5개 어댑터: DGX vLLM → OpenAI-compatible → Anthropic → Ollama → OpenRouter.

## 2. 현재 상태 (main 기준)

```ts
// packages/providers/src/index.ts:35
export type ProviderAdapter = {
  profile: ProviderProfile;
  discoverModels(): Promise<ModelDescriptor[]>;
  complete(request: ProviderCompletionRequest): Promise<ProviderCompletionResult>;
};
```

문제:

- **이름 충돌**: 같은 이름의 `ProviderCompletionRequest`가 `packages/protocol`에도 있고 필드가 다르다. (SSOT 위반)
- **MockProviderAdapter만 존재**. 실제 provider 어댑터 0개.
- **server는 이 인터페이스를 쓰지 않는다**. `createServerProviderProxyCompletionResponse`(apps/server/src/index.ts:913)가 raw fetch로 직접 호출.
- 어댑터 시그니처에 streaming, tool use, system prompt 분리, max_tokens, stop sequence, 에러 분류가 없다.
- 어댑터가 secret/key를 어떻게 받는지 명시되지 않음.

C2 PR(`claude/fix-server-input-validation`)이 머지되면 protocol 쪽 `providerCompletionRequestSchema`가 SSOT가 된다. 어댑터 인터페이스는 그 schema를 기준으로 맞춘다.

## 3. 비목표 (1차에서 의도적으로 안 함)

- **Streaming**. 1차는 전부 buffered 응답. 5개 어댑터가 다 buffered로 동작한 뒤 별도 PR로 streaming layer 추가.
- **Tool/function call**. 1차는 텍스트 메시지만. tool use는 Anthropic/OpenAI 명세가 서로 달라서 어댑터 인터페이스가 흔들리므로 2차로 분리.
- **Multimodal (image/document)**. ModelDescriptor에 modality flag는 있지만 어댑터는 text-only.
- **Token usage 정확 계산**. provider가 반환하는 usage를 그대로 통과. tiktoken/anthropic-tokenizer 같은 의존 추가 안 함.
- **자동 retry / circuit breaker**. 1차는 단순 실패 → 호출자가 결정.

## 4. 5개 provider API 명세 한 페이지

| 항목 | DGX vLLM | OpenAI | Anthropic | Ollama | OpenRouter |
|---|---|---|---|---|---|
| Endpoint | `${base}/v1/chat/completions` | `https://api.openai.com/v1/chat/completions` | `https://api.anthropic.com/v1/messages` | `${base}/api/chat` | `https://openrouter.ai/api/v1/chat/completions` |
| Auth header | 없음 또는 `Authorization: Bearer` | `Authorization: Bearer sk-...` | `x-api-key: sk-ant-...` + `anthropic-version: 2023-06-01` | 없음 (로컬) | `Authorization: Bearer sk-or-...` + `HTTP-Referer`, `X-Title` |
| Request body | OpenAI 호환 | `{model, messages, max_tokens?, temperature?}` | `{model, system?, messages, max_tokens (필수)}` | `{model, messages, stream:false, options:{...}}` | OpenAI 호환 + `transforms?`, `route?`, `provider?` |
| System message | `messages[0].role="system"` | `messages[0].role="system"` | **top-level `system`** (별도 필드) | `messages[0].role="system"` | OpenAI 호환 |
| Response 본문 | `choices[0].message.content` | `choices[0].message.content` | `content[0].text` (array) | `message.content` | `choices[0].message.content` |
| Stop reason | `choices[0].finish_reason` | `choices[0].finish_reason` | `stop_reason` (`end_turn`/`max_tokens`/`stop_sequence`) | `done_reason` | `choices[0].finish_reason` |
| Usage 필드 | `usage.{prompt,completion,total}_tokens` | 동일 | `usage.{input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens?}` | `prompt_eval_count`, `eval_count` | 동일 + `usage.total_cost`(달러) |
| 에러 본문 | `{error: string}` 또는 raw | `{error: {message, type, code}}` | `{type:"error", error:{type, message}}` | `{error: string}` | `{error: {message, code}}` |
| Rate limit 시그널 | 보통 없음 | `429` + `Retry-After` 헤더 | `429` + `Retry-After` + `anthropic-ratelimit-*` 헤더 | 없음 | `429` + `Retry-After` |
| 1차 적용 우선순위 | 1 | 2 | 3 | 4 | 5 |

핵심 갈라지는 지점은 셋:
- **Anthropic의 `system` top-level** — messages에서 분리해야 함.
- **Anthropic의 `max_tokens` 필수** — 기본값 strategy 필요.
- **Ollama의 base URL이 로컬** — DGX 서버 경유 안 하고 직접 호출.

## 5. 제안 인터페이스

C2 PR 머지를 가정. protocol의 schema를 source of truth로 삼는다.

```ts
// packages/providers/src/adapter.ts (신규)
import type {
  ProviderProfile,
  ModelDescriptor,
  ProviderCompletionRequest,   // protocol 마스터
  ProviderCompletionResponse,  // protocol 마스터
} from "@ai-orchestrator/protocol";

export type AdapterRuntimeContext = {
  // 어댑터가 자기 secret을 직접 안다.
  // server는 ServerProviderProxyConfig에서, desktop은 SecretVault에서 주입.
  resolveSecret(): Promise<string | undefined>;
  abortSignal?: AbortSignal;
  // 어댑터별 timeout override (기본 15s).
  timeoutMs?: number;
  // 디버깅용 — 응답 raw text를 받아 로깅하고 싶을 때.
  // 어댑터는 호출 전에 redactSecretsForLog를 적용한다.
  onRawError?: (status: number, redactedSnippet: string) => void;
};

export interface ProviderAdapter {
  readonly profileId: string;
  readonly kind: ProviderProfile["kind"];

  discoverModels(ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]>;
  complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse>;
}
```

기존 `ProviderAdapter` (packages/providers/src/index.ts:35)는 한동안 `LegacyMockProviderAdapter` 로 alias만 유지하고, 신규 인터페이스를 표준으로 한다. MockProviderAdapter는 새 인터페이스로 재작성한다(테스트 기준점).

`complete()`는 protocol의 `ProviderCompletionResponse`를 그대로 반환한다(status/route/usage/error 필드 정렬). 어댑터가 `route`를 결정한다:
- vLLM/OpenAI/Anthropic 직접 호출 → `direct_provider`
- 서버 경유 가능성은 어댑터 외부(server proxy 계층)에서 결정.

## 6. OpenAI-compatible base 패턴

DGX vLLM, OpenAI, OpenRouter, DeepSeek, APIKey.fun(Claude는 anthropic_messages style이지만 reseller는 openai_chat style 섞여있음)이 사실상 같은 wire format이다.

```ts
// packages/providers/src/openaiCompatibleAdapter.ts
export type OpenAiCompatibleAdapterConfig = {
  profileId: string;
  kind: ProviderProfile["kind"];
  baseUrl: string;                    // e.g. "https://api.openai.com", "https://openrouter.ai/api"
  authHeaderName?: string;            // default "Authorization", value = "Bearer <secret>"
  extraHeaders?: Record<string, string>; // OpenRouter: HTTP-Referer/X-Title
  modelListPath?: string;             // default "/v1/models", null이면 discover 안 함
  completionPath?: string;            // default "/v1/chat/completions"
  defaultMaxTokens?: number;
};

export function createOpenAiCompatibleAdapter(
  cfg: OpenAiCompatibleAdapterConfig,
): ProviderAdapter { ... }
```

- **DGX vLLM 어댑터** = `createOpenAiCompatibleAdapter({ baseUrl: "http://127.0.0.1:8001", authHeaderName: undefined, ... })`
- **OpenAI 어댑터** = `createOpenAiCompatibleAdapter({ baseUrl: "https://api.openai.com", ... })`
- **OpenRouter 어댑터** = `createOpenAiCompatibleAdapter({ baseUrl: "https://openrouter.ai/api", extraHeaders: { "HTTP-Referer": "...", "X-Title": "ai-orchestrator-lab" }, ... })`

Anthropic은 wire format이 다르므로 별도 함수 `createAnthropicMessagesAdapter()`. Ollama도 별도(`/api/chat` shape).

## 7. 에러 분류

```ts
// packages/providers/src/errors.ts
export type AdapterErrorCategory =
  | "network"        // fetch 실패, timeout, DNS
  | "auth"           // 401, 403, key 만료
  | "rate_limit"     // 429
  | "bad_request"    // 400, schema mismatch
  | "provider"       // 5xx, provider 내부 에러
  | "blocked"        // content policy, refusal
  | "unknown";

export class AdapterError extends Error {
  constructor(
    readonly category: AdapterErrorCategory,
    message: string,
    readonly status?: number,
    readonly retryAfterSec?: number,
    readonly providerRawSnippet?: string,  // 이미 redactSecretsForLog 처리됨
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
```

어댑터는 항상 `AdapterError`를 throw하거나 `ProviderCompletionResponse.status="failed"`로 반환. 호출자(server, debate engine)는 category 기반으로 대응(예: `rate_limit`이면 백오프, `blocked`이면 다음 라운드 중단).

## 8. Usage 정규화

protocol의 `ProviderCompletionUsage`(현재: inputTokens?, outputTokens?, totalTokens?)에 cache 필드 두 개 추가 제안:

```ts
export type ProviderCompletionUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheCreationInputTokens?: number;  // Anthropic
  cacheReadInputTokens?: number;      // Anthropic
};
```

매핑:

| Provider | inputTokens | outputTokens | totalTokens | cacheRead |
|---|---|---|---|---|
| OpenAI/vLLM/OpenRouter | `usage.prompt_tokens` | `usage.completion_tokens` | `usage.total_tokens` | — |
| Anthropic | `usage.input_tokens` | `usage.output_tokens` | sum 계산 | `usage.cache_read_input_tokens` |
| Ollama | `prompt_eval_count` | `eval_count` | sum 계산 | — |

totalTokens가 없으면 inputTokens + outputTokens로 채운다.

## 9. Server 통합 경로 (단계적 마이그레이션)

지금 `apps/server/src/index.ts`의 직접 fetch 호출:
- `createDgxProviderCompletionResponse` (line 818~) → vLLM 직접 fetch
- `createServerProviderProxyCompletionResponse` (line 913~) → provider proxy 직접 fetch
- `createServerProviderModelDiscoveryResponse` (line 398~) → `/v1/models` 직접 fetch

각 어댑터가 들어오는 시점:
1. **DGX vLLM 어댑터 머지** → `createDgxProviderCompletionResponse`를 어댑터 호출 위임. 5개 어댑터 중 가장 좁은 범위라 시작점으로 안전.
2. **OpenAI-compatible 어댑터 머지** → ServerProviderProxyConfig 중 `apiStyle: "openai_chat"`인 것들(DeepSeek, APIKey.fun GPT, Grok proxy, OpenClaw) 전부 어댑터로 이동.
3. **Anthropic 어댑터 머지** → `apiStyle: "anthropic_messages"`인 것들(APIKey.fun Claude A/B) 어댑터로 이동.
4. **Ollama / OpenRouter 어댑터 머지** → 신규 provider profile 등록 시 즉시 사용.
5. 마지막에 `createServerProviderProxyCompletionResponse` 자체를 deprecate.

각 단계가 별도 PR. 어댑터 추가 ≠ server 리팩터링. 두 PR로 분리.

## 10. 테스트 전략

- **Contract test**: 모든 어댑터가 같은 `adapterContractSuite(adapter, fixtures)`를 통과한다. fixture는 mock fetch로 5가지 케이스(성공, 401, 429, 5xx, 잘못된 JSON).
- **Unit test**: 어댑터별 응답 파싱(특히 Anthropic content array, Ollama 줄 단위, OpenRouter 추가 필드).
- **Mock adapter 재작성**: 새 인터페이스 기준으로 MockProviderAdapter를 다시 짠다. 토큰 카운트는 `content.length`가 아니라 명시 fixture 값.
- **Integration**: smoke 스크립트에서 vLLM 어댑터만 실제 DGX-02 endpoint 호출 (CI 환경에는 토글로 skip).

## 11. 결정 필요 항목 (Codex 회신 요청)

1. **인터페이스 SSOT**: 신규 `packages/providers/src/adapter.ts`로 분리 OK?  또는 기존 `index.ts`에 같이 두기?
2. **secret 주입**: `AdapterRuntimeContext.resolveSecret()` 패턴 OK? 또는 어댑터 생성 시 secret을 클로저로 받는 방식?
3. **Anthropic system 분리**: 어댑터가 `ProviderCompletionRequest.messages`에서 `role==="system"` 메시지를 자동으로 빼서 top-level `system`으로 옮기는 것 OK? (호출자가 신경 안 써도 되게)
4. **max_tokens 기본값**: Anthropic은 필수. 어댑터가 모를 때 4096 / 8192 / 16384 중 어느 쪽? 모델 메타(`modelDescriptor.contextWindow`) 기반 동적 결정?
5. **OAuth secret resolution**: Grok OAuth, Codex OAuth는 어댑터 안에서 refresh를 시도할지, refresh는 별도 계층에서 처리하고 어댑터는 expired면 `AdapterError("auth")` throw할지?
6. **MockProviderAdapter 위치**: 새 인터페이스 기준으로 재작성 후 기존 클래스는 삭제? 아니면 호환 alias 유지?
7. **server 마이그레이션 페이스**: 어댑터 PR 5개를 먼저 다 머지 후 server 일괄 마이그레이션? 또는 어댑터 1개 머지 → server 마이그레이션 1개 반복?

## 12. 작업 분담(현재 합의 반영)

| 항목 | 적임 |
|---|---|
| OpenAI-compatible base + DGX vLLM 어댑터 | Codex |
| OpenAI 어댑터 (base 사용) | Codex |
| OpenRouter 어댑터 (base 사용 + extra headers) | Codex 또는 Claude |
| Anthropic 어댑터 (별도 wire format) | Claude |
| Ollama 어댑터 (별도, 로컬 only) | Claude |
| AdapterError + contract test 골격 | Claude |
| Server 마이그레이션 (각 어댑터 머지 후) | 합의된 어댑터 작성자가 후속 PR로 |

---

## 13. Implementation status (post-merge)

이 제안서는 실제 구현으로 닫혔다. 결정 7개 모두 합의 + 코드 반영 완료, 어댑터 5종이 main에 들어왔다.

### 결정 7개 → 합의 결과

| # | 결정 항목 | 합의 결과 (구현 반영) |
|---|---|---|
| 1 | 신규 인터페이스 파일 위치 | `packages/providers/src/adapter.ts` 분리. `index.ts`는 re-export surface로만 — "index.ts가 다음 App.tsx 되는 거 회피". |
| 2 | Secret 주입 방식 | `AdapterRuntimeContext.resolveSecret()` 패턴. 모든 어댑터(Anthropic / Ollama / OpenAI-compatible / Codex CLI OAuth)가 동일 boundary 사용. |
| 3 | Anthropic system 자동 분리 | 어댑터 책임. `splitSystemAndMessages()` 헬퍼가 system 메시지 추출 → top-level `system` 필드로 매핑. |
| 4 | Anthropic max_tokens 기본값 | context-window-aware. unknown 모델은 4096, 큰 Claude는 8192. 글로벌 16384는 UI/cost controls 성숙 후. AnthropicAdapter `defaultMaxTokens` 옵션으로 caller가 override 가능. |
| 5 | OAuth secret refresh | 별도 계층. 어댑터는 `AdapterError("credential_expired")` 또는 `("refresh_required")`만 throw. CodexCliOAuthAdapter가 이 패턴 따라 CLI에 refresh 위임. |
| 6 | MockProviderAdapter | 신규 `MockLlmAdapter` 재작성. 기존 `MockProviderAdapter`는 `@deprecated` alias로 유지 (`apps/desktop/src/seeds/providers.ts`의 `.profile` 접근 호환). 모든 call site 마이그레이션 후 제거. |
| 7 | Server 마이그레이션 페이스 | 어댑터별 PR. OpenAI-compatible base (#24) → Anthropic (#29) → Ollama (#31, 머지 대기). server cleanup PR (#30) + #29의 server migration이 같이 진행됨. 거대 5어댑터 PR 회피. |

### 어댑터 구현 상태

| 어댑터 | PR | 머지 | 위치 | server 통합 |
|---|---|---|---|---|
| MockLlmAdapter | #18 (PR α) | ✅ | `packages/providers/src/mockLlmAdapter.ts` | n/a (테스트용) |
| OpenAICompatibleAdapter | #24 | ✅ | `packages/providers/src/openAiCompatibleAdapter.ts` | server `createOpenAICompatibleServerCompletion()` |
| AnthropicAdapter | #29 | ✅ | `packages/providers/src/anthropicAdapter.ts` | server `createAnthropicServerCompletion()` |
| OllamaAdapter | #31 | ⏳ 머지 대기 | `packages/providers/src/ollamaAdapter.ts` | 로컬 only — server 통합은 RAM 룰 합의 후 |
| CodexCliOAuthAdapter | #21 | ✅ | `packages/providers/src/node/codexCliOAuthAdapter.ts` (Node-only) | server registry에 `provider_codex_oauth` 등록 |

### 인프라 완성도

- ✅ `LlmAdapter` interface
- ✅ `AdapterRuntimeContext` + `createAdapterContext()` builder
- ✅ `AdapterError` (9 categories: network / auth / credential_expired / refresh_required / rate_limit / bad_request / provider / blocked / unknown)
- ✅ `redactSecretsForLog()` + `truncateForLog()`
- ✅ Server `/provider-completions` 라우팅이 어댑터 기반 (코덱스 #30 cleanup + #29 통합 후)
- ✅ **Contract test fixture** (#33, 머지 대기) — `CONTRACT_HAPPY_PATH` 등 6 expectation + `assertContract` helper. OpenAI-compatible 적용 완료, Anthropic/Ollama는 #29/#31 머지 후 follow-up PR

### 남은 cleanup / 후속

- `_legacyAnthropicMessagesCompletion` + `createAnthropicMessages*` 헬퍼들 — #29 머지 후 dead. 별도 cleanup PR로 제거.
- OpenRouter 어댑터 (OpenAI-compatible base + `HTTP-Referer` / `X-Title` extra headers) — Codex 영역.
- DGX vLLM 전용 최적화 (chat_template_kwargs 등) — 현재는 OpenAI-compatible adapter로 충분, 필요 시 별도 어댑터.
- Ollama server 통합 — RAM 룰 (노드당 vLLM 1개, RAM < 100GiB 보류) 합의 + 호스트 결정 후.
- Anthropic / Ollama contract test 적용 PR — `openAiCompatibleAdapter.contract.test.ts` 패턴 그대로 swap.
