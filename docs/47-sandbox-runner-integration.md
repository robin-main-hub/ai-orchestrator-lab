# 47 — SandboxRunner 1단계: tmux를 실행 경계 뒤로

product-kernel 계약(docs/46)이 "무엇을 어디까지 실행할 수 있는가"를 타입으로 고정했다면,
이 단계는 그 계약을 **실제 실행 경로**에 처음 연결한다. 핵심 한 줄:

```text
tmux를 없애지 말고, tmux를 runner 뒤로 보낸다.
```

## 1. 왜 이 순서인가

```text
Hermes 통합   = "누가 작업하느냐"를 강화 (캐릭터 연속성)
SandboxRunner = "어디서·어떤 권한으로·어떻게 작업하느냐"를 보장 (실행 경계)
```

Codex/OpenCode급 간극은 두 번째에서 먼저 닫힌다. 그래서 착지판부터.

## 2. 평행 레이어를 만들지 않는다 — 기존 실행 추상화를 흡수

이 레포에는 이미 실행 추상화가 있다: `ClosedLoopEffects`
(`apps/desktop/src/lib/closedLoopController.ts`).

```ts
type ClosedLoopEffects = {
  dispatch(command, { stepIndex }): Promise<void>;  // → /tmux/dispatch + approval replay
  capture(): Promise<string>;                        // → /tmux/capture
  escalate(reason, state): Promise<void>;            // → 사람 승인 큐
};
```

SandboxRunner는 이걸 **대체하지 않고 감싼다**. LegacyTmuxRunner는 기존 effects를
주입받아 SandboxRunner 인터페이스로 노출하는 어댑터다 — 기존 tmux dispatch/capture
로직은 한 줄도 삭제되지 않는다.

```text
Mission / WorkerCapability
  → SandboxRunner.preflight   (capability + safeCommandPolicy 게이트)  ← 새로 추가된 경계
  → SandboxRunner.exec        →  기존 ClosedLoopEffects.dispatch
  → SandboxRunner.capture     →  기존 ClosedLoopEffects.capture
```

## 3. 이번에 추가된 것

| 파일 | 내용 |
|---|---|
| `packages/protocol/src/productKernel.ts` | `SandboxRunMode`, `SandboxExecRequest/Result`, `SandboxPreflightResult`, `SandboxCaptureResult` 공유 타입 |
| `packages/agents/src/sandboxPlan.ts` | `sandboxRunModeForCapability` (capability mode → run mode), `createSandboxPlanFromCodingPacket` (verificationPlan → exec 요청). 순수 |
| `apps/desktop/src/lib/sandboxRunner.ts` | `SandboxRunner` 인터페이스 (preflight/exec/capture) |
| `apps/desktop/src/lib/legacyTmuxRunner.ts` | 기존 effects를 감싸는 호환 어댑터 + capability/safe-command preflight |

## 4. 강제되는 불변식 (테스트로 고정)

```text
permissionLevel은 "요청 가능"을, runner preflight는 "실행 가능"을 부여한다.
```

- `merge_recommend` 모드는 **실행 자체 불가** — report만.
- `build` 모드는 `canMutateFiles`인 capability만 요청 가능하고, **항상 승인 뒤**.
- 쿠루미(companion, `permissionLevel: "write_files"`)도 build run은 **차단** —
  권한 레벨이 곧 실행권이 아니다.
- `read_only` / `verify` 모드는 `safeCommandPolicy` allowlist를 통과한 명령만 실행, 승인 불필요.
- preflight가 막으면 `exec`는 dispatch를 호출하지 않고 `status: "blocked", observed: false`.
- 실제 dispatch가 일어난 결과만 `observed: true` (theater status와 구분 — docs/46의 TruthStatus 원칙).

## 5. 아직 안 한 것 (다음 순서)

이번 PR은 **desktop/lib 순수 어댑터 + 기존 effect 주입형**까지다. 서버는 안 건드렸다.

```text
1. (완료) SandboxRunner interface + LegacyTmuxRunner + CodingPacket→exec plan
2. Hermes slot continuity ↔ MissionWorker 연결 (PersonaContinuitySpec ↔ 기존 hermesSlotPool 통합)
3. Server mission persistence (/missions, worker status, artifact refs)
4. Verifier report + sequential merge queue
5. DockerRunner / GVisorRunner / DgxSandboxRunner (같은 인터페이스 뒤)
```

핵심은 이 인터페이스가 생긴 뒤로 선택지가 열린다는 것이다.

```text
오늘은 LegacyTmuxRunner
내일은 DockerRunner
나중엔 GVisorRunner
원격은 DgxSandboxRunner
```

캐릭터는 계속 캐릭터답게 말하고, 실행은 점점 더 안전해진다.
