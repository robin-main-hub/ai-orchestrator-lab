# Batch 19 (구현 핸드오프) — Operator Console Speed Polish

> **상태**: 구현 완료 · PR #615 · 선행 Batch 18 docs/124 · SANDBOX는 Batch 후순위
> **목표**: OS를 **더 빠르게 조작**하게 만든다 — view-only 키보드 가속기 + 한눈 상태. side-effect 0.

## 한 줄 요약
인박스에 로컬-뷰 키보드 가속기(s/p/b/c)와 단축키 힌트 행, Operator Console patch-count 칩 추가.
전부 기존 local-view 핸들러 재사용 — mode/데이터 변경 0, fetch/write/dispatch 0.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #615 | 키보드 가속기(s 소스독 · p 패치 · b 막힌 · c 초기화) + 단축키 힌트 행 + 콘솔 patch-count 칩 |
| #616 | 본 핸드오프(docs/125) + 체크리스트 §19 + BATCH B 설계 노트 |

## 무엇이 빨라졌나
- `s`/`p` → Source Dock / Patch Candidate 레인으로 즉시 scroll+focus(좌석 불변).
- `b` → Blocked 포커스, `c` → 필터 초기화(My Desk). (`/` 검색, `Esc` 지움은 기존)
- 타이핑 중·수정자 키 누름 중에는 가속기 억제(검색 입력 방해 0).
- 단축키 힌트 행으로 발견 가능 + 시각 피드백.
- Operator Console에 `patch N` 칩 — 후보 있을 때만(honest empty).

## 안전 불변식 (0 유지)
```text
side-effect OS action 0 · 가속기는 jump/focus/filter view-only만 · 새 버튼 0 (힌트는 텍스트)
모든 control은 allowed data-action-scope · mode/데이터 변경 0 · fetch/server/EventStorage write 0
PREVIEW/LIVE 누수 0 · LIVE-empty honest empty · generic only · SANDBOX 실행 0
```

## 검증
신규 테스트 `AssistantInboxConsoleSpeed.test.tsx`(8). 인박스 스위트 로컬 221 green · typecheck clean ·
build green · CI green.

---

## 설계 노트 — BATCH B (Patch Queue Source Unification) 보류 사유

Batch 18에서 LIVE patch candidate **매퍼 + seam**까지 완료했으나, 인박스 LIVE 패치 레인은
현재 honest-empty다. 이유와 향후 작업:

- runner-patch 승인 큐는 `useRunnerPatchApprovalQueueController()`로 **`MissionWorkspaceDetail`
  안에서 mission(상세)별로 생성**된다. 단일 app-level 큐가 없다 — 미션을 펼칠 때마다 별도 인스턴스.
- 인박스에 실제 후보를 띄우려면 이 큐 **소유권을 App(혹은 공유 store)로 끌어올려** 한 개의
  큐로 통합하고, 모든 미션 상세가 같은 인스턴스에 enqueue하게 해야 한다.
- 이는 MissionBoard의 **의미(semantics) 변경**(미션별 큐 → 전역 큐)을 동반하고
  MissionBoardContainer/Panel/WorkspaceDetail + 다수 테스트를 건드린다 → **2~3 PR 초과 surgery**.
- 따라서 이번 forward-loop에서는 보류. 진행 시 권장: optional-prop(+local fallback) 패턴으로
  App→Container→Panel→Detail에 공유 controller 주입, 기존 MissionBoard 동작 테스트 유지 +
  인박스 read-only feed 테스트 추가. apply/commit/dispatch/EventStorage write 0 유지.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH B(위 설계 노트대로 큐 통합) — 별 배치로 명시 스코프 필요.
- BATCH D — Patch Candidate Comparison V2(compare board / safer·faster·riskier 레인 / file overlap).
- BATCH E — Replay Timeline V2 · BATCH F — Sandbox Proposal Shell.
