# Streaming Layer Spec

4개 network adapter (OpenAI-compatible / Anthropic / Ollama / Codex CLI) 가 모두 buffered (`complete() → Promise<Response>`) 인 현재 상태에서 token-by-token streaming 으로 가는 설계 합의 문서. 구현 PR 들이 작게 잘리도록 미리 인터페이스 / wire 매핑 / 롤아웃 단계 / 결정점을 한 페이지에 박는다.

관련 문서: [`24-provider-adapters.md`](24-provider-adapters.md) (어댑터 인터페이스 + 5종 post-merge 상태), [`25-anthropic-adapter-spec.md`](25-anthropic-adapter-spec.md) §5 (Anthropic streaming events), [`29-permission-engine-spec.md`](29-permission-engine-spec.md) §10 (permission/streaming 상호작용), [`30-security-audit-checklist.md`](30-security-audit-checklist.md) (보안 감사).

## 1. 왜 지금

- 현재 모든 adapter 가 buffered → 사용자는 응답이 끝날 때까지 대기 (Opus 200k-context 응답 8~30s, DGX vLLM 4~12s, Ollama llama3.1 6~20s)
- 채팅 UX 에서 dead time 5s 초과는 체감 불량. 모바일은 더 심각 (사용자가 화면 잠그면 PWA backgrounded)
- Agent debate 라운드 가시성: 다음 turn 시작 전에 이전 agent 응답 보고 있어야 사용자가 cancel/redirect 가능
- DGX-02 Cloudflare Tunnel 은 SSE 통과 OK (이미 검증). Streaming 인프라적 blocker 없음

## 2. 어댑터별 wire 매핑

| Adapter | Stream protocol | Body shape | Event 종류 | 종료 신호 |
|---|---|---|---|---|
| OpenAI-compatible | SSE (`text/event-stream`) | `data: {...JSON chunk...}\n\n` 반복 | `choices[0].delta.{role,content,tool_calls}` | `data: [DONE]\n\n` |
| Anthropic | SSE (`text/event-stream`) | `event: <type>\ndata: {...}\n\n` 반복 | `message_start` / `content_block_start` / `content_block_delta` (`delta.type=text_delta`) / `content_block_stop` / `message_delta` (final usage) / `message_stop` / `ping` / `error` | `event: message_stop` |
| Ollama | NDJSON over chunked HTTP | `{...}\n` 한 줄당 한 청크 | `{message:{role,content},done,done_reason?,prompt_eval_count?,eval_count?}` | `{done:true}` 라인 |
| Codex CLI | stdout json-lines from `codex exec --json --stream` | child process stdout 한 줄당 한 이벤트 | `{type:"message_chunk", text}` / `{type:"final", text, usage}` / `{type:"error", error}` (실제 schema 는 Codex CLI 1.0.x 기준 확인 필요 — §11.5 결정점) | process exit 0 또는 `{type:"final"}` 라인 |

핵심 관찰: 4개 다 라인 기반 + 청크당 JSON. 어댑터는 native event → normalized event 매핑 함수만 짜면 됨.

## 3. 어댑터 인터페이스 변경

**옵션 A: `stream?: true` 플래그 + 오버로드**
```ts
interface LlmAdapter {
  complete(req, ctx, opts?: { stream?: false }): Promise<ProviderCompletionResponse>;
  complete(req, ctx, opts: { stream: true }): AsyncIterable<ChunkEvent>;
}
```
- 장: 호출 site 통일
- 단: TS 오버로드 + return-type 분기 → caller 가 옵션 잊으면 잘못된 타입. 또 abort/error 가 buffered path 와 다른 채널로 와서 caller 의 try/catch 패턴이 갈림

