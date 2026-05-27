# Stage 1b Smoke Checklist

기준 SHA: `b9ee832` (`#164` merge, Stage 1b 기준 마지막 UI merge = `#192` / `6da8d7c5f0473df885f39b642bee481489bbab2a`)

## 사전 조건 (cascade worker MUST 확인)

1. `git fetch origin && git rebase origin/main` 실행
2. PR body 첫 줄에 `branched off main @ <current main SHA>` 명시
3. PR body 의 scope claim 과 실 diff (`git diff main --stat`) 가 1:1 일치 확인
4. PR body 에 `v0 fidelity` / `primitive normalization` / `design judgment` / `FROZEN` 판정 명시
5. docs-only PR 과 code PR 역할 분리
6. typecheck / build green
7. 위반 시 자동 reject

## R5 Stage 1b 1차 wave

| Surface | PR | Status | Smoke check |
|---|---:|---|---|
| DebateRoundCard tag chip | `#183` (`a81c1d1`) | ✅ merged | Debate tag chips render through `StatusBadge`; `objection: destructive -> warning`, `coding_impact: warning -> muted` |
| AgentCard Primary badge | `#183` (`a81c1d1`) | ✅ merged | AgentCard Primary uses `StatusBadge`; primitive normalization, exact v0 fidelity 아님 |
| TmuxPaneCard status chip | `#182` (`5524d3e1467f143acdd5ae01896362b0ac9a2df5`) | ✅ merged | Final product scope = `TmuxPaneCard.tsx` only; status chip uses `StatusBadge` |

## R5 Stage 1b 2차 wave

| Surface | PR | Status | Smoke check |
|---|---:|---|---|
| ControlQueueDrawer lane chip | `#184` (`29a5cde`) | ✅ merged | Lane label chip uses `StatusBadge`; v0 대응 surface 없음; drawer / lane order / keyboard handler 보존 |
| RuntimeStatusBar status rows | `#185` (`867dae6`) | ✅ merged | StatusRow/StatusDot 계열 uses `StatusBadge`; HealthIndicator popover 구조 보존 |
| TmuxSwarmBoard status elements | `#186` (`6e581fd`) | ✅ merged | Gate chip + role/status elements use `StatusBadge`; primitive normalization, v0 fidelity 로 과장하지 않음 |
| Rail status surfaces | `#187` (`84c5373`) | ✅ merged | `BackupRailMenu`, `ChannelRailPanel`, `ProjectRailPanel` status surfaces use `StatusBadge`; repo 고유 rail normalization |
| CheatSheetOverlay status chips | `#188` (`310e38d`) | ✅ merged | Shortcut priority chip uses `StatusBadge`; `CommandPalette` 미접촉 |

## R5 Stage 1b 3차 wave

| Surface | PR | Status | Smoke check |
|---|---:|---|---|
| EvolveMementoPanel RecordChips | `#190` (`f842919`) | ✅ merged | reinforcement / generic RecordChips / fusion rank chip use `StatusBadge`; `persons` / `semantic` violet tone is intentionally normalized into `muted` |
| CommandPalette verb chip | `#191` (`0ab08d6`) | ✅ merged | Entry verb chip uses `StatusBadge`; full v0 CommandPalette port 아님; cmdk/Dialog/AvatarWithStatus 미도입 |
| Stage3DebateTable avatar / Pill / relay badge | `#192` (`6da8d7c`) | ✅ merged | Debate avatar uses `AvatarWithStatus` first adoption surface; DECISION / Pill / AgentRelay kind badge use `StatusBadge`; status prop unused; initials 1자 -> 2자 |

## Removed stale gates

- F10 gate 후 대기 문구 제거: Stage 1b 1차 wave 는 `#183` + `#182` 머지로 완료됨.
- `#182` / `#183` 상태는 진행 중이 아니라 ✅ merged.
- `#182` cleanup commits `27cce79`, `58e0d38` 는 scope 정리용이며 제품 변경 아님.
- `ControlQueueDrawer`, `RuntimeStatusBar`, `TmuxSwarmBoard`, rail status surfaces, `CheatSheetOverlay` 는 잔여 후보가 아니라 ✅ merged 상태.
- `EvolveMementoPanel` RecordChips, `CommandPalette` verb chip, `Stage3DebateTable` avatar/Pill/relay badge 는 잔여 후보가 아니라 ✅ merged 상태.

## Worker branch rebase precondition

- Grok 2 운영 사고: `grok/stage1b-tmux-conversation-primitives` 가 main 이 아니라 `grok/stage1b-debate-agent-statusbadge` 에서 분기해 `#183` diff 를 흡수함.
- 다음 cascade worker 는 새 branch 시작 전 반드시 branch rebase precondition 을 체크한다.
- PR 생성 전 `git diff main --stat` 출력과 PR body scope claim 이 다르면 push/PR 생성 중단.
- PR body 에 `v0 fidelity` / `primitive normalization` / `design judgment` / `FROZEN` 판정을 구분해서 쓴다.
- docs-only PR 과 code PR 을 섞지 않는다.

## Remaining Stage 1b candidates

- `CommandPalette` full v0 port — TODO / design judgment needed. `#191` 로 verb chip 은 완료됐지만 v0 CommandPalette 구조와 현재 repo verb-command 구조가 달라 단순 치환 금지.
- `AvatarWithStatus` broader adoption — TODO / design judgment needed. `#192` 로 첫 적용 surface 는 생겼지만 `AgentAvatar` 는 protocol-aware component 이므로 무단 교체 금지.
- `ConversationWorkbench` — FROZEN until `#166/#169/#173/#178` conversation stack and component split design are settled.
