# Engine E1 (design note) — Patch Queue Unification is blocked at ≤2-3 PRs

> **상태**: 설계 노트 (구현 보류) · moving-os-engine-loop iter 1 · 선행 docs/124 docs/125
> **결론**: LIVE Patch Candidate lane에 **정직한** 실제 데이터를 먹이는 일은 ≤2-3 PR로는 불가능 —
> MissionBoard surgery가 필요하다. 가짜 stats를 만드는 길은 honest-empty 원칙 위반이라 금지.
> 따라서 E1은 보류(설계 노트)하고 E2(Runner Theater)부터 진행한다.

## 검증으로 확인한 사실 (read-only recon)
1. **진짜 patch handoff/queue의 위치**: 실제 patch는 `RunnerPatchHandoff`(H8c) → `RunnerPatchSafetyReport`(H8d)
   → `RunnerPatchApprovalItem`(H8e)로, **미션별** `useRunnerPatchApprovalQueueController`
   (MissionBoardPanel.tsx:477) 안의 React state에 산다. 실제 diff stats(additions/deletions/changedFileCount)와
   safety report가 거기에 있다. App 레벨엔 노출 안 됨.
2. **App 레벨에서 읽을 수 있는 유일한 write-free 소스 = `workbenchMissionStore`**(모듈 싱글톤,
   useSyncExternalStore). 하지만 `WorkbenchMission`은 **diff stats를 안 들고 있다** — `diffPath`/`testOutputPath`는
   그냥 경로 문자열(`artifacts/${id}/changes.diff`, 생성 시 기본값)이고 `artifacts`는 `string[]`뿐.
   디스크를 읽는 건 금지(side-effect)라 거기서 진짜 stats를 얻을 수 없다.
3. **`PatchCandidateInput`은 `changedFileCount/additions/deletions`를 필수**로 요구한다
   (patchCandidateSource.ts:36). WorkbenchMission에서 만들면 전부 `0/0/0`이 되어 "0 files, +0/-0" 같은
   **가짜로 보이는 행**이 된다 → honest-empty/no-fake-data 원칙 위반.
4. **App.tsx:5525**는 현재 `patchCandidatesFromApprovalItems([])`로 정직하게 비어 있다. 매퍼
   `patchCandidateFromHandoff`/`patchCandidatesFromApprovalItems`(patchHandoffToCandidate.ts)는 완성돼 있고
   타입 전용 import라 실행 비결합. **빈 배열만 실제 items로 바꾸면 불이 들어온다** — 단 그 items가 app 레벨에 있어야.

## 그래서 진짜로 필요한 것 (둘 다 >2-3 PR / MissionBoard surgery)
- **옵션 A — 미션별 큐 통합(공유 controller 주입)**: docs/125가 권장한 optional-prop(+local fallback) 패턴으로
  App→MissionBoardContainer→Panel→Detail에 공유 patch-approval controller를 주입. 미션별 큐의 의미(semantics)
  변경 + 다수 MissionBoard 테스트 수정 동반.
- **옵션 B — app 레벨 read-only patch-handoff 레지스트리**: 각 MissionBoardPanel이 자기 큐를 app 레벨 read-only
  레지스트리에 **publish**(추가 콜백)하고, 인박스가 그걸 집계. 미션별 소유권은 유지(의미 변경 최소)하지만 여전히
  Panel/Container/Detail prop threading을 건드린다 → runner/patch-apply 인접 표면이라 신중 필요.

두 옵션 다 명시적 스코프의 별도 배치가 필요(>2-3 PR). 어느 쪽도 apply/commit/dispatch/EventStorage write를
도입하지 않는다(read-only 시각화 유지).

## 결정
- E1(정직한 LIVE patch feed)은 **보류** — 위 옵션 A/B 중 하나를 명시 스코프 배치로 받을 때 진행.
- 대신 같은 `workbenchMissionStore`가 **정직하게** 들고 있는 실제 데이터(status/heartbeat/lastOutput/events)로
  **E2 Runner Theater**를 먼저 구현(LIVE 배선 완료, docs/134). "보이는 OS → 움직이는 OS"의 첫 실제 슬라이스.
- 향후 patch feed 작업 시 후보 candidateId 스킴은 미래의 미션별-큐 병합과 충돌하지 않게 잡을 것.
