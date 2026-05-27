# v0 Visual QA Checklist

## 1. 목적
- Conversation stack 및 v0 interface 1차 이식 결과를 브라우저에서 검수하기 위한 체크리스트
- 대상: Conversation / AgentsSidebar / CommandPalette / AgentSettingsPanel / Debate / Tmux / Runtime

## 2. 사전 조건
- latest main 기준 실행
- PR #157 / #166 / #169 / #173 / #178 merge 이후 기준
- 가능하면 PR #194 merge 이후 AgentSettingsPanel까지 확인
- dev server 또는 desktop preview 실행 (`npm run dev` 또는 `pnpm dev`)

## 3. 화면별 체크리스트

### Conversation mode
- **left rail 숨김**: Conversation 모드 활성화 시 left-rail 영역이 화면에서 완전히 숨겨지는가 (`shell-surface-hidden` 클래스 부여 확인)?
- **TerminalDock 숨김**: 하단 TerminalDock 영역이 완전히 사라지고 공간을 차지하지 않는가?
- **WorkItemHandoffPanel / CodingPacketPanel / EvolveMementoPanel 숨김**: 보조 작업 패널과 메모리 동기화 패널이 정상적으로 숨김 처리되는가?
- **center board 확장**: left-rail과 다른 패널들이 숨겨짐에 따라 center-board 영역이 좌측으로 확장되어 더 넓은 가로폭을 확보하는가?
- **action row 위치**: 대화 기록 하단, composer 위에 위치하는 ActionStrip(토론 전환, 패킷 생성, 실행 슬롯 버튼 등)이 일관된 여백을 가지고 위치하는가?
- **composer 위치**: 입력창 영역(Composer)이 대화방 가장 밑바닥에 오프셋 정렬 문제 없이 안정적으로 고정되는가?
- **right rail 폭**: 대화 모드(configLibraryActive가 비활성화된 상태)에서 right-rail 너비 변수가 명세에 맞게 `--conversation-right-rail-width: 390px`로 잘 렌더링되는가?
- **right rail 최소/최대 폭**: 창 크기를 조절할 때 right-rail 너비가 최소 360px에서 최대 420px 범위를 유지하는가?
- **mode 전환 회귀 없음**: Conversation 모드와 다른 모드 간 왕복 전환 시 화면 깜빡임 후 컴포넌트가 깨지거나 잘못 마운트되는 회귀 버그가 없는가?

### AgentsSidebar / right rail
- **Collapsible 동작**: 사이드바 내부 섹션 접기/펼치기 조작 시 부드럽게 개폐되며, 화살표 아이콘 방향이 트리거 상태에 따라 알맞게 바뀌는가?
- **provider/model DropdownMenu 열림**: right rail의 각 AgentCard 내 provider/model DropdownMenu를 클릭했을 때 팝업 메뉴가 레이아웃 어긋남 없이 알맞게 표시되는가?
- **provider/model 선택 콜백**: DropdownMenu에서 다른 provider 또는 model을 선택했을 때 콜백 함수가 즉각 작동하여 할당 정보가 업데이트되는가?
- **active/busy item 표시**: 사이드바 리스트에서 활성화(active)된 봇이나 현재 처리 중(busy)인 에이전트가 시각적으로 명확히 대조/강조되는가?
- **in-use / prepare StatusBadge 위치**: 활성화 배지(in-use) 및 준비 중 배지(prepare)가 텍스트와 정렬이 맞고 우측에 정상 노출되는가?
- **truncation**: 사이드바 너비를 줄였을 때 에이전트 이름이나 모델명이 넘쳐나지 않고 말줄임표(`...`)로 말끔히 truncate 처리되는가?
- **arrow button 동작**: 모델 리스트 좌우 스크롤을 위한 이동 화살표 버튼 클릭 시 model window start index가 알맞게 조절되는가?

### CommandPalette
- **entry.verb StatusBadge 표시**: 명령어 아이템 왼쪽의 Verb(예: SWITCH, OPEN, MEMORY)가 StatusBadge (variant="primary", size="sm") 형태의 대문자 고정폭 텍스트로 또렷하게 표시되는가?
- **keyboard navigation**: 방향키(위/아래) 입력에 맞게 포커스 링 또는 배경 선택 반전 표시가 부드럽게 움직이는가?
- **search filtering**: 명령어 입력창에 텍스트 타이핑 시 label 및 hint 매칭을 기준으로 실시간 목록 필터링이 잘 수행되는가?
- **command execution**: 명령어 클릭 또는 `Enter` 실행 시 연결된 모드 변경 및 상태 전환 기능이 문제없이 수행되는가?
- **close behavior**: 실행 후 혹은 ESC 키를 누르거나 마우스 바깥 영역 클릭 시 명령 팔레트 모달이 흔적 없이 자동으로 잘 닫히는가?