**옵션 B: 별도 `completeStreaming()` 메서드 (optional)**
```ts
interface LlmAdapter {
  complete(req, ctx): Promise<ProviderCompletionResponse>;
  completeStreaming?(req, ctx): AsyncIterable<ProviderCompletionChunkEvent>;
}
```
- 장: 타입 명확, 옵셔널 (adapter 가 점진 구현 가능), call site 가 의도를 표명 (`adapter.completeStreaming?.(...) ?? adapter.complete(...)` 폴백 패턴)
- 단: caller 가 둘 다 알아야 함

**결정 (recommend)**: **옵션 B**. 이유:
1. 우리 5개 adapter 중 streaming 미구현 (MockLlmAdapter, Codex CLI v1) 이 한동안 공존 → optional 메서드가 그 상태를 타입으로 표현
2. complete() 의 return type 이 안정 → 기존 caller (server `createServerProviderProxyCompletionResponse`, 추후 debate engine) 코드 변경 0
3. AsyncIterable vs Promise 는 try/catch 패턴이 다름 (`for await ... of` 안에서 throw vs Promise.reject) → 별도 메서드면 caller 가 명시적으로 patterns 선택

## 4. Normalized chunk event 타입 (protocol 추가)

`packages/protocol/src/index.ts` 에 추가:

```ts
export type ProviderCompletionChunkEvent =
  | {
      type: "delta";
      requestId: string;        // ProviderCompletionRequest.id 와 link
      sequence: number;          // 0-based, 단조 증가, 중복/누락 감지용
      delta: string;             // 누적이 아닌 증분 텍스트만
      // Anthropic content_block_index 는 v1 에서는 무시 (text 만)
    }
  | {
      type: "usage";
      requestId: string;
      usage: ProviderCompletionUsage;  // partial 가능 (예: prompt_tokens 만)
    }
  | {
      type: "done";
      requestId: string;
      finalContent: string;       // 모든 delta 합본 (caller 가 누락 검증)
      stopReason?: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "cancelled";
      usage?: ProviderCompletionUsage;  // 최종 usage (Anthropic message_delta 에서 옴)
      endpoint: string;
      createdAt: string;          // first chunk 시각
      completedAt: string;        // 마지막 chunk 시각
    }
  | {
      type: "error";
      requestId: string;
      error: {
        category: AdapterErrorCategory;
        message: string;
        status?: number;
        retryAfterSec?: number;
        providerRawSnippet?: string;
      };
      // error 이벤트가 나오면 그 뒤에는 done 이벤트 없음 — caller 가 sequence 끊김으로 인지
    };
```

핵심 invariant:
- `delta` 는 **증분만**. Anthropic `delta.text`, OpenAI `delta.content`, Ollama `message.content` (Ollama 는 청크당 increment 이미)
- `sequence` 는 어댑터가 내부 카운터로 부여. 0부터 시작
- `done` 또는 `error` 중 정확히 1개로 끝남 (mutually exclusive). caller 는 둘 다 안 받고 stream 끝나면 transport error 로 간주
- `usage` 이벤트는 중간에 0~1회 (Anthropic 은 안 보냄, OpenAI 는 마지막에 1번, Ollama 는 final 라인에 포함). `done.usage` 와 중복 가능 — caller 는 마지막 값으로 덮어씀

## 5. 어댑터별 매핑 명세 (구현용)

### 5.1 OpenAI-compatible (`/v1/chat/completions` with `stream: true`)

```jsonc
// 입력 native event:
data: {"id":"chatcmpl_xxx","choices":[{"delta":{"role":"assistant","content":"Hel"}}]}\n\n
data: {"id":"chatcmpl_xxx","choices":[{"delta":{"content":"lo"}}]}\n\n
data: {"id":"chatcmpl_xxx","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":2,"total_tokens":14}}\n\n
data: [DONE]\n\n
```

매핑:
- 각 `delta.content` → `{type:"delta", delta: content, sequence: n++}`
- `delta.role` 만 있고 content 없는 첫 청크 → 무시 (sequence 증가 안 함)
- `finish_reason` 와 `usage` 가 같은 청크에 있으면 분리: 먼저 `usage` 이벤트, 그 다음 `done` 이벤트
- `data: [DONE]` → 이미 done 보냈으면 무시, 안 보냈으면 done (finalContent 누적)

