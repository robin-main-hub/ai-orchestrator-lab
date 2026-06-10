# 45 — 대화형 코딩 멀티에이전트 로드맵 (Manus + Kimi 보고서 종합)

마누스 3편(조사 노트·구현 체크리스트·조사 보고서)과 키미 보고서를 종합해,
"opencode를 우리 OS에 구현 + 그 이상"으로 가는 길을 정리한다. 혼자 쓰는 도구이므로
복잡도는 허용하되, 두 보고서가 일치하는 안전 원칙(orchestrator는 코딩 금지,
worktree 격리, 승인 게이트, sequential merge)은 그대로 따른다.

## 이번 PR에 들어간 즉시 개선 (UX)

1. **추천대화 = 클릭 즉시 전송** + 우측 **연필 버튼**으로 수정 모드(드래프트로 옮겨
   이어쓰기). 두 보고서의 "lead-mediated, 빠른 반복" 방향.
2. **입력창 자동 성장** — 긴 추천대화/멀티라인이 들어와도 줄 안 잘림(최대 ~5줄 후 스크롤),
   고DPI 받침 클리핑 해결.
3. **Codex식 사이드 패널** (`ChatSidePanel`) — 대화를 가리지 않는 우측 분할.
   우상단 ▣˅ 메뉴: 미리보기 / Diff / 터미널 / 파일 / 백그라운드 작업 / 계획.
   - 백그라운드 작업 = 위임 콘솔(에이전트 출격 현황)을 스레드 위가 아니라 패널에서,
   - 터미널 = 승인 게이트 큐, 계획 = 작업 분해 카드. 패널 안에서는 1열로 정리.
   - 스레드를 덮던 MakimaDelegationConsole을 슬림 배너 + 패널로 이동.
4. **반응형** — body min-width 1180→640, nav-center-shell을 유동 셸 그룹에 편입,
   대시보드 카드 그리드/히어로가 좁은 폭·낮은 높이에서 비율대로 축소(가로 스크롤 0).

## 두 보고서 종합 — 우리만의 차별점

| 일치 원칙 (둘 다 강조) | 우리 현황 |
|---|---|
| orchestrator는 코딩 금지, 분해·위임·검증만 | 역할 정책으로 강제 예정 (Lead = no edit) |
| 구현 worker마다 git worktree | ✅ missionWorkspace (PR #449) |
| plan/build + 승인 게이트 | ✅ 코딩 워크벤치 + 게이트 |
| sequential merge, verifier | 백로그 (아래 Phase) |
| 역할별 모델 라우팅 | 백로그 — 키미 "93.8% Problem" |

### 키미 보고서 차별 통찰 (수치·패턴)

- **93.8% Problem**: Claude Code 토큰의 93.8%가 Opus, 그 96%가 캐시 읽기 낭비 →
  **자동 모델 라우팅이 최고 ROI**. (Haiku는 Sonnet의 ~1/10 비용, 60%를 Haiku로
  돌리면 30–50% 절감.) 우리는 이미 페르소나↔모델 매핑이 있으니, 카테고리 라우팅
  (deep=Opus / quick=Haiku / visual=Gemini)으로 확장.
- **3-Layer Deterministic Control Stack**: PreToolUse(차단) → PostToolUse(비차단
  병렬) → Stop/SubagentStop(최종 검증). 우리 게이트를 이 3계층 훅 모델로 정식화.
- **Hashline**: LINE#콘텐츠해시로 동시 에디트 stale-line 에러 제거(성공률 6.7%→
  68.3%). 병렬 worker가 같은 파일을 만질 때의 핵심 안전장치.
- **4-Station Autonomy Continuum**: HITL → HOTL(@reviewer) → Supervised(Stop Hook
  자동 진행) → Full(Ralph 무인). 자율실행 모드의 단계 모델로 채택.
- **실패 경고**: 11-에이전트가 92% 완료율에도 "유지비 > 가치"로 v1 폐기. 역할을
  인간 조직처럼 늘리는 함정 — 파일 락만 쓴 단순 설계가 더 안정적.
- **DGX-02 경제성**: 로컬 vLLM 70% + Sonnet 20% + Opus 10% 라우팅 → 월 $2–3천
  즉시 절감. (우리는 이미 dgx-02 vLLM 보유.)

## 단계 로드맵 (이후 PR들)

- **Phase A — Diff/Files 패널 실연결**: 코딩 워크벤치의 edit/write가 만든 변경을
  사이드 패널 Diff/Files에 실시간 누적(현재 stub). 두 탭(대화↔코딩) 공유 상태.
- **Phase B — `/fork` (kau.sh식)**: 현재 대화 transcript+멘션 파일을 요약해 새
  worker(worktree+pane)로 포크. 자동 병합 금지, 결과는 report+diff로 회수.
- **Phase C — Mission 객체 통합**: 체크리스트의 Mission 스키마(role/agent/worktree/
  scope/gates/artifacts)로 병렬·자율·리서치 실행을 한 타입으로 수렴.
- **Phase D — verifier + sequential merge queue**: worker done → verifier가 diff/
  test/acceptance 검증 → 승인 후 순차 병합. semantic conflict 방어.
- **Phase E — 모델 라우팅 엔진**: 카테고리별 자동 라우팅(93.8% Problem 대응) +
  토큰/비용 계량 HUD(Dariusz의 burn-rate 경고).
- **Phase F — runtime isolation**: worktree에 port/env/db namespace + post-create
  hook(workmux식). 파일뿐 아니라 런타임 충돌 방지.

전제: 위 Phase 다수가 dgx-02 서버측 작업(검색/파일쓰기 엔드포인트, 멀티 pane
라우팅)을 요구하므로, 재배포 후 단계적으로 진행한다.
