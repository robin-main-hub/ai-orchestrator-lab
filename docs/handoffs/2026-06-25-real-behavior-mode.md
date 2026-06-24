# 2026-06-25 Real Behavior Mode — Cross-Mission Defense & Task Source of Truth

## 한 줄 요약

Micro-characterization PR 루프(#830~#1015) 종료. 첫 real-behavior PR로 mission event payload의 cross-mission contamination 방어선을 수리하고, 운영 기준 문서(`TASKS.md`)를 세워 다음 작업자가 오래된 work-board를 보고 길을 잃지 않게 했다.

## 배경: 루프 종료 선언

#830~#1015까지 약 185개의 test-only micro PR이 머지됐다. 각 PR은 zero-ref export 발굴, enum/schema/fixture 단독 PR, 라벨 핀 등의 패턴이었고, 실제 source behavior 수정이나 invariant 수리가 없었다.

이제 명시적으로 종료한다:

- test-only micro PR 연속 생성: 금지
- zero-ref export 발굴: 금지
- enum/schema/fixture/상수 단독 PR: 금지
- "커버리지 올리기" 자체를 목표로 한 PR: 금지
- 신규 design doc: owner 명시적 요청 없이 금지

## PR #1060 — cross-mission contamination defense

### 커밋 1: `fix(server): reject cross-mission artifact payloads`

`missionStore.appendEvent()`가 top-level `missionId`(route에서 주입)만 검사하고 `artifact.missionId`는 검사하지 않았다. 클라이언트가 `artifact.missionId`를 다른 미션으로 설정하면 top-level은 통과하고 타 미션 artifact가 현재 미션에 붙었다.

수정:
- write-side (`missionStore.ts:556`): `parsed.data.artifact.missionId !== missionId` 검사 추가
- read-side (`missionIndex.ts:119`): `artifact.missionId !== parsed.data.missionId` skip 조건 추가
- test: cross-mission injection 거부 테스트

### 커밋 2: `fix(server): audit all nested missionId in mission event payloads`

13개 payload schema 전수 조사. `missionId`가 outer에도 있고 nested object에도 있는 케이스를 전부 검색.

write-side gap 3건 수정:
- `recordVisualQa`: `report.missionId` + `report.issues[*].missionId` 검사
- `recordScaffoldPlan`: `plan.missionId` 검사
- `recordScaffoldOverlay`: `overlay.missionId` 검사

read-side gap 11건 수정 (`missionIndex.ts`):
- worker.assigned, verification.recorded, merge.queued, checkpoint.created, workspace.attached, design.blueprint.recorded, visual_qa.recorded, design.issue.recorded, scaffold.planned, scaffold.overlay.recorded, error_card.recorded

### 커밋 3: `docs: establish current task source of truth`

- `TASKS.md` 생성: 공식 작업 기준
- `docs/work-board.md` 상단 deprecated 배너
- 본 handoff 문서

## 검증

- server typecheck: clean
- targeted missionStore tests: 43/43 pass
- full server suite: 609/609 pass
- baseline: main `1e70f7ae`

## 다음 작업

1. **Mission vertical integration suite** — create→artifact→verify→merge→reload→rebuild 흐름을 integration test로 고정
2. **Open PR landscape review** — #793/#562/#561/#513 판정표 작성 (merge/close 금지)
3. **onHandoff → control queue approval wiring**
4. **opencode --format json schema 확정**
5. **ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS runbook** (owner action)

상세는 [`/TASKS.md`](../../TASKS.md) 참조.

## Deprecated 문서

- `docs/work-board.md` — R5/R6 시대 작업판. 상단에 deprecated 배너 추가. 파일 삭제 안 함(역사적 맥락 보존).
