# 92 — Generic Template scaffold/diff (Coding/Design OS D7)

Template→Mission이 문서로만 끝나지 않고 **실제 파일 scaffold**까지 이어진다. 단 Dyad식
안전: **즉시 덮어쓰기 금지** — plan(쓰기 없음) → 기존 파일 overwrite는 approval, 적용 전
checkpoint.

```
POST .../scaffold/plan   { templateId, input }  → 무엇이 생성/덮어쓰기될지 계산(planned, 쓰기 0)
POST /missions/:id/scaffold/:planId/apply { approvalId? }
   → repoRoot allowlist + (overwrite면 approval) → checkpoint → 파일 기록(observed)
```

## 한 일

- **protocol** `scaffold.ts`: `scaffoldForTemplate`(generic 앱/디자인 스캐폴드 — react_vite_app은
  package.json/index.html/main.tsx/App.tsx/README, 그 외는 README+컴포넌트 스텁, **회사 도메인
  0**), `buildScaffoldPlan`(순수 — existingPaths로 create/overwrite 판정, planned), apply 결과
  타입, plan/apply 요청 스키마. `ServerMissionRecord.scaffoldPlans`.
- **server** `scaffoldRunner.ts`: `planScaffold`(repoRoot allowlist 게이트, fileExists로 diff),
  `applyScaffold`(**overwrite는 approvedOverwrite일 때만**, 적용 전 checkpoint best-effort, DI fs로
  쓰기). 이벤트 `mission.scaffold.planned`/`.applied`(applied가 plan.apply를 채움) + materialize +
  trace. 라우트 + index.ts 실 fs/checkpoint/approval 배선.
- **desktop**: `planDgxScaffold`/`applyDgxScaffold` 래퍼.
- **smoke**: 별도 scaffold repo(merge repo 미오염)에 react_vite_app plan→apply. plan은 planned,
  **apply는 실제 5개 파일 기록(observed) + checkpoint sha**. **24/24 PASS**.

## 정직성/안전 불변식 (테스트로 못박음)

- plan = **planned**(쓰기 0, 무엇이 생성/덮어쓰기될지만). apply = **observed**(실제 파일).
- **기존 파일 overwrite는 grant된 approvalId일 때만** — 아니면 blocked, 쓰기 0(테스트로 못박음).
- 적용 전 checkpoint(되돌릴 지점), repoRoot allowlist 밖이면 blocked.
- 회사 도메인/회사명 0(테스트로 코어 스캐폴드 문자열 검사).

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| template → planned artifacts → scaffold diff | ✅ plan |
| 기존 파일 overwrite 전 approval | ✅ approvedOverwrite 게이트 |
| 적용 전 checkpoint | ✅ apply가 checkpoint 먼저 |
| generated 변경 명확히 표시 | ✅ create/overwrite action + trace |

## 검증

protocol 99(+3) · server 269(+10) · desktop 1145 그린 · generic app-build smoke **24/24 PASS**
(scaffold plan planned + apply 실제 파일 기록). docs/92.
