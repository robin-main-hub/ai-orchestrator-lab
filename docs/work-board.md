> **Deprecated:** This R5/R6-era work board is retained for history only.
> The current source of truth is [`/TASKS.md`](../TASKS.md).
> Do not use this file to choose new work unless an owner explicitly reopens it.

# Work Board (Claude × Codex 협업 상태)

## R6 canonical update (2026-05-27 sync)

origin/main @ `ecc8d0b` (`#197` merge 대기). R6 Conversation v0 parity wave (PR `#166`, `#169`, `#173`, `#178`, `#194`) 및 visual QA checklist (`#197`) 추가 완료. 아래 R5/R6 open PR 표와 완료 진행 상황은 최신 sync 기준이다.


### 2026-05-26 라운드 5 (Stage 1b primitive adoption - 1차 wave)

- `#183` (`a81c1d1`) - Debate + AgentCard combined
  - `Stage3DebateTable`: DebateRoundCard tag chip -> `StatusBadge` (v0 fidelity)
  - `AgentsSidebar`: AgentCard Primary -> `StatusBadge` (primitive normalization, exact v0 fidelity 아님)
- `#182` (`5524d3e1467f143acdd5ae01896362b0ac9a2df5`) - TmuxPaneCard
  - `TmuxPaneCard` status chip -> `StatusBadge` (v0 fidelity)
  - Final scope = `TmuxPaneCard.tsx` only
  - cleanup commits `27cce79`, `58e0d38` 는 scope 정리용이며 제품 변경 아님

### R5 release note

`#183` Debate tag mapping = v0 fidelity 일치에 더해 의미축 2개 정정 동반:

- `objection`: `destructive` -> `warning` (v0 정렬)
- `coding_impact`: `warning` -> `muted` (v0 정렬)

릴리스 노트 가치 있음 - 사용자가 chip 색상 변화 인지할 수 있음.

### 2026-05-26 라운드 5 (Stage 1b primitive adoption - 2차 wave)

- `#184` (`29a5cde`) - ControlQueueDrawer lane chip
  - `ControlQueueDrawer`: lane label chip -> `StatusBadge` (primitive normalization)
  - v0 대응 surface 없음. drawer 구조 / lane order / keyboard handler 보존.
- `#185` (`867dae6`) - RuntimeStatusBar status rows
  - `RuntimeStatusBar`: StatusRow/StatusDot 계열 -> `StatusBadge` (primitive normalization)
  - HealthIndicator popover 구조 보존.
- `#186` (`6e581fd`) - TmuxSwarmBoard status elements
  - `TmuxSwarmBoard`: gate chip + role/status elements -> `StatusBadge` (primitive normalization)
  - v0 fidelity 라기보다 repo runtime surface 의 primitive normalization 으로 분류.
- `#187` (`84c5373`) - rail status surfaces
  - `BackupRailMenu`, `ChannelRailPanel`, `ProjectRailPanel`: rail-local status chips -> `StatusBadge`
  - repo 고유 rail surfaces normalization.
- `#188` (`310e38d`) - CheatSheetOverlay status chips
  - `CheatSheetOverlay`: shortcut priority chip -> `StatusBadge` (primitive normalization)
  - `CommandPalette` 는 건드리지 않음.

### 2026-05-27 라운드 5 (Stage 1b primitive adoption - 3차 wave)

- `#190` (`f842919`) - EvolveMementoPanel RecordChips
  - `EvolveMementoPanel`: reinforcement / generic RecordChips / fusion view rank chip -> `StatusBadge` (primitive normalization)
  - `persons` / `semantic` 계열이 기존 violet tone 에서 `muted` 로 흡수됨. 이는 v0 exact fidelity 가 아니라 Stage 1b primitive normalization 의도.
- `#191` (`0ab08d6`) - CommandPalette verb chip
  - `CommandPalette`: entry verb inline chip -> `StatusBadge` (primitive normalization)
  - full v0 CommandPalette port 아님. `cmdk`, Dialog 구조, `AvatarWithStatus` 는 미도입이며 design judgment 항목은 별도 유지.
- `#192` (`6da8d7c`) - Stage3DebateTable avatar / pill / relay badge
  - `Stage3DebateTable`: DebateRoundCard avatar -> `AvatarWithStatus`, DECISION / Pill / AgentRelay kind badge -> `StatusBadge` (primitive normalization)
  - `AvatarWithStatus` 첫 실제 적용 surface. `status` prop 은 아직 미사용.
  - initials 는 1자에서 2자로 확장. `roleColorFromRole(agentName)` fallback 은 후속 점검 필요.

### R5 operational incident

운영 사고 (R5 라운드, 2026-05-26):

- Grok 2 가 main 이 아니라 Grok 1 branch (`grok/stage1b-debate-agent-statusbadge`) 에서 분기하여 PR `#182` 가 `#183` diff 를 흡수한 채 열림
- Claude 1기가 GitHub 상 PR diff 직접 확인으로 발견
- Grok 2 가 main 으로 rebase + 두 비-tmux 파일 제거 force-push
- 정리 commit `58e0d38` 후 PR `#182` 정상 머지
- 다음 라운드부터 cascade worker 는 PR 생성 전에 다음 branch rebase precondition 을 강제:
  1. `git fetch origin && git rebase origin/main`
  2. PR body 첫 줄에 `branched off main @ <SHA>` 명시
  3. PR body 의 scope claim 과 실 diff scope (`git diff main --stat`) 가 1:1 일치해야 함
  4. PR body 에 `v0 fidelity` / `primitive normalization` / `design judgment` / `FROZEN` 중 해당 판정을 명시해야 함
  5. docs-only PR 과 code PR 은 역할을 분리해야 함

### R6 Conversation v0 parity wave status

R6 Conversation v0 parity wave (Audit + Shell visibility + Action row + Right rail/sidebar) 및 후속 PR 완료 - `#166`, `#169`, `#173`, `#178`, `#194` 머지 완료.

완료 분류:

- v0 visual parity 1차 완료
  - `ConversationWorkbench` visual parity 및 visibility cleanup 완료 (`#166`, `#169`, `#173`, `#178`)
  - `AgentSettingsPanel` DropdownMenu primitive 치환 완료 (`#194`)
