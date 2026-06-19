# P5 Baseline / CI / Smoke Reliability Guard — Audit + Gate Taxonomy

> **상태**: audit 완료 - docs only (no merge-affecting code gap found)
> **목표**: infrastructure 실패 / external service rate-limit / optional smoke 의존성이 실제 regression과 혼동되지 않도록, CI·smoke·baseline-red 처리 규칙을 repo 안에 정직하게 명문화한다.

## 한 줄 요약
CI/smoke reliability audit completed; docs now define baseline-red and optional infrastructure check handling.

## 무엇이 확인됐나 (inspect-first)
- `.github/workflows/ci.yml`는 이미 hermetic하고 범위가 좁다:
  - `build + test` job = install(frozen-lockfile) → build all → **hermetic** server boot smoke(`server:smoke:boot`) → `pnpm -r --if-present test`.
  - `secret scan + dependency audit` job = gitleaks + `pnpm audit --prod --audit-level high`.
  - provider/DGX smoke(`provider:smoke:*`, `server:smoke`, `tmux:smoke:dry-run`, `orchestration:mvp:audit`)는 **의도적으로 CI에서 실행하지 않는다**(live endpoint/API key/실행 서버 필요). workflow 하단 주석에 이미 명시되어 있음.
- `scripts/smoke-server-boot.mjs` = hermetic. 로컬 포트 bind, 외부 의존성 없음, public `/health`만 확인. ESM extensionless import 류 런타임 크래시를 잡기 위한 build-후 boot 검증.
- `scripts/smoke-orchestration-os.mjs` = hermetic. temp repo + temp storage로 자기 서버를 띄워 product 루프를 한 번에 검증. 각 step에 `critical` 플래그가 있어 치명/비치명을 이미 구분한다.
- 필수 단위/계약 테스트는 네트워크를 타지 않는다(P4까지 동일 main에서 server 615 / protocol 214 / desktop 2371 green을 네트워크 없이 재현).
- **Vercel은 repo CI 안에 없다.** ci.yml 어디에도 Vercel step이 없다 → Vercel/Vercel Preview는 외부 GitHub App check다. **repo 코드로 통제할 수 없다.**

## 확인된 gap
- merge 판단을 흔드는 **코드** gap은 없다. CI는 이미 hermetic하고 required check 범위가 올바르다.
- 진짜 gap은 **문서**다: CI gate 분류(required/optional/external/local), Vercel=외부·rate-limit=infra라는 사실, `pnpm audit`가 advisory DB(브랜치와 무관하게 매일 바뀜)에 의존한다는 점, 그리고 baseline-red 규칙이 repo 안에 명문화되어 있지 않았다. 운영 메모리에만 있어서 PR 병합 판단이 흔들렸다.

## 의도적으로 만들지 않은 것
- required security/test gate를 약화시키지 않았다.
- 실제 실패를 숨기지 않았다(“ignore CI” 류 없음).
- 외부(Vercel)를 repo가 통제하는 척하지 않았다.
- 유용한 smoke를 제거하지 않았다.
- operator-run external smoke(`smoke-dgx-server.mjs` 등)의 exit semantics를 바꾸지 않았다 — 이들은 CI gate가 아니고 merge 판단에 영향이 없어, speculative한 동작 변경을 피했다.

## CI gate 분류 (정본)
| Class | 무엇 | 예 | merge 판단 |
| --- | --- | --- | --- |
| **required (regression)** | repo 코드로 결정·hermetic·deterministic | `build + test`(install/build/boot-smoke/unit·contract tests), `secret scan` | red면 기본 **HOLD**. 단, 같은 실패가 main에도 있으면 baseline(아래). |
| **required-but-external-data** | required지만 외부 데이터에 의존 | `dependency audit`(npm advisory DB) | 브랜치 diff와 무관한 신규 advisory로 red면 baseline/infra. 브랜치가 취약 dep를 **추가**해서 red면 regression→HOLD. |
| **optional / infrastructure** | repo가 통제 못 하는 외부 배포/프리뷰 | **Vercel**, Vercel Preview Comments | rate-limit/quota/배포 인프라로 red면 **infra, regression 아님**. build+test green이면 merge 가능. |
| **operator-run external smoke** | live endpoint/keys 필요, CI에서 안 돌림 | `server:smoke`(DGX), `provider:smoke:*`, `tmux:smoke:dry-run` | merge gate 아님. unreachable=infra(의존성 미가동), assertion fail=regression. 운영자가 판단. |
| **local hermetic smoke** | 외부 의존성 없음, 로컬/CI 둘 다 | `server:smoke:boot`, `orchestration:smoke` | red면 regression→HOLD. |