### 5.2 Anthropic (`/v1/messages` with `stream: true`)

```jsonc
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","usage":{"input_tokens":12,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}

event: message_stop
data: {"type":"message_stop"}
```

매핑:
- `message_start.usage` (input_tokens 만 신뢰; output_tokens 는 0) → 첫 `usage` 이벤트로 emit
- `content_block_delta` + `delta.type === "text_delta"` → `{type:"delta", delta: delta.text, sequence: n++}`
- `content_block_delta` + `delta.type === "input_json_delta"` (tool_use) → v1 무시 + 로그
- `content_block_start/stop` → 무시 (v1 single-block 가정)
- `message_delta.usage` (final output_tokens + cache_*) → `usage` 이벤트로 emit (마지막)
- `message_delta.delta.stop_reason === "tool_use"` → `error` 이벤트 (category: "provider", message: "tool_use_returned_but_not_supported") + stream 종료
- `message_stop` → `done` 이벤트
- `ping` → 무시
- `error` SSE event → `error` 이벤트 매핑 후 종료

### 5.3 Ollama (`/api/chat` with `stream: true`)

```jsonc
{"message":{"role":"assistant","content":"Hel"},"done":false}
{"message":{"role":"assistant","content":"lo"},"done":false}
{"message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":12,"eval_count":2}
```

매핑:
- `done: false` 라인 → `{type:"delta", delta: message.content, sequence: n++}` (단, content === "" 라면 무시)
- `done: true` 라인 → `usage` 이벤트 (`inputTokens: prompt_eval_count, outputTokens: eval_count, totalTokens: 합산`) → `done` 이벤트 (stopReason: done_reason)

Ollama 는 청크당 1 line / line 당 1 JSON 가정. fetch response body 를 newline 으로 split 하면 됨.

### 5.4 Codex CLI (`codex exec --json --stream`)

(아직 v1 미구현 — §11.5 결정점)

예상 schema (CLI 1.0.x):
```
{"type":"message_chunk","text":"Hel"}
{"type":"message_chunk","text":"lo"}
{"type":"final","text":"Hello","usage":{...}}
```

매핑:
- `message_chunk` → `{type:"delta", delta: text, sequence: n++}`
- `final` → `usage` 이벤트 + `done` 이벤트
- subprocess stderr → `error` 이벤트 + 종료 + `kill`
- subprocess exit code !== 0 + done 미발행 → `error` 이벤트 (category: "provider", message: stderr)

## 6. 서버 transport

**옵션 A: SSE** (`Content-Type: text/event-stream`)
- 브라우저 / iOS Safari 의 `EventSource` API 네이티브 지원
- Last-Event-ID 헤더로 reconnect 시 sequence 이어받기 (caller 가 sequence 카운터 보고 결정)
- HTTP/1.1 over Cloudflare Tunnel 통과 검증됨 (Cloudflare 는 SSE 를 비정상 종료 안 함)
- 단방향 (server → client) — cancel 은 별도 endpoint

**옵션 B: WebSocket**
- 양방향, cancel 도 같은 connection 으로
- iOS PWA 에서 backgrounded 되면 connection drop → reconnect 처리 더 복잡
- Cloudflare Tunnel WebSocket 통과 OK 지만 추가 설정 필요할 수 있음

**결정 (recommend)**: **옵션 A (SSE)**. 이유:
- 우리 use case 는 server → client 방향만 (사용자 입력은 별도 POST). bidirectional 불필요
- iOS PWA backgrounding 시 EventSource 가 reconnect 시도 자체를 해 줌 (네이티브)
- HTTP/1.1 SSE 는 stateless — server 측에서 connection pool 관리 부담 0
- 디버깅: `curl -N` 으로 그대로 볼 수 있음

### 6.1 새 server endpoint

