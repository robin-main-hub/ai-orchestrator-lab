# 48 — Mission Board: 서버 hydration + 검증 기록 + 병합 대기열 (D1·D2·D3)

docs/46(계약) → docs/47(실행 경계) 위에, 사용자가 보는 화면과 서버의 영속
상태가 처음으로 같은 현실을 보게 만드는 단계.

```text
C  = 서버가 Mission을 기억한다          (이벤트 영속화)
D1 = UI가 서버 Mission을 본다           (Mission Board hydration)
D2 = 검증을 실행하고 결과가 기억된다     (SandboxRunner → VerificationReport)
D3 = 검증된 결과만 병합 대기열로 간다    (sequential merge queue)
```

## D1 — Mission Board (RunWorkspace 세 번째 모드 "미션 보드")

- `runtime/stage47MissionServer.ts`: `/missions` read/append 클라이언트
  (stage33/34와 같은 관용구 — baseUrl 후보 순회, HMAC 서명, 타임아웃).
- `lib/missionBoardModel.ts`(순수): 서버 레코드 → 보드 아이템 매핑, 병합 규칙
  - 같은 missionId면 **server_observed가 local_fallback을 이긴다**
  - 서버 fetch 실패 시 로컬 보드는 그대로 살고 "서버 미연결"로 표기
- 카드에는 출처(`DGX 저장됨`/`로컬 임시`), truth status(observed/...),
  워커별 capability mode와 **실제 Hermes 슬롯 id**가 그대로 드러난다.
  원칙 유지: 멋있게 보이되 거짓말하지 않는다.

## D2 — 검증 실행 → mission.verification.recorded

```text
보드에서 "검증 실행"
→ 미션의 sandbox_verify 워커 선택 (없으면 안내)
→ 현재 CodingPacket.verificationPlan → SandboxExecRequest[]
→ LegacyTmuxRunner (preflight: capability + safeCommandPolicy)
→ VerificationReport 빌드 → POST /missions/:id/events
```

truth 규칙(`lib/missionVerification.ts`, 클라이언트에서도 강제):

| runner 결과 | check | report |
|---|---|---|
| exitCode 0 | passed | 전부 passed면 `passed` (observed) |
| exitCode ≠ 0 | failed | `failed` (observed) |
| 디스패치만 성공(legacy tmux, 종료코드 미관측) | warning "종료코드 미관측" | `pending`, observed=false |
| preflight 차단 | skipped | `blocked` |

legacy tmux는 종료코드를 관측할 수 없으므로 그 검증은 **정직하게
observed=false**다. observed 검증은 종료코드를 반환하는 runner(docker/
local_process/remote — D4)가 생겨야 가능하고, 서버(missionPolicy)도 같은
규칙으로 한 번 더 강등한다.

## D3 — sequential merge queue (저장/표시까지)

- `mission.merge.queued` 이벤트 + materialized view에 `mergeQueueItems`.
- **서버 불변식**: queue 항목의 `requiredVerificationReportId`는 그 미션에
  실재하고 `status=passed && observed=true`인 report여야 한다 — 아니면 400.
  ("검증된 결과만 병합 대기열로 간다"; merge 실행 자체는 다음 단계)
- 보드 UI도 같은 조건에서만 "병합 대기열 등록" 버튼을 보여준다.

## 이번에 하지 않은 것

- merge 실행(큐 항목 저장/표시까지만), Docker/gVisor runner,
  Hermes memory promotion, UI에서 mission 생성(다음 단계 후보).
