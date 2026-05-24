# Vertical Slice Test Plan

Vertical slice 1번을 "한 번에 동작하는 사용 가능 흐름"으로 닫기 위한 테스트 가이드. Grok·Claude 외부 리뷰 합의대로 첫 슬라이스 범위는 다음 5단계로 고정:

```
[1] Conversation message 입력
  → [2] DGX proxy completion (server 경유, non-streaming)
    → [3] Event sync push (desktop outbox → server event store)
      → [4] Replay (server pull → desktop ConversationMessage 재구성)
        → [5] Obsidian export (projection → vault 파일 쓰기)
```

streaming, tool use, multimodal, mobile approval, Telegram ingress는 슬라이스 1 비포함. 슬라이스 닫힌 뒤 별도 phase.

## 1. 단계별 성공/실패 조건

### Step 1 — Conversation message 입력

| 항목 | 성공 조건 | 실패 조건 |
|---|---|---|
| schema | `conversationMessageSchema` 통과 (`role: user/assistant/system/tool`, `content: string`, `sessionId/id/createdAt` 채워짐) | 빈 content, role 미일치, ISO 형식 아닌 createdAt |
| sessionId | 신규 세션이면 `session_*` 패턴, 기존 세션이면 `conversationSessionSchema.id`와 일치 | 임의 문자열, 256자 초과 |
| metadata | optional, record 형식 | non-object value |

자동 테스트 위치: `packages/protocol/src/index.test.ts` (이미 일부 있음 — `conversationMessageSchema` 케이스 보완).

### Step 2 — DGX proxy completion

| 항목 | 성공 | 실패 |
|---|---|---|
| Request | `providerCompletionRequestSchema.parse` 통과 (C2 적용 후) — id/sessionId/providerProfileId/modelId/messages/source/routePreference/createdAt | 어느 필드든 결여, messages 0개 또는 200 초과, content 200KB 초과 |
| Auth | `Authorization: Bearer ${VITE_ORCHESTRATOR_API_TOKEN}` 부착 (압축 후 Codex 작업), C1 적용 후 401 회피 | 토큰 누락 → 401 `unauthorized` |
| Body size | ≤ 1MB | > 1MB → 413 `payload_too_large` (C2) |
| Routing | `routePreference: "server_proxy"`면 server `/provider-completions` 호출, `direct_provider`면 desktop이 직접 호출 (provider adapter 머지 후) | 라우팅 결정이 모호 → 어느 한쪽 |
| Response | `ProviderCompletionResponse.status = "succeeded"`, `content` 비어있지 않음, `usage.{input,output}Tokens` 둘 다 존재 | status `"failed"` (502/504/upstream 오류) — `docs/26` 진단표 적용 |
| 회귀 보호 | C1 머지 후 토큰 미부착 시 401 명시 확인 | — |

자동: `apps/server/src/index.test.ts` (현재 19 케이스 — `providerCompletionRequestSchema` 거부 케이스 4~5개 추가). 수동: smoke 스크립트 (`pnpm server:smoke`).

### Step 3 — Event sync push

| 항목 | 성공 | 실패 |
|---|---|---|
| Outbox 적재 | desktop 클라이언트가 event를 local outbox(stage16, stage29)에 저장 후 server에 batch push | outbox 누수 (race) |
| Request schema | `eventSyncPushRequestSchema.parse` 통과 (이미 적용됨) | 위반 → 400 `invalid_event_sync_payload` |
| Idempotency | `idempotencyKey`가 `${clientId}:${sessionId}:${eventId}` 패턴, 중복 push 시 `duplicates`로 반환 | 중복인데 새로 accept되면 무결성 깨짐 |
| Revision | server response의 `serverRevision`이 단조 증가 | 동시 push로 동일 revision (server race 위험 — 별도 작업) |
| Secret guard | event payload에 secret 포함 시 server가 `failed`로 반환 (`containsSecretLikeText`) | secret이 그대로 저장 |
| 401/413/400 | C1/C2 적용 후 클라이언트 헤더/크기/schema 위반 시 즉시 거부 | — |

자동: 기존 server 테스트 + secret-rejection 테스트 1개 (이미 있음). 

### Step 4 — Replay

