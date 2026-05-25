# Anthropic Adapter Spec

Anthropic `/v1/messages` 명세를 어댑터 구현 관점에서 정리한 reference. `docs/24-provider-adapters.md`의 인터페이스 제안서가 합의되면 이 문서를 그대로 Anthropic 어댑터 구현(Claude 담당)의 작업 지침으로 사용한다.

대상 provider:
- `provider_apifun_claude` / `provider_apifun_claude_b` (APIKey.fun Claude A/B reseller, `apiStyle: "anthropic_messages"`)
- 향후 Anthropic 직접 (`api.anthropic.com`)이 등록되면 같은 어댑터에 base URL만 다르게 주입.

## 1. Endpoint와 Headers

| 항목 | Anthropic 직접 | APIKey.fun reseller |
|---|---|---|
| Base URL | `https://api.anthropic.com` | `https://api.apikey.fun` (env: `APIKEYFUN_ANTHROPIC_BASE_URL`) |
| Endpoint | `POST /v1/messages` | 동일 |
| 인증 | `x-api-key: sk-ant-...` | `x-api-key: <reseller-key>` (env: `ANTHROPIC_API_KEY` / `ANTHROPIC_API_KEY_ALT`) |
| 필수 헤더 | `anthropic-version: 2023-06-01` | 보통 동일하지만 reseller 정책에 따라 무시될 수 있음 — 일단 보낸다 |
| 선택 헤더 | `anthropic-beta: prompt-caching-2024-07-31` 등 | reseller가 캐시 지원하는지 별도 검증 필요 |
| Content-Type | `application/json` | 동일 |

어댑터는 base URL을 `OpenAiCompatibleAdapterConfig`처럼 외부 주입받고, `x-api-key` 값만 `AdapterRuntimeContext.resolveSecret()`에서 가져온다. `Authorization: Bearer` 헤더는 보내지 않는다 (Anthropic은 OpenAI와 다르게 `x-api-key`를 쓴다).

## 2. Request shape

```jsonc
{
  "model": "claude-opus-4-5",          // 필수
  "system": "...",                     // top-level (선택), 문자열 또는 content blocks 배열
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "max_tokens": 4096,                  // 필수 (OpenAI와 가장 큰 차이)
  "temperature": 0.7,                  // 선택
  "top_p": 0.9,                        // 선택
  "stop_sequences": ["\n\nHuman:"],    // 선택
  "stream": false,                     // 1차 어댑터는 false 고정
  "tools": [ ... ],                    // 1차 비대상 (별도 PR)
  "tool_choice": { "type": "auto" },   // 1차 비대상
  "metadata": { "user_id": "..." }     // 선택
}
```

### 2.1 System 메시지 변환

`packages/protocol`의 `ProviderCompletionRequest.messages`는 OpenAI 스타일이라 `role: "system"`이 messages 배열 안에 들어있다. Anthropic은 `system`이 top-level 필드라 어댑터가 변환해야 한다.

**규칙**:
1. messages 배열을 순회하면서 `role === "system"`인 것들을 추출.
2. 추출된 system 메시지가 0개면 `system` 필드 생략.
3. 1개면 `system: <content>`로 문자열 전달.
4. 2개 이상이면 두 줄로 join (`"\n\n"`) 후 단일 문자열로 전달. (Anthropic도 content block 배열을 받지만 1차 어댑터는 단순화)
5. 나머지 메시지(`user`/`assistant`)는 그대로 `messages`에 둔다.
6. `role: "tool"` 메시지는 1차 어댑터에서는 stripped + warning 로그.

```ts
function splitSystemAndMessages(input: ProviderCompletionMessage[]) {
  const systems: string[] = [];
  const others: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of input) {
    if (m.role === "system") systems.push(m.content);
    else if (m.role === "user" || m.role === "assistant") others.push({ role: m.role, content: m.content });
    // tool role: 1차에서는 drop
  }
  return { system: systems.length === 0 ? undefined : systems.join("\n\n"), messages: others };
}
```

### 2.2 messages 정합성 규칙 (Anthropic 강제)