- structural decomposition은 design judgment / future work로 유지
  - monolithic `ConversationWorkbench` 를 v0 의 5-file 구조(header/view/message-bubble/message-thread/composer + approval-queue)로 분해하는 작업은 미완 상태로 남겨둠.

잔여 / 동결:

- `CommandPalette` full v0 port - TODO / design judgment needed. `#191` 은 verb chip 만 완료했으며 v0 CommandPalette 구조와 현재 repo verb-command 구조가 달라 단순 치환 금지.
- `AvatarWithStatus` broader adoption - TODO / design judgment needed. `#192` 에서 첫 적용은 완료했지만 `AgentAvatar` 는 protocol-aware component 이므로 무단 교체 금지.
- `ConversationWorkbench` structural decomposition - monolithic 대형 컴포넌트를 v0 5-file 구조로 실제 분할하는 작업 (future work).


Claude와 Codex가 같은 repo를 분업할 때 서로의 작업 상태와 합의를 한 페이지로 보기 위한 작업판.

관련 문서: [`review-board.md`](review-board.md) (외부 검토자 리뷰), [`24-provider-adapters.md`](24-provider-adapters.md) (LlmAdapter), [`29-permission-engine-spec.md`](29-permission-engine-spec.md) (Permission/Redaction), [`30-security-audit-checklist.md`](30-security-audit-checklist.md) (보안 감사), [`31-streaming-layer-spec.md`](31-streaming-layer-spec.md) (streaming v1), [`32-memory-adapter-spec.md`](32-memory-adapter-spec.md) (MemoryAdapter contract), [`33-dgx02-deploy-runbook.md`](33-dgx02-deploy-runbook.md) (DGX-02 deploy).

마지막 갱신: 2026-05-27 라운드 **5** (Stage 1b primitive adoption 1차/2차/3차 wave: `#181`~`#192` merge 상태 반영. R4-era 표와 표현은 위 R5 canonical update 가 supersede).

## 1. 협업 규칙

- **Branch prefix**: `claude/...` (Claude 작업) vs `codex/...` (Codex 작업).
- **Commit trailer**:
  - Claude: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  - Codex: `Co-Authored-By: Codex GPT-5 <noreply@openai.com>`
- **PR title prefix**: `[claude] ...` / `[codex] ...`.
- **파일 점유 룰** (동시 작업 금지):
  - Codex 영역: `apps/desktop/**`, `apps/mobile/**`, `apps/server/src/index.ts`, `packages/providers/src/openAiCompatibleAdapter.ts`, `packages/providers/src/node/codexCliOAuthAdapter.ts`, README + docs authority 문서 + Stage6 seed
  - Claude 영역: `packages/providers/src/anthropicAdapter.ts`, `packages/providers/src/ollamaAdapter.ts`, `packages/providers/src/contractTestFixtures.ts`, `packages/agents/src/**`, `agents/<persona>/SOUL.md` + `AGENTS.md`, `docs/24~32` 신규
  - 양쪽 다 신중히: `packages/protocol/src/index.ts` (Claude는 신규 schema 추가만, Codex가 permission 타입 변경 중일 때는 Claude 0 touch)
  - 같은 파일을 만지기 전엔 work-board에 알리고 다른 쪽이 잠시 멈춘다.

## 2. 머지된 작업

### R3.1 → R4 사이에 머지된 항목 (desktop UI 축 — Stage 0~2 + EvolveMemento v1 + v0 cascade)

**Stage 0 / 1a — Tailwind + design token + Shadcn primitive 인프라**

- ✅ **#111 Stage 0** — Tailwind 4 + `@tailwindcss/vite` plugin + `tokens.css` 인프라 + v0 reference 통합 시작
- ✅ **#113 Stage 1a** — 16 Shadcn primitive (`apps/desktop/src/ui/`) 포팅 (Button, Card, Dialog, Drawer, Input, Label, Popover, Select, Separator, Sheet, Tabs, Toast 등)
- ✅ **#114 docs/design-decisions.md** — §1~§14 + Manus archive (v0 + 경쟁 도구 UX 종합 reference)

**Stage 2 — 데스크톱 UI redesign 5단계**

- ✅ **#116 debate mock seed** — 50 scenarios from 니뭉 (Manus) → TS seed
- ✅ **#117 17-persona enrichment** — 깊은 캐릭터 voice 추출
- ✅ **#118 Stage 2-1 AgentsSidebar** — 3-tier (active / standby / specialist)
- ✅ **#119 Stage 2-2 MementoPanel** — collapsible-drawer redesign
- ✅ **#120 Stage 2-3 TerminalDock** — Warp block model
- ✅ **#121 Stage 2-4 Command Palette** — ⌘K 글로벌 팔레트
- ✅ **#122 Stage 2-5 Control Queue** — rename + 6-lane action
- ✅ **#126 Stage 2-6 Debate provenance UI** (Codex #125 schema 위)
- ✅ **#127 Stage 2-6 Tmux block model UI** (Codex #125 schema 위)

**EvolveMemento v1 — Memento + EvolveMem 통합**

- ✅ **#124 docs/specs/memento-evolvemem-v1.md** — Codex 구현 brief (schema enrichment + multi-view fusion + raw recall log + placement contract)
- ✅ **#125 [codex]** — debate provenance + tmux block schemas (Claude #126/#127 차단 해제)
- ✅ **#128 [codex]** — EvolveMemento retrieval uplift (RRF 다중 뷰 fusion)
- ✅ **#129** — 제품 명명 통합 Memento → EvolveMemento
- ✅ **#135 [codex]** — backup projection 에 EvolveMemento recall evidence 투영
- ✅ **#138 v2** — 신규 schema 필드 (keywords/entities/persons/topic/importance/entityReinforcement/losslessRestatement) + fusionDetail UI 표면화
- ✅ **#139 [codex]** — EvolveMemento memory adapter foundation (`packages/memory/` workspace)
- ✅ **#150 [codex]** — runtime gate 강화 (tmux + memory provider 위임)

**Stage 2 polish — agent vocab + autonomy + help**

- ✅ **#130** — unused legacy panel 제거 (MementoPanel.tsx / ApprovalPanel.tsx / AgentState 구버전)
- ✅ **#131 AutonomySlider** — design-decisions §8 5-level UI
- ✅ **#133** — §1 Agent Relay rename + §2 7-state agent vocab
- ✅ **#134 Help Cheat-Sheet overlay** — `?` 단축키 (학습 vs 실행 분리)
- ✅ **#136** — WindowChecklist 11 production panel 에서 bulk 제거
- ✅ **#137** — WindowChecklist.tsx 파일 삭제 (zero importer)

