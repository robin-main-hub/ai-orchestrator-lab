# 60 — Tmux 스웜 보드 2열 그리드 + pane별 인라인 입력 (UX 개선 #5)

스웜 보드는 좌측 aside(380px)에 pane 10개를 세로로 길게 나열하고, 우측에 선택 pane
상세를 띄웠다. 목록↔상세 시선 이동이 멀고, 명령 입력은 맨 아래 하나뿐이라 pane을
바꿀 때마다 입력 컨텍스트가 끊겼다.

## 그리드 + 인라인 입력 (회귀 0)

- **2열 그리드**: 좌측 380px 세로 목록을 `grid grid-cols-2`(모바일 1열) pane 카드
  그리드로 압축. 10개가 5×2로 한눈에.
- **선택 pane 풀와이드 하단**: 좌우 분할을 위(그리드)/아래(상세) 분할로 — 선택 pane
  상세(`TmuxPaneDetail`: 출력·타임라인·승인 게이트)를 그리드 아래 풀와이드로
  (VSCode 터미널 패턴). 시선 이동이 짧아진다.
- **pane별 인라인 입력**: 각 `TmuxFleetRow` 카드 안에 명령 입력(Terminal + input +
  읽기/전송)을 이식. pane을 전환해도 그 pane의 입력이 카드에 그대로 남아 컨텍스트가
  끊기지 않는다. 입력이 카드로 갔으므로 풀와이드 상세의 입력은 `showComposer={false}`로
  꺼 중복을 막았다.

## 구현 메모

- pane 단위 핸들러(`handleDispatchPane`/`handleCapturePane`/`updateCommandDraft`)와
  roleKey 기준 상태(`commandDrafts`/`statuses`/`outputs`/`timelineBlocks`)가 이미 부모
  (App)에서 끌어올려져 있어, 카드 인라인 입력으로 옮겨도 상태 구조 변경 불필요.
- `TmuxFleetRow`를 `button` → `div`(카드)로: 상단 선택 버튼 + 하단 인라인 입력.
  버튼 안에 input을 중첩하는 잘못된 마크업을 피한다.
- 전용 CSS 없음(Tailwind 유틸 + os-* 애니메이션 재사용). TmuxSwarmBoard.test.ts는
  로직 헬퍼만 검사 → 레이아웃 리팩터에 안전. typecheck·빌드·전체 1118 그린.

## 다음

#6 네비 아이콘 레일 + 모드/nav 단일축 · #7 마이크로 인터랙션.
