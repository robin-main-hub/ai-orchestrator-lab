# 46 — Product kernel: sandbox + verifier + Hermes persona contract

이 문서는 실험용 "캐릭터 에이전트 대화/토론"과 사용자가 원하는
**Codex/OpenCode급 코딩 오케스트레이션** 사이의 간극을 줄이기 위한 제품 커널 계약이다.

핵심 원칙:

1. 캐릭터 성격·말투·SOUL quirks는 막지 않는다.
2. 실행 권한은 캐릭터가 아니라 Mission capability가 결정한다.
3. 파일 변경은 Mission sandbox/worktree 안에서만 일어난다.
4. merge는 verifier report와 sequential merge queue를 통과해야 한다.
5. UI의 멋있는 theater 상태와 실제 관측 상태를 분리한다.

냉정하게 말하면, 캐릭터는 "누가 어떻게 판단하고 말하는가"를 맡고,
Product kernel은 "무엇을 어디까지 실행할 수 있는가"를 맡는다.

## 1. 왜 필요한가

기존 흐름은 크게 두 계층이 섞여 있었다.

```text
Conversation / Debate / Persona
  ↕
tmux / provider completion / tool loop
```

이 방식은 실험에는 빠르지만, 다음 문제가 남는다.

| 간극 | 문제 |
|---|---|
| completion-only delegation | 하위 에이전트가 실제 worktree/sandbox에서 일하지 못하고 의견만 낸다. |
| tmux 중심 실행 | live theater로는 좋지만 host-shell 권한과 sandbox 경계가 섞인다. |
| verifier/merge 미완성 | "코드가 됐다"와 "검증 후 병합 가능하다"가 분리되지 않는다. |
| fake-ready 위험 | configured/planned 상태가 observed 상태처럼 보일 수 있다. |
| persona flattening 위험 | 안전을 이유로 캐릭터 말투가 generic coding assistant로 눌릴 수 있다. |

이번 계약은 이 간극을 다음 경로로 닫는다.

```text
Character Persona
  → Agent Capability
  → Mission Worker
  → Sandbox Runner
  → Verification Report
  → Sequential Merge Queue
```

## 2. 새 protocol surface

추가 파일:

```text
packages/protocol/src/productKernel.ts
```

주요 타입:

| 타입 | 역할 |
|---|---|
| `TruthStatus` | observed/configured/planned/simulated 구분 |
| `SandboxSpec` | legacy tmux, docker_gvisor, firecracker 등 실행 격리 계약 |
| `PersonaContinuitySpec` | Hermes sticky slot + SOUL/AGENTS/IDENTITY/USER 파일 참조 |
| `MissionWorkerCapability` | 에이전트별 도구/파일변경/명령실행/샌드박스 필요 여부 |
| `MissionWorkerAssignment` | mission 안에서 특정 agent가 맡은 실제 작업 슬롯 |
| `VerificationReport` | test/typecheck/lint/security 결과의 관측 기반 보고서 |
| `SequentialMergeQueueItem` | 검증 통과 후 순차 병합 대기열 |
| `MissionKernelContract` | side-effect boundary가 mission_sandbox_verifier_merge임을 고정 |

이 계약은 현재 UI/server를 한 번에 갈아엎지 않는다.
먼저 "이 시스템에서 제품 레디 실행이 무엇인지"를 타입으로 고정한다.

## 3. Persona를 막지 않고 더 강화하는 방법

추가 파일:

```text
packages/agents/src/productKernelContracts.ts
```

핵심 함수:

| 함수 | 역할 |
|---|---|
| `createHermesPersonaContinuity(profile)` | personaSlug, Hermes slot, memory scope, SOUL/AGENTS 파일 계약 생성 |
| `createAgentMissionCapability(profile)` | role → capability mode/tool/sandbox/approval 계약 변환 |
| `createMissionWorkerAssignment(...)` | mission에 agent capability를 붙인 worker slot 생성 |
| `buildPersonaContinuitySystemReminder(capability)` | "캐릭터 말투 유지 + 권한 경계 준수" reminder 생성 |

중요한 점:

```text
권한이 강해져도 캐릭터 말투는 죽이지 않는다.
캐릭터 말투가 강해져도 권한은 늘어나지 않는다.
```

예시:

| 캐릭터/역할 | capability |
|---|---|
| 쿠루미 / companion | merge_recommend. 말투와 Hermes continuity는 full 유지. 파일 변경은 직접 못 함. |
| Builder | sandbox_build. write/edit/bash 가능하지만 sandbox/worktree + approval 필수. |
| Verifier | sandbox_verify. bash/verify/diff 가능하지만 write/edit 금지. |
| Auditor/Yuno | sandbox_verify. 독립 감사/반대 의견 가능. 파일 변경 금지. |
| Memory Curator | memory_curate. promotion은 curator_required. |

