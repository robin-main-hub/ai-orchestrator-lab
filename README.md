# AI Orchestrator Lab

맥북에서 실행되는 데스크톱 AI 오케스트레이터와 `dgx-02` 서버를 함께 사용하는 멀티 에이전트 작업실입니다.

이 저장소는 단순한 채팅 앱이나 토론 UI가 아니라, 여러 모델과 여러 에이전트를 한 화면에서 조율하고, 토론 결과를 실제 코딩 작업으로 넘기며, 서버가 죽었을 때도 로컬 모델로 제한 운용되는 전체 시스템을 목표로 합니다.

## 목표

- 데스크톱 앱이 전체 지휘실 역할을 한다.
- `dgx-02`는 강한 모델, 로컬 LLM 서버, 장기 메모리, 원격 작업 실행을 담당한다.
- 서버 접속이 불가능하면 맥북의 로컬 모델과 로컬 CLI만으로 오케스트레이션/토론을 계속한다.
- DGX-02를 중앙 데이터 권위로 두고, 맥북은 로컬 SQLite 캐시/outbox로 복구 동기화한다. 집 PC는 DGX-02 상시 연결 클라이언트로 보고, DGX-02 장애 시에는 비상 degraded 상태로 둔다.
- 토론 기능을 끈 상태에서는 OpenClaw/Claude/Codex/로컬 모델과 1:1 대화하듯 작업한다.
- 하나의 API 또는 하나의 모델에서도 여러 가상 에이전트를 만들어 병렬 토론과 역할 분담을 수행한다.
- 여러 프로바이더 프로파일을 동시에 등록하고, 실행마다 모델/API 키/검증 모델을 바꿀 수 있다.
- 토론은 의사결정뿐 아니라 코딩 작업을 위한 구현 지시서, 컨텍스트 팩, 리뷰 패킷으로 이어진다.
- 일부 에이전트는 `soul.md`를 통해 장기 정체성과 판단 기준을 유지한다.
- 토론 결과와 실행 기록은 Obsidian/Notion으로 자동 백업하고, 폰에서는 읽기와 제한적 승인 중심으로 접근한다.
- 제품 목적은 "쓰려고 만든다"로 두고, 학습은 수단으로 삼는다.

## 핵심 기능

- 데스크톱 오케스트레이터
- Conversation Workbench: 토론 Off 상태의 1:1 대화형 작업 모드
- 멀티 에이전트 토론 라운드테이블
- 코딩 작업 전달 모드
- Telegram/OpenClaw 대화 세션 연동
- 실시간 터미널/CLI 에이전트 슬롯
- 프로바이더 프로파일 다중 등록
- API 키/환경변수 붙여넣기 파서
- 사용 가능 모델 자동 조회
- 강한 모델 검증 또는 동일 로컬 모델 검증
- DGX 원격 실행 및 로컬 폴백
- DGX-02 Event Storage authority, client SQLite outbox, Redaction Layer, Permission Matrix
- External Ingress Guard와 confidence routing
- Memento-MCP 스타일 장기 메모리
- 에이전트별 `soul.md` 정체성 파일
- Obsidian 로컬 백업과 Notion 요약 동기화
- 모바일 읽기/승인 대시보드
- 실행 리플레이, 비용 가드, 권한 매트릭스

## 참고 방향

- tunaFlow: 데스크톱 오케스트레이터, CLI 에이전트 연결, 코드 작업 흐름
- DCInside 토론 UI 글: 프론트엔드 톤, 모델별 패널, 토론 흐름
- wonseokjung/connect-ai: 로컬에서 여러 에이전트를 굴리는 구성
- Memento-MCP: 장기 기억, 회상, 반성, 작업 세션 연결

## 저장소 구조

```text
apps/
  desktop/        # 맥북에서 실행되는 데스크톱 프론트엔드
  server/         # dgx-02에서 실행되는 오케스트레이션 서버
packages/
  protocol/       # 데스크톱-서버-에이전트 공통 스키마
  providers/      # OpenAI/Anthropic/OpenRouter/Ollama/리셀러 API 어댑터
  agents/         # 에이전트 런타임, 토론 엔진, 코딩 전달 엔진
docs/
  00-product-brief.md
  01-architecture.md
  02-feature-map.md
  03-provider-profiles.md
  04-agent-orchestration.md
  05-memory-memento.md
  06-roadmap.md
  07-dgx-local-fallback.md
  08-ui-direction.md
  09-agent-soul.md
  10-backup-and-mobile.md
  11-conversation-mode.md
  12-external-review-plan.md
  13-event-store-permission-redaction.md
  14-product-strategy-vertical-slice.md
  15-agent-topology-and-ingress-guards.md
  16-codex-implementation-handoff.md
  review-board.md
  research-notes.md
```

## 실행 방법

