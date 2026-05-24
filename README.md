# AI Orchestrator Lab

맥북에서 실행되는 데스크톱 AI 오케스트레이터와 `dgx-02` 서버를 함께 사용하는 멀티 에이전트 작업실입니다.

이 저장소는 단순한 채팅 앱이나 토론 UI가 아니라, 여러 모델과 여러 에이전트를 한 화면에서 조율하고, 토론 결과를 실제 코딩 작업으로 넘기며, 서버가 죽었을 때도 로컬 모델로 제한 운용되는 전체 시스템을 목표로 합니다.

## 목표

- 데스크톱 앱이 전체 지휘실 역할을 한다.
- `dgx-02`는 강한 모델, 로컬 LLM 서버, 장기 메모리, 원격 작업 실행을 담당한다.
- 서버 접속이 불가능하면 맥북의 로컬 모델과 로컬 CLI만으로 오케스트레이션/토론을 계속한다.
- DGX-02를 중앙 데이터 권위로 두고, 맥북과 집 PC는 로컬 SQLite 캐시/outbox를 통해 오프라인 후 온라인 복구 시 동기화한다.
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
- DGX-02 Event Store authority, client SQLite outbox, Redaction Layer, Permission Matrix
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
- `apps/server`: DGX 서버 health/runtime/heartbeat/remote-run placeholder

실제 API 키는 저장하지 않고 `SecretRef` 개념으로만 표시합니다. 실제 모델 호출과 터미널 실행은 보안/권한 경계가 더 잡힌 뒤 연결합니다.
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