| 항목 | 성공 | 실패 |
|---|---|---|
| Pull | `GET /events?sessionId=...&afterRevision=...` 호출 → revision 순서대로 응답 | 정렬 깨짐 |
| Replay | `rebuildConversationMessagesFromEvents` (stage18EventReplay)가 메시지 목록 재구성 | dedup 순서 mismatch (Medium #8) |
| Outbox 머지 | local outbox 이벤트 + server 이벤트 머지 시 같은 createdAt 정렬 규칙 사용 | `mergeClientEventOutboxEvents`의 newest-first vs `listBySession`의 oldest-first 불일치 (이미 잡힌 결함 — 별도 fix) |
| 결과 hash | replay된 메시지 목록의 SHA-256이 fixture와 일치 | — |

자동: `apps/desktop/src/runtime/stage18EventReplay.test.ts` (현재 5 케이스 — hash 비교 케이스 1개 추가 권장).

### Step 5 — Obsidian export

| 항목 | 성공 | 실패 |
|---|---|---|
| Projection | `createStage7BackupSnapshot` → `BackupProjectionArtifact` 생성 | artifact가 obsidian 아닌 target |
| Plan | `createObsidianExportPlan({vaultRoot, artifact, content})` → 절대경로 + 상대경로 + byteLength | vaultRoot 외부로 escape (path traversal) |
| Redaction | `redactionRequired: true`인데 content에 secret 패턴 존재 시 export 거부 | secret이 vault 파일에 그대로 |
| 파일 쓰기 | `Stage26FileWriter` 콜백이 호출되고 절대경로에 content 기록 | rolling file write 실패 |
| Vault 경로 | Windows: `F:\obsidian\ai-headquarter` 기본 (work-board 참조). Mac은 별도 동기화 | 잘못된 OS 경로 구분자 |

자동: `apps/desktop/src/runtime/stage26ObsidianExport.test.ts` (현재 3 케이스 — secret-block 케이스 1개 추가).

## 2. Fixture 세트

자동 테스트와 smoke 모두에서 재사용할 minimal fixture.

```ts
// tests/fixtures/verticalSlice.ts
export const SMOKE_SESSION_ID = "session_vs_001";

export const userMessage: ConversationMessage = {
  id: "msg_user_001",
  sessionId: SMOKE_SESSION_ID,
  role: "user",
  content: "Reply OK only",
  createdAt: "2026-05-25T05:00:00.000Z",
};

export const providerCompletionRequest: ProviderCompletionRequest = {
  id: "provider_completion_vs_001",
  sessionId: SMOKE_SESSION_ID,
  providerProfileId: "provider_dgx02_vllm",
  modelId: "qwen36-domain-wiki-rag-prisma",
  messages: [{ role: "user", content: "Reply OK only" }],
  source: "desktop",
  routePreference: "server_proxy",
  createdAt: "2026-05-25T05:00:00.000Z",
};

export const assistantMessage: ConversationMessage = {
  id: "msg_assistant_001",
  sessionId: SMOKE_SESSION_ID,
  role: "assistant",
  content: "OK",
  createdAt: "2026-05-25T05:00:01.000Z",
};

export const eventSyncRequest: EventSyncPushRequest = {
  id: "event_sync_vs_001",
  clientId: "client_macbook",
  sessionId: SMOKE_SESSION_ID,
  idempotencyKey: `client_macbook:${SMOKE_SESSION_ID}:msg_assistant_001`,
  createdAt: "2026-05-25T05:00:01.000Z",
  events: [
    {
      id: "event_msg_001",
      sessionId: SMOKE_SESSION_ID,
      type: "conversation.message",
      payload: { messageId: "msg_assistant_001" },
      createdAt: "2026-05-25T05:00:01.000Z",
      source: "desktop",
      sourceTrust: "trusted",
      redacted: true,
    },
  ],
};
```

secret 거부 테스트용:

```ts
export const secretBearingEvent = {
  ...eventSyncRequest.events[0],
  id: "event_msg_secret",
  payload: { content: "sk-test-shouldnotleak-1234567890abcdef" },
};
```

## 3. 자동 테스트 매트릭스

| 위치 | 케이스 | 신규/기존 | C1/C2 회귀 |
|---|---|---|---|
| `packages/protocol/src/index.test.ts` | `providerCompletionRequestSchema` 정상/필드 누락/길이 초과 | 신규 4~5 | C2 |
| `packages/protocol/src/index.test.ts` | `remoteExecutionRequestSchema` 정상/실패 | 신규 2~3 | C2 |
| `apps/server/src/index.test.ts` | 401 (토큰 누락), 401 (잘못된 토큰), 200 (정상 토큰) | 신규 3 | C1 |
| `apps/server/src/index.test.ts` | 413 (1MB+1 byte body) | 신규 1 | C2 |
| `apps/server/src/index.test.ts` | 400 (provider-completions zod 실패) | 신규 1 | C2 |
| `apps/server/src/index.test.ts` | secret 포함 event 거부 + 로그에 secret 노출 안 됨 (`redactSecretsForLog`) | 신규 2 | C2 |
| `apps/desktop/src/runtime/stage14EventSync.test.ts` | idempotency duplicate 처리 | 기존 + 1 케이스 |  |
| `apps/desktop/src/runtime/stage18EventReplay.test.ts` | replay 결과 hash fixture와 일치 | 신규 1 |  |
| `apps/desktop/src/runtime/stage26ObsidianExport.test.ts` | secret 포함 content export 거부 | 신규 1 |  |
| `packages/agents/src/index.test.ts` | (이미 23개) | — |  |

목표: vertical slice 닫는 시점에 신규 ~15 케이스 추가 후 `pnpm test` 모두 통과.

## 4. End-to-end smoke 시나리오

기존 `scripts/smoke-dgx-server.mjs`가 5단계 중 1~4를 부분 커버. 5단계까지 확장 + 401/413/400 회귀 케이스 추가.

### 4.1 Happy path

```
1. POST /sessions or assume sessionId 존재
2. POST /provider-completions  (userMessage 포함, Bearer 부착)
   → 200, status=succeeded, content="OK" (또는 모델 응답)
3. POST /events/sync           (assistant 응답 이벤트 1개)
   → 202, serverRevision++ , duplicates: []
4. GET /events?sessionId=...
   → events 배열에 방금 push한 이벤트 포함
5. (desktop) replay → ConversationMessage 목록 재구성
6. (desktop) createStage7BackupSnapshot → Obsidian projection 생성
7. (desktop) writeObsidianExport → vault 파일 존재 + content 일치
```

검증 출력 (smoke 스크립트 console.log 확장):
```json
{
  "step": "obsidian_export",
  "vaultRoot": "F:/obsidian/ai-headquarter",
  "absolutePath": "F:/obsidian/ai-headquarter/sessions/session_vs_001.md",
  "byteLength": 384,
  "redactionApplied": true,
  "ok": true
}
```

### 4.2 회귀 케이스 (smoke 옵션)

`SMOKE_MODE=regression` 환경변수로 전환 시:

| 시나리오 | 기대 |
|---|---|
| Bearer 헤더 제거 후 호출 | 모든 protected endpoint 401 |
| 잘못된 토큰 | 401 |
| 2MB 더미 body | 413 |
| `messages: []`로 provider-completions | 400 |
| `idempotencyKey` 패턴 위반 | 400 |
| secret 포함 이벤트 sync | 응답 `failed[]`에 포함 |

각 케이스는 smoke 스크립트가 expected status를 검증 후 다음 케이스로 진행. 모든 케이스 통과 시 exit 0.

## 5. 수동 점검표 (slice 닫기 직전 1회)

자동으로 못 잡는 항목:

- [ ] desktop 앱에서 새 세션 생성 → 메시지 입력 → DGX 응답 수신 (vLLM 실모델, mock 아님)
- [ ] 동일 세션에서 두 번째 메시지 → 첫 메시지 history가 system/messages에 포함됨
- [ ] 데스크탑 종료 후 재실행 → 같은 세션 메시지 history가 보임 (replay 성공)
- [ ] DGX 서버 일시 중단 후 메시지 입력 → outbox에 적재, 재시작 후 sync 자동 진행
- [ ] Obsidian vault 파일 열림 (Obsidian 앱에서 확인) — markdown 깨지지 않음
- [ ] Network 탭에서 `Authorization: Bearer ...` 헤더 보임, body에 secret 미포함
- [ ] `docs/26` 진단 시나리오 6개 각각 (401/PNA/vLLM down/model mismatch/...) 재현 시 진단 코드가 일치

## 6. 회귀 보호 운영

- vertical slice 닫힌 뒤 모든 PR은 `pnpm test` 통과 + (서버 영역 변경 시) `pnpm server:smoke` happy path 통과를 머지 조건.
- smoke regression mode는 weekly 또는 release 직전 1회.
- Obsidian export 결과 hash를 PR 본문에 첨부 (변경 시점 추적).

## 7. 슬라이스 1 닫는 의존성

이 슬라이스를 끝내려면 선행:

1. **C1 머지** (Bearer auth) — server 측 완료, 머지 대기.
2. **C2 머지** (Zod + body limit + redact) — server 측 완료, 머지 대기.
3. **C1 후속** (desktop client Bearer 부착) — 압축 후 Codex 작업.
4. **App.tsx 압축 STEP 4/5** — Codex 진행 중.
5. **C3·C4 desktop race fix** — 압축 후 Claude 작업.
6. **DGX vLLM adapter** (선택) — 어댑터 1번째. 직접 fetch 대신 어댑터 통과로 reroute하면 streaming/tool use 추가가 vertical slice 후속에 가능.
7. **Obsidian 파일 쓰기 실제 구현** — `Stage26FileWriter` 콜백이 현재 인터페이스만, native (Tauri or Node fs) 연결 필요.

## 8. 결정 필요

1. **Smoke regression의 위치**: `scripts/smoke-dgx-server.mjs`에 mode 분기 vs 새 `scripts/smoke-vertical-slice.mjs`로 분리.
2. **Obsidian 파일 쓰기**: 1차에 Node fs로 쓸지(개발 환경 한정), Tauri 시 Rust 측 호출로 쓸지 (doc 21 결정).
3. **replay hash 안정성**: 메시지 정렬에 createdAt + id 보조 정렬 보장 (지금 createdAt만 — 같은 timestamp 시 비결정성).
4. **수동 점검표 책임자**: vertical slice 닫는 사람 1명이 다 vs Codex/Claude 분담.