```
POST /provider-completions/stream
Headers: Authorization: Bearer <token>
Body: ProviderCompletionRequest (기존 /provider-completions 와 동일 schema)
Response: 200 text/event-stream
  event: chunk
  data: <ProviderCompletionChunkEvent JSON>
  ...
  event: done
  data: <ProviderCompletionChunkEvent type:done>

POST /provider-completions/:id/cancel
Headers: Authorization: Bearer <token>
Response: 204 (또는 404 if not in flight)
```

기존 `POST /provider-completions` (buffered) 는 유지 — caller 가 stream 미지원이거나 buffered 가 더 적합하면 (예: 짧은 yes/no 응답) 그쪽 사용.

### 6.2 Cancel 동작

- `/cancel` 받으면 server 는 in-flight stream 의 `AbortController` 에 abort 신호
- 어댑터는 `ctx.abortSignal` 통해 fetch / subprocess 죽임
- Stream 에는 `{type:"done", stopReason:"cancelled", finalContent: <지금까지 delta 합본>}` 보내고 종료
- Client SSE disconnect 도 동일 처리 (`req.on("close")` → abort)

## 7. Client 렌더링 패턴

### 7.1 Desktop (`apps/desktop`)

기존 `MessageList` 컴포넌트에 streaming state 추가:

```ts
type MessageState = {
  id: string;
  role: "user" | "assistant";
  content: string;       // 누적
  streaming?: boolean;   // delta 받는 중
  error?: string;        // error 이벤트 받으면 set
};

// fetch → EventSource → onmessage 에서 type 분기:
//   "delta" → setState((s) => ({...s, content: s.content + delta}))
//   "done"  → setState({...s, content: finalContent, streaming: false})
//   "error" → setState({...s, error, streaming: false})
```

### 7.2 Mobile (`apps/mobile`)

같은 패턴. 단:
- iOS Safari PWA: `EventSource` polyfill 불필요 (iOS 15+ 네이티브)
- background tab: PWA 가 background 가면 EventSource 가 자동 reconnect 시도. server 에서 Last-Event-ID 받으면 in-progress stream 의 unsent chunks 부터 재전송 (단, server 는 chunk 버퍼링 필요 — 메모리 사용 주의, sliding window 64 chunks 만 보관)
- bandwidth: 모바일에서 한 chunk 마다 SSE flush 는 비효율 — server 가 50ms throttle 로 batch flush (delta merge)

## 8. Backpressure / 타임아웃 / 취소

| 항목 | 정책 |
|---|---|
| Backpressure | Server → upstream 어댑터 호출의 fetch 는 Node fetch (stream), backpressure 자동. SSE write 가 client buffer full 되면 fetch read 가 멈춤 → upstream 도 자연스럽게 슬로우다운 |
| 타임아웃 | `AdapterRuntimeContext.timeoutMs` 와 동일 의미. 단, streaming 에서는 "마지막 chunk 이후 N 초" 로 정의 (idle timeout). default 30s |
| Abort | `ctx.abortSignal` → 어댑터 내부 fetch abort. subprocess 어댑터는 SIGTERM (3초 후 SIGKILL) |
| Client disconnect | server `req.on("close")` → 같은 abort 경로 |
| Server crash mid-stream | client 는 EventSource reconnect 시도. 그러나 in-memory state 손실 → reconnect 시 `Last-Event-ID` 헤더 보내도 server 가 모름 → `404` 응답 + client 가 새 stream 시작 (사용자에게는 끊김으로 보임) |

## 9. Mid-stream error 처리

- 정상 동작 중 upstream 이 401/429/500 등 반환: 어댑터가 첫 byte 받기 전에 detect → `error` 이벤트 1개로 끝남 (정상 buffered path 와 같은 mapping)
- 정상 동작 중 일부 chunk 받고 connection drop: 어댑터가 `{type:"error", category:"network"}` 보내고 종료. caller 는 partial `finalContent` 없음 → client 는 "응답 끊김" 표시
- 정상 동작 중 schema 위반 (예: Anthropic 이 unknown event type): warning 로그 + 무시 (stream 계속)
- `done` 또는 `error` 둘 다 없이 transport 정상 종료 (예: server 가 비정상 close): client 가 `EventSource.onerror` 로 감지 → "응답 끊김" 표시