초기 구현은 `pnpm` workspace를 기준으로 합니다.

```bash
corepack prepare pnpm@10.11.0 --activate
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm dev
```

데스크톱 앱은 현재 Vite 기반 프론트엔드 골격입니다. 실제 Tauri/Electron 네이티브 래퍼, 모델 호출, 터미널 실행은 아직 연결하지 않았습니다. DGX 원격 실행은 실제 명령 실행 없이 heartbeat, remote-run request, approval gate, local fallback 경계를 타입과 mock runtime으로만 연결했습니다.

## 현재 상태

첫 코드 골격을 구현 중입니다.

- `packages/protocol`: 공통 타입, Zod 스키마, EventStore/Permission/MemoryTrace/DGX 실행/Backup Projection/Ingress Guard/Permission Matrix 인터페이스
- `packages/providers`: provider adapter interface, credential parser, mock model discovery, secret vault/readiness snapshot
- `packages/agents`: debate round template과 CodingPacket draft builder
- `apps/desktop`: Orchestrator Board UI skeleton, Conversation/Debate/Coding Packet, Agent Runtime, DGX Bridge 카드, Memento Inspector, Backup Projection 패널, Ingress Guard 패널, Permission Matrix dock, Provider model discovery, Provider Vault readiness
- `apps/server`: DGX 서버 health/runtime/heartbeat/model registry/completion proxy, vLLM probe, remote-run placeholder

실제 API 키는 저장하지 않고 `SecretRef` 개념으로만 표시합니다. DGX-02 vLLM 모델 호출은 server proxy 우선, direct fallback 보조 경로로 연결되어 있습니다. 터미널 실행은 보안/권한 경계가 더 잡힌 뒤 연결합니다.
## Stage12

- `DGX-02 vLLM` provider profile을 기본 등록한다.
- DGX-02 모델 레지스트리는 `qwen36-domain-wiki-rag-prisma`를 노출한다.
- `Probe DGX`는 DGX-02 런타임 상태와 provider model discovery snapshot을 함께 갱신한다.
- `apps/server`는 `/models`에서 DGX-02 모델 레지스트리 placeholder를 제공한다.
- 실제 프롬프트 전송은 아직 브라우저에서 직접 하지 않고, 다음 단계의 runtime approval/server proxy를 통과하도록 남겨둔다.

## Stage13

- `packages/protocol`에 `ProviderCompletionRequest`와 `ProviderCompletionResponse`를 추가해 completion도 공통 타입 경계를 타게 했다.
- `apps/server`는 `POST /provider-completions`를 제공하고, 데스크톱에서 받은 `providerProfileId`, `modelId`, 메시지만으로 DGX-02 vLLM에 프록시한다.
- DGX-02 vLLM 실제 endpoint와 secret/base URL은 데스크톱 요청 body에 넣지 않는다.
- 데스크톱은 DGX provider 호출 시 `http://dgx-02:4317/provider-completions`를 먼저 시도하고, 서버 프록시가 아직 떠 있지 않으면 `http://dgx-02:8001/v1/chat/completions` 직접 호출로 fallback한다.
- 서버 프록시는 CORS preflight를 처리하며, `chat_template_kwargs.enable_thinking=false`를 강제해 reasoning/thinking 로그가 대화창에 새지 않게 한다.

## Stage14

- `apps/server` health/runtime/model registry는 vLLM `/models`를 probe해 DGX-02 모델 런타임 상태를 반영한다.
- 데스크톱의 `Probe DGX`는 더 이상 가짜 online 상태를 만들지 않고, `http://dgx-02:4317`의 `/health`, `/heartbeat`, `/models`를 실제 조회한다.
- `dgx-02:4317`이 닫혀 있으면 데스크톱은 DGX를 offline/degraded로 표시하고 direct vLLM fallback 가능성을 event log에 남긴다.
- `scripts/dgx-02/run-server.sh`와 `scripts/dgx-02/ai-orchestrator-server.service`를 추가해 DGX-02에서 서버를 상시 프로세스로 띄울 준비를 했다.
- `corepack pnpm server:smoke`는 `/health`와 `/provider-completions`를 확인하는 smoke test로 사용한다.

## Stage15

- `packages/protocol`에 Event Storage push/pull sync envelope를 추가했다.
- `apps/server`는 `POST /events/sync`로 desktop/MacBook/Home PC client replica 이벤트를 받고, 같은 event id 재전송은 duplicate로 처리한다.
- 서버는 같은 event id의 다른 payload를 conflict로 분리하고, raw secret 패턴이 보이는 이벤트는 failed로 막는다.
- `apps/desktop`은 이벤트를 만들 때 DGX-02 Event Storage로 sync를 시도하고, 실패하면 local outbox 상태로 남긴다.
- Terminal dock의 Event Storage 카드에서 DGX-02 revision, outbox count, 수동 sync 버튼을 볼 수 있다.
- `scripts/smoke-dgx-server.mjs`는 `/health`, `/provider-completions`, `/events/sync`를 함께 확인한다.

