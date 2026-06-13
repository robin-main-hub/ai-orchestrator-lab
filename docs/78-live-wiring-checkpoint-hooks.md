# 78 — Live Wiring L3: Checkpoint 자동 hook

Checkpoint/Rollback runner는 PR2에서 만들었지만 사용자가 수동으로 눌러야만 생겼다 →
보호막이 약하다. L3은 **verify 전·merge 전 checkpoint를 자동 생성**한다. 자동 rollback은
여전히 금지(승인 게이트 경로 유지).

```
verify → autoCheckpoint(before_verification) → runVerification
merge  → autoCheckpoint(before_merge)        → runMerge
```

## 한 일

- **protocol**: `mission.checkpoint.created` 이벤트 payload(`missionCheckpointRecordedPayloadSchema`)
  + `ServerMissionRecord.checkpoints`(observed sha 목록) + trace 타입 `checkpoint.created`.
  checkpoint 이벤트는 **클라이언트 append 창구(missionEventTypeSchema)에 넣지 않는다** —
  서버만 발행. `traceEventFromMissionEnvelope`/`deriveMissionTrace`가 checkpoint를 trace에
  표시(headSha 앞 10자, observed).
- **missionIndex**: `mission.checkpoint.created`를 record.checkpoints로 materialize(멱등).
- **store hook**: `MissionStoreDeps.autoCheckpoint(missionId, reason)` → `created`면 이벤트
  기록, `skipped`면 조용히 진행, `failed`면 정책 분기. verify는 **비critical**(실패해도 진행),
  merge는 **critical**(적용 대상인데 실패하면 머지 중단 → 되돌릴 지점 없는 머지 방지).
- **server**: `autoCheckpoint`를 `createMissionCheckpoint`(실제 `git rev-parse` observed sha,
  repoRoot allowlist)에 배선. `ORCHESTRATOR_ALLOWED_REPO_ROOTS`가 없으면 **skipped**(이
  배포엔 미적용 — 회귀 0). `ORCHESTRATOR_CHECKPOINT_REPO_ROOT`로 명시 가능.

## 정직성/안전 불변식 (테스트로 못박음)

- checkpoint.headSha는 **실제 git rev-parse** observed sha만(합성 금지, truthStatus observed).
- **자동 rollback 금지** — checkpoint만 자동, rollback은 승인된 approvalId 경로 유지(L3에서
  손대지 않음).
- 미적용 배포(allowlist 없음)는 skipped → 머지/검증 그대로 진행(회귀 0).
- before_merge 실패는 머지를 **차단**(critical) — 테스트로 "merged로 안 닫힘" 확인.
- before_verification 실패는 검증을 **막지 않음**(non-critical) — 테스트 확인.

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| verify 전 checkpoint(observed HEAD sha) | ✅ before_verification 기록 |
| merge 전 checkpoint(observed HEAD sha) | ✅ before_merge 기록 |
| checkpoint 실패 정책 | ✅ merge=block, verify=proceed (명시·테스트) |
| rollback approval | ✅ 자동 rollback 없음(유지) |

## 검증

protocol 68 · server 212(+4) · desktop typecheck 그린. docs/78.
