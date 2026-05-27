# v0 port — deferred features ledger

## R5 status update (Stage 1b 1차/2차/3차 wave)

기준: origin/main @ `55c8716` (`#174` docs merge, Stage 1b 기준 마지막 UI merge = `#192` / `6da8d7c5f0473df885f39b642bee481489bbab2a`).

✅ R5 1차 wave 머지 완료:

- AgentCard Primary: Stage 1b primitive normalization 완료, merge commit `a81c1d1` (`#183`). `StatusBadge` adoption 이며 exact v0 fidelity 항목은 아님.
- DebateRoundCard tag chip: v0 fidelity cascade 완료, merge commit `a81c1d1` (`#183`). Debate 관련 항목은 deferred 상태가 아니라 R5 1차 wave 완료 항목으로 본다.
- TmuxPaneCard status chip: v0 fidelity cascade 완료, merge commit `5524d3e1467f143acdd5ae01896362b0ac9a2df5` (`#182`). Final scope = `TmuxPaneCard.tsx` only.

✅ R5 2차 wave 머지 완료:

- ControlQueueDrawer lane chip: primitive normalization 완료, merge commit `29a5cde` (`#184`). v0 대응 surface 없음. drawer / lane order / keyboard handler 보존.
- RuntimeStatusBar status rows: primitive normalization 완료, merge commit `867dae6` (`#185`). HealthIndicator popover 구조 보존. StatusRow/StatusDot 계열만 `StatusBadge` 화.
- TmuxSwarmBoard status elements: primitive normalization 완료, merge commit `6e581fd` (`#186`). gate chip + role/status elements 중심. v0 fidelity 로 과장하지 않음.
- Rail status surfaces: primitive normalization 완료, merge commit `84c5373` (`#187`). `BackupRailMenu`, `ChannelRailPanel`, `ProjectRailPanel` 대상.
- CheatSheetOverlay status chips: primitive normalization 완료, merge commit `310e38d` (`#188`). `CommandPalette` 는 건드리지 않음.

✅ R5 3차 wave 머지 완료:

- EvolveMementoPanel RecordChips: primitive normalization 완료, merge commit `f842919` (`#190`). reinforcement / generic RecordChips / fusion view rank chip 이 `StatusBadge` 로 치환됨. `persons` / `semantic` 의 기존 violet 계열 tone 은 `muted` 로 흡수된 의도적 normalization.
- CommandPalette verb chip: primitive normalization 완료, merge commit `0ab08d6` (`#191`). entry verb inline chip 만 `StatusBadge` 로 치환됨. full v0 CommandPalette port 는 아님; `cmdk`, Dialog 구조, `AvatarWithStatus` 는 미도입.
- Stage3DebateTable avatar / pill / relay badge: primitive normalization 완료, merge commit `6da8d7c` (`#192`). DebateRoundCard avatar 는 `AvatarWithStatus` 첫 적용 surface 이며, DECISION / Pill / AgentRelay kind badge 는 `StatusBadge` 로 치환됨. `status` prop 미사용, initials 1자 -> 2자 변경, `roleColorFromRole(agentName)` fallback 은 follow-up note.

Release-note 의미축 정정:

- `objection`: `destructive` -> `warning`
- `coding_impact`: `warning` -> `muted`

Operational note:

- Grok 2 branch rebase precondition 누락으로 `#182` 가 `#183` diff 를 흡수했으나, main rebase + non-tmux scope cleanup 후 정상 머지됨.
- 다음 cascade worker 는 branch rebase precondition (`git fetch origin && git rebase origin/main`, PR body `branched off main @ <SHA>`, scope claim == `git diff main --stat`) 을 강제한다.
- PR body 는 `v0 fidelity` / `primitive normalization` / `design judgment` / `FROZEN` 판정을 구분해야 한다.
- docs-only PR 과 code PR 은 역할을 분리한다.

Current remaining Stage 1b candidates:

| Surface | 판정 | 이유 | 다음 진입 조건 |
|---|---|---|---|
| `CommandPalette` full v0 port | TODO / design judgment needed | `#191` 로 verb chip 은 완료됐지만 v0 CommandPalette 는 cmdk/agent-palette 구조, 현재 repo 는 verb-command palette 구조. 단순 치환 금지. | 구조/데이터 흐름 판정 후 진행 |
| `AvatarWithStatus` broader adoption | TODO / design judgment needed | `#192` 로 첫 적용 surface 는 생겼지만 현재 `AgentAvatar` 는 protocol-aware component. | `AgentAvatar` 공존/대체 정책 합의 |
| `ConversationWorkbench` | FROZEN | `#166/#169/#173/#178` conversation stack 과 v0 5-file 구조 분해 설계 미합의. | stacked train 정리 + component split 설계 합의 |
| `#157` dropdown/collapsible primitive | 별도 infrastructure PR | Radix dropdown/collapsible dependency + primitive 추가 라인. Stage 1b chip cascade 와 분리. | #157 리뷰/merge train 에서 별도 처리 |
| conversation stack `#166/#169/#173/#178` | 별도 순차 처리 | Conversation shell/workbench/right-rail stacked PR 라인. | merge order 재검증 후 진행 |

