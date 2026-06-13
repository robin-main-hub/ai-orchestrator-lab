# 77 — Live Wiring L2: Verification Runner Registry 연결

Docker/gVisor runner는 PR3/PR4에서 만들었지만 검증 루프는 항상 local만 썼다 →
dead code. L2는 `POST /missions/:id/verify`가 **정책으로 runner를 고르게** 한다.

```
verify → selectVerificationRunner(env) → local | docker | gvisor | blocked
       → runRegistryMissionVerification → VerificationReport(observed 정직)
```

## 한 일

- **순수 선택자** `selectVerificationRunner(env)` — `ORCHESTRATOR_SANDBOX_RUNNER`
  (local|docker|gvisor) + `ENABLE_DOCKER/GVISOR_RUNNER` + `SANDBOX_IMAGE` +
  `ALLOWED_DOCKER_IMAGES`를 보고 runner를 고른다. docker/gVisor를 골랐는데 disable/
  imageless/비허용 이미지면 **blocked** — 절대 local로 몰래 떨어지지 않는다.
- **registry 실행기** `runRegistryMissionVerification` — local은 기존 LocalSandboxRunner
  그대로, docker/gVisor는 container runner로 명령마다 돌려 VerificationReport로 조립,
  blocked는 미관측 리포트.
- **capability 게이트** — 서버가 재계산한 verifier capability mode를 registry까지 전달.
  `sandbox_verify`가 아니면 어떤 runner도 안 돈다(companion이 검증 runner로 승격 불가 —
  store 필터에 더해 이중 방어).
- **server 배선** — `createServerMissionStore.runVerification`이 registry를 호출.
  local/docker 모두 셸 없이 execFile, docker 없으면 throw → 정직하게 failed/observed:false.
  runsc 프로브는 `docker info` Runtimes에 runsc가 있을 때만 true(가짜 gVisor 금지).

## 정직성 불변식 (테스트로 못박음)

- **runner unavailable인데 observed=true 금지** — blocked/missing은 observed:false.
- **Docker/gVisor 실패를 local로 몰래 fallback 금지** — docker 없으면 failed로 떨어지고
  localExec는 호출조차 안 된다(테스트: `localExec not called`).
- **gVisor runsc 없으면 blocked** — 가짜 gVisor 실행 표시 안 함.
- 명령 allowlist(safeCommandPolicy)는 각 runner 내부 게이트가 책임(local/docker/gVisor
  전부 isAutoApprovableCommand 통과 필요).
- **기존 환경 회귀 0** — runner 미지정이면 local 기본 → 동작 동일.

## Acceptance (스펙 대조)

| 기준 | 통과 |
| --- | --- |
| docker runner 선택 → DockerSandboxRunner 호출 | ✅ host `docker` 호출 확인 |
| gVisor 미설치 → fake observed 없이 blocked | ✅ probeRunsc=false → skipped/observed:false |
| local runner 유지 → 회귀 없음 | ✅ 기본 local |
| capability enforcement | ✅ non-verify mode → blocked, 실행 0 |
| observed exitCode | ✅ 실측 exit code 있는 실행만 observed |

## 검증

server 208(+10) 그린, typecheck 그린. docs/77.