### AgentSettingsPanel
- **role DropdownMenu 열림**: 상세 설정 패널 내의 역할(Role) 선택 DropdownMenu가 스크롤 영역을 침범하지 않고 정상적으로 열리는가?
- **role 변경 반영**: 역할을 변경했을 때 상위 데이터 모델(`onUpdateAgent`)에 즉시 반영되고 다른 컴포넌트들에서도 바뀐 역할로 갱신되는가?
- **active 표시**: 수정하고 있는 에이전트의 대형 아바타와 이름이 헤더 영역에 active 상태를 보여주며 강조 렌더링되는가?
- **AutonomySlider 회귀 없음**: 자율성 레벨(Autonomy Level 1~5) 슬라이더 조작 인터랙션이 부드럽게 연동되며, 레벨 설명 텍스트가 정상 노출되는가?
- **avatar upload / clear avatar 회귀 없음**: 프로필 사진 업로드 시 base64 data URL로의 변환 및 저장(`onUploadAvatar`)이 잘 진행되며, 초기화(`onClearAvatar`) 버튼 클릭 시 원래의 이니셜 상태로 깨끗이 복구되는가?

### Debate / Stage3
- **AvatarWithStatus 표시**: 토론 라운드 카드 내에서 발언 주체 에이전트의 아바타가 AvatarWithStatus 컴포넌트로 올바른 테두리 색상(역할별 `roleColorFromRole`)과 상태 아이콘을 동반하여 렌더링되는가?
- **Pill / DECISION / relay badge 표시**: 토론 하단의 Provenance Pill들과 의사결정(`DECISION`) 정보 배지, 그리고 릴레이 배지가 올바른 컬러 배색과 적정 여백으로 표시되는가?
- **card collapse/expand 회귀 없음**: 토론 카드의 접기/펼치기 버튼 클릭 시 애니메이션과 함께 부드럽게 확장/축소되고 에러 없이 구동되는가?

### Tmux / Runtime
- **TmuxSwarmBoard 그리드 정렬**: Tmux 모드 진입 시 right-rail이 사라지고 중앙의 TmuxSwarmBoard가 여러 대의 실행 슬롯 카드 그리드로 화면 전체에 균등하게 분할 배치되는가?
- **RuntimeStatusBar 상태 표시**: 데스크톱 헤더의 시스템 상태 바에서 DGX 및 로컬 모델 상태 점(`StatusDot`)과 StatusBadge가 현재 온라인/오프라인/경고 상태값에 부합하는 시각 톤(success, danger, warning, muted)으로 채색되는가?
- **Probe/Reboot interaction**: Probe 버튼 클릭 시 갱신 콜백이 돌고, Reboot Watchdog 영역 클릭 시 디바이스 제어 콜백이 올바른 다이얼로그 경고와 함께 연동되는가?

## 4. 즉시 수정해야 할 문제 (Blockers)
- **white screen / runtime crash**: 모드 전환 또는 버튼 인터랙션 중 UI가 터져 하얀 화면만 남거나 런타임 크래시가 발생하는 현상.
- **mode switch layout break**: Conversation ↔ Debate ↔ Tmux 모드를 단축키나 팔레트로 이동할 때 레이아웃 구조가 겹치거나 왜곡되는 문제.
- **dropdown positioning bug**: DropdownMenu 클릭 시 팝업 창이 멀리 떨어져서 뜨거나 화면 바깥으로 나가버려 보이지 않는 렌더링 버그.
- **hidden surface not hidden**: 숨겨져야 할 left-rail, TerminalDock, 혹은 보조 패널들이 대화방 모드 전환 후에도 화면에 잔상이나 빈 공간으로 남아있는 문제.
- **callback not firing**: 설정 변경, 역할 전환, 아바타 업로드 등 클릭 시 내부 이벤트 바인딩이 호출되지 않아 갱신이 누락되는 현상.

## 5. Design judgment로 넘길 문제 (UI/UX Polishing)
- **rail width 세부 조율**: right-rail의 너비(360px ~ 420px) 중 어떤 너비가 가장 시각적으로 균형 잡혔는지 세부 픽셀 너비 조율.
- **StatusBadge 색상 대비**: 다크 모드와 라이트 모드 상태에서 StatusBadge들의 텍스트 명도 대비 및 보더 컬러 조율.
- **AutonomySlider 디자인**: 슬라이더 트랙의 두께, 마커 위치 및 각 단계별 한글/영문 힌트 텍스트 레이아웃 세부 튜닝.
- **AvatarWithStatus 적용 범위**: 사이드바 및 대화방 내부에서 봇의 상태(online/offline/busy)를 나타내는 아바타의 세부 보더 두께 및 정렬.
- **CommandPalette full v0 port**: 단축키와 커맨드 목록 외에 v0의 전체 검색 및 필터링 시각 요소를 완벽히 채우는 미적 튜닝.

## 6. QA 결과 보고 템플릿
```text
화면:
문제:
재현 방법:
기대 동작:
실제 동작:
심각도:
추천 담당:
스크린샷/녹화:
```