**Codex 부수 작업 (delegation + approval + tmux 안전)**

- ✅ **#104~#110, #112, #115, #123, #140, #142** — desktop branch experiments controller 추출 / companion delegation 정책 / delegation event payload + timeline + execute / backup projection / agent delegation endpoint / tmux dispatch audit replay / approved request approval-queue replay / tmux dispatch preflight safety endpoint

**v0 cascade (Stage 1b) — 8-panel 모두 v0 디자인에 정렬**

- ✅ **#141 token 통합** — `tokens.css` legacy palette ↔ v0 hex 정렬 + legacy bridge (`--bg`/`--cyan` 등) + `--muted` 충돌 명시
- ✅ **#143 1/8 EvolveMementoPanel** — strict v0 port (header + 4 mini stat + Memory Context + Recall Trace 단일 drawer)

### R2 → R3 사이에 머지된 항목

- ✅ **#31 Ollama adapter (γ)** — 로컬 fallback, 21 tests
- ✅ **#33 contract test fixtures** + OpenAI-compat / Anthropic 적용 (93 tests)
- ✅ **#34 docs/24·25·26 implementation status sync**
- ✅ **#35 docs/29 Permission engine spec** (F1~F10 로드맵)
- ✅ **#36 docs/seed authority correction** (Codex — DGX-02 authority 표기 정정)
- ✅ **#37 docs/30 Security audit checklist**
- ✅ **F1 Codex permission gate foundation** (`ad1fb26`) — protocol schema + evaluator skeleton
- ✅ **Codex desktop event outbox consolidation** (`85eaa0a`)
- ✅ **Codex DGX authority memory model restore** (`7d315d8`)

### R1 라운드 (기존 머지 항목 요약)

- 보안/인증: #9 C1 Bearer auth + CORS, #10 C2 Zod + body limit + secret redact, #17 desktop bearer, #19 stage32 DGX 진단, #20 large body 413 hotfix
- 어댑터 인프라: #18 PR α (LlmAdapter + AdapterError 9 cat + MockLlmAdapter), #21 Codex OAuth main provider, #22 ESM fix, #24 OpenAI-compatible adapter, #25 smoke Codex OAuth, #29 Anthropic adapter (β) + server migration, #30 server legacy cleanup
- mobile / agents / docs: #11~#16 Claude PR 7개 (agents safety, work-board v1, docs/24~27, mobile PWA), #23 mobile polish, #26 탭바 + cap, #27 agents lifecycle fix, #28 DGX vLLM 모델 id, #32 seed authority correction

총 머지 카운트: 약 30+ PR (Claude + Codex 합산).

## 3. 진행 중 (open PR — 18건: 8 R3.1 permission stack + 9 R4 v0 cascade/primitive + 1 Codex runtime)

