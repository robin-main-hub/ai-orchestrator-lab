# 98 — UX 스프린트: 승인 toast · HUD 조건부 · 빈대화 힌트 · 토론 리사이저 · 안전 헤더

외부 UX 제안(7건 + 토론 리사이저)을 **실제 코드베이스에 대조해 어댑트**한 스프린트. 외부 코드는
채팅 텍스트(디스크 미존재)라 전부 실 타입/심볼과 대조 후 반영. **검증 과정에서 다수가 이미
구현돼 있음을 발견** — 정직하게 스킵하고, 진짜 새 것만 착지했다.

## 외부 제안 결산 (검증 후)

| 제안 | 실제 | 결과 |
| --- | --- | --- |
| 승인 toast bar | 새것 | ✅ 착지(+버그 2건 수정) |
| HUD 조건부 표시 | 새것 | ✅ 착지(어댑트) |
| 빈 대화 맥락 힌트 | 새것 | ✅ 착지 |
| 토론 상/하단 리사이저 | 새것 | ✅ 착지 |
| 헤더 컴팩트 → 안전판 | 일부 새것 | ✅ 조건부 경고 배너만(전면교체는 기능손실이라 회피) |
| 에이전트 뷰 lazy | **이미 lazy**(activeAgentDetailPanel 조건부) | ⏭️ 스킵 |
| 대시보드 hero | **이미 존재**(`dashboard__next`+`deriveCockpitHealthRollup`, 디자인 2탄) | ⏭️ 스킵 |

## 착지

- **승인 toast bar**(전역 단일 승인 액션 표면, 결정 A): `deriveApprovalToastItem` + `ApprovalToastBar`
  + Connector, App.tsx 셸 배선. 대기 승인이 있을 때만 하단에 떠서 원터치 허용/거절/이력.
- **HUD 조건부**(`shouldShowUsageHud`): 턴 진행 중이거나 컨텍스트 80%+일 때만 UsageHudChip.
  `ConversationUsageSummary`에 `lastTurnCompletedAt`이 없어 5초 잔상은 순수함수에만(미배선).
- **빈 대화 힌트**(`deriveEmptyConversationHint`): 공급자/승인/기억 상태별 한 줄, 승인은 toast를
  가리키기만. MessageThread `EmptyConversation`에 chip.
- **토론 리사이저**(`verticalSplitResize` + `VerticalSplitResizer`): ChatSidePanel 좌우 리사이저의
  수직판(드래그 + ↑↓ + localStorage). `Stage3DebateTable`의 헤더+타임라인만 **정밀 wrap**(전체 파일
  교체 안 함), footer는 고정 유지.
- **안전 헤더**(`deriveConversationHeaderAlert`): "상태 요약" Popover 제거 → 문제 있을 때만 헤더 아래
  1줄 경고 배너(공급자/승인/오류). 에이전트 popover·프로필·실행·분기·roster 바로가기 전부 보존.

## 외부 코드 버그 수정 (실 타입 대조)

- `tmux_dispatch`는 `PermissionAction`이 아니라 **`ApprovalReplayKind`** → 실행형 승인 판정을
  `replayKind==="tmux_dispatch" || action==="terminal_run"`로 교정.
- **적대적 리뷰가 잡은 HIGH(정직성)**: `ApprovalQueueItem`엔 실제 명령 미리보기 필드가 없다.
  summary는 명령이 아니라 사람용 라벨("터미널 실행 · 사유" / "terminal_run from agent")인데,
  toast가 이를 monospace 명령줄로 보여주고 **"계열" 버튼이 그 가짜 문자열을 세션 자동승인
  prefix 목록에 주입**했다(보안·정직성 위반). → **command 필드·monospace 줄·계열 버튼 전부 제거**.
  진짜 명령을 가진 StreamingDraftBubble 경로에만 "계열 허용"을 둔다. 가짜 fixture로 버그를
  가리던 테스트도 실제 production summary로 교정.
- dead code 정리(상태요약 popover 제거 후 orphan된 `headerMemoryLabel`/import/`Archive` 아이콘).

## 검증

desktop typecheck 그린 · desktop **1209 passed**. 적대적 4-차원 리뷰(honesty/decision-A·통합 안전·
커버리지) → 확정 7건 전부 수정(HIGH 2 + MEDIUM 2 + LOW 3). docs/98.
