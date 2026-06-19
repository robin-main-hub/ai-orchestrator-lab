# P2 Offline Outbox / Conflict Resolver Audit + Guard Tests

> **상태**: 구현 완료 - PR #670 (code/tests, merge commit `e08bc1d`) - reconnect/replay safety pass
> **목표**: offline outbox / EventStorage sync 재연결 경로에서 이벤트가 조용히 중복 저장되거나, 손실되거나, raw secret이 되살아나지 않도록 실제 경로를 검증하고 확인된 gap만 좁게 보강한다.

## 한 줄 요약
Offline outbox/event sync now has idempotency and conflict-safety guards for reconnect/replay paths.

## 무엇이 확인됐나
- 구현되어 있는 경로:
  - desktop Stage29 `LocalClientEventCache`는 client-side projection/outbox 역할을 한다.
  - desktop Stage14 sync는 DGX-02 `/events/sync` 응답에서 `accepted` / `duplicate`만 synced로 보고, `conflict` / `failed`는 queued로 남긴다.
  - server EventStorage는 같은 `event.id` 재전송을 duplicate로 보고, 같은 id의 payload 변경은 `same_event_id_different_payload` conflict로 드러낸다.
  - P1 redaction은 server pre-store / sync exposure / desktop local cache before browser storage에 이미 적용되어 있다.
- 확인된 gap:
  - `conversation.message.created` 이벤트가 같은 `payload.messageId`를 가지지만 reconnect/replay 과정에서 새 local `event.id`로 다시 제출되면, 기존 서버는 두 번째 이벤트를 새 durable event로 accepted했다.
  - 같은 `messageId`인데 payload가 달라도 새 event id이면 accepted되어 semantic conflict가 조용히 묻힐 수 있었다.
- 의도적으로 만들지 않은 것:
  - full semantic conflict resolver.
  - authority-wins merge engine.
  - DB migration / server route / EventStorage schema rewrite.

## 무엇이 바뀌었나
- Server EventStorage logical idempotency guard:
  - `conversation.message.created`에 한해 `sessionId + type + payload.messageId`를 logical key로 본다.
  - 같은 logical key와 같은 logical content가 새 event id로 들어오면 `duplicate`로 응답하고 durable append하지 않는다.
  - 같은 logical key지만 content가 다르면 `conflict`로 응답하고 reason은 `same_logical_event_different_payload`로 둔다.
  - unresolved semantic conflict는 merge하지 않고 client outbox에 남아 review 대상이 되게 한다.
- Desktop sync guard tests:
  - server가 `duplicate`를 응답하면 outbox에서 synced로 제거되는 동작을 고정했다.
  - server가 `conflict`를 응답하면 Stage14가 `failed` + `events need conflict review`로 표면화하고 queuedEvents를 유지하는 동작을 고정했다.

## 안전 불변식
```text
no broad sync architecture rewrite
no DB migration
no destructive data cleanup
no silent drops
no raw secret persistence
no fake conflict resolver
no network calls in tests
no domain/company/ERP roadmap
generic only
```

## 코드 표면
- PR #670, merge commit `e08bc1d`
  - `apps/server/src/index.ts`
  - `apps/server/src/index.test.ts`
  - `apps/desktop/src/runtime/stage14EventSync.test.ts`

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| E1 | deferred | app-level source에는 정직한 diff stats가 없어 fake row를 만들지 않음. |
| E2-E19 | done | WorkItemCandidate / engine read-only axis through local signal filters and command jumps. |
| P0 | done | Swarm IO race guard / stale capture hardening. Local scripts only. |
| P1 | done | Permission/redaction boundary simulation. Production-like example tokens rejected; EventStorage and local outbox redact secret-like payloads before durable/sync exposure. |
| P2 | done | Offline outbox / EventStorage sync logical duplicate guard. Same logical message replay is duplicate; changed logical payload is conflict/review, not silent accepted merge. |
| P3 | next | SSE / Agent Crash Error Boundary. Verify before patch; do not assume bug report is true. |
| P4 | pending | Provider Discovery Degradation. |

## 검증
- Local:
  - `pnpm --filter @ai-orchestrator/server exec vitest run src/index.test.ts` - 98 tests pass.
  - `pnpm --filter @ai-orchestrator/desktop exec vitest run src/runtime/stage14EventSync.test.ts src/runtime/stage18EventReplay.test.ts src/runtime/stage29LocalEventStore.test.ts` - 17 tests pass.
  - `pnpm --filter @ai-orchestrator/protocol test` - 214 tests pass.
  - `pnpm --filter @ai-orchestrator/server test` - 609 tests pass.
  - `pnpm --filter @ai-orchestrator/desktop test` - 2371 tests pass. Existing `--localstorage-file` warning only.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass. Existing Vite chunk warning only.
  - `git diff --check` - pass.
- CI:
  - PR #670 `build + test` - pass.
  - PR #670 `secret scan + dependency audit` - pass.
  - PR #670 Vercel + Vercel Preview Comments - pass.

## 완료 문구 (과장 금지)
Offline outbox/event sync now has idempotency and conflict-safety guards for reconnect/replay paths. This is not a full semantic conflict resolver and does not claim offline sync is solved end-to-end.
