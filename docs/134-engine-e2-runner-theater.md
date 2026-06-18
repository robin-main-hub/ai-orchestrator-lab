# Engine E2 (구현 핸드오프) — Runner Theater

> **상태**: 구현 완료 · PR #632 (코드) + 본 docs PR · 선행 docs/133(E1 설계 노트) · moving-os-engine-loop iter 1
> **목표**: "보이는 OS → 움직이는 OS"의 첫 실제 슬라이스. Assistant Inbox가 **실제 runner/미션 상태**를 읽기 전용
> operations theater로 보여준다 — 어떤 runner가 무엇을 하고 있는지 LIVE로. dispatch/start/write 0.

## 한 줄 요약
공유 `workbenchMissionStore` 스냅샷을 App에서 read-only 구독(useSyncExternalStore)해 `live.runnerSessions`로 흘려보내고,
순수 `projectRunnerTheater`가 미션 status → lane(active/attention/idle/done) + heartbeat liveness(runner 분 단위 스케일) +
정직한 lastOutput/eventCount/artifactCount로 투영, `RunnerTheaterCard`가 lane별로 렌더. PREVIEW=example, LIVE=실제(누수 0),
미관측 시 honest empty.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #632 | `lib/runnerTheater.ts`(projectRunnerTheater + classifyHeartbeat + summarizeRunnerTheater + EXAMPLE_RUNNER_SESSIONS) + `RunnerTheaterCard` + 컨테이너 runnerExtras + AssistantInboxLiveInput.runnerSessions + App.tsx read-only 구독 + 테스트 2종 |
| (this) | docs/133(E1 설계 노트) + docs/134(본 핸드오프) + 체크리스트 §E2 |

## 무엇이 움직이게 됐나
- 그동안 runner 상태는 인박스에 안 보였다. 이제 **실제** 미션(`workbenchMissionStore`, 코딩탭/대화-포크가 공유하는
  진실)이 인박스 LIVE에 lane별로 표시: active / attention(blocked·failed·needs_review·killed) / idle(cleanup_ready) / done.
- 각 행: role + title + (eventCount/artifactCount) + **heartbeat liveness 칩**(live<2m / idle<30m / stale / unknown,
  주입 nowMs로 순수 계산). 헤더에 active/attention 요약 + **stalled**(running인데 heartbeat stale = 죽었을 수 있음) 경고.
- 정직성: 디스크 안 읽음 → `artifactCount`는 in-memory `artifacts[]` 길이만, diff stats는 주장 안 함(그건 E1/미션별 큐 영역).
  미관측이면 honest empty("관측된 runner 세션 없음").

## 안전 불변식 (0 유지)
```text
read-only projection · workbenchMissionStore.getSnapshot()만(구독은 read-only, mutator 호출 0)
dispatch/start/execute/runner 시작 0 · file write/EventStorage/server write 0
PREVIEW=example / LIVE=실제(누수 0) · honest empty · stats 날조 0 · Date.now는 App에서 주입(순수코어 0)
표시 전용(버튼 0) · MissionBoard/미션별 controller 미접촉 · generic only
```

## 검증
`runnerTheater.test.ts`(7 — heartbeat 분류 · status→lane · liveness · in-memory만(날조 0) · invalid drop/empty ·
요약/stalled · 결정성·도메인 용어 0) · `AssistantInboxRunnerTheater.test.tsx`(4 — PREVIEW lane 그룹 · LIVE 실데이터만(누수 0) ·
LIVE honest empty + 금지어 0 · read-only). 인박스+lib 로컬 **1583 green** · typecheck clean · build green · CI green.

## 미접촉 / 다음 후보 (engine 큐 — generic only)
- E3 BATCH C — Memory / Learning Inbox (read-only): 실패/조사/검증된 가설/distilled memory 후보/stale·forbidden·
  contradicted memory/batchRemember·memory eval 상태. auto-trust 0, runtime load 0, write 0.
- E4 BATCH D — Evidence Draft LIVE producer · E5 WorkItem Canonical Seed · E6 Control Queue/Launch Key surface 등.
- 보류: E1 정직한 patch feed(docs/133 — 미션별 큐 통합 = MissionBoard surgery, 명시 스코프 필요).
