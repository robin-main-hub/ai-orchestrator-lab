# AI Orchestrator Lab

AI Orchestrator Lab은 여러 AI 모델, CLI 러너, 코딩 워크벤치, 미션 보드, 터미널, 승인 큐, 장기 메모리, 리플레이를 하나의 데스크톱 조종석에서 다루기 위한 **개인용 AI Command OS**입니다.

목표는 단순 채팅 앱이나 예쁜 대시보드가 아닙니다. 사람이 목표를 주면 여러 에이전트가 계획, 실행, 검증, 보고, PR 생성까지 이어가고, 사용자는 그 과정을 승인 게이트와 증거 기반 화면으로 통제합니다.

> 한 줄 정의: OpenCode, Claude Code, Codex, 로컬 모델, tmux/worktree 러너를 대체하기보다, 이들을 mission, permission, evidence, replay, memory, provider, approval 레이어로 감싸는 오케스트레이션 OS입니다.

---

## 현재 제품 방향

이 저장소는 두 축으로 발전 중입니다.

1. **Desktop Command OS**
   - 대화, 코딩, 리서치, 토론, 미션 실행, 터미널, 승인 큐, 메모리, 프로바이더 관리, 런타임 상태를 하나의 앱에서 운영합니다.

2. **Authority / Runtime Architecture**
   - 현재 구현은 DGX/server authority 계열로 시작했습니다.
   - 최신 설계 트랙은 MacBook local authoritative store, replica/outbox, import verifier, cutover, epoch quarantine, phone pending intent까지 다루는 A-series authority migration으로 확장되었습니다.
   - 실제 authority flip은 아직 코드 시작 전이며, 별도 GO가 필요한 HOLD 상태입니다.

현재 README의 예전 표현처럼 “DGX-02가 무조건 메인 authority”라고 단정하면 최신 설계와 맞지 않습니다. 더 정확한 표현은 다음입니다.

```text
현재 구현: DGX/server 중심 authority + desktop cache/outbox 계열
목표 설계: MacBook local authoritative store + DGX replica/sync/model-execution hub
상태: 설계 완료, 코드 flip은 승인 대기
```

---

## 핵심 기능

### 1. Command / Dashboard

- 시스템 전체 상태 요약
- 오늘의 attention / blocked item / running mission 표시
- Operator Cockpit과 연결되는 health summary
- mission, provider, runtime, approval 상태를 한 화면에서 확인

### 2. Studio

- Conversation Workbench
- Coding Workbench
- Research Swarm
- Debate / Annex
- Plan / Build 모드
- 파일 멘션, 도구 호출, 승인 게이트, 결과 재투입 루프

### 3. Operations

- single-agent autonomous run
- parallel agent run
- Mission Board
- Summon Theater / live operation view
- tmux terminal board
- approval queue
- replay / trace / evidence inspection

### 4. Library

- workspaces
- sessions
- artifacts
- patch candidates
- evidence bundles
- memory / learning records
- replay history
- agent personas

### 5. System

- provider registration
- model discovery
- source/channel management
- config files
- backup / recovery
- runtime health
- permission / redaction boundaries

---

## 최근 구현된 주요 계층

### Mission / Verification / Merge

- mission event materialization
- board status derivation
- verification report normalization
- observed/passed truth gate
- merge queue
- git worktree merge runner
- fake-green 방지
- mission trace / replay

### GitHub Write Guards

최근 루프에서 GitHub 외부 write 경로의 실제 보안 결함을 다수 수정했습니다.

- secret scanner parity
- modern OpenAI key detection
- GitHub fine-grained PAT detection
- GitLab PAT detection
- bare bearer token detection
- env-style secret assignment detection
- path traversal / `.` segment bypass 차단
- `.env`, `secrets`, `.git`, workflow, lockfile, build artifact 경로 차단
- branch/ref metacharacter validation
- PR title / label / commit message control-character guard
- commit message secret scan

이 레이어는 “AI가 GitHub에 쓰기 전에 서버가 한 번 더 막는 방어막”입니다.

### Provider / Trust / Memory

- provider credential parser
- model/provider discovery
- OpenAI / Anthropic / OpenRouter / Ollama 계열 trust classification
- hostname spoofing 방지
- untrusted provider memory recall quarantine
- provider error redaction

### Public Redaction / Safety

- public text sanitizer
- provider error snippet redaction
- autorun publish-phase redaction
- patch safety scanner
- local shell output redaction
- storage-path redaction parity는 EventStorage 동작 변경에 해당하여 별도 승인 대기

### A-series Authority Design

docs/157 이후 authority migration 설계가 큰 축입니다.

- canonical authority ledger
- MacBook authority migration blueprint
- authoritative store seam
- import verifier
- cutover runbook
- offline phone operational truth
- authority migration test matrix
- OPFS authoritative store format
- replica outbox persistence
- controller rewire
- phone pending intent
- epoch quarantine
- authoritative event id format

