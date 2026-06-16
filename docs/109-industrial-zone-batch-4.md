# 109 — Industrial Zone Batch 4 (card polish + live expansion + gate enablement contract)

## 한 줄

Assistant Inbox를 "기술적으로 mount됨"에서 **시각적으로 쓸만한 Command Center**로: 카드 polish + 공유 배지 + generic live source 확장(N+O). 그리고 learning-failure gate의 **owner/enablement 계약**을 기본 OFF·자동 flip 0으로 정의(P). **LINE M(실제 브라우저 preview)은 ssh/headless 제약으로 사람(owner)에게 위임** — 대신 실행 checklist doc 제공.

## PR 트랙 (모두 main merged)

| PR | merge | 라인 | 내용 |
|---|---|---|---|
| #553 | `6d05d12` | P | learning failure gate enablement contract (owner/idempotency/audit, disabled by default) |
| #554 | `7116945` | N+O | Assistant Inbox card polish + generic live source expansion + preview checklist doc |

## LINE N+O — Assistant Inbox 시각화 + live 확장 (#554)

**N (polish):**
- 공유 `components/inbox/StatusBadge.tsx`: 단일 `StatusBadge`(PASS/WARNING/BLOCKED, 일관 variant+icon) + `SourceBadge`(live / no live data / 예시(fixture)).
- evidence verdict / manifest loadable·blocked / learning stage 전부 같은 StatusBadge 경로.
- 5개 카드 밀도 개선: bordered section panel, title truncate, dense single-row header, 우측 source badge, `N/4 live` 헤더 카운터. 기존 testid 보존 + `data-status-kind`/`data-live-sections` 추가.

**O (generic live 확장, ERP/domain 0):**
- `projectLearningLoopItems`: `deriveLearningLoopState` 기반 실 hypothesis/verified/rejected 카운트 + note, `summarizeLearningLive`.
- `projectMemoryCandidatesFromProjectRecords`: 정직한 `observed:false` suggested note.
- runner/manifest 정직성 유지. fixture는 예시, empty는 정직.

**검증(직접 확인):** 프로덕션 inbox button/onClick 0(read-only), 도메인 live 오염 0, 공유 SourceBadge(live/no live data/예시), 51 tests(5 files). **browser preview 미실행** — ssh/headless. 대체 = jsdom render + build + typecheck.

## LINE M — 실제 브라우저 preview (사람/owner 몫)

내(Code) 환경은 ssh로 headless dgx-01만 접근 → 실제 브라우저 preview/스크린샷 불가. headless 흉내 = 가짜 검증이라 안 함. 대신 **`docs/ASSISTANT_INBOX_PREVIEW_CHECKLIST.md`** 제공:
- 로컬 dev 실행 명령 (apps/desktop dev script)
- nav 경로: 시스템 → 어시스턴트 인박스 (command_center)
- 시각 체크리스트: 레이아웃 안 깨짐 / 카드 밀도 / PASS·WARNING·BLOCKED 색 명료 / LIVE·EMPTY·예시 배지 가독 / nav 위치 / "멋있는가" 주관 평가

→ **owner가 Mac/Antigravity에서 직접 실행·확인** 권장.

## LINE P — gate enablement contract (#553)

- `apps/server/src/learning/learningFailureEnablement.ts`: `LearningFailureEnablementContract`(owner, enabled default false, requireObservedEvidence/requireIdempotency/auditRequired = literal `true`, 끌 수 없음) + `evaluateEnablement(contract, {decision, observedEvidence})` → `{allowed, reason, auditEvent{kind:"learning.failure.enablement.evaluated", emitted:false}}`.
- `allowed:true`는 enabled AND gate decision append AND observed evidence AND idempotency key 전부일 때만. 그 외 항상 false.
- 순수 compute — append/emit/side-effect 0. audit record는 **described(반환), emit 안 함**. 코드 머지만으로 안 켜짐(owner가 enabled=true 주입 + audit해야).
- `docs/LEARNING_FAILURE_ENABLEMENT_CONTRACT.md`: owner/transition/audit/no-auto-flip.
- 11 tests.

## 통합 검증 (main)

- `corepack pnpm typecheck`: **0 errors** / `build`: **green**
- 신규 테스트: N+O 51 + P 11
- 안전 불변선 전부 유지: 가짜 observed/live 0 / 자동 trusted·active 승격 0 / 자동 runtime load 0 / 자동 append·write·flip 0 / EventStorage 변이 0 / DB migration 0 / OS core 도메인 import 0.

## 다음 후보

- **LINE M 실측** (owner — checklist doc 따라 로컬 dev에서 화면 확인 → 피드백)
- 카드 디자인 추가 다듬기(실측 피드백 반영)
- evidence 경로 단일화(evidenceBridge canonical) — Antigravity 조율
- gate 실 enablement(owner가 contract flip + audit) → learning.failure 실 append (그 다음 단계)
