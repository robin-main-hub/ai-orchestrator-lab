# 70 — Docker / gVisor Sandbox Runner (Orchestration OS PR3+PR4)

Local/Legacy runner는 진짜 exit code를 관측하지만 격리가 약하다. SandboxRunner와 같은
철학(observed exit code) 뒤에 무균실 runner를 추가한다.

## DockerSandboxRunner (PR3)

`apps/server/missions/dockerSandboxRunner.ts`(순수 빌더 + DI exec, 테스트):
- `buildDockerRunArgs(config, argv)` — **보안 기본값 항상 적용**: `--rm --read-only
  --cap-drop=ALL --security-opt=no-new-privileges --network=none --memory=Nm
  --pids-limit=256` (옵션 `--cpus`, `--runtime=runsc`). host repo 직접 마운트 금지 —
  **mission worktree만** `-v <worktree>:/work`(readonly면 `:ro`), rw면 `/tmp` tmpfs만.
- `runDockerSandboxExec` — 공유 allowlist(`isAutoApprovableCommand`) 게이트 통과 후
  명령을 **argv로**(컨테이너 셸 없음) `docker run`. 호스트 docker 호출은 execFile
  (shell:false). exit 0→completed, ≠0→failed, timeout→timeout, 모두 observed:true.
  게이트 차단은 docker 미실행 → observed:false.

## GVisorSandboxRunner (PR4)

`apps/server/missions/gvisorSandboxRunner.ts`: Docker runner를 `--runtime=runsc`로.
**runsc가 없으면 가짜로 gVisor 실행됐다고 표시하지 않는다** — `probeRunsc()`가 false면
status=blocked, observed=false(=configured 의미)로 정직하게 떨어지고 docker를 부르지
않는다. runsc가 있을 때만 runtime=runsc로 실제 실행.

## 정직성 / 안전 (GPT PRO 원칙)

- 명령 allowlist + repoRoot/worktree만 마운트 + 호스트 docker execFile(shell:false).
- observed는 진짜 실행/exit 관측에서만. gate/probe 차단은 observed:false.
- SandboxKind enum의 docker_rootless/docker_gvisor를 그대로 사용(enum 확장 불필요).

## 후속 (정직하게)

라이브 verification 경로(runVerification effect)에 capability.defaultSandboxKind 기반
**kind→runner factory**로 배선하는 것은 docker 환경 + 통합 작업이라 후속. 이번 PR은
runner 엔진(빌더·게이트·매핑)을 테스트와 함께 완성했다 — registry가 없던 자리에
factory를 끼우면 같은 seam 뒤에서 선택된다.

## 검증

server +7(docker) +2(gVisor) = 192 그린, typecheck. docs/70.

## 다음

PR5 Structured Error Card + bounded self-correction + ConfidenceSignal.