> **목적**: v0 mockup 에 없거나 v0 의 단순 레이아웃에 들어가지 않는 우리만의 기능들을 기록. 나중에 별도 진입점 (right-click context, sub-page, drawer 등) 에서 재도입할 자리를 찾을 때 참고.
> **갱신 규칙**: v0 port PR 에서 "이 기능은 v0 에 없어서 뺐다" 할 때마다 여기에 한 줄 추가.

---

## 카테고리

- 🔵 **포기** — 기능 자체를 들어내도 손해 없음
- 🟡 **이동** — UI 자리만 옮길 예정 (right-click menu / sub-page / drawer 등)
- 🔴 **재진입 필수** — 데이터/콜백이 이미 있어서 반드시 표면화 필요

---

## EvolveMemento panel (PR #143)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| Relations drawer (memory 관계 그래프) | 🟡 | v0 는 Recall Trace 만 1 drawer. relation 데이터는 인스펙터에 살아있음. | Memento sub-page 또는 right-click "관계 보기" |
| Reflect drawer (중복/모순/stale issues) | 🟡 | v0 는 Reflect 없음. 데이터는 인스펙터에 살아있음. | Memento sub-page 의 "정리" 탭 |
| Records drawer + activate/pin/forget actions | 🔴 | v0 read-only. activate/pin/forget callback 은 호스트가 여전히 전달함. | right-click context menu on Recall Trace row · 또는 Records sub-page |

## Conversation page (PR #144)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| Agent dropdown rich layout (AvatarWithStatus + StatusBadge + 그룹별 메뉴) | 🟡 | DropdownMenu primitive 미설치. 현재 native `<select>` 로 대체. | `@radix-ui/react-dropdown-menu` 도입 후 본격 dropdown |
| Branch experiment 컨트롤 (분기 / 채택) | 🔵 | v0 mockup 에 없음. 현재 Action Strip 에 유지. | 그대로 유지 |
| Telegram import | 🔵 | v0 에 없음. Action Strip 에 유지. | 동상 |
| ContextPack tier toggle (Lite/Standard/Full) | 🔵 | v0 header chips 에 자리 부족. 현재 header 우측 chip 으로 유지. | 동상 |
| Inline DelegationPanel | 🟡 | v0 에 직접 없지만 우리만의 핵심. message thread 위에 inline panel 로 carry. | 그대로 유지 |
| Inline ApprovalQueuePanel | 🟡 | v0 의 별도 ApprovalQueue 컴포넌트와 의미는 같지만 위치 다름. v0 는 하단 collapsible. 우리는 message thread 위에 + 하단에 둘 다. | 하단 strip 으로 점진 통합 |

## Debate page (PR #145)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| Provenance pills (수용/기각/근거/코딩/decision) | 🔴 | v0 mockup 의 round-card 에 없음. design-decisions §7 의 핵심. round-card footer 에 carry. | 그대로 유지 — v0 의 단순 footer 대신 우리 확장 footer |
| parent reference row (parentUtteranceId) | 🔴 | v0 에 없음. §7 의 핵심. | 동상 — round-card 안 별도 row 로 carry |
| DECISION badge | 🔴 | v0 에 없음. §7 의 결정 노드 강조. | 동상 — round-card border + badge |

## Tmux page (PR #146)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| Orchestrator recommendation strip (난이도 / score / recommended roles) | 🟡 | v0 에 없음. tmux 가 본격 가동되면 가치 큼. 현재 header 아래 strip 으로 유지. | 그대로 유지 — v0 의 단순 header 와 공존 |
| TerminalTimelineBlock per-pane Warp timeline | 🔴 | v0 mockup 에 없음. Stage 2-6 의 핵심 산출물. pane card 안에 carry. | 동상 — card 하단 collapsible section |