## 10. 테스트 전략

### 10.1 Adapter unit (per-adapter)

mock fetch / mock subprocess 가 native event stream (SSE 또는 NDJSON) 을 그대로 emit → 어댑터의 `completeStreaming()` 가 normalized event sequence 를 정확히 내는지 검증.

```ts
it("anthropic: emits delta events for content_block_delta + final usage + done", async () => {
  const events: ProviderCompletionChunkEvent[] = [];
  const adapter = new AnthropicAdapter({ ..., fetchImpl: mockSseFetch([
    'event: message_start\ndata: {"message":{"usage":{"input_tokens":12}}}\n\n',
    'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hel"}}\n\n',
    'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"lo"}}\n\n',
    'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
    'event: message_stop\ndata: {}\n\n',
  ])});
  for await (const e of adapter.completeStreaming!(req, ctx)) events.push(e);
  expect(events.map(e => e.type)).toEqual(["usage","delta","delta","usage","done"]);
});
```

### 10.2 Streaming contract fixtures

`contractTestFixtures.ts` 에 추가:
- `CONTRACT_STREAM_HAPPY` — N delta + final done
- `CONTRACT_STREAM_USAGE_FIRST` — usage 이벤트가 첫 delta 전에 옴 (Anthropic 패턴)
- `CONTRACT_STREAM_CANCELLED` — abort 시 done(stopReason:"cancelled") + finalContent partial
- `CONTRACT_STREAM_MID_NETWORK_ERROR` — N delta 후 transport drop → error 이벤트
- `CONTRACT_STREAM_AUTH_BEFORE_FIRST_CHUNK` — 첫 byte 전 401 → error 이벤트만, delta 0개

### 10.3 Server integration

`apps/server` test 에서 in-process server spawn → `EventSource` polyfill (Node 환경) 로 연결 → event sequence assert.

### 10.4 E2E (manual)

DGX vLLM 에 streaming smoke:
```bash
SMOKE_STREAM=1 pnpm server:smoke
```
실제 streaming 경로로 흐름. usage 가 0 아닌 값으로 도달하는지 확인.

## 11. 결정점

### 11.1 인터페이스: 옵션 A vs B
**Recommend B (separate `completeStreaming?()`)**. §3 이유 참조.

### 11.2 Transport: SSE vs WebSocket
**Recommend SSE**. §6 이유 참조.

### 11.3 Usage 이벤트 emission 정책
- 옵션 a: stream 중 0~N 회, 마지막 done 에 최종값
- 옵션 b: stream 중 0 회, done 에만 포함
- **Recommend a** (Anthropic 처럼 input_tokens 를 first chunk 에서 알려주는 provider 가 있고, caller 가 mid-stream cost 추정 가능)

### 11.4 Reconnect / sequence 복원
- 옵션 a: server 가 sliding window 64 chunks 버퍼 → Last-Event-ID 받으면 미발신 분만 재전송
- 옵션 b: reconnect 미지원, 끊기면 새 stream 필요
- **Recommend b** (v1). 이유: 64 chunks 버퍼링은 메모리 관리 복잡 + multi-tenant 까다로움. v1 은 끊기면 사용자가 retry. v2 에서 ROI 보고 a 추가 검토

### 11.5 Codex CLI streaming 실 schema
- `codex exec --json --stream` 의 정확한 event schema 확인 필요. CLI 1.0.4 도큐 또는 source 조사. (실 호출해서 capture)
- 만약 schema 가 stable 하지 않거나 stream 모드 자체 미지원이면: Codex CLI 어댑터는 streaming 미지원 (`completeStreaming` 안 구현) — caller 가 자동 폴백