- 첫 메시지는 반드시 `role: "user"`. 어댑터는 위반 시 `AdapterError("bad_request", "anthropic: messages must start with user")`.
- `user`/`assistant`가 반드시 교차. 같은 role이 연속되면 어댑터가 자동으로 `"\n\n"`로 머지하지 말고 `bad_request` throw — 호출자(debate engine)가 라운드를 잘못 구성한 신호.
- 마지막 메시지가 `assistant`인 경우 Anthropic은 그 assistant 응답을 이어서 생성하므로 허용. 1차 어댑터도 그대로 통과.

### 2.3 max_tokens 정책

Anthropic은 `max_tokens` 필수. `ProviderCompletionRequest`에 없는 필드라 어댑터가 결정해야 한다. **결정 필요** (docs/24 결정점 4번):

| 옵션 | 장 | 단 |
|---|---|---|
| 4096 고정 | 단순, 모든 모델 안전 | Opus처럼 200k context 모델에서 짧음 |
| 8192 고정 | 적당히 길어 default 응답 충분 | 일부 reseller가 거부할 수 있음 |
| 16384 고정 | 긴 응답 가능 | rate limit/quota 빨리 소진 |
| `modelDescriptor.contextWindow / 8` 동적 | 모델별 자동 조정 | Discovery에서 contextWindow 안 받은 모델은 fallback 필요 |

**Claude 추천**: `Math.min(8192, modelDescriptor.contextWindow ?? 200_000)` — Opus/Sonnet는 8k, Haiku도 8k 안전. contextWindow 미상이면 4096 fallback. 별도 옵션으로 `request.maxTokens`가 들어오면 그게 우선 (단, protocol schema에 필드 추가 필요 — 별도 PR).

## 3. Response shape

