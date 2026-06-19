# P4 Provider Discovery Degradation / Timeout Isolation Audit + Guard Tests

> **상태**: 구현 완료 - PR #674 (code/tests) - registry aggregation isolation pass
> **목표**: provider discovery/registry/health 경로에서 느린/죽은/throw하는/메타데이터가 깨진/오프라인 provider 하나가 전체 provider 목록이나 swarm을 막거나 무너뜨리지 못하도록 실제 경로를 검증하고, 확인된 gap만 좁게 격리한다.

## 한 줄 요약
Provider discovery now isolates slow, failing, and malformed providers without blocking healthy providers.

## 무엇이 확인됐나 (inspect-first)
- 이미 격리되어 있던 경로 (변경 안 함):
  - 원격 model discovery `createServerProviderModelDiscoveryResponse`는 provider 단위로 `timeoutMs: 1_500` + AbortController로 묶여 있고, throw/timeout 시 static model fallback + status flag로 떨어진다. 기존 테스트("static APIFun allowlist")가 `fetchImpl` throw에도 model을 반환함을 고정한다.
  - desktop UI `useProviderRegistryController` / `stage13DgxServer`의 `fetchJson`은 provider 단위 try/catch + local fallback + `provider.registry.failed` 이벤트, AbortController timeout(기본 1.5s), error preview secret redaction까지 이미 적용되어 있다.
  - `packages/providers` `ConnectionHealthMonitor`는 AbortController timeout(5s)·degradedThreshold(2s)·online/degraded/offline/syncing 4-state로 잘 하드닝되어 있다.
  - secret resolver(`resolveServerProviderApiKey` / `resolveServerProviderOAuthAvailability`)는 env/file/key 읽기가 전부 try/catch로 막혀 있어 readily throw하지 않는다.
- 확인된 gap:
  - server `createServerProviderRegistrySnapshot`가 proxy provider entry를 `Promise.all(serverProviderProxyConfigs.map(createServerProviderRegistryEntry))`로 모은다. entry 하나가 reject하면 snapshot 전체가 reject → `/provider-registry`와 `/cockpit/snapshot`이 통째로 죽고 provider 목록이 전부 사라진다. **aggregation에 per-provider 격리가 없다.**
- 의도적으로 만들지 않은 것:
  - provider discovery architecture rewrite.
  - registry build 경로의 timeout (이 경로는 local fs/env뿐 — network 없음. 비-network 경로의 timeout은 speculative).
  - 새 route / EventStorage write 변경 / DB migration / runner dispatch / 외부 송신.

## 무엇이 바뀌었나
- 순수 helper `isolateProviderRegistryEntries(configs, buildEntry, buildDegradedFallback)`:
  - `Promise.allSettled`로 모든 entry build를 settle시킨다.
  - fulfilled는 그대로 통과, rejected는 해당 provider만 degraded fallback entry로 치환한다.
  - builder/fallback을 주입받는 generic 순수 함수라 가짜 builder로 격리 동작을 직접 단위 테스트할 수 있다.
- `createDegradedProviderRegistryEntry`:
  - 실패 provider를 `secretAvailability: "missing"` + `"discovery-degraded"` 태그 + `selectedModelId: undefined`로 표면화한다.
  - raw error는 entry에 담지 않는다 — secret 누출 방지. 실패 사실만 격리해서 보여준다.
- `createServerProviderRegistrySnapshot`가 `Promise.all` 대신 이 helper를 쓴다. cockpit summary는 `available`만 ready로 세므로 degraded entry는 ready/fallback에 잘못 잡히지 않는다.

## 안전 불변식
```text
no broad provider architecture rewrite
no new route
no EventStorage write change
no DB migration
no runner dispatch
no external send
no raw secret persistence
no raw error leakage into entries
no network calls in tests
no domain/company/ERP roadmap
generic only
```

## 코드 표면
- PR #674
  - `apps/server/src/index.ts`
  - `apps/server/src/index.test.ts`

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| P0 | done | Swarm IO race guard / stale capture hardening. Local scripts only. |
| P1 | done | Permission/redaction boundary. EventStorage·local outbox redact secret-like payloads before durable/sync exposure. |
| P2 | done | Offline outbox / EventStorage sync logical duplicate guard. Same logical replay=duplicate; changed payload=conflict/review, not silent merge. |
| P3 | done | SSE / Agent crash error boundary. writeEvent per-session try/catch + serialize guard; one dead socket no longer kills fan-out. |
| P4 | done | Provider discovery degradation. Registry aggregation isolates a throwing provider into a degraded entry; healthy providers still appear. Remote model discovery / UI / health monitor were already isolated. |
| P5 | next | (다음 stabilization 항목 미지정.) |

## 검증
- Local:
  - `pnpm --filter @ai-orchestrator/server exec vitest run src/index.test.ts` - 101 tests pass (98 baseline + 3 new).
  - `pnpm --filter @ai-orchestrator/server test` - 615 tests pass (612 baseline + 3).
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass. Existing Vite chunk warning only.
  - `git diff --check` - clean.

## 완료 문구 (과장 금지)
Provider discovery now isolates slow, failing, and malformed providers without blocking healthy providers. This does not claim provider reliability is solved end-to-end.
