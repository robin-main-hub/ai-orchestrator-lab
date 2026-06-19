# P6 Operational Diagnostics / Evidence Bundle Guard

> **상태**: 구현 완료 - PR #677 (code/tests) - read-only redacted evidence bundle projector
> **목표**: 향후 bug hunt가 시스템 상태를 안전하게(redacted) read-only로 넘길 수 있는 evidence bundle 절차/생성기를 만든다. 시크릿/원문 payload 누출 없이 핸드오프용 표준 필드를 담는다.

## 한 줄 요약
Operational diagnostics can now produce a redacted read-only evidence bundle for bug-hunt handoffs.

## 무엇이 확인됐나 (inspect-first)
- 이미 있던 것 (변경 안 함):
  - 시크릿 redaction: `@ai-orchestrator/providers`의 `redactSecretsForLog`(sk-/Bearer/API_KEY=/PEM 등 패턴 마스킹). server에도 동일 사본 존재.
  - live health/runtime/cockpit snapshot: `createLiveHealthResponse`, `createLiveRuntimeSnapshot`, `createServerProviderRegistrySnapshot`, `createServerOperatorCockpitSnapshot`. 단, 이들은 **네트워크 probe를 동반하는 live 대시보드**이고 git/test/CI 분류 필드가 없어 핸드오프 bundle로 부적합.
  - hermetic smoke(`smoke-server-boot.mjs`, `smoke-orchestration-os.mjs`): 진단이 아니라 boot/product 검증용.
- 확인된 gap:
  - **단일 evidence bundle 생성기 부재**: git SHA/branch/dirty + test 결과 + degraded counts + CI/baseline 노트 + redaction status + timestamp을 한 번에 담는 read-only·redacted bundle이 없었다.
  - 진단 출력이 시크릿/원문 payload를 담지 않는다는 **보장(테스트)**이 별도로 없었다.

## 무엇이 바뀌었나 (PR #677)
- 순수 helper `projectEvidenceBundle(input)` (`apps/server/src/diagnostics/evidenceBundle.ts`):
  - **network 0 / fs 0 / 입력 mutation 0** — read-only 투영.
  - provider/stream/outbox 상태를 **counts only**로 축약. raw key·event payload·stream frame 절대 미포함.
  - 모든 free-text(runtime `recentError`, CI/baseline 노트)를 `redactSecretsForLog`로 통과.
  - optional 입력 부재 시 정직하게 degrade: tests=`not_run`, provider/runtime/stream/outbox=`unavailable`.
  - provider `degraded` = P4 `discovery-degraded` 태그 수. outbox `pending`은 명시 sync 결과 우선, 없으면 runtime client outbox 합(`source`로 출처 표기).

## Evidence bundle 안전 필드 (정본 스키마)
```text
kind: "ops_evidence_bundle"
generatedAt: ISO timestamp
git: { sha, branch, dirty }
tests: { status: not_run | passed | failed, command?, passed?, failed?, total? }
providers: { status: collected|unavailable, total, ready, notReady, degraded }   # counts only
runtime:   { status: collected|unavailable, dgxStatus, memorySyncStatus, recentError? }  # recentError redacted+truncated
stream:    { status: collected|unavailable, activeSessions, degradedSessions }    # counts only
outbox:    { status: collected|unavailable, pendingCount, conflictCount, source: explicit|runtime }  # counts only
ciBaselineNotes: string[]   # each redacted
redaction: { applied: true, helper: "redactSecretsForLog" }
```
금지(설계상 불가):
```text
no raw provider keys / secret refs
no raw event payloads
no raw stream frames
no network probe inside the projector
no input mutation
```

## 핸드오프 절차 (operator/script)
1. git 상태 수집(read-only): `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`, `git status --porcelain`(비어있으면 dirty=false).
2. (선택) 테스트를 실제로 돌렸다면 그 결과를 `tests`로 전달. 안 돌렸으면 생략 → `not_run`.
3. (선택) live 상태가 필요하면 이미 있는 snapshot으로 채운다: `createServerProviderRegistrySnapshot()` → `providerRegistry`, `createLiveRuntimeSnapshot()` → `runtime`. **probe가 필요 없으면 생략** — bundle은 정직하게 `unavailable`로 표기한다.
4. (선택) event-sync 결과가 있으면 `outbox`(pending/conflict), SSE 세션 카운트가 있으면 `stream`으로 전달.
5. CI/baseline 분류 메모(P5 taxonomy 기준)를 `ciBaselineNotes`로 전달.
6. `projectEvidenceBundle(input)` 결과 JSON을 핸드오프에 첨부. 모든 free-text는 이미 redacted.

> CLI wrapper(live 수집 글루)는 **문서화된 follow-up**이다. P6은 검증 가능한 순수 생성기 + 절차까지를 범위로 한다(테스트 안 되는 live-수집 글루를 무검증으로 커밋하지 않음).

## 안전 불변식
```text
read-only diagnostic (no server write)
no network calls in tests
no real secrets in output (redactSecretsForLog enforced)
no raw event/stream payload leakage (counts only)
no DB migration / no EventStorage write / no runner dispatch / no external send
generic OS only
```

## 코드 표면
- PR #677
  - `apps/server/src/diagnostics/evidenceBundle.ts`
  - `apps/server/src/diagnostics/evidenceBundle.test.ts`
- PR #(this) docs
  - `docs/152-ops-evidence-bundle.md`

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| P0 | done | Swarm IO race guard / stale capture. |
| P1 | done | Permission/redaction boundary. |
| P2 | done | Offline outbox / conflict guard. |
| P3 | done | SSE / agent crash boundary. |
| P4 | done | Provider discovery degradation isolation. |
| P5 | done | CI/smoke/baseline reliability taxonomy. |
| P6 | done | Ops evidence bundle. Pure read-only redacted projector (counts only); live snapshots/redaction already existed. Gap = portable handoff bundle + redaction guarantee tests. |
| P7 | next | Local Runtime Health Summary / Degraded State Audit. |

## 검증
- `vitest run src/diagnostics/evidenceBundle.test.ts` - 6 pass.
- `pnpm --filter @ai-orchestrator/server test` - 621 pass (615 baseline + 6).
- `pnpm typecheck` - pass. `pnpm build` - pass(기존 Vite chunk warning만). `git diff --check` - clean.

## 완료 문구 (과장 금지)
Operational diagnostics can now produce a redacted read-only evidence bundle for bug-hunt handoffs. 이것은 진단이 end-to-end로 완성됐다는 주장이 아니다 — projector는 입력을 안전하게 투영할 뿐, live 수집 CLI는 후속 작업이다.
