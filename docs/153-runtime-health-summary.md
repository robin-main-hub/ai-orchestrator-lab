# P7 Local Runtime Health Summary / Degraded State Audit

> **상태**: done — code + tests (real UI gap fixed) + this doc
> **목표**: 로컬 런타임 health 요약이 healthy / degraded / offline / unknown을 정직하게 구분하고, 한 subsystem 실패가 다른 subsystem을 가리거나 stale 상태가 healthy로 둔갑하지 않게 한다.

## 한 줄 요약
Runtime health summaries now classify healthy, degraded, offline, and unknown states without hiding subsystem failures.

## 무엇이 확인됐나 (inspect-first)
- `RuntimeStatus` enum = `online | degraded | offline | syncing` (`packages/protocol/src/index.ts:26`). **`unknown`은 enum에 없다** — UI가 unknown을 별도로 만들어 쓰던 자리.
- `apps/desktop/src/components/RuntimeStatusBar.tsx`의 `deriveHealth`는 health dot 하나를 `dgxStatus` + `localModelStatus` 두 개에서만 뽑았고, 문자열 `"offline"`에만 반응했다.
- 그 결과 검증된 gap 3종:
  - **G1 degraded가 healthy로 표시**: `statusToneFromString`가 `"degraded"`/`"syncing"`를 인식 못 하고 `"idle"`로 떨어뜨림. `deriveHealth`는 `"offline"`만 문제로 보고 `dgxStatus="degraded"`를 그대로 healthy로 흘려보냄.
  - **G2 subsystem masking**: `deriveHealth`가 `memorySyncStatus`를 아예 안 봄. early-return 구조라 DGX가 정상이면 memory-sync 실패가 안 보임.
  - **G3 stale 미표시**: `updatedAt`을 어떤 임계값과도 비교하지 않음. 오래된 스냅샷도 confident healthy로 표시.

## 무엇을 했나
- 순수 helper 신규: `apps/desktop/src/lib/runtimeHealthProjection.ts`
  - `projectRuntimeHealth(snapshot, { now?, stalenessThresholdMs? })` → `{ level, reasons, subsystems, stale }`.
  - `level: "healthy" | "degraded" | "offline" | "unknown"`.
  - 모든 subsystem(`dgx` / `local` / `memory`)을 분류하고 **worst-of**로 roll-up → masking 불가(G2).
  - 실제 `RuntimeStatus` enum을 인식. `online`/`syncing`=healthy(작동 중·실패 아님), `degraded`=degraded, `offline`=offline. **미인식/누락 = unknown(절대 healthy 아님)**(G1).
  - `recentError`는 실패 신호 → offline 레벨로 승격. 단 **raw error 문자열은 reasons에 echo하지 않는다**(count/label만).
  - staleness: 주입된 `now`와 `stalenessThresholdMs`(기본 5분)로 판정. `updatedAt`이 없거나 파싱 불가면 stale=true(보수적·가시화). stale이면 reasons에 표기하고 healthy만 degraded로 낮춘다(이미 degraded/offline은 더 낮추지 않음)(G3).
  - **순수**: network/I·O/mutation 없음. `now`를 주입받아 clock도 외부화.
- UI wire-in (`RuntimeStatusBar.tsx`):
  - `deriveHealth` = `projectRuntimeHealth(...).level`을 기존 UI 상태(healthy/degraded/critical/unknown)로 매핑(offline→critical).
  - `statusToneFromString`/`statusToBadgeVariant`에 `degraded`/`syncing` 인식 추가 → row badge도 정직해짐.
  - status popover에 stale 안내 줄 추가(노출은 마지막 확인 기준임을 명시).

## 분류 규칙 (정본)
| subsystem 값 | health level | 근거 |
| --- | --- | --- |
| `online` | healthy | 정상 |
| `syncing` | healthy | sync 진행 = 기대된 작동 상태, 실패 아님 |
| `degraded` | degraded | 저하 — 가려지면 안 됨 |
| `offline` | offline | 오프라인 |
| 미인식/누락 | **unknown** | 추측해서 healthy로 보고 금지 |

roll-up severity: `offline > degraded > unknown > healthy` (worst-of).
- `recentError` 있으면 → 최소 offline.
- stale면 → healthy를 degraded로 강등(그 이상은 안 낮춤).

## 의도적으로 만들지 않은 것
- 새 runtime ping / liveness probe / 네트워크 호출을 추가하지 않았다(테스트 포함 네트워크 0).
- protocol enum에 `unknown`을 추가하지 않았다 — unknown은 UI projection 레벨에서만 존재.
- `RuntimeStatusBar` 외 다른 health surface(`cockpitHealthRollup`, `cockpitProjectionHealth`)는 이번 검증 gap 밖이라 건드리지 않았다.
- staleness 임계값을 운영 cadence로 확정하지 못해(스냅샷 갱신 주기 미검증) 기본 5분으로 보수적으로 두고 호출자가 주입 가능하게 했다.

## 안전 불변식
```text
no new runtime pings / network probes
no real network calls in tests
no raw error/secret text echoed into reasons
no protocol/schema/migration change
no EventStorage write / runner dispatch / external send / patch apply
pure projection helper (no I/O, no mutation, injected clock)
generic only
```

## 코드 표면
- `apps/desktop/src/lib/runtimeHealthProjection.ts` (신규, 순수 helper)
- `apps/desktop/src/lib/runtimeHealthProjection.test.ts` (신규, 14 tests)
- `apps/desktop/src/components/RuntimeStatusBar.tsx` (deriveHealth/tone/badge wire-in + stale note)
- `docs/153-runtime-health-summary.md` (this file)

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| P0 | done | Swarm IO race guard / stale capture hardening. |
| P1 | done | Permission/redaction boundary. |
| P2 | done | Offline outbox / EventStorage sync duplicate guard. |
| P3 | done | SSE / Agent crash error boundary. |
| P4 | done | Provider discovery degradation isolation. |
| P5 | done | CI/smoke/baseline reliability audit (docs). |
| P6 | done | Ops evidence bundle (redacted read-only projection). |
| P7 | done | Runtime health summary: worst-of subsystem roll-up, degraded/syncing recognized, unknown≠healthy, staleness flagged. Real UI gap fixed. |
| P8 | next | Command Palette / Local-View Action Scope Audit. |

## 검증
- `pnpm --filter @ai-orchestrator/desktop exec vitest run src/lib/runtimeHealthProjection.test.ts` — 14/14 pass.
- 기존 `RuntimeStatusBar.test.tsx` — 2/2 pass.
- desktop 전체: 402 files / 2385 tests pass (baseline 2371 + 14 신규).
- `pnpm --filter @ai-orchestrator/desktop typecheck` — clean.
- workspace deps(protocol/providers/simplememo/agents) 빌드 후 실행(네트워크 없이).

## 완료 문구 (과장 금지)
Runtime health summaries now classify healthy, degraded, offline, and unknown states without hiding subsystem failures. 이것은 모든 runtime 관측이 end-to-end로 정확해졌다는 주장이 아니다 — 이번 변경은 `RuntimeStatusBar`의 검증된 roll-up gap(degraded/syncing 미인식, memory-sync masking, stale 미표시)을 좁게 고친 것이며, staleness 임계값은 운영 cadence 확정 시 조정 대상이다.
