# P9 Sandbox Proposal / Patch Candidate Safety Audit

> **상태**: audit 완료 — docs only (no merge-affecting code gap found)
> **목표**: SANDBOX 좌석(제안 전용 시나리오 덱)과 patch candidate lane/card/drawer가 **preview-only / proposal-only**로 남아 있고, apply / commit / dispatch / execute / send 컨트롤을 절대 노출하지 못함을 inspect-first로 확인하고 명문화한다.

## 한 줄 요약
Sandbox and patch candidate surfaces remain preview-only and cannot expose apply/commit/dispatch controls.

## 무엇이 확인됐나 (inspect-first)
### Sandbox 좌석 (proposal-only)
- `apps/desktop/src/components/inbox/AssistantInbox.tsx:2620` `SandboxProposalDeck`는 **버튼/onClick/폼 요소가 전혀 없다** — title/badge/steps/note를 보여주는 순수 display.
- 워터마크: `"PROPOSAL ONLY — 시뮬레이션 미리보기입니다 · 실행/적용/전송 없음 · 모든 결과는 가상(simulated)입니다"`(2634).
- 데이터 모델 `apps/desktop/src/lib/sandboxProposal.ts`:
  - `SandboxProposal.dryRun: true`(literal type — 항상 dry-run, 실행 불가)(`:18`).
  - `outcome`는 `simulated-pass | simulated-warning | simulated-blocked`만(실제 결과 아님)(`:10`).
  - `steps`는 `ReadonlyArray<string>`. 픽스처는 generic·정적(원격 로딩 없음).
  - `isProposalOnly(p)`(`:59`)가 dryRun·simulated outcome·"proposal only" note를 검증.

### Patch candidate 좌석 (preview-only)
- `AssistantInbox.tsx:3771` `PatchCandidatesCard`의 컨트롤은 두 종류뿐:
  - **Compare 토글**(`data-action-scope="local-view"`, `title="후보 비교 보드 · 보기 전용"`) — 로컬 가시성 토글만.
  - **candidate row**(`data-action-scope="local-detail"` via `rowActivation`) — read-only detail drawer 열기만.
- apply / commit / dispatch / run 버튼 **없음**.
- 데이터 모델 `apps/desktop/src/lib/plugins/patchCandidateSource.ts`:
  - `PatchCandidate`는 read-only projection. safety status = `pass | warning | blocked`(apply/committed 상태 없음).
  - `projectPatchCandidates`가 note를 `"patch candidate · read-only · preview only (no apply/dispatch)"`로 강제(`:133`).
- detail drawer는 local-detail close 컨트롤 하나만(테스트로 잠김).

### 불변식 enforcement (정본)
- `apps/desktop/src/components/inbox/inboxInvariant.ts`:
  - `ALLOWED_ACTION_SCOPES = ["local-view","local-preference","local-detail"]` — 모든 button/role=button은 이 중 하나의 `data-action-scope`를 **반드시** 달아야 한다.
  - `FORBIDDEN_ACTION_WORDS`(approve/enable/send/append/run /apply patch/dispatch/sync/execute/reconnect/refresh/write/load/import) — 컨트롤 라벨에 금지.
  - `assertNoSideEffectActionControls(root)` / `assertNoForbiddenActionText(root)` — 모든 inbox surface 테스트에서 사용.
  - 철학(주석): "`<button>`이 적이 아니라 *side-effect OS action*이 적이다. 로컬 view 컨트롤은 허용, OS에 무언가를 *하는* 컨트롤은 금지."

### server/protocol 도달 경로
- desktop patch-candidate surface에서 도달 가능한 **patch-apply / patch-commit 엔드포인트가 없다.** `apps/server`에 `/patch/apply|commit|dispatch` 라우트 미등록(`"codex-apply-patch"`는 provider 모델 이름이지 엔드포인트 아님). 즉 surface가 실제 apply 경로에 wiring조차 안 되어 있다.

## 확인된 gap
- sandbox/patch-candidate surface에 side-effect 컨트롤이 새는 **코드 gap은 없다.** preview-only 불변식이 이미:
  - 데이터 모델(`dryRun: true`, read-only note),
  - 렌더(버튼 없음 / scoped 컨트롤만),
  - 테스트(`inboxInvariant` 기반 per-surface assertion)
  로 3중 잠겨 있다.
