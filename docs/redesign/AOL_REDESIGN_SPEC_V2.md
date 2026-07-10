# AOL 리디자인 v2 스펙 (통합 정본)

- 기준: main @ f61b13d, 대상 `apps/desktop/src`. v1 정본(홈 미션컨트롤 PR#1095, 목표 루프 living-telemetry PR#1096, styles.css 토큰)을 상속한다.
- 지위: 이 문서가 v2 구현의 단일 정본이다. 뷰별 설계안 초안과 이 문서가 어긋나면 이 문서를 따른다. v1 스펙 §4의 "REFLECORE 히어로·소환진·도감 제거(코스프레 정리)" 프레임은 2026-07-10 사용자 확정으로 폐기됐다.
- 계약 경계: 서버 API·스토어 키·엔진/런타임 시그니처 불변이 기본. 예외는 §1.4에 전수 등재한다.

## §0-A 사용자 최우선 지침 (2026-07-10 추가 확정 — 이 절이 다른 모든 절에 우선)

- **오타쿠적 요소(캐릭터·페르소나·아바타·게임적 연출과 언어)는 이 프로그램의 가장 중요한 핵심이다.** 어떤 슬라이스에서도 생략·축소·"나중에" 미루기 금지. 트레이드오프가 생기면 다른 복잡성을 깎아서 페르소나 요소를 지킨다.
- **과잉 복잡성은 생략 가능**: 스펙의 비-페르소나 항목(세부 마감, 부수 상호작용, 엣지 상태 장식 등)이 구현 중 과도하게 복잡하다고 판단되면 단순화해도 된다(PR 본문에 단순화 내역 명시). 단 아래는 단순화 대상이 아니다: U1 프리미티브(PersonaChip 포함), U3 vitals 실데이터 바인딩, §3.5 HOME-P, 각 뷰의 페르소나 슬라이스(PER-*·DEB-3·TMX-4·THR-4·CKP-C·INB-D·RUN-3·CONV 수행 서명), 신원/표정 일관성 시나리오(§6), append-only 감사 기록.
- 우선순위 서열: **페르소나 가시성 > 살아있는 텔레메트리 > 레이아웃 정리 > 기타 마감.**

## §0-B 설정파일(config_files) 뷰 특별 지침 (2026-07-10 사용자 확정 — 이 뷰에 한해 §2 해당 절보다 우선)

사용자가 이 페이지를 "특히 지저분하다"고 지목. 원칙: **최소화·간단명료 — 필수 기능만 남기고, 다른 뷰에 있거나 크게 중요하지 않은 것은 전부 생략한다.**
- **남길 것(필수)**: 설정파일 목록(SOUL/AGENTS/기억정책/템플릿) + 선택 파일 에디터(라벨·본문 중심, 경로/범위/태그는 접힘·보조), 파일 상태 배지 1개("앱 내장·디스크 미반영" 같은 상태를 단일 명료 표기), 팩 적용(간결 카드), **이 파일을 쓰는 캐릭터 표시(PersonaChip — 페르소나 가시성 §0-A 준수, 이 뷰에서도 캐릭터는 보여야 함)**.
- **뺄 것(다른 뷰 소관·비필수)**: 터미널/실행 로그 스트립과 상태 카드들(perm-queue·runtime·DGX 연결·금고 등 — tmux/관제판 소관), 우측 에이전트 로스터 패널 전체(agents 뷰 소관 — 단 파일별 소비 캐릭터 칩으로 페르소나 프레즌스는 유지), 장황한 규칙 안내 문구 나열(충돌 규칙 등은 해당 입력 옆 한 줄 힌트로), 기타 이 화면의 과업(설정파일 관리)과 무관한 위젯 일체.
- 레이아웃: 2패널(좌 파일 리스트 / 우 에디터) + 간결 헤더. CFG-A~E 슬라이스는 이 지침에 맞게 축소·병합 가능(큐 접촉 규칙은 유지).

## §1 공통 원칙

### 1.1 v1 상속 (재확인)

- 토큰: `--bg #0B1120 / --surface #0F172A / --surface-2 #16203A / --border rgba(148,163,184,.14) / --fg #F1F5F9 / --fg-muted #94A3B8 / --accent #22C55E / --accent-dim rgba(34,197,94,.14) / --destructive #EF4444 / --warning #F59E0B(상태 의미만) / --radius 12px`. 정본은 styles.css `:root`, tokens.css는 미러.
- z-scale 4단만: base 0 / rail 20 / topbar 30 / dialog 50. 신규 오버레이는 이 4단 중 하나.
- 타이포: Space Grotesk, 숫자는 mono(tabular-nums). 새 웹폰트 네트워크 로드 금지.
- 모션 4종 + spin만: dot-pulse(무한) / feed-in 120ms / fade-in 200ms / spin 0.9s. 카운트업은 useCountUp raf 420ms cubic ease-out. 전부 `@media (prefers-reduced-motion: no-preference)` 안, 정지가 기본값.
- 안티슬롭 락: 이모지 금지(lucide만), em-dash 노출 문자열 금지, AI퍼플 금지, 액센트 1색(emerald), 순수 #000/#fff 금지, 의미 없는 장식 상태점 금지. IA는 좌측 레일 + 상단바 56px, 라우터 도입 금지(navSections view-state 존중).

### 1.2 페르소나 프레즌스 원칙 (최우선, 2026-07-10 사용자 확정)

캐릭터·아바타·페르소나 언어는 1급 기능이다. 제거·축소 금지. v2의 방향은 "페르소나 자산을 살아있는 텔레메트리(상태점 맥동·카운트업·라이브 피드)에 결박해, 내 캐릭터들이 실제로 일하는 모습이 보이게" 하는 것이다. 구체 규범:

1. 실행 중 작업 단위(run·pane·미션·발언·후보)에는 담당 캐릭터 아바타 + 실상태 상태점을 붙인다.
2. 수행 기록(영수증·타임라인·피드·근거)에는 수행 캐릭터의 "수행 서명"(PersonaChip)을 붙인다.
3. 아바타 비대체 원칙: 상태(thinking/error 등)가 아바타를 스피너·아이콘으로 대체하지 못한다. 상태는 링 색·상태점 오버레이·표정 스왑으로 표현한다.
4. 신원 해석 실패 시 가짜 캐릭터 배정 금지. 정직 폴백(이니셜/actor 라벨/"시스템")만.
5. HP/MP류 장식 수치는 가능하면 실데이터 바인딩(§1.3 U3), 불가하면 유지하되 정보 위계만 보호(출처 라벨).
6. 안티슬롭 락은 색·모션 규율일 뿐 페르소나 검열이 아니다. 캐릭터 일러스트·표정 스프라이트·일본어 무대 언어·소환 어휘는 자유.

### 1.3 v2 통일 결정 레지스트리 (편집장 확정 · 뷰 초안과 어긋나면 이 목록이 이긴다)

**U1. 공용 프리미티브 6종을 파운데이션 PR(F1)에서 신설**하고, 각 뷰의 로컬 복제·개별 신설 계획을 전부 대체한다.
- `lib/useCountUp.ts`: RunningWorkCard.tsx:179 / RmasAgentRail.tsx:82 구현의 승격. theater의 "로컬 3벌째 복제", coding·annex의 `hooks/` 경로안 기각. 기존 2개 소비처의 import 교체는 F1b로 분리(U20).
- `lib/personaIdentity.ts`: 신원 해석 단일 정본. personaName → role 슬러그 매핑("implementer"→builder, "qa-verifier"→verifier 등, workbenchMissions.ts:69 불일치의 렌더층 해법) → `resolvePersonaPortraitUrl` → `agentDisplay` 한국어명 → 정직 폴백(ApprovalToastBar.tsx:22-37 actor 라벨 로직 추출). inbox의 `personaRoleAdapter.ts`, management의 폴백 추출안을 여기로 흡수.
- `components/persona/PersonaChip.tsx`: 아바타(16/20/24/32/40px variant) + 이름 + 선택적 역할 톤 배지 + 선택적 상태점. cockpit `PersonaSignature`, run/coding `PersonaChip`, management `PersonaIdentityChip`을 이 하나로 통일. 문서 전체에서 "수행 서명"은 이 컴포넌트를 뜻한다.
- `lib/personaVitals.ts`: HP/MP 산식 단일 정본(U3).
- `hooks/useFollowScroll.ts`: 바닥 추적(임계 80px) + 스크롤업 시 해제 + "최신으로" 필(accent-dim 칩, feed-in). conversation `useThreadAutoScroll`, coding·research·tmux의 개별 구현안을 통일.
- `hooks/useDialogFocus.ts`: 열림 시 초기 포커스(기본 취소 버튼) + Tab 트랩 + Escape + 배경 inert + 닫힘 시 트리거 복귀. coding 다이얼로그 2종, inbox 드로어, ControlQueueDrawer, PersonaCodexModal 공용.

**U2. 수행 서명 표준**: PersonaChip으로 통일. 영수증 행 24px, 피드/타임라인 항목 20px(compact 원장 16px), 카드 헤더 32~40px, 아바타 스택은 겹침 -6px 최대 4 + "+N".

**U3. HP/MP**: 색은 HP=`var(--accent)`, MP=`var(--fg-muted)` (persona 뷰 결정 채택). run 초안의 "accent 농도 2단" 기각. 산식은 `lib/personaVitals.ts` 하나만: HP(기억) = agentMemoryQuality 신호 매핑(healthy .9 / building .65 / empty .45, error 시 오버라이드 생략, 신호 부재 시 tier 기본값) / MP(신뢰) = 영속화된 run 이력(`ai-orch.personaRunHistory.v1`)의 페르소나별 완료율(표본 3건 미만이면 tier 기본값). theater 초안의 "승인 이벤트 비율 블렌드", run 초안의 "Hermes 슬롯 연속성" 산식은 기각(후속 개선 후보로만 기록). tier 기본값 사용 시 `title="기준치"` 툴팁으로 출처 명시. `buildPersonaCard`(personaCard.ts:62-64)의 기존 override 인자에 주입, 시그니처 불변.

**U4. 레어도 프레임**: SSR 레인보우 그라데이션 폐기. accent 강도 사다리로 통일: SSR = accent 2px 보더 + `box-shadow 0 0 18px var(--accent-dim)` + (가드 하) 보더 불투명도 셔머 3s / SR = accent 45% 1.5px / R = border 강화(rgba(148,163,184,.35)) / N = 기본 border. run 초안의 "무지개 유지" 기각(PersonaCard는 persona·run·theater 3서피스 공유라 한 결정만 가능하고, 액센트 1색 규율과 정합). 별개로 **role glow 11색은 유지**: `data/agent-portraits.ts`의 roleGlowColors를 CSS 변수(`--persona-glow-<role>`)로 이관하되 색 자체는 보존. 아바타 프레임 전용 채널이며 UI 크롬 액센트 규율과 별개임을 styles.css 주석으로 명문화(cockpit 결정을 전 뷰 채택).

**U5. 루트 클래스·풀블리드**: 뷰 루트 클래스는 `.{view}-v2`로 통일: `.conversation-v2 / .debate-v2 / .annex-v2 / .tmux-v2 / .cockpit-v2 / .run-v2 / .theater-v2 / .coding-v2 / .research-v2 / .persona-v2 / .inbox-v2 / .config-v2 / .mgmt-page(관리 5페이지 공통 래퍼만 예외)`. 초안의 `.opscockpit`·`.summon-theater`·`.persona-hall`·`.config-lib`은 위 이름으로 리네임. 풀블리드는 `.nav-center-shell .center-board:has(> .{view}-v2) { padding:0; overflow:hidden }` 한 줄 패턴만 사용. styles.css의 `:not()` 셀렉터 체인(124-130, 7854-7884)에 신규 클래스 추가 금지, 신규 구획은 styles.css 말미에 뷰별 블록으로 격리(annex 초안의 격리 원칙을 전 뷰 규칙으로 승격). 관리 5페이지와 config, setup 상태의 research는 풀블리드 아님(nav-center-page 거터 유지).

**U6. 고정 레일 폭 3단 스케일**: 260 / 300 / 340. 스냅 결과: debate cast 280→300, verdict 340 유지 / annex rail 260 유지 / tmux roster 300 유지 / cockpit fleet 280→300, queue 340 유지 / run cast 320→300 / theater roster minmax(300px,340px) 유지 / research rail 300 유지 / persona duty 340 유지 / inbox rail 248→260, dock 320→340 / config list 320→300. 예외: 아이콘 레일(56/60px), 리사이즈 가능 레일(coding 세션 레일 `--coding-rail-w` 기본 264px 유지).

**U7. 브레이크포인트 4단**: 1440 / 1280 / 1024 / 768로 스냅. 초안의 1100·1023·960·900·920은 1024로, 720은 768로 재매핑. 공통 전환 문법: 1024 미만에서 캐스트/로스터 레일은 가로 아바타 스트립(아바타+상태점 축약형)으로 전환, 보조 패널은 접이식 요약 또는 하단 스택, 가로 스크롤은 페이지 레벨 금지(내부 overflow-x 컨테이너만 허용).

**U8. 오버레이 2단 규칙**: 모달(포커스 트랩 + 배경 inert + 백드롭) = `--z-dialog`(50): inbox 상세 드로어, ControlQueueDrawer(z-30→50 승격+백드롭 추가), PersonaCodexModal(z-80→50), coding 다이얼로그 2종, 읽기전용 Sheet, CommandPalette. 비모달 보조 시트(스레드 위 유리판, 트랩 없음) = `--z-rail`(20): conversation·coding의 반응형 사이드 시트. dialog층은 동시 개방 1개(App.tsx 오픈 핸들러에서 상호 배제, management 결정을 전역화). ApprovalToastBar만 topbar층(30) 유지.

**U9. dot-pulse는 1.6s 단일** (1.8s 변형 표기 폐지). live/thinking 상태에만.

**U10. mono 숫자 클래스는 `.aol-mono` 단일** (신규 코드 기준. 기존 `.rmas-mono`는 잔존 허용).

**U11. 계약 예외 전수 목록** (이 목록 밖 계약 변경 금지):
- 신규 localStorage 키 1개: `ai-orch.personaRunHistory.v1` (AutonomyRunSummary 미러, append, 30건 cap. persona PER-D). U3의 MP 산식이 이 키를 소비.
- 클라이언트 런타임 옵셔널 확장 1건: `stage3Runtime.ts` `runStage3DebateSession`에 `onRoundComplete(session)` 옵셔널 콜백(하위호환, 서버 무관. debate DEB-4).
- 컴포넌트 로컬 localStorage 2건: `aol.tmux.selectedRole`(선택 유지), coding·conversation 기존 키 재사용은 변경 아님.
- 보류(v2 범위 밖, 별도 결정): annex PR-D(contextPreview 신뢰도 필드), coding `codingChatStore.personaName` 필드, coding `SummonInput.personaName` 연결, 미션 병렬 verify, tmux 서버측 diff/스트림 엔드포인트, 승인 requestedBy 신원 키 서버 하달, patchCandidatesFromApprovalItems 데이터 통합, runnerGateMode 동적화, role 슬러그 소스 통일.

**U12. 공유 파일 정리는 F2 한 곳에서만**: PublicWorkTracePanel violet(33·52행), shared/AgentActivity 색 교정(구조 개조는 TMX-4), ConversationWorkbench index.tsx 535·544 violet 토글, Composer.tsx 스웜서치 보라 하이라이트, styles.css 8008-8040 `.os-breathe/.os-thinking` reduce 가드 편입, body 배경 강제(`#09090b !important` 7947-7975, LiveTerminalPanel `#07070a` 등) 제거·토큰 복원, tokens.css reduce 블록 신설(`.status-pulse` 가드). 이 항목들을 담고 있던 뷰 슬라이스(debate PR5 전체, research PR-5의 Composer 건, cockpit A·management M6·conversation P1·tmux T1의 해당 항목)에서 제외한다. debate PR5는 폐지.

**U13. 빈 상태 오빗 2단**: 표준 120px 원형(radius 999px, opacity .9) + 소형 72px(보조 존 전용: cockpit live 존, persona duty 레일 80px→72px 스냅). 문법: 오빗 이미지 + 타이틀 + 보조문 1줄 + accent-dim CTA(있을 때만). 보조 패널의 한 줄 빈 상태(coding 미션 보드 등)에는 오빗 사용 금지(과함).

**U14. 타이포 하한**: 전역 11px. 관리 묶음·inbox는 12px(--fs-meta) 최소단. 9~10.5px 마이크로 타이포 전면 폐지.

**U15. 탭 문법**: `role="tablist"/"tab"/"tabpanel"` + aria-selected/aria-controls + roving tabindex(화살표, Home/End) + 수동 활성화(Enter/Space). 비활성 패널은 `hidden`이 기본. 유일 예외: run 미션 상세 12카드 탭(RUN-6)은 renderToStaticMarkup 테스트 보존을 위해 마운트 유지 + CSS `data-active` 숨김 + `inert` 허용.

**U16. 승인 카드 문법 통일**: 유리판 + `border-left: 3px var(--warning)` + 요청 캐릭터 PersonaChip + 명령 원문 mono + 위험 사유 부제 + 액션 버튼(뷰별: conversation 3버튼 완결 / tmux 큐잉+대기열 안내 / cockpit·drawer 승인·보기). 처리 정본은 ControlQueueDrawer, 각 뷰 인라인 카드는 같은 시각 문법의 컨텍스트 사본. 헤더/배너는 "가리키기 전용"(자체 액션 없음).

**U17. 수치 정본 1곳 원칙**: 같은 수치는 화면당 최대 2곳(헤더 스트립의 판정용 1 + 행동 위치의 헤더 1). 3중 이상 중복 표기는 결함으로 취급(cockpit GlanceTile·debate 카운트 3중·tmux 3분할 스트립 해체가 이 원칙의 적용례).

**U18. WorkTheater.tsx 삭제 확정** (conversation P5에서 "작전 콘솔"로 흡수). `lib/workTheater.ts`가 공유 정본으로 존속. theater THR-4의 "공유 소비자 동반 검증" 대상은 WorkTheater.tsx가 아니라 작전 콘솔(또는 P5 이전이면 WorkTheater.tsx)로 읽는다. 먼저 머지되는 쪽 기준으로 상대가 rebase.

**U19. notice 3톤 문법**: info=fg-muted / success=accent / error=destructive. info·success 자동 소거(6초), error 수동 닫기. 컨테이너 `role="status" aria-live="polite"`, error 항목만 `role="alert"`. coding NoticeStack(최대 3 큐), tmux 링버퍼(최근 5), research tone 분리, run missionId 스코프 맵이 전부 이 문법의 구현체.

**U20. useCountUp 기존 소비처 import 교체(F1b)는 abort PR 이후로 분리**: 현재 별도 진행 중인 autonomy 중지(abort 핸들) PR이 App.tsx·RunningWorkCard.tsx·autonomousRun.ts를 건드린다. F1은 신규 파일 생성만 하고, RunningWorkCard/RmasAgentRail의 로컬 useCountUp 제거는 abort PR 머지 후 F1b에서 수행한다. 그때까지 사본 공존은 무해.

**U21. 상태 언어 정직성**: 영어 enum 노출 금지, 사전은 `lib/railStatusLabels.ts` 확장 단일본. failed/blocked=destructive, watch/승인대기=warning, 정상=accent, 유휴=fg-muted. 시드/픽스처 데이터는 "마지막 점검 전"류 라벨로 실측과 구분(픽션을 라이브처럼 표기 금지: tmux 초기 상태, theater 예비 소환수, management 시드 전부 해당).

### 1.4 계약 경계 재확인

불변: 서버 REST/SSE(`/cockpit/snapshot`, provider-completions, stage33TmuxServer 3함수, `/rmas/*`, 게이트 엔드포인트), 스토어 키(CENTER_MODE_STORAGE_KEY, codingChatStore, workbenchMissions, tmux 상태 키 4종), 타입 shape(AgentConfigFile, EventEnvelope, 타임라인 블록 스키마), projection lib(~34개), 리듀서·엔진 시그니처(researchSwarm, runParallelAutonomy, deriveTmuxRecoveryPlan), config 이벤트 4종 페이로드. 예외는 U11뿐.

---

## §2 뷰별 스펙

공통 문법(상태점·카운트업·카드·빈 상태·에러 배너·모션·포커스 링·타이포 하한)은 §3을 따르고, 아래에는 뷰 고유 결정만 적는다. `[조정]` 표시는 초안 대비 이 문서에서 확정 변경된 지점이다.

### 2.1 대화 (conversation)

**컨셉**: "캐릭터의 작업실". 페르소나 배선이 이미 전부 실데이터이므로 구조는 살리고 껍데기(zinc/violet/cyan)만 토큰으로 교체.

**레이아웃**: 풀블리드 유지, 셸 클래스 `.conversation-v2`(styles.css 7854~7890 체인 등재가 아니라 U5 격리 블록으로).

```
.conversation-v2 {
  display: grid;
  grid-template-columns: 60px minmax(0,1fr) var(--conv-side-w, 0px);
  grid-template-rows: auto auto minmax(0,1fr) auto;
  grid-template-areas:
    "rail header header"
    "rail alert  side"
    "rail thread side"
    "rail composer side";
}
```
헤더 내부 grid(1fr|auto). 사이드 패널 폭은 `--conv-side-w` CSS 변수(localStorage 배선 재사용), 닫힘=0px 컬럼 붕괴. 배경은 MessageThread.tsx:112 violet radial 대신 §3 표준 글로우. 반응: 1280 미만 사이드 패널=비모달 오버레이 시트(z-rail 20), 768 미만 캐릭터 레일 60px 유지 + 나머지 오버플로 메뉴 + 풀폭 시트.

**IA 핵심**:
- 헤더+Spotlight 2단 → **페르소나 헤더 밴드 1단 병합**(`ConversationPersonaHeader.tsx` 신규): 표정 초상 40~48px(스프라이트 308장, `expressionForActivity`) + 이름 + 활동 내레이션 8상태 + 상태점 + HUD 슬롯. 에이전트 이름은 화면에 1회만.
- 위임 관찰 3서피스 → **작전 콘솔 1개**: MakimaDelegationConsole이 WorkTheater의 6단계 파이프라인+초상 연출 흡수, WorkTheater.tsx 삭제(U18). "作戦無台" 오기 → "作戦舞台" 수정, 일어 플레이버 유지. 배너는 콘솔 닫힘 시 진입점 역할만.
- 승인: 스레드 최하단 인라인 ApprovalCard 단일 정본(U16) + 스트리밍 버블 내 액션 유지 + 헤더 배너는 가리키기 전용(클릭 시 카드로 스크롤+포커스).
- viewMode="agents" 4밴드 적층 폐기 → 사이드 패널 "agents" 모드 카드 스택 이관(콘텐츠 무손실). 사이드 패널 6모드→5모드(background+plan 통합).
- 죽은 코드 제거: DelegationInline·DelegationChip, 미사용 props 6종, `.conversation-v0-shell .right-rail` 잔재 CSS + `--conversation-right-rail-*` 주입(App.tsx:5202-5204).

**상호작용**:
- 중지 조건 확장: `responding·capturing·dispatching·testing` 포함(스트리밍 중 중지 가능).
- 추천대화 클릭 = 컴포저 채움+포커스(즉시 전송 폐기).
- 자동 스크롤: `useFollowScroll`(U1) [조정: 초안의 useThreadAutoScroll 대체].
- `createdAt` 부재 시 Date.now() 조작 → "시간 미상" 표기. `document.querySelector` 포커스 → ref 전달(index.tsx:379-383, 440-444).

**상태·페르소나**: 빈 대화 = 페르소나 초상 96px을 오빗 링 위에 + 캐릭터 인사말 + 기억 품질 라벨 + 추천 대화 3개(채움 방식). 스트리밍 = 드래프트 버블 border-left 2px accent + speaking 펄스 + `TurnTelemetryStrip`(경과 mono·토큰 카운트업·활성 도구 칩) + 도구 칩 feed-in. 응답 완료 = 버블 하단 "수행 서명"(PersonaChip 24px + 모델 + SOUL/기억/도구 근거 배지). 승인 대기 = 헤더 표정 waiting_approval 동기 전환(기존 배선).

**a11y**: aria-live 재설계(버블 라이브 제거, 숨김 라이브 영역 1개로 턴 전이만 발화), 포커스 순서 레일→헤더→배너→스레드(승인 버튼만 정지)→컴포저→패널, 승인 카드 포커스 강탈 금지, 8.5~9.5px→11px 승격, `✓` 글리프→lucide Check.

**뷰 고유 수용 기준**: 헤더 1밴드(이름 1회), 위임 데이터 동시 2곳 이상 렌더 금지, agents 모드에서 스레드 50% 이상, responding 중 중지 동작, 표정 스왑+맥동+카운트업 동시 관찰, tmux/cockpit/debate 시각 무변(avatar-with-status 파급 0).

### 2.2 토론 (debate)

**컨셉**: 7층 헤더 적층을 해체하고 "캐릭터들이 토론하는 모습"을 화면의 주인으로.

**레이아웃**: 풀블리드, `max-w-4xl` 중앙 고정·VerticalSplitResizer(상하 분할) 폐기 → 3열.

```
.debate-v2  columns: 300px | minmax(0,1fr) | 340px   [조정 U6: cast 280→300]
rows: auto | 1fr | auto
"header header header" / "cast feed verdict" / "bar bar bar"
```
header: kicker + 문제문 2줄 클램프+"전체 보기" 토글 + runState 필 + 경과 mono 카운트업. 에러 배너는 header area 공유. feed: 라운드 탭 sticky + 타임라인(카드 내부 max-width 860px). verdict: 실행 중=라이브 텔레메트리 카드 / 완료=의장 결정+통합 스탯+블루프린트(접이식)+Coding Packet CTA. bar: 요약 1줄+Annex 링크(SummaryChip 중복 제거). 반응: 1440 미만 verdict 280px[조정: U6 예외 허용, 축소 변형], 1024 미만 1열(verdict 접이식 요약, cast 가로 스트립 64px) [조정: 초안 1024~1439 구간 통합].

**IA·상호작용**: 결정/합의/반대/리스크 카운트는 `DebateStatStrip` 1곳(U17). summary는 "실제 요약+Annex 링크" 복원. UtteranceCard: `role="button"` 컨테이너 제거, 초상 36px, 명시 버튼(선택/부모 발언 점프/Annex)으로 분해, severity 좌측 바 3톤. 라운드 탭 `DebateRoundTabs` 분리(tablist, 상태점 pending=muted/live=pulse/done=solid). 신규: DebateHeader / DebateCastRail / DebateVerdictPanel / DebateStatStrip. BlueprintReviewCard 파일 분리 시 MissionBoardContainer import 동반 수정 필수.

**상태**: 세션 없음=오빗 단일 중앙 상태(빈 3열 금지). running 기본=스피너+경과 카운트업, "이 라운드에 발언이 없습니다"와 완전 분리. 스트리밍(DEB-4)=`onRoundComplete` 옵셔널 콜백(U11)으로 라운드마다 부분 반영, 발언 feed-in, 발화자 halo 이동. 완료 전이=결정 라운드 자동 이동(사용자 수동 조작 시 1회 규칙으로 미이동). 에러=header 배너+재시도(stop 버튼 문법)+"마지막 성공 세션 보기".

**페르소나**: DebateCastRail = 캐릭터당 행(아바타 40px, `agentVisualsById` 배선 수리: App.tsx:5742 전달분 구조분해 누락 수리 + 캐릭터명 + 역할 라벨 + 상태점 + 발언 수 카운트업 + 미니 입장 궤적 칩(색+lucide 아이콘+aria-label 이중 인코딩, 히트타깃 24px, 클릭 점프)). 의장 결정 카드에 마키마 아바타+"의장 {캐릭터명}의 결정", confidence 카운트업(실데이터 815·820행). 작업 로그 하단 "수행: {캐릭터명}" 서명. footer 참여자 = 아바타 스택+N. 토큰 정리: violet 전면(debateChamberPresentation.ts tone 맵 포함)→accent 체계, "✓"/"◎"→lucide.

**a11y**: 탭 roving, 발언 카드 인터랙티브 중첩 0, 라이브 알림은 피드 상단 polite 리전 1곳, `hover:scale-125` 삭제, smooth scroll 가드.

**뷰 고유 수용 기준**: 1440에서 피드가 첫 화면 세로 60% 이상, 카운트 1곳, 완료 자동 탭 이동, 궤적 칩 점프+플래시, lib 테스트 11개+Stage3DebateTable 5케이스 green.

### 2.3 토론 부록 (annex)

**컨셉**: "토론의 백스테이지". 6탭 → 좌 260px 상설 레일 + 우 콘텐츠 4탭.

**레이아웃**: 풀블리드 유지, `.annex-v2`.

```
columns: 260px 1fr / rows: auto auto 1fr
"banner banner" / "header header" / "rail panel"
rail: 결정 준비도 게이지+runState → 참가자 로스터(4인) → 탭 4개(카운트 mono) → 머신 구획(권한·기억 동기화, 위계 강등)
panel: 근거 960px / 활동 720px, 좌측 정렬. 근거 탭만 rows 1fr|auto로 하단 고정 액션 바
```
반응: 1024 미만 1열, 레일은 가로 스트립(게이지+로스터 가로, 탭 가로 스크롤), 머신 구획 disclosure [조정: 초안 960→1024].

**IA**: 탭 4개 = 근거/활동/기억/대기열. status 탭 해체(레일 승격), agents+logs → "활동" 통합 타임라인. 탭 id는 `memory`/`queue` 유지 + `agents/logs→activity`, `status→기본탭` 매핑 어댑터 1함수(콕핏 점프 하위호환). queue 필러 항목 제거(진짜 빈 상태 도달 가능). 근거 카드별 버튼 3종 반복 → "대화로"만 카드 잔류(ref 인자), 패킷/승인 큐는 하단 고정 바. 스테일 initialTab 수리: "보조자료" 버튼(App.tsx:5739)·팔레트(4369) 경로에서 리셋.

**컴포넌트**: DebateAnnexPage(677줄) → `components/annex/` 6파일 분해(엔트리+AnnexRail+4패널+AnnexCard). 신규 AnnexReadinessGauge, AnnexRosterItem. debateChamberPresentation은 annex 전용 export 분리(debate 본 서피스 diff 0).

**상태·페르소나**: 로스터 = participants[].name(마키마·오시노 시노부·시노미야 카구야·아스카) + agentVisualsById 아바타 + `providerName · modelId` mono 서브라인 + 발화자 pulse-glow(AgentPortraitFrame 재사용, 신규 keyframe 0). 활동 타임라인 = 행위자 아바타 20px + "마키마 → 오시노 시노부" + relay state 점 복원(observed=accent 솔리드/pending=idle/blocked=warning: mock pending 위장 금지). 근거 카드 = 발언 스니펫 제목(ID는 mono 서브라인 강등) + 발화 캐릭터 서명(props 파생만, 계약 불변). confidence % = mono+muted+"추정" 라벨(실바인딩은 보류 PR-D, U11). 대기열 담당 배지 = orchestrator 기본 마키마(agentId 기반 컴포넌트). runState=error → banner area에 runError 표면화.

**a11y**: div+role="button" → 네이티브 button, 뒤로가기 aria-label, 원거리 점프 사전 신호(lucide arrow-up-right + "대화에서 열기" 상시), text-[10px] → 11px.

**뷰 고유 수용 기준**: 탭 4개·status/logs/agents 부재, 콕핏 점프 착지 유지, 보조자료·팔레트 진입 시 항상 기본 탭, pending relay 위장 없음, 대기열 0건 오빗.

### 2.4 Tmux 실행 (tmux)

**컨셉**: "워커 함대 관제탑". 자동 갱신(폴링) + 캐릭터 상시 프레즌스 + 실데이터 결박.

**레이아웃**: 셸 구조 현행 `.tmux-focus-shell` 유지(App.tsx 모드 배선 4곳 불가침), body 배경 오버라이드만 토큰 복원(F2). 뷰 루트 `.tmux-v2`:

```
columns: 300px minmax(0,1fr) / rows: auto minmax(0,1fr) auto
"header header" / "roster detail" / "bar bar"
```
header: 좌 "워커 함대"+kicker+`dgx-02 · ai-swarm` mono / 우 플릿 스탯 3종(작업/승인대기/오류, 카운트업)+라이브 타이머(마지막 캡처 경과, data-live 시 accent)+전체 새로고침(ghost)+근무 스택(라이브 캐릭터 미니 아바타 20px 최대 5+N). 승인 게이트 notice는 header area 내 확장. detail: pane 헤더(초상 56px+제목+AgentStatePill+소환 후보 칩) → 승인 게이트 배너(조건부, U16) → 라이브 출력(유리판 mono, flex-grow) → 타임라인. bar: 관측 전용 안내+최신 notice 1건(링버퍼 5, 인라인 확장)+폴링 토글. 반응: 1440 roster 300 / 1024~1440 260 [조정: 초안 960→1024] / 1024 미만 1열+가로 아바타 칩 스트립.

**IA**: pane 10개 전수 상시 표시(휴리스틱 slice 폐지), 추천은 정렬+배지로 강등. TmuxCommandCenter 3분할 해체(U17). "다음 명령" 드래프트 박스 제거(승인 배너 내부로 흡수, `tmuxCommandDrafts` 상태는 유지). composer 데드 브랜치(757-783)·미사용 prop/import 삭제. `codexByPaneRole` useMemo 1회화.

**핵심 신규**: `components/tmux/useTmuxLiveCapture.ts`: useRunningRmasRuns 패턴 이식(선택 pane 5초/비선택 30초 라운드로빈, 실패 백오프 5s→30s, `requestTmuxCapture`만 호출, 상태 소유권은 App 유지·setter props 주입). 반환 `{lastCapturedAt, isPolling, connectionState, refreshAll, refreshPane}`. + TmuxFleetRoster / TmuxPaneDetailPanel(분해 이식).

**버그 수정**: `mapTmuxPaneStateToAgentState`의 `includes("captur")` → 정확 매칭 테이블(`captured→done`), 헤더 "작업" 카운트 done 제외. 승인 버튼 멱등 가드(보드측 busy). 선택 유지 `aol.tmux.selectedRole`.

**상태**: 진입 즉시 1회 전체 캡처, 도착 전 상태점 idle·"대기"(픽션 라이브 표기 금지, U21). 서버 미도달 = detail 오빗("DGX-02에 연결할 수 없습니다"+"다시 시도"), 로스터는 idle 유지. 캡처/dispatch 실패 = 마지막 정상 출력 보존 + destructive 인라인 배너+재시도(출력 텍스트 에러 치환 폐지).

**페르소나**: P1 아바타 비대체 개조(shared/AgentActivity.tsx:119-124: 아바타 상시 + 링 색 + 우하단 8px 상태점 + thinking 시 conic 스트로크, 가드) → 대화 뷰 긍정 파급. P2 표정 스프라이트 활성화(personaAvatarSource.ts:19-25 미사용 자산: idle→기본/thinking→집중/done→만족/error→곤란, crossfade 120ms 가드, 폴백 필수). P3 타임라인 블록 캐릭터 서명(PersonaChip 16px, "렘이 캡처함/유이가 실행함", 주체 해석은 TmuxSwarmBoard.tsx:568-580 체인 함수 추출). P4 승인 배너 페르소나 카피("마키마가 승인을 기다립니다: `<명령>`") + `rejectFromQueueNotice` 소비 시작. P6 소환 후보 칩 violet→accent-dim·9px→11px·★→lucide Star, "워커 함대" 어휘 전부 유지.

**뷰 고유 수용 기준**: 진입 3초 내 자동 캡처(preview_network `/tmux/capture`), pane 10개 고정, 동일 출력 1곳 렌더, captured 완료 표기, 모드 복귀 시 선택 유지, thinking/error에서도 아바타 존재, 관제판 recovery plan 무변(블록 스키마 불변).

### 2.5 운영 관제판 (cockpit)

**컨셉**: 접힌 히어로+4단 드릴다운 폐기 → 항상 펼쳐진 단일 관제면. 3초 판정 / 즉시 행동 / 살아있는 현장 / 캐릭터 서명 영수증 4존이 1440x900 무스크롤 공존.

**레이아웃**: 풀블리드(기존 cockpit-focus-shell + cockpit-center-board 유지), 루트 `.cockpit-v2` [조정 U5: .opscockpit 리네임]:

```
columns: 300px 1fr 340px   [조정 U6: fleet 280→300]
rows: auto 1fr auto auto
"health health health" / "fleet live queue" / "fleet ledger queue" / "diag diag diag"
gap 12px, padding 16px
```
반응: 1280 미만 `260px 1fr` 2열(queue 중앙 하단) [조정: 초안 1024~1439→1280 스냅] / 1024 미만 단일 컬럼 순서 health→queue→live→fleet(가로 스트립)→ledger→diag. 배경: 보라 radial(OperatorCockpit.tsx:242) 폐기 → 표준 글로우 + 32px 그리드 오버레이는 `var(--border)` 토큰화.

**IA**: 헬스 스트립(토글 삭제, 상태점+판정 문장+카운터 4+CTA 1: CTA 클릭 시 대상이 반드시 보이고 포커스, expanded 상태 자체 소멸로 v1 결함 16 구조적 재발 불가). 승인 큐 = 승인 대기+실행 슬롯 인계 통합 단일 큐(수치 정본은 헬스 카운터, 행동 정본은 큐: U17). GlanceTile 4종+MissionMetric 5종+MissionCommandDeck+자체 sticky 헤더 삭제. Maturity/Roadmap 카드는 콕핏 제외, 팔레트 딥링크+설정/진단 서피스 이전(initialFocus 매핑 유지). 진단 스트립(CockpitDiagStrip): 라우팅/기억/복구/디스패치/DGX 미러 5항목 한 줄, 각 전용 뷰 라우팅.

**컴포넌트**: OperatorCockpit.tsx → named grid 조립자 ~250줄로 축소. CockpitHealthHero → CockpitHealthStrip(TONE rgba 맵 → 토큰). WorkerFleetCard → PersonaFleetRail(차단>작업>대기 정렬, cyan 전면 교체, 고정 "실시간" 라벨→실시각). ApprovalEvidenceCard+PendingHandoffStrip → ApprovalQueueCard(행=PersonaChip(요청 주체)+요약+증거 스니펫+승인/보기). WorkReceiptLedgerCard: 서명 열 추가(PersonaChip, compact 변형은 16px 아바타만: 홈 호환 필수), 정렬 배열 재생성·GitHub #251 하드링크 수정. 신규: CockpitLiveOps(useRunningRmasRuns 소비: run 카드=border-left 2px accent+참여 아바타 스택 최대 4+N+토큰 카운트업+경과 타이머, 피드 행=feed-in+발화자 아바타+severity 보더). Badge/GlassPanel 톤 3종화, text-[9px] 폐지. [조정] PersonaSignature.tsx 신설안은 공용 PersonaChip(U1)으로 대체.

**데이터 정직화(계약 불변)**: WorkTraceSearchItem에 `performedBy?` 로컬 타입 확장 + trace metadata `personaDisplayName`(publicWorkTrace.ts:152-177)에서 조립, 미상은 "시스템". fleet 투영(App.tsx:4738-4743)에 lastActivityAt·blockedReason 보강(agentActivityById 표면화), worktree/branch는 로컬 소스 없으면 UI 줄 삭제. `snapshot.timestamp` 가짜 시각(App.tsx:4716) → 원격 fetch 성공 시각+로컬 투영 갱신 시각 2필드. 죽은 import(App.tsx:192) 제거.

**상태**: 로딩=정적 스켈레톤 3행(.cockpit-skel, 무모션 기본). 원격 실패=헬스 아래 warning 배너 1줄+재시도, 로컬 투영 계속 렌더. 빈 함대=오빗+CTA "에이전트 구성 열기". 진행 run 없음=소형 오빗 72px+CTA+최근 완료 2건 흐리게.

**페르소나**: 함대 레일=AgentPortrait 44px+role glow 프레임(U4)+useAgentExpression(blocked→error, working→speaking)+isTyping을 피드 발화 유무에 실바인딩. 이름은 페르소나 한국어명(operatorWorkerDisplay 19키), 원시 agentId는 tooltip 강등. 표정 레지스트리 빈 배열은 유지(에셋 유입 시 자동 활성). SOUL.md/AGENTS.md 적용 여부를 서명 tooltip에 표면화.

**뷰 고유 수용 기준**: 기동 직후 클릭 0회로 4존 가시, 승인 2클릭 내 처리, "승인 N건" 정확 2곳, Maturity/Roadmap DOM 부재, 동기화 시각이 리렌더로 불변, 홈 compact 원장 동일 동작+16px 서명.

### 2.6 실행 (run)

**컨셉**: 3모드(single/parallel/board) 1문법. 모드 전환에도 header/cast/bar 골격 불변으로 공간 기억 보존.

**레이아웃**: 풀블리드 `.run-v2`:

```
columns: 300px 1fr   [조정 U6: 320→300]
rows: auto 1fr auto
"header header" / "cast stage" / "bar bar"
```
header: 좌 모드 라디오그룹(3항목, 2줄 서브캡션 "1명 폐루프"/"N명 워크트리"/"서버 영속") / 우 텔레메트리 스트립(실행 중 n·완료 n·승인 대기 n·서버 연결). 에러 배너 header area 공유. bar: 상시 렌더(유휴 시 disabled+설명 라벨: 레이아웃 점프 0). stage 모드별: single=720px 폼→실행 후 요약 스트립 접힘+타임라인 / parallel=드래프트 큐(가로 칩)+터미널 그리드 auto-fill minmax(360px,1fr) / board=미션 행 리스트+행 인라인 확장(내부 4탭). 반응: 1024 미만 1열, cast 가로 스트립 [조정: 초안 1100→1024].

**핵심 결정**:
- **RUN-2 상태 배선 수리**: `lib/parallelRunStore.ts`(autonomyRunStore 패턴 복제: 탭 이탈 후 복귀 시 실행 추적 보존), summon 시드 소비 후 해제(App.tsx `setSummonSeedPersona(null)`), board `hasLoadedOnce` 플래그(첫 진입 가짜 에러 플래시 제거).
- board: verify는 해당 미션 행 인라인(스피너+`.aol-mono` 경과 타이머+"서버 실측 검증 중 · 최대 3분"), 다른 행 버튼에 "OO 검증 중 · 대기" 사유 라벨, notice는 `Record<missionId, notice>` 맵. 상세 12카드는 4탭(개요/편집/프리뷰·QA/배포, 현재 단계 기본 활성, U15 예외 적용: 마운트 유지+data-active).
- parallel: 설정 4종(워크트리/Hermes/체크인/로어북) → RunSettingsDrawer 접이식+요약 칩, 드래프트 입력 label 부여, 브로드캐스트 바 상시.

**페르소나**: cast 레일 = single PersonaCard 풀 사이즈(표정 초상 카드 배너급 승격, expressionStateMachine 연동, 한코 도장 히스토리, TTS "말하기") / parallel compact 스택(Hermes 배지, 표정 classifier를 step outcome에 연결) / board buildWorkers 로스터(아바타+배정 미션 수 mono+capabilityMode 칩). PersonaChip을 터미널 카드 헤더·미션 행 워커 슬롯·완료 영수증에 서명으로. HP/MP는 U3 정본 산식 [조정: 초안의 Hermes 연속성 산식 기각]. 도장 4색 = 完了 accent / 失敗 destructive / 承認待 warning / 実行中 fg-muted+accent 펄스. SSR 프레임은 U4(accent 사다리) [조정: 초안 "무지개 유지" 기각]. glitch 색은 accent 계열 2톤 재조색(모션 유지). "도감 소환"·承認待 어휘 유지. HUD `#46ecff/#46f0a0/#ff4f4f`·비콘 `#ffd166/#ffae00`·`#34d399` 전량 토큰 치환. `⎇`·텍스트 화살표 → lucide.

**a11y**: 모드 스위처 radiogroup(화살표+Space), 모드 전환 시 stage 첫 인터랙티브로 포커스 이동, 텔레메트리 aria-live off, 미션 notice role="status", 전역 에러 role="alert".

**뷰 고유 수용 기준**: 3모드 전환 골격 픽셀 불변, Slow 3G에서 가짜 에러 0프레임+스켈레톤 3행, 탭 복귀 시 병렬 보드 완전 보존, 재소환 시 새 시드, 페르소나 요소 v1 대비 소실 0.

### 2.7 작전극장 (theater)

**컨셉**: "출격 상황판". 소환 카드·마법진·일본어 무대 언어를 실데이터에 결박.

**레이아웃**: 풀블리드 `.theater-v2` [조정 U5: .summon-theater 리네임]:

```
columns: minmax(300px,340px) minmax(0,1fr)
rows: auto minmax(0,1fr) auto
"header header" / "roster stage" / "film film"
```
header 내부 auto|1fr|auto: 타이틀 "작전극장" / 6단계 트랙(分類~完了, 스텝=상태점+jp 라벨+인원 배지, 1px sep) / 집계 스트립(출격·승인대기·완료·막힘, 카운트업). 되감기 배너는 header 공유. roster: 카드 최대 6장 전수(4장 절단 폐지, 집계와 일치), 정렬 blocked>waiting>active>idle>done. stage: hero 초상+마법진 260~300px+이름 뱃지 / "이번 작전" 패널(임무 제목+요약+사용자 원 요청 발췌: App.tsx:5496 request prop 1줄 추가) / hero 이벤트 라이브 피드+summon 커맨드 티커 1줄. film: TimelineScrubber v2 풀폭. 반응: 1024 미만 "header/stage/roster/film" 1열, roster 가로 snap 스트립(카드 280px), 마법진 220px. 배경 `bg-[#0a0a0b]`+violet/teal 블롭 폐기 → 표준.

**상호작용**: 카드 = 형제 버튼 2개(본문=hero 선택 / MessageSquare 아이콘=대화 열기, 중첩 금지). hero는 `useState<string|null>`, null이면 첫 active 폴백. **App.tsx 클릭 무반응 버그 수정**: `handleOpenDelegatedAgentConversation`(App.tsx:3716-3720)에서 nav 해제 명시 수행(previousModeRef 조기 반환 회피). 스크러버: 밀도 틱(`frameTicksByCategory(frames, buckets)` 순수 파생 신규, 기존 export 불변), onScrub 소비 배선(SummonTheater 내부), 되감기 모드 = header warning 배너 "+MM:SS 시점 · n/N"+`LIVE로` + 피드 `framesUpTo` 절단 + 로스터 dim(.6)+"현재 상태" 뱃지(단계 chip 시점 되감기는 범위 밖 명시).

**상태·페르소나**: 빈 상태 = 예비 파티 3장 유지 + muted "예비 소환수" 라벨(U21) + 헤더 트랙 전 단계 idle(가짜 "분류 active" 폐지) + 무대 임무 패널 자리에 오빗+CTA "지휘자에게 요청 보내기". 초상 onError → 이니셜 폴백. active 초상 우하단 상태점 오버레이. 피드 delegation/run 이벤트에 아바타 20px+jp명 프리픽스(`狂三 — 위임 진행 +02:14`은 em-dash 제거해 `狂三 · 위임 진행 +02:14`). HP/MP는 U3 [조정: 승인 비율 블렌드 기각]. RARITY_META는 U4 사다리, `SSR★` 텍스트 유지. summon 커맨드라인 stage·task 실데이터 바인딩, 타자기 타이머 폐기→내용 변경 시 fade-in 1회. 마법진 keyframe은 가드 블록 이동, reduced-motion 시 정적 이중 링. "✦" → lucide Sparkles, "auth req !" → "승인 필요". 召喚·作戦ログ·JP_NAME 18종·lang="ja" 유지. summarizeTheater 이중카운트 수정(approve 행 deployed 제외, lib/workTheater.ts + 공유 소비자 검증은 U18 참조). useCountUp은 F1 lib 소비 [조정: 로컬 복제 기각].

**뷰 고유 수용 기준**: 위임 6건 시 카드 6장+집계 일치, localStorage mode=conversation 상태에서도 대화 전환(회귀 테스트), 스크럽 절단+LIVE 복귀, reduced-motion 시 화면 내 움직임 0, 페르소나 요소 전부 렌더.

### 2.8 코딩 (coding)

**컨셉**: "누가 지금 무엇을 하는가"를 헤더로 승격한 에이전트 코딩 작업대.

**레이아웃**: 풀블리드 `.coding-v2`. grid 정의는 coding-workbench.css 단일 파일로 통일(styles.css:10491 죽은 정의 제거, 인라인 3트랙 제거: 트랙 3 vs 자식 4 정합성 붕괴의 구조적 해결. 인라인은 `--coding-rail-w` 주입만).

```
columns: var(--coding-rail-w,264px) 6px minmax(0,1fr) minmax(300px,340px)
rows: 56px minmax(0,1fr) auto
"rail resize header header" / "rail resize thread board" / "rail resize composer board"
+ --board-closed(3트랙) / --rail-collapsed(56px 아이콘)
```
헤더 grid(1fr|auto): 좌 빌드·플랜 탭+담당 PersonaChip / 우 토큰 텔레메트리+오류 StatusBadge+보드 토글(배지). 반응: 1280 미만 보드=우측 비모달 드로어(z-rail 20, U8) / 1024 미만 레일 기본 접힘 56px. 스레드 열은 모든 폭에서 minmax(0,1fr).

**IA**: 미션 보드 기본 닫힘 → 활성 미션 1건 이상 또는 GitHub 부착 진행 시 자동 열림+헤더 배지. "샘플 Mission 생성" `import.meta.env.DEV` 게이트. 러너 미연결 미션은 "러너 미연결" muted 정직 라벨. `/help` = notice 한 줄 → 스레드 내 명령 그리드 카드(3열). 모델 미선택 = 전송 시 거절이 아닌 빈 상태·컴포저 위 사전 CTA(설정 스크롤+포커스). GithubPublishPanel은 스콥 밖(색 4곳만 치환: 588·662·748 violet + 203 text-violet-200).

**컴포넌트**: CodingWorkbench(1,213줄) → 셸+effects 유지, CodingSessionRail / CodingTelemetryHeader / CodingComposer / CodingMissionBoard 추출 + NoticeStack(U19). PersonaChip은 공용(U1) 소비 [조정: coding/PersonaChip.tsx 신설 기각]. 자동 스크롤 useFollowScroll(U1).

**페르소나**: 헤더 칩 = 빌드 모드=builder, 플랜 모드=architect 기본 바인딩(모드 전환=캐릭터 교대). 스레드 "에이전트" 익명(CodingThread.tsx:197) → PersonaChip small. 도구 카드 헤더 16px 아바타 서명(주체 데이터 없으면 세션 활성 페르소나, 표시 계층). diff 승인 카드 = 서명 + 적용 시 done 상태점. 미션 카드 = role 초상 배지(personaIdentity 매핑)+한국어 상태 라벨. 빈 세션 = 오빗 링 중앙에 대기 캐릭터 아바타 + CTA 2개. codingChatStore personaName·SummonInput 연결은 보류(U11).

**상호작용·a11y**: 슬래시 메뉴 combobox(aria-expanded/activedescendant, ↑↓/Tab/Enter/Escape, 메뉴 열림 중 Enter 오전송 금지, startsWith+포함 병행). 세션 삭제 인라인 2단 확인(2초 복귀), 히트 타깃 28px. 다이얼로그 2종(자동승인 경고·arm) useDialogFocus(U1). 리사이저 role="separator" 보존. 토큰: 보라 그라디언트 전송(css:498-505)→run 버튼 문법, rose 그라디언트 중단→stop 문법, z-index 60 2곳→50, `⌁`→lucide, radius 12(내부 중첩 8px 1단만 명시 예외).

**뷰 고유 수용 기준**: 보드 열림/닫힘 각각 grid area 정합(DevTools overlay), grid 정의 1곳, /fork 후 자동 열림, 빌드↔플랜 캐릭터 교대, 바닥 추적+"최신으로", 기존 테스트 6종+GithubPullRequestPanel(180줄)·미션보드(360줄) green.

### 2.9 리서치 (research)

**컨셉**: 관전과 개입. 로직 레이어(researchSwarm/Runner/Workspace/conversationSwarmPlan) 불변, 프레젠테이션 ~1,130줄 재작성.

**레이아웃**: board 상태 풀블리드 `.research-v2`(columns 300px|1fr, rows auto|1fr|auto, areas "header header"/"rail computer"/"bar bar"). rail = 마스터플랜(접기, 12명 이상 기본 접힘)+요원 로스터. computer = AgentComputerHeader(고정)+스텝 타임라인(스크롤)+결론 블록. bar = notice(U19)+중단/보고서/새 조사. setup 상태는 풀블리드 아님: nav-center-page 센터 칼럼 max-width 880px, 요원 카드 그리드 auto-fill minmax(240px,1fr)(16명 시드도 한 화면). 반응: 1024 미만 rail 가로 스트립 [조정: 1100→1024], 768 미만 setup 1열 [조정: 720→768].

**결함 수정(핵심)**: 프로바이더 변경 시 modelId defaultModel 자동 연동(:71-72, :276) / 새 조사 시 직전 보고서 보존(lastReportRef: swarm=null 후에도 다운로드 유지, 다음 배치 시 소거) / 중단 즉시 "중단 중" 피드백 / 실패 요원 선택 시 run.error 원문 렌더(researchSwarm.ts:53, destructive 좌보더 블록+요원 아바타 소형) / 러너 usage·rounds(runner:135-140) 헤더 노출+카운트업 / step.at 타임스탬프 mono / App.tsx:5508 serverBaseUrl 전달(coding·rmas와 동일화) / 하단 요원 스트립(:389-404) 로스터 통합(상태동사 이관, 아바타 34→40px 확대) / "Agent's Window" 죽은 span 삭제 / atLatest 죽은 경로 → useFollowScroll로 부활.

**라이브 델타**: `onDelta` 빈 훅(runner:155) 실구현: 타임라인 최하단 "생성 중" 행 실시간 append(mono, 최대 높이+내부 스크롤, 좌측 요원 아바타 20px), 라운드 종료 시 확정 스텝으로 치환. 계약 변경 아님(기존 시그니처 내).

**페르소나**: computer 헤더 = 48px 아바타 + displayName + 도감 caption(미활용 자산) + 상태점 + 요원별 토큰 카운트업 + 시작 시각. 로스터 진행 표시 = 12슬롯 4px 도트 → 아바타 하단 얇은 진행 바(role="progressbar", 동일 실데이터 :228-235). 결론 블록 = 아바타 24px+displayName 서명. 보고서 버튼 옆 완료 요원 아바타 스택(최대 6+N). setup 도감 픽커 = datalist → 18인 아바타+caption 그리드 팝오버(z-dialog), facet 문장 프리필 가시화. personaSprites 표정 바인딩은 자산 확인 후 선택 커밋. 아바타 "?" → 이니셜+surface-2 원형.

**상태**: 프로바이더 0개 = 오빗+"프로바이더 설정으로 이동" CTA(막다른 길 금지). 배치 직후 = 전 로스터 live 점 + "{이름} 준비 중"+spin(스켈레톤 남발 금지). 전원 실패/오프라인 = header 배너 승격(notice 중복 금지).

**뷰 고유 수용 기준**: research-swarm.css에 보라·`#34d399`·`#07070a`·var(--cyan) grep 0건, "⚠"/"▷" 0건, 실시간 델타 흐름 관찰, 프로바이더-모델 연동, 직전 보고서 잔존, 하단 스트립 부재.

### 2.10 페르소나 (persona)

**컨셉**: 정적 쇼케이스 → "내 캐릭터들이 지금 실제로 일하는 길드 홀".

**레이아웃**: 풀블리드 `.persona-v2` [조정 U5: .persona-hall 리네임, `__` 하위 클래스도 persona-v2__ 네임스페이스]:

```
columns: minmax(0,1fr) 340px / rows: auto auto 1fr
"header header" / "party duty" / "codex duty"
```
header: "소환진 · 페르소나" + 요약 스트립(가동 중 N · 오늘 활성 N · 도감 18, mono). party: 3열 카드, reason 칩은 배너 오버레이 → 카드 상단 캡션 행. codex: auto-fill minmax(150px,1fr) 18인 상시 그리드(캐러셀·is-expanded 토글 폐지). duty: 유리판 레일(가동 중 + 최근 작전). 반응: 1024 미만 "header/duty/party/codex" 1열, duty 가로 스트립 [조정: 1100→1024]. `.dashboard__*` 클래스 의존 전면 폐기(홈 CSS 무접촉 이탈).

**duty 레일**: `PersonaDutyRail.tsx`(presentational) + `lib/personaDuty.ts`(순수 view-model: AutonomyRunSummary running + RunningWorkItem + hermes 슬롯 병합). 귀속 규칙: personaName 있는 항목만 아바타 서명, 불명 항목은 말미 "이외 실행 N건 · 홈에서 보기" 집계(가짜 귀속 금지). 데이터는 App.tsx:5079 폴링 결과를 prop으로(뷰 폴링 신설 금지). 항목 = 아바타 32px + live 상태점 + 캐릭터명 + goal 1줄 + `step N` 카운트업. 소환진 카드 중 가동 중 캐릭터는 헤더에 동일 상태점(도감-라이브 연결).

**영속화(U11 유일 신규 키)**: `ai-orch.personaRunHistory.v1`에 AutonomyRunSummary 미러(append, 30건 cap). 최근 작전 행 = 아바타 24px 서명 + 클릭 시 재소환 프리필(onSummonPersona 동선) + 재시작 후 잔존 + 0건이어도 섹션 미숨김("아직 작전 기록 없음 · 첫 소환을 해보세요").

**토큰 재작성(styles.css 페르소나 구획)**: 레어도는 U4 표(SSR accent 셔머 포함, 신규 keyframe 1개 허용·가드 필수), HP `#46f0a0`→accent / MP `#46ecff`→fg-muted(U3), 카드 배경 rgba(20,20,40,.55)→유리판, 모달 퍼플 글로우·오브→accent-dim, 주 소환 버튼 퍼플 그라디언트→run 버튼 문법, `var(--cyan)` 포커스/run명→accent, radius 22/14/11/10→12, 모달 z 80→50, 부모 figure hover transform 삭제(-6px 이중 이동 해소, 자식 -2px 단일). 레어도 뱃지는 StatusBadge 시맨틱 차용 폐지 → `persona-card__rarity` 전용 클래스.

**모달(PersonaCodexModal)**: useDialogFocus(U1: ESC/트랩/autofocus/복귀), role="dialog"를 section으로 이동, 내부 2중 스크롤 → 모달 본문 1겹(SOUL clamp 해제, 표정 28종 그리드 본문 편입). 콘텐츠·소환 3액션·배지 전부 보존.

**HP/MP 실바인딩**: U3 정본(agentMemoryQuality 매핑 + run history 완료율). `rarityForScore` 합성식이 자동 추종: 성과에 따라 카드가 진화하는 실제 가챠 감각. 스탯 라벨 `title="기억 품질 · 최근 작전 기반"`.

**뷰 고유 수용 기준**: 18인 무스크롤 그리드, duty 라이브 아바타+맥동+카운트업, 재시작 후 기록 잔존, 모달 스크롤 1개, 페르소나 구획 보라·cyan grep 0, 홈·SummonTheater·AutonomyRunPanel 회귀 0(persona-card 마크업 호환), PersonaCard 헤더 초상 onError 폴백.

### 2.11 어시스턴트 인박스 (command_center)

**컨셉**: "컨트롤 셸 위의 제로 데이터" 역전: 캐릭터들이 무엇을 관측·수행 중인지가 첫 화면인 관측 데스크. 읽기 전용 계약(`data-action-scope`, inboxInvariant.ts) 유지, read-only 선언은 헤더 배지 1개로 단일화.

**레이아웃**: 풀블리드 `.inbox-v2`:

```
columns: 260px | 1fr | 340px   [조정 U6: 248→260, 320→340]
rows: auto | 1fr
"header header header" / "rail board dock"
```
header: 제목·좌석 스위치·텔레메트리 5칩(후보/ready/blocked/러너 live/신규 이벤트, 나머지 12칩은 확장)·"관측 전용" 배지·overflow(MoreHorizontal). rail: 레인 6개+저장 뷰 드롭다운. board: 통합 필터 1줄(검색 1+세그먼트 3: 준비도/종류/위험)+후보 리스트(레인 캡 3개 → "더보기 N"). dock: 페르소나 러너 시어터. 드로어 = grid 밖 z-dialog 단일 인스턴스(top 56px, width 400px, 내부 스크롤, dock 위 덮음). 반응: 1280 이하 dock 하단 스트립 / 1024 이하 rail 가로 칩 행+드로어 풀폭 시트 [조정: 960→1024]. toast safe-area 132px 예약 제거(board padding-bottom 24px).

**IA**: CommandDeck 12버튼 → 팔레트(기존 InboxCommand)+overflow 메뉴, 단축키 8kbd → `?` 오버레이, 레거시 4섹션 그리드 → 하단 "원천 데이터" 아코디언 1개, WIC 메타 5층 → 드로어 "운영" 탭. "ready" 3중 컨트롤 → 준비도 세그먼트 1개, 검색 1개, 카테고리 어휘 1벌(필터 총수 12 이하). 드로어 2종 → InboxDetailDrawer 통합(탭 실동작+hidden+useDialogFocus, 기존 DetailSections 6개 탭 패널 재사용).

**페르소나(이 뷰 최대 증분, 현재 0)**: PersonaRunnerTheater = 행마다 personaIdentity(U1) 해석 아바타 40px + 상태점(live 맥동/stalled warning/done solid/error halo) + 캐릭터명·role + lastOutput 1줄 말풍선 + branch mono 칩 + 표정 팩 바인딩(running→curiosity, done→approval, stalled→annoyance, error→anger, 3단 폴백). 실측 스탯 = eventCount/artifactCount/ageMinutes(:1379-1397 기존 데이터) 미니 스탯 3개 카운트업(HP/MP 대체, 전부 실데이터). 후보 행 = runner 시그널 링크 있는 행에 미니 아바타 20px 스택. 드로어 Runner Signals 항목 = 수행 서명(아바타+이름+시각). 빈 상태 = 오빗+페르소나 대기 로스터(아바타 5~6 idle 점)+카피 "관측된 신호가 없습니다. 러너가 일을 시작하면 이 자리에 나타납니다."+PREVIEW 데모 CTA(local-view 스코프). `dgx_disabled`는 dock 상단 정직 배지. "cosplay 금지" 테스트 프레임 이 서피스 복제 금지, 역으로 "아바타 렌더" 계약 테스트 신설.

**a11y**: 단축키 document 레벨 승격(input 포커스 가드), CommandDeck 점프 no-op → disabled+aria-disabled, text-[9px]+opacity 45% 전면 금지, rowActivation 패턴 유지.

**뷰 고유 수용 기준**: 첫 뷰포트 컨트롤 2층 이하, 필터 12 이하·검색 1·ready 1, 드로어 동시 1+hidden 패널+트랩, inboxInvariant 전 테스트 green(신규 포함 data-action-scope), testid 보존.

### 2.12 설정파일 (config_files)

**컨셉**: "캐릭터들이 입고 일하는 지침(장비) 라이브러리". 중심 질문 = "이 파일을 지금 누가 입고 있는가"(`linkedAgentIds`가 실프롬프트 주입 유일 키, agentRuntimeConfig.ts:39).

**레이아웃**: 풀블리드 아님. 셸 현행 `.compact-rail-shell`+우측 280px AgentsSidebar 유지, 컨테이너 max-width 1280px 중앙. 루트 `.config-v2` [조정 U5: .config-lib 리네임]:

```
columns: 300px 1fr   [조정 U6: 320→300]
rows: auto 1fr auto
"header header" / "list editor" / "feed feed"
```
header: 타이틀+부제 "에이전트 지침 라이브러리"+종류 세그먼트 탭 5종(count mono)+검색 / 우: "앱 내장 라이브러리" 뉴트럴 칩(정직성 문단+amber 배지 2중 → 이 칩 1개)+새로 만들기(accent). editor 내부 rows auto|auto|1fr|auto: 툴바(체크포인트/복제/불러오기/내보내기+자동반영 인디케이터 "자동 반영됨 · HH:MM") / 착용 에이전트 행 / 본문 textarea(mono 13px) / 메타 풋라인(범위 select · 버전 mono 읽기전용 · 태그 · 논리 경로 mono+복사: 자유 편집 제거). 반응: 1024 미만 280px, 768 미만 1열 [조정: 900→768].

**시맨틱 교정 3건(UI 레이어, 계약 무관)**: 탭 클릭=탐색만(빈 종류=빈 상태+CTA, 생성 부수효과 제거) / Save → "체크포인트 기록"(이벤트 기록+버전 자동 +1+체크 피드백) / 복제본 v1 시작(controller:81의 +1 제거). 이벤트 페이로드 4종 shape 불변, version 단조성 의존처 발견 시 후퇴안(체크포인트만 +1) 적용.

**페르소나 체인(화면의 척추)**: 카드 아바타 스택(18px, 최대 4+N, "미착용" 뉴트럴 표시) / 착용 에이전트 편집 행(칩 24px+X 해제+"+" 팝오버 아바타 그리드, 신규 초안 자동 링크 즉시 가시화) / 활동 피드 캐릭터 서명("쿠루미의 SOUL.md v3 기록됨 · 2분 전") / 우측 레일 상호 하이라이트(selectedAgent 재사용: 착용 파일 accent 보더+"쿠루미 착용 n건 · 해제" 필터 칩) / 프로필 팩=장비 세트(역할 초상+"적용" 팝오버, 결과가 아바타 스택 변화로 가시). 라이브 착용 카드 상태점 = 착용 에이전트 중 라이브 활동 시 accent 맥동.

**신규**: ConfigLibraryView / ConfigFileList / ConfigFileEditor / ConfigLinkedAgentsRow / ConfigActivityFeed(팩 카드 내장). 토큰: `#fbbf24` 인라인 배지 제거, `#6b4e24`·`rgba(0,0,0,.4)` 치환, radius 7/8→12, `--cyan`→accent.

**뷰 고유 수용 기준**: Queue/Coding Packet 버튼·TerminalDock 부재(conversationShellVisibility 갱신), 착용 편집→카드 스택·레일 하이라이트 즉시 갱신+`selectAgentRuntimeConfigFiles` 결과 검증(agentRuntimeConfig 무수정), 빈 탭 생성 0, 체크포인트 +1·복제 v1, 임포트 실패 destructive 배너, 초광폭 1280 캡.

### 2.13 관리 묶음 (management: sessions/projects/providers/channels/backup + 오버레이)

**컨셉**: "레일용 미니패널의 카드 승격" 잔재 청산. 관리 페이지 문법 신설: 페이지 헤더(제목+설명+라이브 스트립+주 액션+활동 캐릭터 스택) → 1차 작업면 → 2차 보조면.

**레이아웃**: nav-center-page 거터 유지(풀블리드 아님). 공통 래퍼 `.mgmt-page`:

```
columns: minmax(0,1fr) 340px / rows: auto auto 1fr
"head head" / "strip strip" / "main side"
```
반응: 1024 미만 1열 [조정: 960→1024]. side는 minmax(300px,340px).
- sessions: main=세션 테이블형 목록(캡 해제: 상태점|제목|노드|갱신시각 mono|재생·이름변경), side=런타임 노드 카드(재부팅 승인)+승인 큐 요약(처리 정본은 드로어 딥링크, 사유 캡션 승격). "운영 상태" 접힘 섹션 main 하단 full-width.
- projects: main=탭(패킷/실행/인사이트, localStorage 유지), side=브랜치 실험(아바타)+메모리 딥링크. dead prop reviewMode 제거.
- providers: `280px | minmax(0,1fr)` 마스터-디테일(920px 단일 컬럼 오버라이드 교체), 210px 내부 스크롤 감옥 해제(.left-rail.provider-mode 전용 유지). 디스커버리 진행 = 버튼 내 스피너+라벨.
- channels: main=가로 가드 스테퍼(차단 스텝에서 destructive 단선)+인입 목록, side=어댑터 카드(하드코딩 2종은 "설정 필요" 정적 안내 카드로 정직 표기, U21).
- backup: main=projection 카드 목록(빈 상태 신설), side=마스킹 상태.

**오버레이**: ControlQueueDrawer z-30→50+백드롭+aria-modal 정합+tablist 화살표 순회+requestedBy에 PersonaChip(토스트바와 신원 표기 동일화)+amber 토큰화, 레인/일괄승인 로직 불변(테스트 8 it). ApprovalToastBar = 토큰 치환만(구조·문구·테스트 11 it 불변), 폴백 로직은 personaIdentity(U1)로 추출 후 역소비. dialog층 동시 개방 금지(U8). RuntimeRailPanel은 분리하지 않고 `variant?: "page"|"sheet"` prop(기존 gating 테스트 2케이스 유지).

**CSS 전략**: `.mini-panel/.rail-*`는 묶음 밖 4컴포넌트(AgentConfigDrawer/AutonomyRunPanel/ConfigLibraryPanel/MissionBoardPanel)와 공유 → 직접 수정 금지, `.mgmt-*` 네임스페이스 포크, 원본 존치.

**상태 언어**: railStatusLabels 확장 단일 사전(U21), "failed=초록"(styles.css:875-878) 폐기, 하트비트 칸 에러 욱여넣기 폐기(상태=점+단어, 전문=접힘 mono 행), 시드 데이터 "마지막 점검 전" 라벨. 죽은 `pulse` 규칙(styles.css:1614-1617) → dot-pulse 가드 교체.

**페르소나**: 드로어·운영 카드 승인 항목 = 요청 캐릭터 PersonaChip(해석 실패 시 actor 라벨 폴백). tmux 항목 = TmuxPaneRole → StatusBadge 역할 톤 칩(기성 자산 첫 소비). projects 브랜치 = branchAgentNameLabel에 아바타+실행 중 상태점. 런타임 노드 = "감시: 프리렌" 칩(watchdog identity). 헤더 아바타 스택 = 페이지 관련 활동 캐릭터(실데이터 없으면 미렌더).

**뷰 고유 수용 기준**: 5페이지 헤더+스트립, 세션 캡 해제, 영어 enum 0건, 새로고침·점검·디스커버리 즉시 피드백, 드로어 백드롭+Esc+화살표+복귀 포커스, 묶음 밖 4컴포넌트 스크린샷 무변, 기존 테스트 8파일+토스트 11 it green.

---

## §3 크로스뷰 일관성 규칙 (같은 위젯 = 같은 문법)

| 위젯 | 정본 문법 |
|---|---|
| 상태점 | 8px 원, data-tone: idle=fg-muted 55% / live·thinking=accent+`box-shadow 0 0 0 3px var(--accent-dim)`+dot-pulse 1.6s / done=accent 솔리드 / error=destructive+동일 halo / waiting=warning. 항상 텍스트 라벨 동반(색 단독 금지), 장식 상태점 금지 |
| 카운트업 | `lib/useCountUp.ts`(raf 420ms cubic ease-out, reduce 시 즉시 스냅) + `.aol-mono`(tabular-nums) 필수. 최종값을 aria-label로 |
| 카드 | 유리판 = `color-mix(in srgb, var(--surface) 60~88%, transparent)` + blur 8~10px + 1px var(--border) + radius 12. 강조 = border-left 2px(진행 accent) / 3px(승인 warning·에러 destructive) |
| 상태 스트립 | 한 줄 flex, 항목 사이 1px 세로 sep, 숫자 strong+mono. 수치 정본 1곳 원칙(U17) |
| 빈 상태 | 오빗 120px(보조 존 72px) + 타이틀 + 보조문 + accent-dim CTA. 빈 껍데기 다열 렌더 금지(단일 중앙 상태) |
| 에러 배너 | header grid area 공유(rmas__top 패턴: 타 셀 불침범, z 불요), destructive 좌보더 + fade-in 200ms + 재시도 버튼(stop 문법). 마지막 정상 데이터 보존, 화면 전체 에러로 죽이지 않음 |
| 캐스트/로스터 레일 | 폭 U6 스케일, 행 = 아바타(36~44px)+캐릭터명+역할 라벨(muted)+상태점+뷰별 실측치 1개(mono). 정렬은 개입 필요 우선(blocked>waiting>active>idle>done). 1024 미만 가로 아바타 스트립 |
| 수행 서명 | PersonaChip(U2). 영수증·타임라인·피드·근거·발화자·미션 카드 공통. 신원 미상="시스템"/actor 라벨/이니셜(빈칸·가짜 배정 금지) |
| 승인 카드 | U16 문법. 처리 정본=ControlQueueDrawer, 배너류는 가리키기 전용 |
| 탭 | U15 tablist 문법. 선택 표시 = 배경+2px accent 하단 보더(색 단독 금지) |
| 오버레이 | U8 2단(모달 50=useDialogFocus 필수 / 비모달 시트 20). dialog층 동시 1개 |
| notice | U19 3톤 |
| 팔로우 스크롤 | useFollowScroll(임계 80px, "최신으로" accent-dim 필). smooth scroll은 reduce 시 auto |
| 배경 | 풀서피스 = `radial-gradient(1200px 420px at 78% -10%, var(--accent-dim), transparent)` + var(--bg). ambient-bg.jpg는 홈 전용 |
| 버튼 | run=accent bg+#052E16 / stop=destructive 14% bg+55% border / ghost=surface 82%+border, hover accent 45%+accent-dim / focus-visible outline 2px accent offset 2px 전 요소(제거 금지) |
| 모션 예외 허용 목록 | 신규 keyframe은 persona SSR 셔머 1개만. 기존 유지: theater 마법진(가드 블록 이관), run 한코 slam·glitch(재조색), AgentPortraitFrame pulse-glow(가드 이관). 그 외 4종+spin 밖 신설 금지 |
| 반응 | U7 4단. 가로 스크롤은 내부 overflow-x 컨테이너만 |
| 상태 언어 | U21. 시드/픽스처는 실측과 구분 라벨 |

## §3.5 페르소나 재도입 (홈 포함)

v1이 홈에서 PersonaView로 이관했던 캐릭터 프레즌스를 각 작업 뷰에 되살린다. 이관된 기능(도감·상세 모달 등)은 persona 뷰에 그대로 두되, "일하는 순간의 캐릭터"는 모든 작업 화면에 존재해야 한다.

- **홈(DashboardView) 소형 슬라이스(HOME-P)**: ① 현재작업 히어로(RunningWorkCard)에 담당 페르소나 아바타 24~32px + 상태점(run 데이터의 personaName/participants 기반, 귀속 불명 시 미표시). ② "해온 업무"(WorkReceiptLedgerCard compact)는 CKP-C의 16px 수행 서명이 자동 파급: 홈 측은 테스트 갱신만. ③ 빠른시작 3버튼에 "도감에서 소환" 진입 유지. ④ `DashboardView.test.tsx:63`의 "does not render any cosplay elements" 테스트 폐기, "히어로에 담당 아바타 렌더" 계약 테스트로 교체. ⑤ RunningWorkCard 접촉이므로 abort PR 머지 후 착수(U20 게이트).
- 각 뷰의 재도입은 §2에 내장됨(conversation 수행 서명, cockpit 함대·서명, inbox 시어터, config 착용 체인, management 신원 칩 등). 원칙은 §1.2.

## §4 Grok 에셋 필요 목록

원칙: 기존 자산(aol-ambient-bg.jpg 홈 전용, aol-empty-state.jpg 오빗, 아바타 18종, 표정 스프라이트 308장/11인)으로 전부 충당한다. **v2 필수 신규 에셋 0건.** 소형 오빗(72px)은 동일 이미지 축소 사용.

선택(차단 아님, 별도 발주 시):
1. 표정 미보유 7인 표정팩(최소 4종: 기본/집중/만족/곤란): tmux P2·inbox 표정 바인딩·cockpit agentPortraitRegistry의 커버리지 확대용. 없으면 기본 아바타 폴백으로 정상 동작.
2. 아바타 404 정적 실루엣 1장: 이니셜 폴백으로 충분하므로 기본 생략.

## §5 구현 슬라이스 계획

### 5.1 파운데이션 (최우선, 전 뷰 선행)

| PR | 내용 | 파일 | 비고 |
|---|---|---|---|
| **F1** | 공용 프리미티브 6종 신설(U1) + 단위 테스트 | lib/useCountUp.ts, lib/personaIdentity.ts, lib/personaVitals.ts, components/persona/PersonaChip.tsx, hooks/useFollowScroll.ts, hooks/useDialogFocus.ts (전부 신규) | 기존 파일 무접촉, 충돌 0. 모든 뷰 슬라이스의 선행 |
| **F1b** | RunningWorkCard/RmasAgentRail 로컬 useCountUp 제거+import 교체, ApprovalToastBar 폴백을 personaIdentity 소비로 전환(표시 결과 불변) | RunningWorkCard.tsx, RmasAgentRail.tsx, ApprovalToastBar.tsx | **abort PR 머지 후**(U20). 홈·rmas·토스트 스모크 |
| **F2** | 크로스뷰 토큰 스윕(U12): PublicWorkTracePanel violet, AgentActivity 색만, ConversationWorkbench 535·544 violet 토글, Composer 보라 하이라이트, os-breathe/os-thinking 가드, body 배경 강제 제거(#09090b/#07070a), tokens.css reduce 블록 | PublicWorkTracePanel.tsx, shared/AgentActivity.tsx, ConversationWorkbench/index.tsx·Composer.tsx(색만), styles.css, tokens.css | 소비 4서피스(debate/tmux/conversation/coding) preview 스팟체크 동반. App.tsx 무접촉 |

### 5.2 웨이브 구조

- **Wave 0**: F1 → F2 (F1b는 abort 게이트 뒤).
- **Wave 1 (병렬 가능, App.tsx 무접촉 토큰/버그 PR)**: CONV-P1, DEB-1, ANX-A, TMX-1, CKP-A, THR-1, COD-A, RES-1, PER-A, INB-A·B, CFG-A, MGT-1. (RUN-1은 App.shellIaWiring 접촉이라 App 큐로.)
- **Wave 2 이후**: 각 뷰 내부 의존 순서(아래 표) + App.tsx 직렬 큐(5.4) + abort 게이트(5.5)를 동시에 만족하는 순서로.

### 5.3 뷰별 PR 목록 (편집 조정 반영)

**conversation**: CONV-P1 토큰 스윕(F2 중복분 제외: violet 토글·AgentActivity 제외) → CONV-P2 셸·헤더 병합(App: 잔재 변수 주입 5202-5204 제거, shellIaWiring 갱신) → CONV-P3 스레드(ApprovalCard·useFollowScroll·aria-live·수행 서명·TurnTelemetryStrip) ∥ CONV-P5 작전 콘솔(WorkTheater.tsx 삭제, U18) → CONV-P4 컴포저(P2 후, index.tsx 겹침) → CONV-P6 agents 이관·props 청소(App: 5656-5735, 유일 실질 App 변경. 충돌 시 @deprecated 후퇴안).

**debate**: DEB-1 토큰(debateChamberPresentation 본 서피스 톤, ANX-A와 같은 파일: 직렬 DEB-1 → ANX-A) → DEB-2 3열 재구성+파일 분해(+MissionBoardContainer import) → DEB-3 페르소나(agentVisualsById 수리, App 1곳) → DEB-4 스트리밍(onRoundComplete, App 승격 플로우). DEB-2→3→4 순차, 병렬 금지. (구 PR5는 F2로 폐지.)

**annex**: ANX-A 구조 재편+토큰(annex 전용 export 분리, :not 체인 무접촉) → ANX-B 페르소나(App 5796-5812 1구획) → ANX-C 상호작용·상태(App 4001-4008/4369/5739, 콕핏 점프 2종 회귀 테스트) → ANX-D 보류(별도 결정, stage3Runtime 공유라 DEB-4 이후 조율).

**tmux**: TMX-1 버그·데드코드·토큰(captured 매핑, F2 중복분 제외) → TMX-2 레이아웃(named grid, 로스터/디테일 분해, App 무수정 목표) → TMX-3 텔레메트리(useTmuxLiveCapture, F1 소비. TMX-2와 순차, App 접촉 시 큐 등록) → TMX-4 페르소나(AgentActivity 구조 개조: 대화 뷰 preview 검증을 수용 기준에 포함, 멱등 가드).

**cockpit**: CKP-A 토큰(F2 중복분 제외) → CKP-B 골격 평탄화(App: 5188+5779-5795, 문제 16 회귀 테스트, 라벨 상수 actionLabels.ts 추출) → CKP-C 서명+큐 통합(PersonaChip 소비, WorkReceiptLedgerCard: DashboardView.test 필수 통과) → CKP-D 라이브 텔레메트리(App 4625-4924 투영부 단독 점유, **abort 게이트 뒤**: RunningWorkCard 소비 전환 포함) → CKP-E 상태·a11y 마감.

**run**: RUN-1 셸 통합+토큰 퍼지(App shellIaWiring, 문자열 변경 몰아넣기) → RUN-2 상태 배선 수리(parallelRunStore·시드 해제·hasLoadedOnce, App 2줄) → RUN-3 single(PersonaCard 승격+U3 바인딩, **abort 게이트 뒤**: AutonomyRun 계열 인접) ∥ RUN-4 parallel(RUN-2 후) ∥ RUN-5 board 리스트 → RUN-6 board 상세 4탭(U15 예외, 최고 위험: 12카드 무수정·마운트 유지). styles.css는 RUN-1이 공통 셸 구획을 파일 말미 신설로 물리 분리.

**theater**: THR-1 토큰·골격(App 무접촉) → THR-2 상호작용(App 2곳: 5496 prop, 3716-3720 nav 해제) ∥ THR-3 스크러버 v2(eventTimeline 신규 export+테스트) → THR-4 시맨틱·페르소나(workTheater.ts 공유: U18에 따라 P5와 rebase 조율, U3 바인딩).

**coding**: COD-A 토큰·그리드 기반(coding-workbench.css 재작성, styles.css 10491 제거) → COD-B 분해·notice·스크롤(App 5500-5506 1회 접촉, useFollowScroll 소비) → COD-C 페르소나+텔레메트리(PersonaChip·useCountUp F1 소비 [조정: 자체 추출 삭제]) ∥ COD-D 상호작용 마감(combobox·2단 삭제·useDialogFocus) ∥ COD-E 미션보드·GitHub 정리(workbenchMissions 문구만, GithubPublishPanel 색 4곳, 미션보드 스모크 360줄 필수).

**research**: RES-1 토큰 부채(research-swarm.css 단독+글리프 2건, os-breathe는 F2로 이관 [조정]) → RES-2 상태 노출+결함 수정(App 1줄 serverBaseUrl, css 무수정 유지) → RES-3 board 레이아웃+분해(F1 소비) → RES-4 setup+라이브 델타(onDelta 실구현). (구 PR-5는 F2 이관으로 폐지, 잔여 마감은 RES-4에 흡수.)

**persona**: PER-A 토큰·프레임(U4/U3 색, persona-card 공유 3서피스 preview 필수) → PER-B 레이아웃(.persona-v2, dashboard__* 이탈, App 확인만) → PER-C 모달 a11y(useDialogFocus 소비, A 후) ∥ PER-D 텔레메트리(PersonaDutyRail·personaDuty·영속화 키·U3 바인딩. App 5084-5095/5364-5384: B 후 rebase, **abort 게이트 뒤**).

**inbox**: INB-A 토큰·어휘 정화(카피 핀 테스트 일괄 개정) ∥ INB-B 드로어 v2(useDialogFocus) → INB-C 셸 재구성(4,323줄 분해, App 마운트부 5607-5641만, 유일 App 접촉) → INB-D 페르소나 시어터(personaIdentity 소비) → INB-E 빈 상태·잔여.

**config**: CFG-A 토큰·a11y 부채(기존 패널) → CFG-B 뷰 골격(App 5642-5654+5322-5339, 유일 App 접촉. conversationShellVisibility 테스트 전건 green) → CFG-C 페르소나 체인(agentRuntimeConfig 무수정+런타임 주입 회귀 테스트) → CFG-D 시맨틱(체크포인트·복제 v1·탭 부수효과) → CFG-E 팩 적용+피드.

**management**: MGT-1 기반(railStatusLabels 확장·mgmt-* 포크·죽은 pulse, useCountUp/personaIdentity는 F1 소비 [조정: 자체 추출 삭제]) → MGT-2 sessions(App 5516-5552) → MGT-3 providers+channels+backup(App 무접촉) ∥ MGT-4 projects+페르소나 → MGT-5 오버레이(App 5885-5974: 동시 개방 금지 정책) → MGT-6 마감 스윕(ConversationWorkbench 건은 F2로 이관 [조정]).

**HOME-P**: §3.5 홈 소형 슬라이스. **abort 게이트 뒤**, CKP-C 이후(서명 파급 수용).

### 5.4 App.tsx 직렬 큐 (전 레인 공용 락: 한 시점에 오픈 1개)

App.tsx(~6,000줄)는 전 뷰 공유. 접촉 PR은 아래 기본 순서로 직렬 머지하고, 각 PR은 자기 뷰 구획만 접촉한다. 순서 원칙: 접촉 면적 작은 것 먼저, 같은 뷰 내부 의존 준수, abort 게이트 대상은 뒤.

1. RES-2 (1줄) → 2. RUN-1 → 3. RUN-2 (2줄) → 4. THR-2 (2곳) → 5. CONV-P2 (잔재 제거) → 6. DEB-2 → 7. DEB-3 → 8. DEB-4 → 9. ANX-B → 10. ANX-C → 11. COD-B → 12. CFG-B → 13. INB-C → 14. MGT-2 → 15. MGT-5 → 16. CKP-B → 17. PER-B → 18. CONV-P6 → **[abort PR 머지 게이트]** → 19. CKP-D → 20. PER-D → 21. HOME-P → 22. (필요 시) TMX-3.

큐 관리자는 rebase 상황에 따라 인접 순서를 바꿀 수 있으나, 같은 뷰 내부 순서와 게이트는 불변.

### 5.5 abort PR 게이트

현재 진행 중인 autonomy 중지(abort 핸들) PR이 App.tsx·RunningWorkCard.tsx·autonomousRun.ts를 접촉한다. 다음 슬라이스는 abort PR 머지 후에만 착수: **F1b, CKP-D, RUN-3, PER-D, HOME-P**. F1은 신규 파일만이라 무관, 나머지 Wave 1은 전부 무관.

### 5.6 공유 파일 소유권 표

| 파일 | 소유 슬라이스 | 다른 슬라이스의 접촉 규칙 |
|---|---|---|
| App.tsx | 5.4 큐 | 큐 밖 접촉 금지 |
| styles.css | 뷰별 신규 구획은 파일 말미 append-only 블록(뷰명 주석), 기존 구획 수정은 해당 뷰 토큰 PR만 | :not 체인 추가 금지(U5) |
| tokens.css | F2 | 이후 무접촉 |
| PersonaCard/persona-card CSS | PER-A | run·theater는 소비만, 시각 회귀 스크린샷 3서피스 |
| shared/AgentActivity.tsx | F2(색) → TMX-4(구조) | conversation preview 동반 |
| PublicWorkTracePanel.tsx | F2 | debate·tmux 소비만 |
| lib/workTheater.ts | THR-4 | CONV-P5와 U18 rebase 규칙 |
| workbenchMissions.ts | COD-E(문구만, 스키마 불변) | inbox는 personaIdentity 렌더층 어댑터로 우회 |
| WorkReceiptLedgerCard.tsx | CKP-C | 홈 compact 호환+DashboardView.test 필수 |
| debateChamberPresentation.ts | DEB-1 → ANX-A(전용 export 분리) | 직렬 |
| stage3Runtime.ts | DEB-4 | ANX-D는 그 후 별도 조율 |
| rail-*/mini-panel CSS | 수정 금지(MGT-1이 mgmt-* 포크) | 묶음 밖 4컴포넌트 회귀 0 |
| conversationShellVisibility.ts | CFG-B | 대화 뷰 기존 테스트 전건 green |

## §6 검증 계획

**전 슬라이스 공통 의무** (화면 PR preview 필수 보고 룰 적용):
1. typecheck / build / test green(라벨·클래스 단언 갱신 명시).
2. 1440x900 preview 스크린샷 + preview 실행 여부(yes/no)+사유+대체 검증 보고.
3. reduced-motion 에뮬레이션: 맥동·카운트업·feed-in·spin·smooth scroll 전부 정지(스냅), 정보 손실 0.
4. 해당 뷰의 §2 뷰 고유 수용 기준 체크리스트를 PR 본문에 첨부.

**크로스뷰 grep 게이트** (Wave 완료 시마다 + 최종):
- 색: `violet|purple|#8b5cf6|8B5CF6|139,92,246|167,139,250|#46ecff|#46f0a0|#ffd166|#34d399|#9b6bff|#378add|#c4b5fd|#7c3aed|#fbbf24|#6b4e24|cyan-|sky-|fuchsia-|teal-|zinc-|#09090b|#07070a|#0a0a0b|var\(--cyan\)` = 대상 구획 0건(role glow 변수 선언·아바타 아트 제외).
- 문자열: em-dash·이모지·글리프(✓ ◎ ✦ ⚠ ▷ ⌁ ⎇ ★단 SSR★ 텍스트는 허용) = 사용자 노출 0건.
- 구조: radius 12 일탈(명시 예외 제외), z-index 4단 밖 0건, 11px 미만 텍스트 0건(관리·인박스 12px), tabular-nums 미적용 수치 0건, **`--persona-glow-*` 참조는 아바타 프레임 컴포넌트(AgentPortraitFrame·PersonaCard·PersonaChip 아바타 링) 밖 0건** [검수 T-13], **v2 완료 시점 신규 작성 코드 `.rmas-mono` 0건(별칭 처리 후)** [검수 T-14].

**공유 컴포넌트 회귀 매트릭스** (해당 슬라이스에서 preview 스팟체크):
| 변경 | 확인 서피스 |
|---|---|
| PersonaCard(PER-A) | persona, run single, theater |
| AgentActivity(F2, TMX-4) | conversation, tmux, **AutonomyRunPanel, PersonaView** [검수 F-4] |
| avatar-with-status(CONV-P1) | conversation, tmux, cockpit, debate |
| PublicWorkTracePanel(F2) | debate, tmux, conversation |
| WorkReceiptLedgerCard(CKP-C) | cockpit, 홈 |
| workTheater.ts(THR-4) | theater, 작전 콘솔(또는 WorkTheater) |
| workbenchMissions(COD-E) | coding, conversation |
| personaSprites 소비(TMX-4·INB-D) | AutonomyRunContainer, AutonomyRunPanel, PersonaView, conversationAgentPortrait [검수 F-4] |
| rail-* 무수정(MGT-1) | AgentConfigDrawer, AutonomyRunPanel, ConfigLibraryPanel, MissionBoardPanel |
| useCountUp F1b | 홈 RunningWorkCard, rmas 레일 |

**상태 커버리지 매트릭스** [검수 UX-20 신설]: 최종 통합 검증 산출물로 **13뷰 x {로딩 / 빈 / 에러 / 부분 실패} 매트릭스**를 작성해 PR 본문(마지막 Wave)에 첨부한다. §2에 명시된 칸은 해당 정의를, 공백 칸은 §3 기본 문법(스켈레톤 무모션 / 오빗 / U23 배너+마지막 정상 데이터 보존) 상속을 기본값으로 선언하고, 상속으로 커버되지 않는 칸이 발견되면 결함으로 등록한다.

**페르소나 텔레메트리 정직성 검증** [검수 UX-5]: v2 완료 시점에 18인 기준 HP/MP tier 기본값 고정 비율을 측정·보고(목표: HP 0%, MP 50% 미만). 미달 시 U3 산식 후속 개선 후보(theater 승인 비율 블렌드 등)를 재개봉한다.

**기능 회귀 핵심 시나리오** (최종 통합 검증):
- 소환 → run 실행 → theater 관전 → 홈 히어로 → persona duty → cockpit run 카드: 같은 run이 5화면에서 같은 캐릭터·같은 상태점으로 보인다(신원 일관성). **같은 상태에서 같은 표정이 보인다(personaExpression 정본, 표정 일관성)** [검수 T-7].
- 승인 1건: 발생(tmux/conversation) → 토스트바 → 드로어 처리 → cockpit 카운터 감소: 전 구간 동일 신원 표기(PersonaChip), 카운트 정본 위치 준수(U17). **tmux 인라인 직접 승인 경로와 드로어 경로의 결과 동일성(멱등 가드 포함)** [검수 UX-6].
- 콕핏 점프 2종(annex memory/queue 착지), debate 승격 직후 관전+완료 자동 이동 가드, coding /fork 보드 자동 열림(+미션 존재만으로는 미열림), research 새 조사 후 직전 보고서 잔존, persona 앱 재시작 후 기록 잔존, **inbox 드로어 열린 채 ↑↓ 연속 검토** [검수 UX-4], **tmux 연결 단절 시 로스터 정직 표기** [검수 UX-10].
- 계약 불변 검증: stage33TmuxServer·provider-completions·/cockpit/snapshot 호출부 diff 0, localStorage 키 신규는 `ai-orch.personaRunHistory.v1` 1개뿐임을 grep으로 확인.

---

## §7 기각한 지적과 이유

3렌즈 검수 총 46건 중 40건 수용(문구 정정·구조 개정 포함), 아래 6건은 기각 또는 대안 중 미채택. 기각분도 전부 대안 경로로 해소되었거나 근거를 명시한다.

**R1. [UX-4의 대안 B] "inbox 상세 드로어를 비모달 z-rail 시트 예외로 지정" — 기각 (대안 A 수용)**
지적의 본질(후보 연속 검토 시 열기·닫기 왕복)은 드로어 내 이전/다음 내비게이션 + 리스트 ↑↓ 연동(U8·§2.11)으로 해소했다. U8 2단 레지스트리에 첫 예외를 만들면 오버레이 규율 자체가 약화되고, 읽기 전용 계약(inboxInvariant) 하에서 포커스 트랩·inert가 주는 "지금 무엇을 검토 중인가"의 명료성이 비모달보다 낫다.

**R2. [UX-6의 대안 B] "tmux 큐잉 전용화 + 멱등 가드를 ControlQueueDrawer로 이동" — 기각 (대안 A 수용)**
tmux는 승인이 발생하는 현장이고 기존 approve/reject 배선이 실동작한다. 발생 현장에서 처리 못 하고 드로어 왕복을 강제하면 처리 시간만 늘고, U16의 "인라인 카드=컨텍스트 사본" 취지(같은 시각 문법, 같은 액션)와도 어긋난다. U16 표를 직접 승인으로 갱신하는 쪽으로 모순을 해소했다.

**R3. [taste-8의 대안] "verdict 260 스냅 또는 U6에 '축소 변형 260' 규칙 승격" — 기각**
UX-1(1024~1439 구간에서 피드가 최협 열이 되는 위계 역전)을 수용하면서 1280 미만 verdict 고정 레일 자체가 소멸(접이식 전환)했으므로, 축소 고정 폭이라는 개념이 사라졌다. 두 지적을 하나의 해법으로 해소했고, U6에 축소 변형 규칙을 추가하면 3단 스케일이 사실상 4단이 되어 레지스트리 취지가 희석된다.

**R4. [taste-17①] "히트 타깃 24px 하한" — 기각 (UX-21의 28px 채택)**
같은 문제(뷰별 24/28px 이원화)에 대한 두 검수의 제안이 갈렸다. 이원화 해소가 목적이라면 하향이 아닌 상향 통일이 안전하고, coding이 이미 28px를 기준으로 설계되어 있어 28px 단일(U24)로 확정했다. 24px 하한을 택하면 "하한 24 + 관행 28"의 이중 기준이 재발한다.

**R5. [taste-17②] "research setup도 풀블리드로 통일" — 기각 (동일 지적의 차선인 '의도적 예외 명기' 수용)**
setup→board는 세션당 1회 수준의 단방향 전이(구성 문서 → 관제면)로, run의 초 단위 모드 왕복과 달리 공간 기억 보존의 이득이 없다. setup을 풀블리드+내부 max-width로 바꾸면 nav-center-page 거터 문법(관리·config와 공유)에서 이 뷰만 이탈해 오히려 일관성이 깨진다. §2.9에 예외 근거를 명문화하는 쪽으로 해소했다.

**R6. [UX-17의 대안 A] "persona codex·party 카드 높이 수치 상한 명시" — 기각 (대안 B '수용 기준 교정' 채택)**
카드 높이는 콘텐츠(캐릭터명 길이·배지 수·레어도 프레임)에 종속이라 스펙에 픽셀 상한을 박으면 첫 콘텐츠 변경에서 깨지는 죽은 수치가 된다. 지적의 본질은 "무스크롤 주장의 검증 가능성"이므로, 수용 기준을 "구획 페이지 스크롤 0 + 구획 내 스크롤 최대 1"로 교정(§2.10·§2.9)해 preview에서 기계적으로 판정 가능하게 만들었다.

**참고(기각 아님, 조건부 처리)**: taste-16이 요구한 "기록 시작을 파운데이션 시점으로"는 append 로직(F1)과 배선(F3)으로 분리 수용했다. 배선 파일(autonomyRunHistory.ts 인접)을 abort PR이 접촉한다는 feasibility-1의 사실 확인 때문에 배선만은 게이트 뒤 1순위로 두는 것이 물리적 하한이며, 이는 지적의 취지(U3 소비자보다 기록이 먼저)를 게이트 제약 내 최대한으로 충족한다.