### 11.6 Server 에 multiplex 여부
- 옵션 a: 하나의 SSE connection 으로 여러 stream multiplex (event 에 `requestId` 박혀 있으니 가능)
- 옵션 b: stream 1개 당 SSE connection 1개
- **Recommend b**. multiplex 는 client connection pool 절약은 되지만 cancel / error 격리가 복잡. 모바일 환경에서 stream 동시 1~2개라 multiplex 이득 없음

### 11.7 Throttle 정책
- Server → client SSE flush 빈도
- 옵션 a: 매 delta 즉시 flush
- 옵션 b: 50ms throttle (그동안 들어온 delta 모아서 하나의 chunk 로 합쳐 flush)
- **Recommend b for mobile / a for desktop** (config 로 분기). 모바일 네트워크에서 SSE chunk overhead (`event: chunk\ndata: {...}\n\n` 가 chunk text 보다 길 수 있음) 무시 못 함

### 11.8 Tool use 이벤트 처리
- 옵션 a: streaming v1 에서 tool_use 도 발신 (event type `tool_use_chunk`)
- 옵션 b: tool_use 만나면 stream 종료 + error 이벤트
- **Recommend b** (v1). Tool use 는 별도 layer 합의 필요 (buffered 어댑터도 현재 `tool_use_returned_but_not_supported` 반환). Streaming 이전에 tool use spec 먼저

## 12. Permission engine (docs/29 F1~F10) 과 상호작용

- F2 permission gate 는 stream 시작 전에 evaluate — buffered path 와 동일. permission denied 이면 stream 안 열림, 기존 403 응답
- F4 budget guard 가 streaming 에 의미 있음: chunk 마다 누적 token 추정 → budget 초과 시 server 가 stream 강제 종료 (`done.stopReason: "cancelled"`, error chunk 발신 후 connection close)
- F5 모바일 approval: stream 시작 전 approval 필요한 경우는 buffered 와 동일 (approval UX 로 진입). stream 시작 후에는 approval 인터럽트 미지원 (caller 가 cancel 후 재시작)
- F7 redaction pipeline: streaming 에서 redaction 은 까다로움 — chunk 경계가 redaction 패턴 한가운데일 수 있음. **v1 streaming 은 outbound redaction 미지원** (chunk 통째로 client 까지 통과), F7 + streaming 통합은 별도 spec

## 13. Prompt caching (PR #43) 과 상호작용

- Caching 은 request shape 결정 (어댑터 `enablePromptCaching` 옵션) — streaming 과 직교
- `stream: true` 와 caching 동시 사용 가능. cache_control 마킹된 system block 그대로 전송
- `usage.cache_*_tokens` 는 Anthropic `message_delta` event 에서 도착 → §4의 `usage` 또는 `done.usage` 이벤트로 표면화
- caller 가 caching 효율 측정하려면 `done.usage.cacheReadInputTokens > 0` 확인

## 14. 롤아웃 단계 (PR 분할)

각 단계는 독립적으로 머지 가능 / 이전 단계가 머지될 때까지 default `stream: false` (caller 도, server 도) → 기존 동작 완전 호환.

| Phase | PR 내용 | 의존 |
|---|---|---|
| **P1** | `packages/protocol` 에 `ProviderCompletionChunkEvent` + helper type. `MockLlmAdapter.completeStreaming()` 구현 + 단위 테스트. `contractTestFixtures.ts` 에 5 streaming fixture 추가 | 0 |
| **P2** | `OpenAiCompatibleAdapter.completeStreaming()` 구현 + SSE 파싱 helper + 단위 + contract 테스트 | P1 |
| **P3** | `AnthropicAdapter.completeStreaming()` 구현 (multi-event SSE 파싱) | P1 |
| **P4** | `OllamaAdapter.completeStreaming()` 구현 (NDJSON 파싱) | P1 |
| **P5** | Server `POST /provider-completions/stream` endpoint + cancel endpoint. permission gate 통합. logging | P2~P4 중 하나 이상 |
| **P6** | `apps/desktop` MessageList streaming 렌더링 + `EventSource` wiring | P5 |
| **P7** | `apps/mobile` 동일 + iOS PWA 동작 검증 | P5 |
| **P8** | F4 budget guard 가 streaming 누적 token 으로 mid-stream cancel | P5 + F4 머지 |
| **P9** (optional) | Codex CLI streaming (§11.5 schema 확정 후) | P1 + Codex CLI v1.1+ 확정 |
| **P10** (optional) | SSE reconnect + sliding-window buffer (§11.4) | P5 운영 데이터로 ROI 확인 후 |