## Stage16

- MacBook client id를 `client_macbook`으로 통일하고, Event Storage sync가 실제 MacBook outbox count를 갱신하도록 수정했다.
- Home PC는 offline-first outbox 대상이 아니라 `online_only` / `requires_dgx` 클라이언트로 분리했다.
- DGX-02 서버가 내려가면 MacBook은 local outbox로 큐잉하고, Home PC는 DGX 복구 대기 degraded 상태로 표시한다.
- 데스크톱 앱에 browser localStorage 기반 Event outbox adapter를 추가했다. 이후 Tauri/Electron 단계에서 같은 인터페이스를 SQLite로 교체하면 된다.
- 앱 새로고침 후에도 MacBook outbox에 남은 이벤트를 다시 DGX-02 `/events/sync`로 밀어넣는다.

## Stage17

- DGX-02 서버 Event Storage를 프로세스 메모리에서 append-only JSONL 파일로 승격했다.
- 기본 저장 위치는 `data/events/events.jsonl`이고, `EVENT_STORAGE_DIR`로 바꿀 수 있다.
- 서버 재시작 후에도 event id, revision, duplicate/conflict 판정이 유지된다.
- `GET /event-storage`로 storage mode, JSONL path, revision, event/session count를 확인할 수 있다.
- `scripts/smoke-dgx-server.mjs`는 `/event-storage`와 `/events` pull 결과까지 함께 확인한다.

## Stage18

- Conversation message event payload에 redacted `content`를 포함해 DGX-02 Event Storage가 실제 대화 복원의 원본이 되도록 했다.
- `apps/desktop/src/runtime/stage18EventReplay.ts`에서 DGX-02 `/events?sessionId=...` pull, Conversation message 재구성, local message/event dedupe merge를 담당한다.
- Terminal dock의 Event Storage 카드에 `pull` 버튼을 추가해 MacBook 또는 Home PC 화면에서 DGX-02에 저장된 세션 이벤트를 다시 불러올 수 있다.
- 오래된 이벤트처럼 content가 없는 message event는 안전하게 건너뛰고, 앞으로 생성되는 메시지는 redaction layer를 통과한 본문만 저장한다.

## Stage19

- `coding_packet.created` 이벤트 payload에 전체 `CodingPacket` 구조를 포함해, 코딩 전달 상태도 DGX-02 Event Storage에서 복원할 수 있게 했다.
- `apps/desktop/src/runtime/stage19CodingPacketReplay.ts`는 최신 유효 packet 이벤트를 찾고 Zod schema로 검증한 뒤 UI 상태로 되돌린다.
- content가 없는 구형 packet 이벤트는 건너뛰고, schema가 깨진 packet은 `invalid`로 분리해 나중에 conflict/review UI로 넘길 수 있게 했다.

## Stage20

- `packages/protocol`에 Event Storage session index response 타입을 추가했다.
- DGX-02 서버는 `GET /sessions`로 sessionId, event count, 최신 이벤트 타입, source/trust 요약을 내려준다.
- Desktop 좌측 레일에 Sessions 패널을 추가해 DGX-02 revision과 최근 세션을 확인하고, 현재 세션 replay를 바로 실행할 수 있게 했다.

## Stage21

- Desktop의 메시지 생성, Telegram ingress, permission snapshot, Event Storage replay를 `activeSessionId` 기준으로 전환했다.
- Sessions 패널에서 특정 sessionId를 누르면 해당 세션의 이벤트와 메시지를 DGX-02에서 pull하고, 선택된 세션을 active 상태로 표시한다.
- 새 메시지와 새 이벤트는 현재 active session에 기록되므로 MacBook/Home PC 간 세션 이동의 기본 경계가 생겼다.

## Stage22

- Sessions 패널에 새 세션 생성 버튼을 추가했다.
- 새 세션을 만들면 `session.created` 이벤트가 현재 active session으로 기록되고 DGX-02 Event Storage에 sync된다.
- 생성 직후 대화창과 이벤트 로그는 새 세션 기준으로 비워져, 이후 메시지와 코딩 패킷이 해당 sessionId 아래에 쌓인다.

## Stage23

- Event Storage session index 항목에 `title`과 `createdByClient`를 추가했다.
- DGX-02 서버는 `session.created` 이벤트 payload의 title/sourceClient를 세션 인덱스 메타데이터로 승격한다.
- Desktop Sessions 패널은 sessionId 대신 사람이 읽을 수 있는 title을 우선 표시하고, 세부 줄에 sessionId와 event count를 함께 보여준다.