## 4. Sandbox runner 방향

이번 PR은 runner 구현이 아니라 계약을 먼저 넣는다.
실제 runner는 다음 순서로 붙인다.

```text
SandboxRunner interface
  ├─ LegacyTmuxRunner        # 현재 기능 호환
  ├─ DockerRootlessRunner    # 빠른 로컬 격리
  ├─ DockerGvisorRunner      # product-ready 기본값 후보
  └─ RemoteCodexRunner       # Codex/OpenCode 외부 실행 adapter
```

기본값은 `docker_gvisor`로 잡되, 현재 시스템과의 호환을 위해
`legacy_tmux`도 `SandboxKind`로 남긴다.

tmux는 제거하지 않는다.

```text
tmux = theater / live observation / operator console
sandbox = side-effect authority
```

이렇게 분리해야 멋있음과 안전성이 같이 간다.

## 5. Debate 정책

모든 작업에 토론을 켜면 토큰만 태운다.
토론은 다음 조건에서만 product kernel로 승격한다.

| 조건 | 토론 정책 |
|---|---|
| 단순 질문/파일 읽기 | conversation_only |
| 작은 수정 | Builder + Verifier |
| 보안/권한/삭제/DB | Builder + Verifier + Auditor |
| 큰 구조 변경 | Architect isolated round → Builder → Verifier |
| 의견 충돌 | firstRoundIsolation + one_global_directive |

`DebateControlPolicy`의 기본값 후보:

```ts
{
  firstRoundIsolation: true,
  maxRounds: 3,
  criticDirectiveLimit: "one_global_directive",
  exitWhenVerifierPasses: true,
  exitWhenNoNewRisk: true
}
```

리제/유노/Verifier 계열이 장문의 불만 목록을 쏟아내면 Builder가 산만해진다.
그래서 기본 critic output은 `globalRevisionDirective` 하나로 제한한다.

## 6. Truth status

UI와 report는 아래 상태를 반드시 구분해야 한다.

| 상태 | 의미 |
|---|---|
| `observed` | 실제 probe/test/log/artifact로 확인 |
| `configured` | 설정/계약은 있음. 현재 실행 확인은 아님 |
| `planned` | 로드맵/예정 |
| `simulated` | 데모/시드/목업 |

작전극장 감성은 유지하되, "보이는 것"과 "증명된 것"을 섞지 않는다.

## 7. 다음 구현 PR 후보

### PR A — SandboxRunner interface

```text
feat(runtime): add SandboxRunner interface and legacy tmux adapter
```

수용 기준:

- `SandboxRunner.prepare/exec/readFile/writeFile/diff/destroy` interface 추가
- 기존 tmux dispatch는 `LegacyTmuxRunner`로 감싼다
- `SandboxSpec.kind=legacy_tmux`일 때만 host tmux path 허용
- mutation이 sandbox 없이 실행되면 reject

### PR B — Mission store/server route

```text
feat(server): persist missions and worker assignments
```

수용 기준:

- `/missions` route
- Mission event append
- worker status transition
- artifact refs 저장
- truthStatus 표면화

### PR C — Verifier + sequential merge queue

```text
feat(verifier): observed verification report and sequential merge queue
```

수용 기준:

- worker diff artifact
- verifier sandbox checks
- observed report
- human approval
- sequential merge
- post-merge smoke

### PR D — Hermes memory promotion worker

```text
feat(memory): Hermes-style persona continuity and memory promotion worker
```

수용 기준:

- persona memory scope
- sticky slot restore
- SOUL/AGENTS/IDENTITY/USER trace
- curator_required promotion
- Obsidian/Notion은 export adapter로 유지

## 8. 금지할 착각

| 착각 | 금지 이유 |
|---|---|
| "캐릭터가 executor니까 host shell 가능" | 권한은 capability + sandbox가 결정한다. |
| "tmux에서 보이면 sandbox다" | tmux는 observation이고 sandbox가 아니다. |
| "검증 모델이 OK라고 말했으니 pass" | pass는 observed check result여야 한다. |
| "안전을 위해 말투 제거" | action은 제한해도 persona voice는 보존한다. |
| "configured provider = live provider" | observed/configured/planned/simulated 분리. |

## 9. 이번 계약의 의도

이번 변경은 큰 기능 완성이 아니라, 다음을 코드 수준에서 고정하는 첫 착지판이다.

```text
캐릭터성 강화 = Hermes continuity
코딩 능력 강화 = Mission capability
실행 안전성 강화 = SandboxSpec
신뢰성 강화 = VerificationReport
제품성 강화 = SequentialMergeQueue + TruthStatus
```

러시아 심판 판정:

```text
예술점수는 유지한다.
기술점수는 sandbox/verifier/merge로 올린다.
가짜 착지는 무효 처리한다.
```
