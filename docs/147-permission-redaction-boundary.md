# P1 Permission / Redaction Boundary Simulation

> **상태**: 구현 완료 - PR #668 (code/tests, merge commit `ba1d8a2`) - permission/redaction safety pass
> **목표**: SecretRef / fallback key / EventStorage sync/outbox 경계를 실제 테스트로 검증하고, 확인된 누출 경로만 좁게 보강한다.

## 한 줄 요약
Permission/redaction boundaries now reject example fallback secrets in production-like mode and redact secret-like event payloads before durable/sync exposure.

## 무엇이 바뀌었나
- Server auth boundary:
  - `ORCHESTRATOR_API_TOKEN=dev-orchestrator-token` 또는 `.env.example` placeholder(`replace-with-strong-random-token`)는 `NODE_ENV=production`에서 서버 시작 전에 거절한다.
  - production token generation은 추가하지 않았다.
- Server EventStorage boundary:
  - raw secret-shaped event는 기존처럼 `raw_secret_pattern_detected`로 거절한다.
  - accepted event는 EventStorage state에 들어가기 전에 `pre_store` redaction을 통과한다.
  - JSONL durable append는 원 요청 payload가 아니라 state의 redacted event만 기록한다.
  - `/events` pull/sync exposure는 같은 redacted state에서 파생된다.
- Desktop local outbox boundary:
  - Stage29 `LocalClientEventCache`가 browser storage에 쓰기 전에 secret-like string과 sensitive-key payload를 `[REDACTED:secret]`로 마스킹한다.
  - local cache/outbox는 여전히 client projection/outbox일 뿐이며 DGX-02 authority를 대체하지 않는다.
- SecretRef/ref-only handling:
  - `apiKeyRef`와 `secretRef` ref-only metadata는 보존한다.
  - raw secret material을 ref처럼 가장해 저장하는 경로는 허용하지 않는다.

## 안전 불변식
```text
no real secret material in tests
no production key generation
no permission model rewrite
no DB migration
no server route change
no external network call added
no broad lifecycle / runner / patch behavior change
generic only
```

## 코드 표면
- PR #668, merge commit `ba1d8a2`
  - `apps/server/src/index.ts`
  - `apps/server/src/index.test.ts`
  - `apps/desktop/src/runtime/stage29LocalEventStore.ts`
  - `apps/desktop/src/runtime/stage29LocalEventStore.test.ts`

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| E1 | deferred | app-level source에는 정직한 diff stats가 없어 fake row를 만들지 않음. |
| E2-E19 | done | WorkItemCandidate / engine read-only axis through local signal filters and command jumps. |
| P0 | done | Swarm IO race guard / stale capture hardening. Local scripts only. |
| P1 | done | Permission/redaction boundary simulation. Production-like example tokens rejected; EventStorage and local outbox redact secret-like payloads before durable/sync exposure. |
| P2 | done | Offline outbox / EventStorage sync logical duplicate guard. Same logical message replay is duplicate; changed logical payload is conflict/review, not silent accepted merge. |
| P3 | next | SSE / Agent Crash Error Boundary. |

## 검증
- Local:
  - `pnpm --dir apps/server exec vitest run src/index.test.ts` - 96 tests pass.
  - `pnpm --dir apps/server exec vitest run src/index.test.ts src/eventLogRotation.test.ts src/eventLogRotation.integration.test.ts` - 107 tests pass.
  - `pnpm --dir apps/desktop exec vitest run src/runtime/stage29LocalEventStore.test.ts src/runtime/stage14EventSync.test.ts src/runtime/stage18EventReplay.test.ts` - 15 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `pnpm --filter @ai-orchestrator/protocol test` - 214 tests pass.
  - `pnpm --filter @ai-orchestrator/server test` - 607 tests pass.
  - `pnpm --filter @ai-orchestrator/desktop test` - 2369 tests pass. Existing `--localstorage-file` warning only.
  - `git diff --check` - pass.
- CI:
  - PR #668 `build + test` - pass.
  - PR #668 `secret scan + dependency audit` - pass.
  - PR #668 Vercel + Vercel Preview Comments - pass.

## 완료 문구 (과장 금지)
Permission/redaction boundaries now reject example fallback secrets in production-like mode and redact secret-like event payloads before durable/sync exposure. No committed WorkItem lifecycle, runner dispatch, patch apply, DB migration, or broad permission rewrite was introduced.