```jsonc
{
  "id": "msg_01abc...",
  "type": "message",
  "role": "assistant",
  "model": "claude-opus-4-5",
  "content": [
    { "type": "text", "text": "응답 본문" }
    // 1차 어댑터는 type=text만 다룬다. tool_use는 1차 비대상.
  ],
  "stop_reason": "end_turn",  // end_turn | max_tokens | stop_sequence | tool_use
  "stop_sequence": null,
  "usage": {
    "input_tokens": 152,
    "output_tokens": 87,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

### 3.1 content array 파싱

```ts
function extractAnthropicText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text!)
    .join("");
}
```

- `type === "text"`가 아닌 블록(`tool_use`, `image` 등)은 1차 어댑터에서는 무시 + warning 로그.
- text 블록이 0개면 `ProviderCompletionResponse.content = undefined` + `status = "succeeded"` 그대로. 호출자가 빈 응답으로 처리.

### 3.2 stop_reason 매핑

| Anthropic | ProviderCompletionResponse 의미 |
|---|---|
| `end_turn` | 정상 종료, `status: "succeeded"` |
| `max_tokens` | 정상 종료지만 잘림, `status: "succeeded"` + warning |
| `stop_sequence` | 정상 종료, `status: "succeeded"` |
| `tool_use` | 1차 어댑터는 tool 미지원이라 `status: "failed"` + `error: "tool_use_returned_but_not_supported"` |

### 3.3 Usage 매핑

protocol의 `ProviderCompletionUsage` 확장 제안 (docs/24 §8):

```ts
{
  inputTokens: anthropic.usage.input_tokens,
  outputTokens: anthropic.usage.output_tokens,
  totalTokens: input_tokens + output_tokens,
  cacheCreationInputTokens: anthropic.usage.cache_creation_input_tokens,  // 신규
  cacheReadInputTokens: anthropic.usage.cache_read_input_tokens,          // 신규
}
```

cache 필드가 protocol에 없으면 추가하는 PR을 어댑터 작업과 동시에 낸다 (Anthropic 어댑터 PR에 포함).

## 4. Error 응답

```jsonc
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",  // authentication_error | permission_error | not_found_error | rate_limit_error | api_error | overloaded_error
    "message": "..."
  }
}
```

HTTP status는 보통 type과 일치하지만 reseller가 다르게 줄 수 있어서 둘 다 본다.

| Anthropic error.type | HTTP | AdapterError category |
|---|---|---|
| `authentication_error` | 401 | `"auth"` |
| `permission_error` | 403 | `"auth"` |
| `not_found_error` | 404 | `"bad_request"` (model id 잘못) |
| `invalid_request_error` | 400 | `"bad_request"` |
| `rate_limit_error` | 429 | `"rate_limit"` + `retryAfterSec` 헤더 파싱 |
| `api_error` | 500 | `"provider"` |
| `overloaded_error` | 529 | `"provider"` + retry 권장 |
| (HTTP 502/504) | 502/504 | `"provider"` (reseller proxy 단)  |
| (response body가 JSON 아님) | * | `"unknown"` |

`AdapterError.providerRawSnippet`에 들어가는 텍스트는 어댑터가 `redactSecretsForLog`(server에 이미 있는 헬퍼, 어댑터 패키지에도 이동 필요)로 처리한 뒤 최대 240자.

### 4.1 Rate limit 헤더

Anthropic은 추가 헤더 제공:
- `retry-after`: 초 단위 정수
- `anthropic-ratelimit-requests-limit`, `anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-requests-reset`
- `anthropic-ratelimit-tokens-limit`, `anthropic-ratelimit-tokens-remaining`, `anthropic-ratelimit-tokens-reset`

1차 어댑터는 `retry-after`만 본다. 나머지는 향후 백오프/QoS 계층에서 사용.

## 5. Streaming events (1차 어댑터 비대상)

`stream: true`로 보내면 SSE. 1차 어댑터는 streaming 비포함이지만, 향후 streaming layer가 구현할 때 참고할 event 종류:

| Event | 내용 |
|---|---|
| `message_start` | `message` 객체 (content 비어있음), usage 초기값 |
| `content_block_start` | `index`, `content_block` (type만 있음) |
| `content_block_delta` | `index`, `delta: { type: "text_delta", text: "..." }` |
| `content_block_stop` | `index` |
| `message_delta` | `delta: { stop_reason, stop_sequence }`, `usage: { output_tokens }` 누적 |
| `message_stop` | 종료 |
| `ping` | 무시 |
| `error` | streaming 중간 에러, 즉시 종료 |

text 누적은 `content_block_delta`의 `delta.text`만 모으면 됨. tool/image 블록은 향후.

## 6. Prompt caching (1차 어댑터 비대상이지만 명세)

`anthropic-beta: prompt-caching-2024-07-31` 헤더를 보내고, request의 system/messages content block에 `cache_control: { type: "ephemeral" }`를 붙이면 다음 호출 시 cache_read_input_tokens로 회수.

```jsonc
{
  "system": [
    { "type": "text", "text": "long system prompt...", "cache_control": { "type": "ephemeral" } }
  ]
}
```

reseller는 보통 cache 지원 불확실 — 어댑터는 default off, 명시 옵션으로만 켠다.

## 7. APIKey.fun Claude A/B reseller 차이

| 항목 | 직접 Anthropic | APIKey.fun |
|---|---|---|
| Base URL | `api.anthropic.com` | `api.apikey.fun` |
| `anthropic-version` 헤더 | 필수 | 보통 무시되지만 보내도 OK |
| `anthropic-beta` 헤더 | 동작 | reseller가 beta 기능 미지원일 가능성 — 미사용 권장 |
| `cache_control` | 동작 | reseller가 cache 통과시키지 않을 수 있음 — default 미사용 |
| 응답 stop_reason | Anthropic 그대로 | reseller가 일부 변환 가능, 어댑터는 unknown stop_reason도 `succeeded`로 처리 |
| 응답 usage.cache_*_tokens | 정확 | reseller가 0으로 고정해서 줄 수 있음 — 어댑터는 절대값 의존 금지 |
| Rate limit | Anthropic 헤더 | reseller가 자체 정책, `retry-after`만 신뢰 |

trust level은 `untrusted` (`packages/providers/src/index.ts:detectTrustLevel`에서 자동 분류) → memory recall 차단 정책은 protocol 단에서.

## 8. 어댑터 구현 골격 (참고용)

```ts
// packages/providers/src/anthropicAdapter.ts
import type { ProviderAdapter, AdapterRuntimeContext } from "./adapter";
import type {
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ModelDescriptor,
} from "@ai-orchestrator/protocol";
import { AdapterError } from "./errors";

export type AnthropicAdapterConfig = {
  profileId: string;
  baseUrl: string;              // "https://api.anthropic.com" or "https://api.apikey.fun"
  anthropicVersion?: string;    // default "2023-06-01"
  defaultMaxTokens?: number;    // default 4096
  betaHeaders?: string[];       // reseller에서는 비움
  modelListPath?: string;       // default null (Anthropic은 /v1/models 없음)
};

