# Batch 21 (구현 핸드오프) — Replay Timeline V2

> **상태**: 구현 완료 · PR #619 #620 · 선행 Batch 20 docs/126 · forward-loop iter 3
> **목표**: REPLAY를 단순 리스트가 아니라 **작전극장 리플레이**처럼 — 시간 클러스터 타임라인 + 로컬 스크러버. EventStorage/server write 0.

## 한 줄 요약
replay 이벤트를 시간 근접도로 클러스터링해 타임라인으로 보여주고, 로컬 스크러버로 클러스터를 훑는다.
list/timeline 토글(default list로 기존 UX 보존). 카테고리·검색 필터와 통합. 전부 read-only.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #619 | `buildReplayTimeline` 순수 투영 + `ReplayTimeline` 컴포넌트 + list/timeline 토글 |
| #620 | 본 핸드오프(docs/127) + 체크리스트 §21 |

## 무엇이 보이게/유용해졌나
- **타임라인 클러스터**: 이벤트를 시간 gap(기본 30분) 기준으로 묶어 cluster로. 최신 cluster 먼저.
- **클러스터 헤더**: 시간 span + event count + 카테고리 분해 칩.
- **로컬 스크러버**: `<input type=range>`로 active cluster를 훑음(view state only). active cluster만 항목 펼침.
- **필터 통합**: 기존 카테고리 필터 + 인박스 검색이 타임라인에도 그대로 적용(같은 filtered set).
- **토글**: list ↔ timeline (local-view 버튼). 기본 list라 기존 replay 테스트/UX 무변경.

## 안전 불변식 (0 유지)
```text
buildReplayTimeline 순수(no Date.now/IO) · EventStorage mutation 0 · server write 0
스크러버/토글 view-only(local-view) · 새 side-effect 0 · generic only · SANDBOX 실행 0
```

## 검증
신규 테스트: `replayTimeline.test.ts`(4 — clustering/gap-split/custom-gap/empty) ·
`AssistantInboxReplayTimeline.test.tsx`(5). 기존 Replay/ReplayFilter 스위트 green.
인박스+lib 로컬 237 green · typecheck clean · build green · CI green.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH F — Sandbox Proposal Shell(제안 전용: scenario proposal cards · dry-run visual · "proposal only" 워터마크).
- BATCH G — Generic Source Pack Demo · BATCH H — Evidence Draft / Footnote Surface.
- BATCH J — Command Palette Power Pass · BATCH K — Visual Style Pass.
- 보류 유지: BATCH B(patch queue 통합, docs/125 설계 노트).
