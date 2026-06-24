# 2026-06-25 Open PR Landscape Review

## 기준

- main: `d20e2a86` (PR #1060, #1061 merged)
- 대상: #793, #562, #561, #513
- 목적: 판정만. merge/close/rebase 금지.

## 판정표

| PR | 제목 | 분류 | 액션 |
|---|---|---|---|
| #793 | v0 command OS design / UI renewal | stale but salvageable | owner decision |
| #562 | server-side mimo auth injection | still valuable | owner rebase |
| #561 | summon theater terminal cursor fix | still valuable | owner cherry-pick |
| #513 | product kernel isolation contracts | already landed / superseded | owner close |

---

## #793 — feat(desktop): renew orchestrator shell with v0 command OS design

- **상태**: DRAFT, mergeable UNKNOWN
- **분기**: `codex/full-ui-renewal`
- **고유 커밋**: ~30 (테스트 특성화 #776~#790 + `5c3e63e2` UI shell IA)
- **실제 고유 파일**:
  - `apps/desktop/src/components/AppShellNav.tsx` (192 lines, NEW)
  - `apps/desktop/src/lib/appShellIa.ts` (322 lines, NEW)
  - `apps/desktop/src/lib/appShellIa.test.ts` (52 lines, NEW)
  - `apps/desktop/src/styles/renewal-shell.css` (653 lines, NEW)
  - `apps/desktop/src/App.tsx` (+495 lines) — main에서 100+ 커밋이 이미 수정
- **main에 흡수된 부분**: 테스트 특성화 커밋들이 특성화하던 코드가 main에서 변경됨 — stale
- **살릴 가치**: 4개 신규 파일 (shell IA layer)은 main에 없는 고유 자산. App.tsx 통합은 수동 rebase 필요.
- **버릴 이유**: ~30개 테스트 특성화 커밋은 미세 루프 산물 — 이미 폐기된 모드
- **owner 액션**: `5c3e63e2`만 fresh branch에 cherry-pick → App.tsx 수동 통합. 테스트 특성화 커밋은 버림.

## #562 — feat(desktop): server-side mimo auth injection (real token, no client leak)

- **상태**: OPEN, mergeable UNKNOWN
- **분기**: `feat/mimo-real-token-server-proxy`
- **고유 커밋**: `ee19efb2` 1개
- **실제 고유 변경**:
  - `apps/desktop/functions/_mimoProxy.ts` — server-side `MIMO_API_KEY` env 주입 (Bearer/x-api-key)
  - `apps/desktop/functions/mimo-token-anthropic/[[path]].ts` — `authStyle` 파라미터
  - `apps/desktop/functions/mimo-token-openai/[[path]].ts` — 동일
  - `apps/desktop/vite.config.ts` — dev proxy에서 같은 env 주입
  - `docs/handoffs/2026-06-16-mimo-real-token-wiring.md` (NEW)
- **main 상태**: #558이 passthrough proxy를 만들었지만, 실제 API key 주입은 없음. main의 `_mimoProxy.ts`는 여전히 passthrough.
- **충돌**: `vite.config.ts`에 #514 변경이 있어 약간의 충돌 예상. 나머지는 clean.
- **살릴 이유**: 보안 개선 — 실제 API key가 client bundle에 노출되지 않음. diff가 작고 잘 scoped됨.
- **owner 액션**: main에 rebase → vite.config.ts 충돌 수동 해결 → merge. MiMo 실키/Cloudflare env가 걸려 있어 owner 검증 필요.

## #561 — fix(desktop): pin summon theater terminal cursor to command text

- **상태**: OPEN, mergeable UNKNOWN
- **분기**: `fix/summon-footer-cursor`
- **고유 커밋**: `1ea87bbd` 1개
- **실제 고유 변경**:
  - `apps/desktop/src/components/SummonTheater.tsx` (+5/−4 lines) — footer를 nowrap flex row로: `>` prefix (shrink-0), command text (truncate, min-w-0), cursor (shrink-0)
- **main 상태**: footer 코드가 여전히 pre-fix 상태 (flex 없음, nowrap 없음, cursor가 떠다님)
- **충돌**: SummonTheater.tsx가 main에서 3번 수정됐지만 footer 부분은 미변경 — 충돌 최소 또는 없음
- **살릴 이유**: 장식용 cursor가 항상 텍스트 끝에 붙음. 장식-only (aria-hidden, 로직 변경 없음). diff가 극히 작음.
- **owner 액션**: `1ea87bbd`를 main에 cherry-pick.

## #513 — feat(protocol): add product kernel isolation contracts

- **상태**: DRAFT, mergeable UNKNOWN
- **분기**: `codex/product-kernel-sandbox-persona`
- **고유 커밋**: 5개 (1 feature + 4 chore/placeholder)
- **실제 고유 변경**:
  - `packages/protocol/src/productKernel.ts` — 243 lines (branch) vs **387 lines** (main, 더 포괄적)
- **main 상태**: main이 완전히 다른, 더 풍부한 API surface로 대체:
  - `productKernelContracts.ts` (358 lines, runtime bridge) — branch에 없음
  - `productKernelContractsCoverage.test.ts` (51 lines) — branch에 없음
  - 다른 type 이름, 다른 design philosophy
  - worker assignment, persistence, sandbox spec 등 branch가 다루지 않은 영역 포함
- **버릴 이유**: main이 더 완전한 구현으로 독립 개발. branch의 simpler design은 obsolete.
- **owner 액션**: close. 특정 schema를 branch에서 가져오고 싶으면 새 PR로 제안.

---

## 요약

- 즉시 조치 가능: #561 cherry-pick (tiny, decorative) — **DONE** (closed, reimplemented via #1066)
- owner 검증 후 조치: #562 rebase (보안 개선, MiMo env 검증 필요) — **review packet ready**
- 대규모 수동 통합: #793 (UI shell IA, App.tsx 수동 rebase) — **assessment below**
- 폐기: #513 (superseded) — **CLOSED**

## #793 integration difficulty assessment (2026-06-25)

### Unique files (salvageable as-is)

| File | Lines | Self-contained? |
|---|---|---|
| `apps/desktop/src/components/AppShellNav.tsx` | 192 | Yes — nav component with icons |
| `apps/desktop/src/lib/appShellIa.ts` | 322 | Yes — shell IA types/config (section IDs, virtual surfaces, tab IDs) |
| `apps/desktop/src/lib/appShellIa.test.ts` | 52 | Yes — test for IA config |
| `apps/desktop/src/styles/renewal-shell.css` | 653 | Yes — CSS for renewed shell |

### App.tsx integration (NOT salvageable)

- #793 changes App.tsx: +4697 / −580 lines
- Current main App.tsx: 5827 lines (already very large, 100+ commits since branch point)
- Cherry-picking the App.tsx changes is impossible — manual re-integration required

### Possible split

1. **PR A (low-risk):** Cherry-pick the 4 new files only. No existing code touched. Adds the shell IA layer + components without wiring them in.
2. **PR B (high-risk, separate):** Wire the new shell into App.tsx. Requires understanding current App.tsx structure and the intended IA. Significant UI task.

### Design intent

The 4 files implement a "command OS" shell IA: a navigation system with sections (command, studio, operations, library, system), virtual surfaces, and tab IDs. It's a new way to organize the app's navigation — not a visual style change.

### Recommendation

- PR A is safe to do anytime (adds new files, zero conflict risk)
- PR B requires owner to decide: is the command OS shell IA still the desired direction? If yes, allocate a dedicated UI integration session. If not, close #793.