## baseline-red 규칙 (정본)
```text
1. main에 이미 존재하는 실패  = baseline-red (회귀 아님).
   - 같은 파일/같은 개수/같은 원인이면 0-regression.
2. 브랜치에서만 나는 신규 실패 = regression → HOLD.
3. 브랜치발 security/build/test 실패 = HOLD (절대 우회 금지).
4. 외부 infra(Vercel rate-limit 등) red = infra, regression 아님.
   - required(build+test, secret scan) green이면 merge 가능.
5. baseline-red로 stack이 막히면 admin-merge,
   baseline 자체는 별도 PR로 추적. required 보안/테스트 gate는 약화 금지.
```
판단 순서: ① required check(build+test, secret scan)가 green인가 → ② red인 check가 external/infra(Vercel)인가 baseline인가 regression인가를 위 표로 분류 → ③ regression/HOLD 조건이면 멈추고 보고, 아니면 merge.

## external smoke 실패 분류 (운영 컨벤션)
operator-run external smoke를 돌릴 때:
- **infra_unavailable**: endpoint 미도달(`No DGX server base URL reachable` 등). 코드 회귀 아님 — 의존 서비스가 꺼져 있는 것. 서비스 기동 후 재실행.
- **infra_rate_limit**: 외부 quota/배포 rate-limit(`Deployment rate limited — retry in 24 hours` 등). 코드 회귀 아님.
- **regression**: 서비스는 도달했으나 assertion 실패. 실제 결함 → 조사.
hermetic smoke(`server:smoke:boot`, `orchestration:smoke`)는 외부 의존성이 없으므로 red면 항상 regression으로 본다.

## 안전 불변식
```text
no weakening required security/test gates
no hiding real failures
no blanket ignore-CI
no real network calls in tests
no secret usage
no DB migration
no EventStorage write
no runner dispatch
no external send
no patch apply
no hidden background job
no domain/company/ERP roadmap
generic only
```

## 코드 표면
- docs only. workflow/scripts/코드 변경 없음.
  - `docs/151-ci-smoke-baseline-reliability.md` (this file)

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| P0 | done | Swarm IO race guard / stale capture hardening. Local scripts only. |
| P1 | done | Permission/redaction boundary. Secret-like payloads redacted before durable/sync exposure. |
| P2 | done | Offline outbox / EventStorage sync logical duplicate guard. |
| P3 | done | SSE / Agent crash error boundary. writeEvent per-session isolation. |
| P4 | done | Provider discovery degradation. Registry aggregation isolates a failing provider. |
| P5 | done | CI/smoke/baseline reliability audit. CI already hermetic; Vercel external. Docs now define gate taxonomy + baseline-red rule. No merge-affecting code gap. |
| P6 | next | (다음 stabilization 항목 미지정.) |

## 검증
- Local (동일 main 74d0afb, 코드 무변경):
  - `pnpm typecheck` - pass.
  - `pnpm server:smoke:boot` - pass (server boots, `/health` 200, hermetic, no external deps).
  - server 615 / protocol 214 / desktop 2371 tests - P4에서 동일 main 기준 green(네트워크 없이).
- docs-only PR이므로 추가 빌드 산출물 변화 없음.

## 완료 문구 (과장 금지)
CI/smoke reliability audit completed; docs now define baseline-red and optional infrastructure check handling. 이것은 CI 신뢰성이 end-to-end로 해결됐다는 주장이 아니다 — Vercel 같은 외부 check는 여전히 repo 밖에서 결정되며, 이 문서는 그 결과를 어떻게 분류·판단할지를 명문화한 것이다.
