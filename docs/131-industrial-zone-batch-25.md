# Batch 25 (구현 핸드오프) — Command Palette Power Pass

> **상태**: 구현 완료 · PR #627 (코드) + 본 docs PR · 선행 Batch 24 docs/130 · forward-loop iter 7
> **목표**: 인박스 command palette + command bus를 **local-view 점프 타깃**으로 확장 — 모든 표면(Source Dock /
> Patch Candidates / Operator Console / Replay / Sandbox / Evidence Draft)을 빠르게 도달 가능하게. side-effect 0.

## 한 줄 요약
팔레트에 Operator Console / SANDBOX / Evidence Draft 점프 3종 추가 + `focusSection` 버스에
`operator-console`·`evidence-draft` 타깃(StatusStrip·EvidenceDraftCard에 cardRef) 배선 + 키보드
가속기 `o`/`e`. 전부 view-only — run()은 주입 핸들러만 호출하고, 점프는 scroll/focus 뿐(데이터/모드 변경 0,
SANDBOX 좌석 전환만 명시적). 마운트 안 된 타깃(LIVE의 PREVIEW 전용 카드)엔 정직한 no-op.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #627 | `inboxPaletteCommands`(+3 명령) + `AssistantInbox`(focusSection 타깃 2종 + cardRef + 점프 콜백 + `o`/`e` 가속기) + 테스트(팔레트 id 동기화·dispatch·금지어 확장 + 신규 CommandJumpsV2) |
| (this) | 본 핸드오프(docs/131) + 체크리스트 §25 |

## 무엇이 보이게/빨라졌나
- 팔레트 명령: `inbox.operatorConsole`(focusSection operator-console) · `inbox.sandbox`(mode sandbox 좌석) ·
  `inbox.evidenceDraft`(focusSection evidence-draft). 기존 sourceDock/patchCandidates/replay/clear/saved-view와 함께
  모든 표면 도달.
- focusSection 타깃: `operator-console`(StatusStrip rootRef) · `evidence-draft`(EvidenceDraftCard cardRef) →
  scroll + focus. 타깃 미마운트 시 ref null → 정직한 no-op(소스독 점프와 동일 패턴).
- 키보드 가속기: `o` 오퍼레이터 콘솔 · `e` Evidence Draft (입력 중/모디파이어 시 억제). 단축키 힌트 갱신.

## 안전 불변식 (0 유지)
```text
view-only · 모든 run()은 주입 핸들러만 호출 · send/write/run/approve/dispatch 0
점프=scroll/focus only(데이터/모드 변경 0, SANDBOX 좌석 전환만 명시적) · side-effect action control 0
assertNoSideEffectActionControls + assertNoForbiddenActionText 통과 · 팔레트 라벨 금지어 0 · generic only
```

## 검증
`inboxPaletteCommands.test.ts`(pinned id 리스트 +3 동기화 · per-command dispatch · 금지어 스캔 확장
execute/commit/sync/refresh) · 신규 `AssistantInboxCommandJumpsV2.test.tsx`(3 — operator-console·evidence-draft
점프 scroll · LIVE PREVIEW-only no-op · side-effect control 0). 인박스+lib 로컬 **1559 green** ·
typecheck clean · build green · CI green.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH K — Visual Style Pass(밀도 높은 다크 커맨드센터 톤 · 위계/배지/empty state).
- BATCH I — Launch Key / Commit Point UX(승인 큐 → 컨트롤/오퍼레이터 큐 라벨링, 의미 불변).
- BATCH L — Docs Cleanup / No-Domain Roadmap Guard.
- 보류 유지: BATCH B(patch queue 통합, docs/125 설계 노트 — 명시적 스코프 필요).
