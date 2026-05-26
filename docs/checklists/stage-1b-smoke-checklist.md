# Stage 1b Smoke Checklist

기준 SHA: `5524d3e1` (`#182` squash merge, full SHA `5524d3e1467f143acdd5ae01896362b0ac9a2df5`)

## 사전 조건 (cascade worker MUST 확인)

1. `git fetch origin && git rebase origin/main` 실행
2. PR body 첫 줄에 `branched off main @ <current main SHA>` 명시
3. PR body 의 scope claim 과 실 diff (`git diff main --stat`) 가 1:1 일치 확인
4. typecheck / build green
5. 위반 시 자동 reject

## R5 Stage 1b 1차 wave

| Surface | PR | Status | Smoke check |
|---|---:|---|---|
| DebateRoundCard tag chip | `#183` (`a81c1d1`) | ✅ merged | Debate tag chips render through `StatusBadge`; `objection: destructive -> warning`, `coding_impact: warning -> muted` |
| AgentCard Primary badge | `#183` (`a81c1d1`) | ✅ merged | AgentCard Primary uses `StatusBadge`; primitive normalization, exact v0 fidelity 아님 |
| TmuxPaneCard status chip | `#182` (`5524d3e1467f143acdd5ae01896362b0ac9a2df5`) | ✅ merged | Final product scope = `TmuxPaneCard.tsx` only; status chip uses `StatusBadge` |

## Removed stale gates

- F10 gate 후 대기 문구 제거: Stage 1b 1차 wave 는 `#183` + `#182` 머지로 완료됨.
- `#182` / `#183` 상태는 진행 중이 아니라 ✅ merged.
- `#182` cleanup commits `27cce79`, `58e0d38` 는 scope 정리용이며 제품 변경 아님.

## Worker branch rebase precondition

- Grok 2 운영 사고: `grok/stage1b-tmux-conversation-primitives` 가 main 이 아니라 `grok/stage1b-debate-agent-statusbadge` 에서 분기해 `#183` diff 를 흡수함.
- 다음 cascade worker 는 새 branch 시작 전 반드시 branch rebase precondition 을 체크한다.
- PR 생성 전 `git diff main --stat` 출력과 PR body scope claim 이 다르면 push/PR 생성 중단.

## Remaining Tier 1 cascade candidates

- `CheatSheetOverlay`
- `ControlQueueDrawer` lane chip
- `TmuxSwarmBoard`
- `EvolveMemento` RecallTrace
- `CommandPalette`
- `RuntimeStatusBar`
- `ConversationWorkbench` frozen until stacked train and component split design are settled.