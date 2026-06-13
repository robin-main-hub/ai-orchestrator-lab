# 49 — Mission 풀 루프 프로덕션 마무리 (E1·E2·E3)

docs/46(계약) → 47(실행 경계) → 48(보드/검증기록/머지큐) 위에, 검증을 실제로
실행하고 머지까지 닫아 풀 루프를 완성한다.

```text
패킷 → 미션 생성 → 워커 배정 → 검증 실행(진짜 observed) → 병합 대기열 → 머지 실행
```

## E1 — 서버 검증 실행기 (진짜 observed)

legacy tmux는 디스패치만 가능하고 종료코드를 관측할 수 없어 검증이 늘
`observed=false`였다. 이제 서버가 직접 실행한다.

- `missions/localSandboxRunner.ts`: 검증 명령을 repo root에서 `execFile`로
  실행하고 **실제 종료코드**를 관측 → exit 0 = passed, ≠0 = failed,
  전부 종료코드를 가지면 `observed=true`.
- **보안 경계**: 유일한 게이트는 desktop과 **공유하는** allowlist
  (`@ai-orchestrator/agents`의 `isAutoApprovableCommand` — desktop의
  safeCommandPolicy를 이 패키지로 승격하고 desktop은 re-export, 정책 드리프트
  제거). allowlist 밖이거나 셸 메타문자가 있으면 실행 자체가 안 되고 skipped.
  명령은 공백 split 후 `shell:false`로 실행 → 인젝션 불가(이중 방어).
- `POST /missions/:id/verify { commands }` → 실행 → `mission.verification.recorded`.

## E2 — 머지 실행

- `POST /missions/:id/merge { mergeQueueItemId }` → 큐 항목을 `merged`로
  전이 + `mission.closed(merged)`.
- **불변식**: 큐 항목이 가리키는 검증이 여전히 `observed && passed`여야 머지
  실행(아니면 400). index는 같은 큐 항목 id를 upsert해 queued→merged 전이를
  반영. 멱등(이미 merged면 그대로).
- 실제 git merge는 worktree 인프라(다음 단계) 전까지 상태 전이 + 선택적
  `mergeCommitSha` 보존으로 둔다.

## E3 — UI 풀 루프

- `stage47MissionServer`에 `verifyDgxMission`/`mergeDgxMission` 추가.
- Mission Board: 헤더 "패킷→미션 생성"(architect/builder/verifier 기본 배정),
  카드에 검증 실행(서버 /verify)·병합 대기열·머지 실행 버튼. 각 버튼은
  서버 불변식과 같은 조건에서만 노출(검증된 것만 큐잉, 큐 있는 것만 머지).
- 클라이언트측 tmux 검증 빌더(missionVerification)는 서버 verify가 진짜
  observed로 우월하므로 제거(평행 중복 제거).

## 라이브 E2E (dgx)

```text
미션 생성 → 검증 실행(서버가 pnpm 실행, observed) → 병합 대기열 → 머지 실행
→ 서버 재시작 → 전부 복원
```

## 남은 것 (프로덕션 강화 후보)

- 실제 git merge(worktree 격리), Docker/gVisor runner(원격 격리 실행),
  Hermes memory promotion, 검증 아티팩트(stdout/stderr) 저장.
