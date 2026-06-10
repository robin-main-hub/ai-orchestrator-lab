# 46 — 정식 프로그램 완성 스프린트 (20 패치)

6-차원 멀티에이전트 감사(51 발견) → 우선순위 20 패치. 자율 세션에서 전부 구현·머지.

## 토론 엔진을 진짜로 (마퀴 기능이 목업이었음)
1. **토론을 실제 멀티에이전트 엔진으로** — `handlePromoteToDebate`가 목업
   `createStage3DebateSession`(박힌 한글 문자열) 대신 `runStage3DebateSession`(실제
   LLM 호출) 호출 + 로딩/에러 상태. 엔진이 UI에서 죽은 코드였음.
2. **이전 라운드 발언을 라운드 프롬프트에 주입** — 같은 정적 컨텍스트만 돌려서
   에이전트가 서로 반응 못 함. 라운드 누적 요약 추가.
3. **발언 간 링크(수용/기각/부모/결정)** — 엔진이 안 써서 confidence 항상 0.5,
   결정 노드 0. 라운드 후 링크 패스 추가.
4. **의장 결정 요약 카드** — synthesizeChairmanDecision 출력이 화면에 없음.
5. **입장(stance) 추적 + 라운드 간 입장 변화**.
6. **라운드 컨트롤 라이브 + 패킷→executor 연결**.

## 중복 진입점 정리
7. 백업 5중복 → BackupRailMenu 정본.
8. 런타임 페이지 중복(legacy 인라인 패널 + 세션 페이지 2중 마운트) 제거.
9. 승인 큐 2중 경로 → ControlQueueDrawer 정본.
10. 외부 인입 4버튼 → ChannelRailPanel 정본 + 죽은 IngressGuardPanel 삭제.
11. 죽은 ProviderProfilesManagerPanel 삭제(렌더 안 됨).
12. 기억 remember/에디터 진입점 정리.
13. 코딩 패킷 3중복 버튼 정리.
14. 네비게이션 2중 시스템(홈/대시보드, 콕핏 3진입) 통합.

## 죽은/안 먹는 버튼 + 폴리시
15. 미리보기 패널 모드 — 백킹 소스 없음 → 연결 또는 메뉴에서 숨김.
16. 콕핏 명령 팔레트 별칭 → 명명된 카드로 deep-link.
17. 죽은 버튼 disabled 처리(ResearchAgentComputer 출력 없는 행 등).
18. executor 경로 활성화 — `agent_executor enabled:false`라 승인된 작업이 실행 안 됨.
19. 토론 end-to-end 스모크 + 골든 출력 테스트.
20. 단일 액션 레지스트리 — 중복 근본 원인(같은 핸들러 산발 배선) 차단.

## 추가 a11y/폴리시 (감사 부산물)
- `.rail-icon-button` hover/focus-visible 상태(7개 레일 패널 공용).
- 아이콘 전용 버튼 aria-label(title만으론 스크린리더 안 읽힘) — 특히 노드 재부팅.
- DGX 승인/거부 버튼 색 구분(거부=rose) + 포커스 링.
- 노드 재부팅 버튼에 파괴적 경고 색.
- WorkbenchHeader 칩 3/4개 툴팁 없음.
- OperatorCockpit "건" 단위만 남은 placeholder 텍스트.
- AgentCard 수정/삭제 버튼 키보드 포커스 시 노출.
- 리서치 스웜 포커스 링 + 스트립 아바타 alt.

전제: dgx-02 재배포 완료(최신 코드+CORS). 서버 백엔드 기능 배선 가능.