- 진짜 gap은 **문서**였다: 이 preview-only 불변식과 그 enforcement 모델, 그리고 "desktop이 실제 apply 엔드포인트에 연결되어 있지 않다"는 사실이 P-시리즈 audit 장부에 명문화되어 있지 않았다.

## 의도적으로 만들지 않은 것
- preview-only 불변식을 런타임 가드로 중복 구현하지 않았다 — 컴포넌트가 애초에 side-effect를 wiring하지 않으므로 테스트 잠금으로 충분하다. 런타임 가드 추가는 over-engineering.
- sandbox/patch 픽스처를 도메인/회사 용어로 바꾸지 않았다(generic 유지).
- 실제 patch-apply 경로를 만들지 않았다(이번 audit 범위 밖이자 안전 불변식 위반).

## preview-only surface 분류 (정본)
| Surface | 파일 | 컨트롤 | 동작 | 안전 |
| --- | --- | --- | --- | --- |
| SANDBOX proposals | `AssistantInbox.tsx:2620` | 없음(display-only) | 텍스트/배지/스텝 보기 | ✅ |
| Patch candidate lane | `AssistantInbox.tsx:3771` | Compare 토글, row | 가시성 토글, detail drawer 열기 | ✅ |
| Patch detail drawer | drawer | close만(local-detail) | 보기 닫기 | ✅ |
| Work item candidates | derived | row 선택(local-detail) | detail drawer 열기 | ✅ |

판단 원칙: ① preview/proposal surface의 데이터는 dry-run/read-only로 type-level 고정. ② 렌더 컨트롤은 `local-view`/`local-detail`/`local-preference` scope만. ③ 테스트가 surface마다 side-effect 컨트롤·금지어 부재를 강제. ④ desktop에서 실제 apply 엔드포인트 도달 경로 없음.

## 안전 불변식
```text
sandbox proposals are dryRun:true, inert preview objects (never executed)
patch candidates are read-only projections (no apply/commit/dispatch control)
every inbox control carries an allowed local-* action-scope
forbidden side-effect words actively asserted-absent per surface
no desktop→server patch-apply path exists
no real network calls in tests
generic only
```

## 코드 표면
- docs only. sandbox/patch/component 코드 변경 없음.
  - `docs/155-sandbox-patch-candidate-safety-audit.md` (this file)

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
| P7 | done | Runtime health summary: worst-of subsystem roll-up; degraded/unknown/stale honest. |
| P8 | done | Command/keyboard scope audit (docs). Inbox palette view-only; side-effecting commands global/explicit. |
| P9 | done | Sandbox/patch-candidate safety audit. preview-only 불변식 3중 잠금(data/render/test) 확인. desktop→apply 경로 없음. No merge-affecting code gap; docs. |
| P10 | next | Final Stability Ledger / Release Readiness Audit. |

## 검증
- inspect-first 읽기: `inboxInvariant.ts`, `sandboxProposal.ts`, `patchCandidateSource.ts`, `AssistantInbox.tsx`(SandboxProposalDeck/PatchCandidatesCard).
- sandbox/patch 관련 테스트 7파일 / 39 tests green(동일 main, 네트워크 없이): SandboxProposal·PatchLane·PatchDetailDrawer·PatchLiveWiring·WorkItemCandidates·sandboxProposal·patchCandidateSource.
- docs-only PR이므로 빌드 산출물 변화 없음.

## 완료 문구 (과장 금지)
Sandbox and patch candidate surfaces remain preview-only and cannot expose apply/commit/dispatch controls. 이것은 OS 전체가 patch를 절대 적용할 수 없다는 주장이 아니다 — 이 audit는 desktop의 sandbox/patch-candidate *표시 surface*가 preview-only 불변식(데이터 dry-run/read-only, scoped 컨트롤, per-surface 테스트)으로 잠겨 있고 실제 apply 엔드포인트에 wiring되어 있지 않음을 inspect-first로 확인·명문화한 것이다.