## 15. 분담 / 파일 소유

| Phase | 파일 영역 | 담당 (제안) |
|---|---|---|
| P1 | `packages/protocol` + `packages/providers/{mockLlmAdapter, contractTestFixtures}` | Claude (이미 contract fixtures 작성자) |
| P2 | `packages/providers/openAiCompatibleAdapter.ts` | Codex (file owner) |
| P3 | `packages/providers/anthropicAdapter.ts` | Claude (file owner) |
| P4 | `packages/providers/ollamaAdapter.ts` | Claude (file owner) |
| P5 | `apps/server/src/index.ts` | Codex (file owner) |
| P6 | `apps/desktop` | Codex (file owner) |
| P7 | `apps/mobile` | Codex (file owner) — 또는 Claude 가 일부 영역만 양보 받음 |
| P8 | server + F4 통합 | Codex |
| P9 | `packages/providers/node/codexCliOAuthAdapter.ts` | Codex (file owner) |
| P10 | server | Codex |

P1 만 머지되면 P2~P4 를 Claude 와 Codex 가 평행 진행 가능 (다른 파일, 인터페이스는 P1 에 박혀 있음).

## 16. 보안 / 감사

[`docs/30-security-audit-checklist.md`](30-security-audit-checklist.md) §3 Provider 어댑터 체크리스트 streaming 항목 추가 (P2~P4 PR 에 포함):

- [ ] streaming chunk 가 secret pattern 포함하는지 redact 적용 여부 (현재 buffered 는 `providerRawSnippet` 만 redact — streaming 은 raw 가 client 까지 흐름)
- [ ] `done.finalContent` 가 client log 에 남을 때 secret 누출 가능 — desktop / mobile 의 message store 가 secret pattern detect 후 마스킹 (caller 책임)
- [ ] SSE connection 의 Authorization 헤더가 query param 으로 빠지지 않는지 (`EventSource` 는 헤더 못 보냄 → Cookie 또는 별도 token endpoint 합의 필요 — §11 미정 결정점)
- [ ] cancel endpoint 도 Bearer auth 동일 적용
- [ ] error 이벤트의 `providerRawSnippet` 는 buffered 와 같은 `redactSecretsForLog` 통과

### 16.1 SSE 인증 결정점 (추가)

`EventSource` API 는 custom headers 불가 → `Authorization: Bearer <token>` 못 보냄. 대안:
- 옵션 a: Cookie 기반 auth (server 가 set-cookie 로 token 발급)
- 옵션 b: query param (`?token=...`) — log 누출 위험
- 옵션 c: `fetch()` + `ReadableStream` (browser 네이티브, EventSource 안 씀) → custom headers 가능
- **Recommend c** (v1). 모든 modern 브라우저 + iOS 15+ 지원. EventSource 대비 API 가 약간 verbose 하지만 보안 우월. 단점: reconnect 자동 안 됨 (수동 구현 — v1 은 §11.4 처럼 reconnect 미지원이라 OK)

## 17. 미정 / 후속 합의 필요

위 §11 결정점 (8 개) + §16.1 SSE 인증 (1 개) — 총 9 개 결정점에 대해 user / codex 회신 필요. 9 개 다 추천안 있고, 추천안 그대로 가도 streaming v1 으로 합리적.

추천안 그대로 합의되면 다음 PR 은 P1 (Claude, protocol + Mock + contract fixtures) 시작 가능.