### Claude v0 cascade — 2/8 ~ 8/8 panel port (7건) + 공유 primitive 2건

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#144](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/144) | `main` | **2/8 ConversationWorkbench** — v0 visual (Header + MessageBubble + Composer + ActionStrip + InboxApprovalStrip), 40+ callback 보존 | MERGEABLE |
| [#145](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/145) | `main` | **3/8 Stage3DebateTable** — DebateContextHeader + 2-col round grid + Status Hub + Agent Relay sidebar, provenance pill (§7) 보존 | MERGEABLE |
| [#146](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/146) | `main` | **4/8 TmuxSwarmBoard + TmuxPaneCard** — h-10 header + recommendation strip + Operator Chat (w-80) + Agent Pane Grid (4-col) + h-8 footer | MERGEABLE |
| [#147](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/147) | `main` | **5/8 AgentsSidebar** v0 재구성 — Core/Specialists/Companions 3 그룹 (`roleToCategory`) + AgentCard (avatar + Primary + hover action) + `docs/specs/v0-port-deferred-features.md` 신규 (3-카테고리 ledger) | MERGEABLE |
| [#148](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/148) | `main` | **6/8 ControlQueueDrawer** — drawer overlay (우리 컨셉) + v0 visual language, 6 lane (approve/ask/edit/delegate/block/archive) 보존 | MERGEABLE |
| [#149](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/149) | `main` | **7/8 CommandPalette + CheatSheetOverlay** — v0 Dialog-style overlay + verb-grouped command 카탈로그 | MERGEABLE |
| [#151](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/151) | `main` | **8/8 RuntimeStatusBar** — v0 TopNav status zone (meta strip + HealthIndicator popover + Probe DGX) + `docs/specs/v0-port-deferred-features.md` full ledger | MERGEABLE |
| [#152](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/152) | `main` | **공유 primitive — AvatarWithStatus + StatusBadge** — 6 RoleColor × 5 status × 3 size / 12 variant × 2 size. `roleColorFromRole()` 17→6 매핑 헬퍼 포함. `vite.config.ts`에 `@ai-orchestrator/memory` alias 보완 (#139 후속) | MERGEABLE |
| [#154](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/154) | `main` | **stack on #152** — EvolveMemento panel에 StatusBadge 1차 채용 (인라인 `<span>` → `<StatusBadge variant="primary" size="sm">` 치환). Stage 1b adoption cascade 의 시작점 | MERGEABLE |

머지 순서: **`#144~#149 + #151 (서로 독립, 어느 쪽부터든 OK) → #152 → #154`**. Stage 1b adoption cascade (primitive 채용) 는 #152 머지 후 다른 패널들에 동일 패턴으로 확장 예정.

### Codex 단발 — runtime continuity

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#153](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/153) | `main` | **[codex]** runtime continuity smoke path 강화 — desktop UI 축과 독립 | MERGEABLE |

### Codex permission stack (F2~F9, stacked tree) — R3.1에서 그대로 open

```
main
 └── #42 (F2 server permission gate)
      ├── #44 (F3 desktop approval UX)
      └── #46 (F4 server /approvals/*)
           ├── #47 (F5 mobile approval queue)
           ├── #49 (F7 server redaction pipeline)
           │    └── #55 (F9 ingress receiver)
           ├── #51 (F6 desktop approval drawer)
           └── #52 (F8 provider budget guard)
```

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#42](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/42) | `main` | F2 server permission gate — `/provider-completions` + `/remote-runs`에 evaluator 통합 | MERGEABLE |
| [#44](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/44) | `#42` | F3 desktop approval UX (sibling of #46) — 채팅 안 승인 패널 + composer 복원 retry | MERGEABLE |
| [#46](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/46) | `#42` | F4 server `/approvals/list,grant,reject` endpoints + Event Store 기록 | MERGEABLE |
| [#47](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/47) | `#46` | F5 mobile approval queue — 폰에서 승인/거절 + 처리 내역 | MERGEABLE |
| [#49](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/49) | `#46` | F7 server redaction pipeline — provider 호출 직전/응답 직후 + Event Store 경로 redaction | MERGEABLE |
| [#51](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/51) | `#46` | F6 desktop approval drawer — 상단 버튼 + 우측 drawer, 터미널 inline approve/reject 보존 | MERGEABLE |
| [#52](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/52) | `#46` | F8 provider budget guard — 입력 토큰 추정 + 임계값별 승인 대기/거부, approval에 `costEstimateTokens` 포함 | MERGEABLE |
| [#55](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/55) | `#49` | F9 ingress receiver — 외부 입력 raw 격리 + redacted normalized event + approval request만 Event Store 진입 | MERGEABLE |

머지 순서: **`#42 → (#44, #46) → (#47, #49, #51, #52) → #55`**. `#46` 위 4 sibling은 서로 독립이라 어느 쪽 먼저든 OK. `#55`는 `#49` 위 stacked.

**F10 (tmux dispatch gate)** — Codex에서 구현 중, 아직 PR 미공개. 베이스는 `#55` 위에 stacked 예상.

### Claude solo PR (6건, 독립)

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#41](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/41) | `main` | Ollama adapter contract test 적용 (120 tests) | MERGEABLE |
| [#43](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/43) | `main` | Anthropic prompt caching opt-in (`enablePromptCaching` + `cacheStrategy`, 130 tests) | MERGEABLE |
| [#45](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/45) | `main` | docs/31 streaming layer spec (4 어댑터 → token-by-token 설계 합의, 9 결정점) | MERGEABLE |
| [#48](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/48) | `main` | 5 virtual agent SOULs (architect / reviewer / skeptic / verifier / memory_curator) | MERGEABLE |
| [#50](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/50) | `main` | docs/32 memory adapter spec (`MemoryAdapter` contract, 11 결정점) | MERGEABLE |
| [#58](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/58) | `main` | OpenRouter adapter — `createOpenRouterAdapter()` factory wrap of OpenAI-compat (139 tests) | MERGEABLE |

### Claude stack (2건, debate engine 사전 작업)

| PR | base | 요약 | 상태 |
|---|---|---|---|
| [#54](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/54) | `main` | `packages/agents` persona markdown loader + `defaultAgentProfiles` 7개 정합 (58 tests) | MERGEABLE |
| [#56](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/56) | `#54` | 페르소나 시각 정체성 — `avatar.svg` placeholder 6개 + `chatBackgroundPath` 폴백, 데스크톱 swarm + 모바일 메시지 + 모바일 채팅 배경이 한 출처 (72 tests) | MERGEABLE |

총 18건 모두 MERGEABLE (R3.1 stack 8 + R4 desktop UI 9 + Codex runtime 1).

검증 상태: 모든 PR에 `pnpm typecheck` + `pnpm test` 통과. providers 120~139 tests, agents 58~72, server 27~36 (F7/F8/F9 추가 반영). R4 desktop UI 축은 visual 변경이라 단위 테스트는 기존 callback contract 만 보장 — v0 layout 일치는 사용자가 페이지별 시각 확인.

## 4. 다음 작업 우선순위

### Codex 다음 진입

- **F10 tmux dispatch gate** — 진행 중, PR 미공개 (R3.1 부터 동일). `#55` 위 stacked 예상. R4 동안 `#142` (tmux dispatch preflight safety endpoint) / `#150` (runtime gate 강화) 가 머지되어 인프라 준비도 진행
- **R3.1 permission stack 머지** — `#42 → (#44, #46) → (#47, #49, #51, #52) → #55`. R4 동안 그대로 open. 본 라운드 끝나는 대로 진입
- **M2~M6 memory adapter 구현** — `#139` 이 M1 foundation 까지 깔았으므로 다음 단계는 DgxSimpleMem 어댑터 / Memento MCP 어댑터 / reflection worker 등
- (R3.1 시점부터 누적) evaluator 정책 매트릭스, 2FA, ERP 도메인 정책 별도 후속

### Claude 다음 진입

순서 의존:

1. **R4 PR 머지 train** — open 9 건 (#144~#149 + #151 + #152 + #154). #144~#151 서로 독립이라 어느 쪽 먼저든 OK. #152 머지 후 #154 (Stage 1b adoption 시작점)
2. **Stage 1b adoption cascade** — `#154` 가 EvolveMemento 에서 StatusBadge 채용 패턴 정착시키면, 동일 패턴을 ConversationWorkbench / Stage3DebateTable / TmuxPaneCard / AgentsSidebar / ControlQueueDrawer 등에 mechanical 로 cascade. AvatarWithStatus 도 동일 패턴
3. **dropdown-menu + collapsible primitive 추가** — npm deps (`@radix-ui/react-dropdown-menu`, `@radix-ui/react-collapsible`) 설치 후 `src/ui/` 에 wrapper 추가. v0 cascade 에서 보류했던 surface (예: AgentCard provider 선택, 일부 panel expand/collapse) 마무리
4. **debate engine 실 실행** — `packages/agents`. F2 evaluator + F4 budget guard + F5 approval flow 가 main 에 있어야 호출 가능. R3.1 permission stack 머지 라운드 끝나면 즉시 진입
5. **deferred-feature ledger 반영** — `docs/specs/v0-port-deferred-features.md` 의 🔴 (재진입 필수) 항목들 - 현재 production 흐름에 다시 자리 찾기 (별도 surface / Cheat Sheet 의 추가 row / Control Queue lane 등)
6. **streaming P1** (docs/31 결정 회신 후) — protocol 에 `ProviderCompletionChunkEvent` 추가 + `MockLlmAdapter.completeStreaming()` + 5 streaming contract fixtures

### 잠금 해제 의존 표

| 작업 | 잠금 해제 조건 |
|---|---|
| debate engine 실 실행 | F2 + F4 + F5 머지 (다 PR로 떴음, 머지 대기) + #48/#54/#56 머지 |
| ~~M1 memory adapter workspace~~ | ✅ **#139 머지로 닫힘** (Codex). M2~M6 은 Codex 후속 |
| streaming P1 | docs/31 결정 회신 + Codex F10 머지 후 protocol 정착 |
| ERP 도메인 entries (`payment_action` 등) | F1~F10 다 머지 + 보안 감사 통과 |
| Multi-channel ingress (external, mobile webhook) | F9 머지 (#55) |
| tmux dispatch | F10 머지 |
| 모바일 승인 큐 UI 추가 기능 | F5 머지 (#47) |
| **Stage 1b primitive cascade 완료** | #152 + #154 머지 → 나머지 7 panel 에 동일 채용 (별도 follow-up PR) |
| **dropdown-menu / collapsible 채용** | npm deps 설치 + `src/ui/` wrapper 추가 |
| **deferred 🔴 항목 재진입** | v0 cascade 8 panel 머지 + 사용자가 적용점 찾는 시점 |

## 5. 결정 대기

### docs/29 6개 결정 (R2부터 누적)

1. 정책 매트릭스 위치 — hardcoded TS vs JSON vs DB row
2. approval TTL 기본값
3. 2FA 메커니즘 — 모바일 push + 코드 vs external bot inline button
4. PermissionMatrixItem 영속화 — Event Storage vs 별도 audit log
5. untrusted source memory recall — 차단 vs summary only
6. Redaction 위반 처리 — 자동 치환 vs 거부 (scope 별)

### docs/31 9개 결정 (PR #45)

1. **인터페이스**: `complete()` `stream` 플래그 vs 별도 `completeStreaming?()` — Claude 추천 옵션 B
2. **Transport**: SSE vs WebSocket — Claude 추천 SSE
3. **Usage 이벤트 emission**: stream 중 0~N회 vs 마지막에만 — Claude 추천 0~N회
4. **Reconnect**: 64-chunk sliding window vs 미지원 — Claude 추천 v1 미지원
5. **Codex CLI streaming schema**: CLI 1.0.x 실 schema 확인 필요
6. **Server multiplex**: 한 SSE에 여러 stream vs stream당 SSE — Claude 추천 1:1
7. **Throttle**: 즉시 flush vs 50ms batch — Claude 추천 모바일은 batch, 데스크톱은 즉시
8. **Tool use 이벤트**: streaming 발신 vs 만나면 종료 — Claude 추천 v1은 종료
9. **SSE 인증** (§16.1): EventSource Cookie/query vs `fetch()` + ReadableStream — Claude 추천 후자

### docs/32 11개 결정 (PR #50)

1. 새 워크스페이스 `packages/memory` vs `packages/providers` 동거 — Claude 추천 새 워크스페이스
2. `reflect()` 어댑터 책임 vs 별도 service — Claude 추천 optional method
3. DgxSimpleMem `remember()` 반환 타입 — Claude 추천 `promotion_pending` error throw
4. Memento MCP `pin` 미지원 시 대안 — Claude 추천 metadata 매핑 우선, 미지원 시 sidecar table
5. `memoryContext` streaming 필요 여부 — Claude 추천 v1 buffered
6. Trust enforcement: caller 책임 vs adapter wrapper — Claude 추천 wrapper
7. `forget` 시 secret storage 처리 — Claude 추천 별도 worker
8. `pin`/`forget`/`activate` 동기 vs 비동기 일관 — Claude 추천 모두 Promise, 비동기 backend는 `promotion_pending` 일관
9. Event Store schema 추가 memory events 17개 — Claude 추천 M1 PR에 한꺼번에
10. (§11.x 결정점 중) MemoryAdapter 의존을 별도 신규 패키지로 분리할지 — Claude 추천 그렇게
11. memory_curator 페르소나 호출 budget — `provider_call` budget 안에서

### 기타

- Anthropic prompt caching 활성화 시점 — PR #43 머지 후 첫 caller가 `enablePromptCaching: true`로 전환할 시점 (현재 default off)
- Ollama 실 호스팅 위치 — DGX-02 vs desktop-local (RAM 안전 3룰 통과 후)
- ~~OpenRouter adapter 담당~~ — ✅ **Claude factory wrap (#58)으로 닫힘**. Codex가 별도 풀-스크래치 OpenRouter 어댑터 만들 필요 없음
- 페르소나 placeholder SVG vs 실인물 사진 — `agents/<persona>/avatar.svg` placeholder (#56) 적용 됨. 사용자가 실인물 portrait 으로 교체할 시점 (drop-in 으로 자동 교체)
- F10 머지 후 tmux 실 dispatch 활성화 시점 — F1~F10 다 main 정착 + 보안 감사 통과 후

## 6. 알려진 위험 (요약)

상세는 [`docs/30-security-audit-checklist.md`](30-security-audit-checklist.md) §7.

| 위험 | 등급 | 닫힐 시점 |
|---|---|---|
| Permission/Approval enforcement (typed only) | High → **PR 완성, 머지 대기** | F1~F5 PR (#42/#44/#46/#47) 머지 시 |
| Redaction pipeline 5 stage 중 3,4,5 미구현 | Medium → **PR 완성, 머지 대기** | F7 (#49) 머지 시 |
| Ingress receiver 0 구현 | Medium → **PR 완성, 머지 대기** | F9 (#55) 머지 시 |
| Audit log 영속화 | High → **부분 진행 (PR 완성)** | F4 (#46) 머지 + 후속 F8 schema 확장 |
| 2FA (device_reboot, secret_view, payment) | High | F4~F5 (#46/#47) 머지 + 결정 3 (external bot vs mobile push) |
| Backup/Export redaction (pre_backup) | High → **부분 진행** | F7 (#49)는 prompt_inject + pre_persist 만; pre_backup은 별도 |
| Server rate limit 부재 | Low (지금) → High (외부 사용자 증가 시) | 별도 PR |
| Provider OAuth refresh layer | Medium | F4 또는 별도 |
| Provider 비용/예산 폭주 | Medium → **PR 완성, 머지 대기** | F8 (#52) 머지 시 입력 토큰 추정 + 임계값 가드 |
| tmux dispatch 직접 실행 | High (tmux 진입 시) | F10 (Codex 구현 중) 머지 + 보안 감사 |
| ERP-도메인 actions 정책 미정 | High (ERP 진입 시) | ERP 진입 직전 |
| **Streaming layer 부재** (모든 응답 buffered) | Medium (UX) | docs/31 결정 회신 → P1~P7 |
| **Memory backend 0** (LocalHeuristic 폴백만) | Medium (장기 기억 0) | docs/32 결정 회신 → M1~M6 |

## 7. 분담 안 한 작업 (양쪽 다 안 잡음)

R2 대비 정리됨:

- ~~Virtual agent 5개 SOUL 파일~~ — ✅ **PR #48로 닫힘**
- ~~페르소나 visual identity (avatar + 채팅 배경 폴백)~~ — ✅ **PR #56으로 닫힘**
- ~~persona markdown loader~~ — ✅ **PR #54로 닫힘**
- ~~Memento MCP 실연동 spec~~ — ✅ **PR #50으로 spec 닫힘**, 구현(M1~M6)은 결정 회신 후 진입
- ~~streaming layer (`stream: true` 어댑터 통합) spec~~ — ✅ **PR #45로 spec 닫힘**, 구현(P1~P10)은 결정 회신 후
- ~~OpenRouter adapter~~ — ✅ **PR #58로 닫힘** (factory wrap)

R3.1 → R4 추가 정리됨:

- ~~M1 memory adapter foundation~~ — ✅ **Codex #139 로 닫힘** (`packages/memory/` workspace 신설)
- ~~design-decisions §1~§14 정합~~ — ✅ **#114 (spec) + #129 (§1 명명) + #131 (§8 autonomy) + #133 (§1+§2) + #134 (§6 cheat sheet) 로 진척**
- ~~v0 디자인 적용~~ — ✅ **#111 (Stage 0) + #113 (Stage 1a) + #141 (token 통합) + #143~#152 (8 panel cascade) + #154 (Stage 1b adoption 시작) 로 closure 임박**
- ~~EvolveMemento 통합~~ — ✅ **#124 (spec) + #125/#128/#135/#139 (Codex) + #129/#138/#143 (Claude) 로 v1 완성**

여전히 미정 / 남은 큰 과제:

- visual QA (PR #197 및 후속 점검)
- `ConversationWorkbench` structural decomposition (monolithic 분할)
- `CommandPalette` full v0 port
- `AvatarWithStatus` 잔여 surface policy (broader adoption)
- BEM legacy panel cleanup
- provider CLI hardening follow-up (PR #196 env allowlist 및 후속)
- Tool use / function call — Anthropic / OpenAI 명세 차이 어댑터 통합 후
- Multimodal (image / document) — ModelDescriptor에 flag만, 어댑터 미구현
- Coding Packet 실행 게이트 — packet 검증은 있고 실 실행 0
- Obsidian/Notion 실 file writer — projection 타입만, fs/API 호출 0
- review-board.md Stage 1~42 reclassification — 코덱스가 양보한 후보, 현재 미배정
- **Stage 1b primitive cascade — 나머지 7 panel** (#154 패턴을 ConversationWorkbench / Stage3DebateTable / TmuxPaneCard / AgentsSidebar / ControlQueueDrawer / CommandPalette / RuntimeStatusBar 에 mechanical 채용)
- **dropdown-menu + collapsible primitive** (npm deps 설치 + `src/ui/` wrapper 추가)
- **deferred-feature ledger 의 🔴 항목 재진입** (각 항목별로 별도 surface 찾아 다시 등장)


## 8. 최근 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-05-25 R1 | 협업 룰 (branch/trailer/PR prefix + 파일 점유) | 별도 GitHub 계정보다 관리 부담 작음 |
| 2026-05-25 R1 | C1 → C2 순서로 분리 커밋 | 접속 차단이 CORS인지 body validation인지 추적 가능 |
| 2026-05-25 R1 | 어댑터 순서 vLLM → OpenAI → Anthropic → Ollama → OpenRouter | 실제 시운전 축 + OpenAI-compatible 골격 재사용 |
| 2026-05-25 R1 | 어댑터 1차에 streaming/tool use 비포함 | 5개 buffered 검증 후 별도 PR |
| 2026-05-25 R1 | Codex OAuth를 메인 provider로 채택 | 빠른 응답, dense qwen은 RAG/문서/오프라인용 폴백 |
| 2026-05-25 R1 | Codex OAuth는 CLI subprocess (A안) | `codex serve` 부재로 C안 불가, B안은 약관 risk |
| 2026-05-25 R1 | Cloudflare Tunnel로 endruin.com 외부 노출 | DNS DGX-02 직접 노출보다 NAT/TLS/IP 변경 자동 |
| 2026-05-25 R2 | Anthropic adapter는 `x-api-key` 사용 | 기존 raw fetch의 `Authorization: Bearer` 잘못 |
| 2026-05-25 R2 | `ProviderCompletionUsage`에 cache 필드 추가 | Anthropic prompt caching usage 정확 보고 |
| 2026-05-25 R2 | server anthropic_messages도 어댑터 통과 | OpenAI-compatible과 대칭 + raw fetch dead code 제거 |
| 2026-05-25 R2 | DGX-02 = canonical authority, MacBook = client outbox/cache | 코덱스의 #36 correction |
| 2026-05-25 R2 | Permission/Redaction은 F1~F10 단계별 진입, tmux는 F10 | docs/29 §10 |
| 2026-05-25 R2 | debate engine 실 실행은 evaluator (F2) + budget (F4) + approval flow (F5) 후 진입 | 어댑터 + permission stack 둘 다 받아야 후속 정리 비용 적음 |
| 2026-05-25 R2 | Anthropic prompt caching beta는 default off | reseller cache 지원 불확실, 호출자 명시 시만 활성 |
| 2026-05-25 R2 | Ollama 실 호스팅 결정 보류 | RAM 안전 3룰 통과 후 |
| 2026-05-25 R3 | **F3 desktop approval UX (#44)는 F2 (#42) 위에 sibling stack, F4 (#46)도 sibling** | UX와 server endpoint가 다른 영역이라 stacked sibling이 가장 깔끔. 머지 순서 `#42 → (#44, #46) → #47` |
| 2026-05-25 R3 | **승인 큐는 Event Store에 `approval.requested/granted/rejected` 이벤트로 영속화** (별도 임시 메모리 X) | 모바일/리플레이/감사 로그 모두 같은 원본 — F4 (#46) 구현 결정 |
| 2026-05-25 R3 | **Anthropic prompt caching 활성화 시점은 caller가 결정** (default off 유지) | reseller(APIKey.fun) cache 지원 미검증. PR #43 머지 후 직접 api.anthropic.com부터 smoke 검증 → 검증된 reseller만 단계적 활성 |
| 2026-05-25 R3 | **5 virtual agent SOULs (architect/reviewer/skeptic/verifier/memory_curator)는 페르소나당 SOUL.md + AGENTS.md 페어로 정의** (#48) | orchestrator 패턴 그대로 — voice/판단/산출물은 각자 다르고 안전 경계 (Permission Matrix, secret, DGX-01, untrusted)는 공통 |
| 2026-05-25 R3 | **Streaming은 `completeStreaming?()` 별도 optional method**, transport는 SSE | `complete()`/`Promise` 와 stream/`AsyncIterable`은 try/catch 패턴이 달라 한 메서드 묶으면 caller 자주 틀림. SSE는 단방향/iOS PWA reconnect 네이티브/Cloudflare 검증됨 |
| 2026-05-25 R3 | **MemoryAdapter는 LlmAdapter 패턴 그대로 별도 contract 박음 — `packages/memory/` 신규 워크스페이스** | providers는 LLM 호출, memory는 다른 도메인. trust enforcement / error taxonomy / contract fixtures 섞으면 변경 비용 큼 |
| 2026-05-25 R3 | **DgxSimpleMem `remember()`는 즉시 `promotion_pending` error throw** (intent event만 발행, 실 record는 Curator promotion 후) | caller가 비대칭성을 명시적으로 try/catch로 처리하게 강제 — return type union 대비 호환 부담 작음 |
| 2026-05-25 **R3.1** | **F6/F7/F8/F9를 `#46` (F4) 위 sibling stack으로 평행 배치** | F6 데스크톱 UI, F7 server redaction, F8 budget guard, F9 ingress receiver가 서로 다른 layer라 sibling으로 두면 리뷰가 깨끗하고 머지 순서 부담 작음. F10만 #55 위 stacked (ingress + tmux가 같은 외부-입력 축) |
| 2026-05-25 **R3.1** | **F7 redaction은 prompt_inject + pre_persist 만 v1, pre_backup은 별도 PR** | 5-stage 중 2개부터 실 동작 검증 후 stage 3~5 확장 — 한꺼번에 5단계 다 짜면 false positive 디버깅 비용 큼. usage 숫자(`totalTokens` 등) false positive는 R3.1에서 패턴 좁혀 해결됨 |
| 2026-05-25 **R3.1** | **F8 provider budget guard는 입력 토큰 추정 + 임계값 2단** (승인 대기 / 거부) | trusted provider라도 large prompt는 비용 폭주 위험 — 사전 추정으로 막음. `costEstimateTokens`를 approval payload에 실어 UI가 나중에 USD 환산 표시 가능 |
| 2026-05-25 **R3.1** | **F9 ingress는 외부 raw 격리 + redacted normalized event만 Event Store 진입** | external/mobile webhook이 직접 실행에 도달 안 함 — server에서 guard 결과와 approval request만 기록. 외부 입력 → 자동 실행 경로 0 |
| 2026-05-25 **R3.1** | **OpenRouter는 factory wrap of OpenAI-compat** (별도 풀-스크래치 어댑터 X) | wire shape 동일이라 `headers` / `extraBody` / `kind` 옵션으로 OpenRouter 특화(`HTTP-Referer`, `X-Title`, `transforms`, `route`)만 주입. OpenAI 어댑터 미래 개선이 자동 적용됨 |
| 2026-05-25 **R3.1** | **페르소나 visual identity 는 `agents/<name>/avatar.svg` convention** (SOUL.md 와 sibling) | 데스크톱 swarm 썸네일 + 모바일 메시지 아바타 + 모바일 채팅 배경 폴백 셋이 같은 출처 본다 — placeholder SVG 옆에 `avatar.png` drop-in 으로 자동 교체. 사람이 일하는 느낌 / 몰입감 |
| 2026-05-25 **R3.1** | **`PersonaFileSource` 인터페이스로 fs-agnostic** (`node:fs` 는 `src/node/` 에만) | desktop renderer Vite bundle / 모바일 PWA / 테스트 in-memory 셋 다 같은 loader 쓸 수 있게 — `node:fs` 브라우저 번들 누출 방지 |
| 2026-05-26 **R4** | **Stage 1a (16 primitive) → Stage 1b (adoption) 사이에 Stage 2 가 raw `<button>` + BEM 으로 진행됨** — Stage 1a primitive 가 사실상 미채용 상태였음 | v0 cascade 가 Stage 1b 의 implicit 실행. 신규 패널은 처음부터 v0 + primitive 채용, 기존 패널은 v0 cascade 후 별도 PR (#154 시작) 로 점진 채용 |
| 2026-05-26 **R4** | **EvolveMemento 라는 단일 제품명으로 Memento + EvolveMem 통합** (#129) | 사용자가 둘 다 같은 기능으로 인식 — "memento" 캐주얼 호칭 + "evolve" 진화 의미 결합. 코드 식별자도 `EvolveMemento` 일관 (이전 `MementoPanel` / `EvolveMemPanel` 분리 제거) |
| 2026-05-26 **R4** | **debate provenance + tmux block model은 Codex 가 schema (#125), Claude 가 UI (#126/#127) — strict file ownership 분리 병행** | Codex 는 `packages/protocol` 권한, Claude 는 `apps/desktop/src/components` 권한. 같은 turn 에 schema + UI 동시 진행 가능했음 (서로 다른 파일이므로 충돌 0) |
| 2026-05-26 **R4** | **v0 디자인 cascade 는 8 panel 전부 strict port — 우리가 추가했던 시각 요소도 v0 에 없으면 제거** (사용자: "니가 만든거 아깝다고하지말고") | v0 와 "거의 똑같이" 가 요구사항이라 mixed 디자인은 인지부담만 키움. 우리가 추가한 기능 중 v0 구조에 안 들어가는 건 `docs/specs/v0-port-deferred-features.md` 에 3-카테고리 (🔵 포기 / 🟡 이동 / 🔴 재진입 필수) 로 ledger 만들어 보존 — 나중에 적용점 찾을 때 잃지 않음 |
| 2026-05-26 **R4** | **EvolveMemento 패널은 1-drawer (Recall Trace) 만** — 우리가 추가했던 Relations/Reflect/Records 3-drawer 는 deferred ledger 로 이동 (#143) | 사용자: "v0 구조면 충분히 1-drawer 이 뭔질 몰라 나는". 관리 callback 은 props 에 유지하되 UI surface 만 제거 → 나중에 v2 부활 시 wire-up 비용 0 |
| 2026-05-26 **R4** | **token 통합은 legacy 값을 기준으로 v0 hex 를 정렬** (#141) — 새 v0 색이 와도 shipping 색 유지 | legacy 가 사용자가 실제로 보고 있는 화면. v0 색을 그대로 적용하면 미세한 hue 변화가 일관성 깨뜨림. `--bg`/`--cyan` 같은 legacy alias 도 동시에 `var(--background)`/`var(--primary)` 로 bridge — 점진 migration |
| 2026-05-26 **R4** | **`--muted` 의미 충돌은 일단 문서화만 (rename X)** — v0 는 "surface", legacy 는 "text" | 둘 다 광범위하게 쓰여 rename 비용이 큼. `tokens.css` 주석으로 충돌 명시 + 새 사용처는 `--muted-foreground` (text) / `--muted` (surface) 로 명시 — 기존 깨진 사용처는 v0 cascade 때 자연스럽게 정리됨 |
| 2026-05-26 **R4** | **공유 primitive 는 `AvatarWithStatus` + `StatusBadge` 둘만 우선** (#152) — dropdown-menu / collapsible 은 deps 설치 필요해 보류 | v0 cascade 8 panel 에서 가장 자주 반복되는 시각 요소가 (1) 페르소나 아바타 + 상태 dot (2) 상태 chip. 이 둘만 먼저 primitive 화 → 나머지 patterns 은 사용 빈도 보고 추출 결정 |
| 2026-05-26 **R4** | **AvatarWithStatus 는 17 role → 6 RoleColor 매핑** (`roleColorFromRole()`) — v0 가 6 색 갖고 있음 | role 마다 다른 색 주면 시각 부담 큼. v0 6 색 (cyan/violet/amber/rose/emerald/slate) 안에서 role group 단위로 묶음. 개별 페르소나 식별은 avatar image 가 담당 |
| 2026-05-26 **R4** | **Stage 1b adoption 은 `#154` 처럼 stacked PR 로 데모하고 다른 패널은 별도 follow-up** | 한 PR 에 8 panel 다 primitive 채용하면 리뷰 부담 + 회귀 위험 큼. `#154` 가 EvolveMemento 하나에서 StatusBadge 채용 패턴 정착 → 같은 패턴 다른 패널에 cascade 시 mechanical change |
| 2026-05-26 **R4** | **`vite.config.ts` 에 `@ai-orchestrator/memory` alias 추가** (#152 안에 포함) — Codex #139 후속 정리 | Codex 가 새 workspace 만들면서 `tsconfig.json` paths 는 추가했지만 Vite alias 추가 누락 — desktop dev server 가 import 못 풀음. Stage 1b primitive PR 에 묻어서 fix (작은 인프라 변경이라 별도 PR 비용 큼) |
| 2026-05-26 **R4** | **AutonomySlider 는 §8 5-level 모델** (#131) — slide 한 번에 5 단계 자율성 전환 | manual / approve / supervise / observe / autonomous 5 단계. discrete 값이라 slider 가 직관적. 각 level 에서 어떤 action 이 auto vs approval 인지 hover tooltip 으로 명시 |
| 2026-05-26 **R4** | **Agent Relay 라는 단일 명칭으로 §1 통합** (#133) — agent 7-state vocab (idle/thinking/streaming/awaiting/blocked/error/done) §2 도 동일 PR | 이전엔 "AgentState" / "AgentSwarm" / "AgentChain" 등 혼용 — Agent Relay 가 협업 의미 가장 정확. 7-state 는 디자인 컬러 토큰과 1:1 매핑 (status badge / avatar status dot 둘 다) |
| 2026-05-26 **R4** | **Help Cheat-Sheet (`?`) 는 Command Palette (`⌘K`) 와 분리** (#134) | 학습 도구 ≠ 실행 도구. palette 는 verb-first 명령 실행, cheat-sheet 는 단축키 → 액션 → 우선순위 3-열 표로 학습. 이전엔 `?` 가 palette 재오픈이었는데 학습 측면에서 부적절 |
| 2026-05-26 **R4** | **WindowChecklist 는 11 production 패널 + 파일 자체 제거** (#136/#137) | Codex #107 가 "hide completed" 로 일단 가렸지만 실 사용 0 (개발자만 보던 디버그 surface). v0 디자인에도 자리 없음. callback / type 은 protocol 에 남겨 외부 patching 여지만 보존 |
| 2026-05-26 **R4** | **deferred-feature ledger 는 3 카테고리** (🔵 포기 / 🟡 이동 / 🔴 재진입 필수) — `docs/specs/v0-port-deferred-features.md` | 단순 "deferred" 만 적으면 나중에 우선순위 못 정함. 🔴 는 보안/안전 영향, 🟡 는 다른 surface 에 다시 등장 가능, 🔵 는 의식적으로 영구 제거 — 결정 근거가 명시되어 미래에 흔들리지 않음 |
| 2026-05-26 **R4** | **v0 cascade 동안 R3.1 permission stack (#42~#55) 는 건드리지 않음** — 머지 큐 그대로 보존 | desktop UI 축과 server permission 축이 완전 독립이라 병렬 작업 가능. R3.1 stack 의 머지는 Codex 가 별도 라운드로 진행 — 본 라운드 R4 에 합치면 conflict surface 폭증 |
| 2026-05-26 **R4** | **Codex 가 `packages/memory` workspace 신설** (#139) — docs/32 spec 의 M1 실 구현 시작 | Claude PR #50 이 spec 닫고 결정 회신 받았던 항목 — Codex 가 file ownership (`packages/memory` Codex 영역) 으로 받아 구현. Claude 는 `vite.config.ts` alias 만 보완 (#152) |
