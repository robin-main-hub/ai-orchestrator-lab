# Batch 11 (구현 핸드오프) — Saved Views + Command Palette Hooks

> **상태**: 구현 완료 · PR #582 #583 #584 #585 · 선행 Batch 10 docs/116 (검색/필터/포커스)
> **목표**: 자주 쓰는 뷰 조합을 빠르게 부르고, 어디서든 팔레트로 인박스를 조종. 모두 view-only.

## 한 줄 요약
검색·필터·포커스 위에, **Saved Views 프리셋 + 액티브 뷰 영속 + Command Palette hooks**를 얹어 "내 OS 책상" 감각을 완성. side-effect action 0 유지.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #582 | A | Saved View 프리셋(My Desk/Today/Blocked/Failures/Runner/Learning/Replay) |
| #583 | B | 액티브 뷰(focus/category/search) localStorage 영속 |
| #584 | C | Command Palette hooks (command-bus prop) |
| #585 | D | 본 핸드오프(docs/117) + 체크리스트 |

## LINE 요약
- **A** 내장 프리셋 = view-only 필터 조합(focus+category+query). radio로 적용, "Replay"는 REPLAY 좌석 점프. `activeViewPreset()`로 현재 조합 하이라이트. 저장 액션/버튼 없음(프리셋은 내장).
- **B** persistFilters(앱이 켬, 기본 off) → 액티브 뷰를 `ai-orchestrator.inbox-view-filters.v1`에 복원/저장. 읽기 시 검증(replay focus/bad category/non-string query → 기본값). 좌석 영속과 동일 패턴. **로컬 UI pref만**.
- **C** 팔레트 → 인박스 **command-bus**: App이 nonce'd `command` prop을 컨테이너에 내려보냄. 컨테이너는 좌석을 소유하므로 mode 명령(REPLAY) 적용, 필터 명령(focus/category/clear)은 인박스가 effect로 적용. **전체 상태 리프트 없이** view-only. 팔레트 명령 5종: Inbox 열기 / REPLAY 좌석 / Failures 필터 / Blocked 보기 / 필터 초기화.
- **D** 본 문서 + 체크리스트.

## Command Palette 경계 (명시)
```text
Command Palette is allowed to control Assistant Inbox view state
(mode / focus / category / search / clear).
Command Palette must NOT trigger send / write / run / apply / dispatch / approve actions.
This is still read-only command-center control, not automation.
```
**반복 명령 안전성**: `InboxCommand`는 디스패치마다 `nonce`가 증가하는 새 객체로 발행되고, 적용 effect의 dep는 명령 객체 자체이므로 — 같은 명령(예: "Blocked 보기")을 연속 실행해도 매번 재적용된다(동일 값/참조로 인한 effect 미발화 없음). 회귀 테스트로 고정.

## 검증
- 신규 테스트: A +4, B +3, C +4, D +1(반복-명령 회귀) = **+12**. **전체 desktop 스위트 2008+ green** · root typecheck·build·secret green(CI).
- 기본 프리셋=My Desk(all/all)·persist off → 기존 테스트 무영향.
- **정직 한계**: command-bus는 컨테이너 레벨 단위테스트로 검증(명령 prop 전달·mode/focus/category/clear 적용·반복 재실행). **App의 Command Palette UI 배선(엔트리 5종 등록 + 실제 팔레트 클릭→prop)은 단위 수준에서만 검증**했고, 실제 팔레트 UI 실측(⌘K 열기→선택→반영)은 headless 제약으로 추후 오너 프리뷰로 확인.

## 안전 불변식 (0 유지)
```text
ERP/domain import 0 · fake live 0 · external send 0 · server append/write 0
runtime load 0 · DB migration 0 · hidden job 0
side-effect action control 0 (approve/send/write/run/apply/dispatch)
preview→live 누수 0 · replay mutation 0 · approval semantics 변경 0
Saved Views/영속/command = local view state(+localStorage UI pref)만
```

## Batch 11 regression 체크리스트
- 프리셋 선택 시 focus/category/search 조합 적용 · Replay 프리셋은 좌석 점프
- persist on이면 새 마운트에서 액티브 뷰 복원 · off면 미기억 · 무효 저장값 → 기본
- 팔레트: Inbox 열기(내비) / REPLAY / Failures / Blocked / Clear가 view만 바꿈
- 부작용 컨트롤 0 · `<button>` 0(검색=input, 나머지=radio)

## 미접촉 / 다음 후보
- 사용자 정의 Saved View(이름 붙여 저장) — 현재는 내장 프리셋 + 액티브 뷰 영속.
- **SANDBOX shell**(시뮬레이션/dry-run — action-risk, 계속 보류).
- 실제 WorkItem source 배선.
- 팔레트 명령 e2e 프리뷰 검증(현재 단위테스트, headless 제약).