## Agents sidebar (PR #147)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| §2 3-tier lane (active / standby / specialist drawer) | 🟡 | v0 는 category (Core/Specialists/Companions) 그룹화. 우리 "지금 일하는 agent 강조" 컨셉은 더 동적이지만 v0 layout 에 없음. | active lane 만 sidebar 상단 sticky strip 으로 부활 검토 |
| §2 7-state vocabulary dot tone (gated / waiting_approval / watch_only / blocked) | 🟡 | v0 의 단순 status dot 으로 축소. 7 state 매핑 helper 는 코드에서 빠짐. | data plumbing 완성 시 dot 색상에 다시 매핑 |
| AgentSidebarCard 의 풍부한 controls (provider/model 양쪽 dropdown + 양쪽 chevron) | 🔴 | v0 는 단일 model dropdown 만. 우리는 provider+model 둘 다 필요. carry. | 그대로 유지 |
| Specialist drawer 의 compact density | 🔵 | v0 의 collapsible Companions 그룹으로 대체. compact density 모드는 빠짐. | 필요 시 dense mode 토글로 |

## Control Queue drawer (PR #148)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| 우측 슬라이드 overlay drawer (⌘⇧A 호출) | 🔴 | v0 mockup 은 Debate view bottom strip 만. 우리 ⌘⇧A overlay 는 §6 의 핵심 — keyboard 호출 가능 surface. | 그대로 유지 |
| 4 disabled lane (ask / edit / delegate / block) | 🟡 | schema 대기. visual 만 그려놓음. | protocol handoff schema 도입 후 활성 |

Stage 1b note: `#184` 에서 lane chip label 은 `StatusBadge` 로 primitive normalization 완료. drawer 구조 / lane order / keyboard handler 는 보존.

## Command Palette (PR #149)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| `cmdk` 패키지 미사용 | 🔵 | v0 는 cmdk 의 fuzzy filter / arrow nav 사용. 우리는 useState + substring 으로 충분. | npm dep 늘리지 않음 |
| Cheat Sheet overlay (`?` shortcut) | 🔴 | v0 에 없음. 학습용 별도 modal. 우리만의 추가 surface. | 그대로 유지 |

Stage 1b note: `#188` 은 `CheatSheetOverlay` 만 primitive normalization 했고 `CommandPalette` 는 건드리지 않음. `CommandPalette` 는 TODO / design judgment needed 로 유지.

Stage 1b note: `#191` 은 `CommandPalette` entry verb chip 만 primitive normalization 했음. full v0 CommandPalette port 는 여전히 design judgment needed 로 유지.

## Top nav / status bar (PR #150)

| 기능 | 범주 | 이유 | 재진입 후보 |
|---|---|---|---|
| Mode switching (Conversation / Debate / Tmux) 의 top nav 통합 | 🟡 | v0 의 TopNav 중앙에 있음. 우리는 board-toolbar 에 분리 보유. App.tsx 큰 refactor 필요. | App shell layout refactor 별도 PR |
| Logo / brand block ("AI Orchestrator Lab" + "desktop command room") | 🔵 | v0 의 좌측 brand 영역. 우리 layout 에 자리 없음 (좌측 nav rail 이 차지). | 좌측 nav rail 의 brand-block 으로 carry 중 |
| ⌘K trigger button | 🟡 | v0 의 우측 Command button + ⌘K kbd. 우리는 toolbar 우측 ghost button 으로. | top nav refactor 와 함께 |

Stage 1b note: `#185` 에서 `RuntimeStatusBar` StatusRow/StatusDot 계열은 `StatusBadge` 로 primitive normalization 완료. HealthIndicator popover 구조는 보존.

## Tmux swarm / rail / cheat sheet Stage 1b notes

| Surface | 상태 | 비고 |
|---|---|---|
| `TmuxSwarmBoard` | ✅ primitive normalization 완료 (`#186`) | gate chip + role/status elements 중심. v0 fidelity 로 분류하지 않음. |
| `BackupRailMenu`, `ChannelRailPanel`, `ProjectRailPanel` | ✅ primitive normalization 완료 (`#187`) | repo 고유 rail status surfaces. |
| `CheatSheetOverlay` | ✅ primitive normalization 완료 (`#188`) | repo 고유 surface. `CommandPalette` 미접촉. |

---

## 메모

- 이 ledger 는 **stale 되면 안 됨**. v0 port PR 추가 시 PR 본문에서 "deferred features" 섹션을 만들고 여기에 옮겨 적기.
- 각 항목은 **재진입 후보 위치** 를 적어둘 것 — 나중에 "어디서 표면화하지?" 결정 시간 절약.
- 🔴 (재진입 필수) 가 가장 우선. UI 가 영구히 잃어버리면 안 되는 기능들.
- 🔵 (포기) 도 의도적인 결정 — "v0 가 안 만든 데 우리도 굳이 안 만든다" 합의.