현재 상태:

```text
A-series design/docs: mostly closed
Phase 0~2 code: GO 대기
Phase 3~5 flip/cutover: 별도 GO 대기
```

---

## 저장소 구조

```text
apps/
  desktop/      # Vite/React 기반 데스크톱 앱 UI
  server/       # 오케스트레이션 서버, provider proxy, mission/GitHub/write guards

packages/
  protocol/     # 공통 타입과 Zod 스키마
  providers/    # provider adapter, credential parser, model discovery, error redaction
  agents/       # agent runtime, debate/coding/research orchestration
  simplememo/   # continuity memory

agents/         # persona / role / identity assets
docs/           # product, runtime, authority, safety, handoff docs
scripts/        # smoke, deployment, runner, utility scripts
artifacts/      # generated reports and audit bundles
```

---

## 현재 상태 요약

```text
제품 계층: Desktop Command OS + mission/agent/runtime orchestration
UI 계층: 기존 shell에서 full UI renewal 필요
Mission 계층: board/verification/merge/replay/trace 계열 구현됨
GitHub write guard: 최근 대량 보강됨
Provider trust: hostname spoofing 계열 보강됨
Authority migration: 설계 완료, 코드 시작은 승인 대기
EventStorage redaction parity: 승인 대기
Terminal-state guard: 제품 정책 결정 대기
```

---

## 실행 방법

```bash
corepack prepare pnpm@10.11.0 --activate
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm dev
```

주요 검증 예시:

```bash
pnpm --filter @ai-orchestrator/protocol build
pnpm --filter @ai-orchestrator/providers build
pnpm --filter @ai-orchestrator/simplememo build
pnpm --filter @ai-orchestrator/agents build
pnpm --filter @ai-orchestrator/desktop typecheck
pnpm --filter @ai-orchestrator/desktop test
pnpm --filter @ai-orchestrator/server test
```

---

## 앞으로 만들 내용

### 1. Full UI Renewal

현재 README와 UI 설명은 오래된 nav / stage / tab 구조에 묶여 있습니다. 다음 UI 방향은 5개 상위 영역입니다.

```text
Command
Studio
Operations
Library
System
```

목표:

- old left nav 제거
- duplicate mode tabs 제거
- Command OS 느낌의 shell 재구성
- Conversation / Code / Research / Debate를 Studio로 정리
- Run / Live / Mission / Terminal / Queue를 Operations로 정리
- Workspaces / Sessions / Artifacts / Memory를 Library로 정리
- Providers / Models / Sources / Config / Backup / Runtime을 System으로 정리

### 2. Authority Phase 0~2

승인 후 진행할 non-flip 코드 단계:

- authoritative store adapter seam
- OPFS/local store implementation
- replica outbox persistence
- controller rewire slot-in
- shadow parity report
- import verifier dry-run

### 3. Authority Phase 3~5

별도 승인 후 진행할 flip/cutover 단계:

- authority epoch quarantine
- cutover state machine
- DGX/server projection 전환
- phone pending intent flow
- rollback/read-only legacy JSONL plan

### 4. Product Runtime

- terminal-state guard 정책 결정
- mission lifecycle immutability / reopen policy
- WorkItem lifecycle commitment
- approval queue UX 정리
- replay / evidence UX 강화
- memory learning loop activation

### 5. ERP / Business Plugin Track

이 저장소 자체는 generic AI Orchestrator OS입니다.

GIOLITE ERP, 국내/해외 영업 대시보드, Evidence Hub, Slack/Email/Notion/Drive 연결은 이 OS 위에 얹는 **도메인 플러그인 / 별도 앱 트랙**으로 취급합니다.

원칙:

```text
OS core = generic
ERP / Sales workflow = plugin or downstream app
```

---

## 개발 원칙

- fake data로 green 만들지 않기
- AI summary를 truth로 취급하지 않기
- source/evidence/replay를 함께 남기기
- provider secret은 절대 UI/로그/commit에 노출하지 않기
- runtime/provider/approval/EventStorage 계약은 UI 작업 중 변경하지 않기
- authority flip은 설계 문서 완료와 별개로 별도 승인 후 진행하기
- generic OS core에 회사/개인/거래처 식별자를 넣지 않기

---

## README 유지 원칙

README는 짧고 살아있는 제품 지도로 유지합니다.

역할 분리:

```text
README.md = 제품 정체성, 현재 상태, 실행법, 앞으로 만들 큰 방향
docs/ = 상세 설계와 PR별 deep dive
artifacts/ = 검증 결과와 감사 산출물
```

Stage별 긴 변경 로그는 README에 다시 누적하지 않고, 별도 `docs/history/` 또는 `docs/changelog/`로 이동합니다.