export function createAnthropicAdapter(cfg: AnthropicAdapterConfig): ProviderAdapter {
  return {
    profileId: cfg.profileId,
    kind: "anthropic",
    async discoverModels(_ctx) {
      // Anthropic 공식엔 /v1/models 없음 → static list 또는 ServerProviderProxyConfig.defaultModelIds 사용
      return [];
    },
    async complete(request, ctx) {
      const secret = await ctx.resolveSecret();
      if (!secret) throw new AdapterError("auth", "anthropic: missing x-api-key");

      const { system, messages } = splitSystemAndMessages(request.messages);
      const body = {
        model: request.modelId,
        ...(system ? { system } : {}),
        messages,
        max_tokens: cfg.defaultMaxTokens ?? 4096,
        stream: false,
      };

      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": secret,
        "anthropic-version": cfg.anthropicVersion ?? "2023-06-01",
      };
      if (cfg.betaHeaders?.length) headers["anthropic-beta"] = cfg.betaHeaders.join(",");

      // fetch + timeout + abortSignal
      // → 응답 파싱 → ProviderCompletionResponse 반환
      // → 에러는 AdapterError로 throw
      // 자세한 구현은 어댑터 PR에서.
    },
  };
}
```

## 9. 테스트 fixture (계약 테스트용)

| Case | Request 특이점 | Mock fetch 응답 | 기대 결과 |
|---|---|---|---|
| 정상 응답 | system 1개 + user 1개 | 200, content array text 1개 | `status: "succeeded"`, content 추출, usage 채워짐 |
| system 2개 | system 2개 + user 1개 | 위와 동일 | request body의 `system`이 `"\n\n"` 머지된 문자열 |
| first message가 assistant | messages[0].role = "assistant" | 호출 없음 | `AdapterError("bad_request", ...)` throw |
| max_tokens 도달 | 짧은 응답 + `stop_reason: "max_tokens"` | 200 | `status: "succeeded"` + warning, content는 잘린 채 반환 |
| tool_use 반환 | request에 tool 없음 | 200, `stop_reason: "tool_use"` | `status: "failed"`, error `"tool_use_returned_but_not_supported"` |
| 401 | 정상 request | 401 + `{type:"error",error:{type:"authentication_error",...}}` | `AdapterError("auth", ..., 401)` |
| 429 + retry-after | 정상 request | 429 + header `retry-after: 30` | `AdapterError("rate_limit", ..., 429, retryAfterSec: 30)` |
| 500 + body 비-JSON | 정상 request | 500, body `"upstream timeout"` | `AdapterError("provider", ..., 500, providerRawSnippet: redacted)` |
| reseller가 cache_*_tokens 0으로 반환 | 정상 request | 200 + usage.cache_read_input_tokens = 0 | usage 그대로 통과, 호출자는 절대값 가정 안 함 |

## 10. 어댑터 PR 안에서 같이 해야 할 protocol 변경

`packages/protocol/src/index.ts`:
- `ProviderCompletionUsage`에 `cacheCreationInputTokens?: number` + `cacheReadInputTokens?: number` 추가.
- (선택) `ProviderCompletionRequest`에 `maxTokens?: number`, `stopSequences?: string[]` 추가. 추가하면 어댑터가 default 대신 호출자 값 우선 사용. 이건 별도 합의.

## 11. 결정 필요 (Anthropic 어댑터에 한정)

1. **`max_tokens` default 정책** — 4096 고정 / 8192 고정 / `modelDescriptor.contextWindow / 8` 동적 중 선택. (Claude 추천: `min(8192, contextWindow ?? 200000)`)
2. **`role: "tool"` 메시지 처리** — 1차에서 drop + warning vs `AdapterError("bad_request")`. (Claude 추천: drop + warning, 호환성 위해)
3. **`anthropic-version` 값** — `2023-06-01` 고정 vs 환경변수 노출. (Claude 추천: 고정, 필요 시 별도 옵션)
4. **`prompt-caching` beta** — 1차 어댑터 옵션으로라도 노출 vs 완전 미포함. (Claude 추천: 완전 미포함, 별도 PR)
5. **reseller 모델 목록 처리** — `/v1/models` 없으니 `ServerProviderProxyConfig.defaultModelIds` 그대로 통과 vs 어댑터 자체 static list. (Claude 추천: 전자, server config가 SSOT)
