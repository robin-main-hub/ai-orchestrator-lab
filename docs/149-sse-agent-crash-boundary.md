# P3 SSE / Agent Crash Error Boundary Audit + Guard Tests

> **상태**: 구현 완료 - PR #672 (code/tests) - SSE fan-out 격리 pass
> **목표**: SSE / streaming / agent-crash / malformed event가 전체 dashboard를 freeze시키지 않고 local degraded/error state로 격리되는지 inspect-first로 검증하고, 확인된 gap만 좁게 보강한다. **버그가 있다고 가정하지 않는다 — 실제 코드 경로를 먼저 검증한다.**

## 한 줄 요약
SSE and agent crash boundaries now degrade locally instead of freezing the dashboard.

## 무엇이 확인됐나 (inspect-first)
- 이미 단단한 경로 (수정 불필요):
  - **client streaming** (`apps/desktop/src/lib/codingAgentClient.ts`, `apps/desktop/src/runtime/stage12DgxProvider.ts`): connect timeout(15s) + stall guard(90s, `readWithStallGuard`) + malformed JSON → `null`로 skip(`parseChunkLine`/`parseProviderChunkLine`) + 본문 시작 전 에러 시 non-stream POST 폴백. 청크 깨짐/연결 정체/서버 중단을 호출부에서 흡수한다.
  - **server stream endpoint** (`/provider-completions/stream`, `apps/server/src/index.ts`): payload 검증 → permission gate → `event: chunk` 루프, 실패 시 `type: "error"` chunk를 실어 보내고 `finally response.end()`. request close 시 `AbortController` abort.
  - **UI error boundary** (`apps/desktop/src/components/AppErrorBoundary.tsx`): 렌더 예외를 흰 화면 대신 복구 카드로 잡고 새로고침/닫기 제공.
  - **event classification** (`apps/desktop/src/lib/eventClassification.ts`): 순수·결정적, unknown은 unknown으로 — malformed type이 throw하지 않는다.
  - **mission commit 보호**: `missionStore`의 `onEventsCommitted` 훅은 try/catch로 감싸져 있어 subscriber가 throw해도 commit이 실패하지 않는다 (`missionTraceBus.test.ts`에 고정).
  - **reconnect/backoff**: streaming spec v1(`docs/31`)에서 의도적으로 미지원. client는 one-shot + non-stream 폴백 모델이라 tight-loop reconnect 경로 자체가 없다 → 추가하지 않음(speculative 금지).
- 확인된 gap (단 1건, verified):
  - `SseSession.writeEvent`가 `response.write(...)`를 **에러 처리 없이** 호출한다. 이 메서드는 두 fan-out 루프(`SseSessionRegistry.broadcast`, `MissionTraceBus.publish`)와 **동기 commit 경로**(`onEventsCommitted` → `publish`)에서 호출된다.
  - 한 구독자의 소켓이 destroyed면 `response.write`가 동기 throw(`ERR_STREAM_DESTROYED` 등)를 낼 수 있고, 그러면 **루프가 중단돼 나머지 모든 구독자가 이벤트를 못 받는다.** `missionStore` 훅 가드는 commit 실패만 막을 뿐, **publish 배치 전체를 통째로 삼켜서** 깨진 한 스트림이 모든 패널의 live trace를 조용히 blank시킨다.
- 의도적으로 만들지 않은 것:
  - broad streaming architecture rewrite.
  - reconnect/backoff 엔진 (spec v1 미지원).
  - 새 server route / EventStorage write 변경 / DB migration.

## 무엇이 바뀌었나
- `SseSession.writeEvent` per-subscriber 격리 (`apps/server/src/events/sseSession.ts`):
  - 직렬화 먼저 → 직렬화 불가 payload(순환 참조 등)는 **이 이벤트만 skip**(연결 유지).
  - write 시도 → 소켓 throw면 **이 세션만 `close("write_error")**`로 닫고(레지스트리/버스에서 자동 제거) 예외를 삼킨다. siblings는 계속 수신, commit 경로는 영향 없음.
  - `start()` 순서 보정: heartbeat 타이머/리스너를 **초기 heartbeat write 이전에** 등록 → 그 첫 write가 close를 유발해도 interval이 누수되지 않게 한다.
- focused tests (`apps/server/src/events/sseSession.test.ts`, fake `ServerResponse` — 소켓/fs 없음):
  - write-throw → 세션 close, 예외 없음, 레지스트리에서 제거.
  - `broadcast`가 한 세션 소켓이 throw해도 건강한 세션엔 전달(레지스트리는 생존자만 남김).
  - 직렬화 불가(circular) payload는 skip, 연결 유지, 이후 정상 이벤트는 정상 전달.

## 안전 불변식
```text
no broad streaming architecture rewrite
no new server route
no EventStorage write change
no DB migration
no runner dispatch
no external send
no patch apply
no hidden background job
no fake agent execution
no reconnect engine (spec v1 out of scope)
no network calls in tests
no domain/company/ERP roadmap
generic only
```

## 코드 표면
- PR #672
  - `apps/server/src/events/sseSession.ts`
  - `apps/server/src/events/sseSession.test.ts` (신규)

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| E1 | deferred | app-level source에는 정직한 diff stats가 없어 fake row를 만들지 않음. |
| E2-E19 | done | WorkItemCandidate / engine read-only axis through local signal filters and command jumps. |
| P0 | done | Swarm IO race guard / stale capture hardening. Local scripts only. |
| P1 | done | Permission/redaction boundary simulation. |
| P2 | done | Offline outbox / EventStorage sync logical duplicate guard. |
| P3 | done | SSE fan-out per-subscriber 격리. 한 dead socket이 broadcast/publish 루프를 중단시켜 다른 구독자를 막던 gap을 close. malformed payload는 skip, 연결 유지. client/stream-endpoint/error-boundary는 이미 단단해 무수정. |
| P4 | next | Provider Discovery Degradation. Verify before patch. |

## 검증
- Local (base = origin/main `ed212bd`; baseline은 workspace deps 빌드 후 green):
  - `vitest run src/events/sseSession.test.ts src/missions/missionTraceBus.test.ts` - 9 tests pass.
  - `pnpm --filter @ai-orchestrator/server test` - **612 tests / 57 files pass** (0 regression).
  - `pnpm --filter @ai-orchestrator/server typecheck` - pass.
  - `pnpm --filter @ai-orchestrator/server build` (+ `--verify-boot` smoke) - pass.
  - `git diff --check` - pass.
- CI:
  - PR #672 - 체크 실행 중(머지 전 green 확인 필요).

## 완료 문구 (과장 금지)
SSE and agent crash boundaries now degrade locally instead of freezing the dashboard. This hardens the server-side SSE fan-out isolation boundary; it does not claim full end-to-end streaming reliability, and reconnect remains intentionally out of scope per streaming spec v1.
