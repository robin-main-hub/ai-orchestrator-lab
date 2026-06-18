# Engine E3 (구현 핸드오프) — Learning & Memory Console

> **상태**: 구현 완료 · PR #634 (코드) + 본 docs PR · 선행 docs/134(E2) · moving-os-engine-loop iter 2
> **목표**: OS가 **무엇을 배웠고 / 무엇을 버렸고 / memory가 건강한지**를 한눈에 보는 read-only 콘솔.
> 기존 순수 투영을 조합(중복 0). auto-trust 0 · runtime load 0 · write 0.

## 한 줄 요약
이미 LIVE로 들어오는 입력(learningEvents, projectRecords)과 기존 투영(projectLearningLoopItems,
projectMemoryCandidateItems/FromProjectRecords, MemoryEvalReport)을 순수 summarizer
`buildLearningMemoryConsole`로 굴려서 learning loop 단계 롤업 + memory 후보 분해 + memory-eval 건강도
(pass/warn/fail + forbidden/stale/contradicted hit)를 한 카드에 표시. App.tsx 변경 0(입력은 이미 배선됨).

## PR 트랙
| PR | 내용 |
| --- | --- |
| #634 | `lib/learningMemoryConsole.ts`(buildLearningMemoryConsole) + `LearningMemoryConsoleCard` + 컨테이너 learningMemoryExtras(props.learningLoops/memoryCandidates 재사용 + eval reports) + 테스트 2종 |
| (this) | 본 핸드오프(docs/135) + 체크리스트 §E3 |

## 무엇이 보이게 됐나
- **learning**: loop 총수 + settled(verified/distilled/consulted) / active / rejected 칩 + verified/rejected 가설 수.
- **memory**: 후보 총수 + suggested vs written 분해 + 정직한 observed(written) 수(아직 writer 없음 → 보통 0).
- **eval 건강도**: pass/warn/fail 칩 + forbidden/stale/contradicted/superseded hit 집계 + blocked 리포트.
- **flags**: rejected loop / memory eval fail / forbidden·stale·contradicted hit를 honest 경고 칩으로 — 표시만(행동 0).
- 데이터 없으면 honest empty("관측된 learning/memory 없음"). PREVIEW=fixture / LIVE=실입력(누수 0).

## 안전 불변식 (0 유지)
```text
read-only 요약 · auto-trust 0 · runtime/skill load 0 · memory write 0 · EventStorage/server write 0
표시 전용(버튼 0) · honest empty · PREVIEW/LIVE 분리(누수 0) · suggested→written 승격 0 · generic only
```

## 검증
`learningMemoryConsole.test.ts`(6 — 단계 롤업 · memory 분해 · eval 집계(forbidden/stale/contradicted) ·
flags · honest empty · 결정성/도메인 용어 0) · `AssistantInboxLearningMemory.test.tsx`(4 — PREVIEW 롤업+flags ·
LIVE 실입력만(누수 0) · LIVE honest empty · read-only). 인박스+lib 로컬 **1593 green** · typecheck clean ·
build green · CI green.

## 미접촉 / 다음 후보 (engine 큐 — generic only)
- E4 BATCH D — Evidence Draft LIVE producer: PREVIEW 전용 Evidence Draft를 live draft 입력 수용으로 확장
  (claims + numbered footnotes + missing-info ask + stale 경고). 외부 전송 0 · approve 관료주의 0 · write 0.
- E5 WorkItem Canonical Seed · E6 Control Queue/Launch Key surface.
- 보류: E1 정직한 patch feed(docs/133 — MissionBoard surgery 필요).
- 한계: LIVE eval 건강도는 manifest eval 소스가 아직 안 배선돼 honest-empty(실제 eval 소스 생기면 표시).
