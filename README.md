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
agents/
  orchestrator/   # 기본 SOUL.md / AGENTS.md 프로필 파일
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
  17-role-based-tmux-agent-swarm.md
  18-memento-mcp-structure-check.md
  19-tmux-session-runtime.md
  20-dcinside-reference-1185913.md
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

- `packages/protocol`: 공통 타입, Zod 스키마, EventStore/Permission/MemoryTrace/DGX 실행/Backup Projection/Ingress Guard/Permission Matrix/tmux terminal runtime 인터페이스
- `packages/providers`: provider adapter interface, credential parser, mock model discovery, secret vault/readiness snapshot
- `packages/agents`: debate round template과 CodingPacket draft builder
- `apps/desktop`: Orchestrator Board UI skeleton, Conversation/Debate/Coding Packet/Tmux preview, Agent Runtime, DGX Bridge 카드, Memento Inspector/API adapter, Backup Projection 패널, Ingress Guard 패널, Permission Matrix dock, Provider model discovery, Provider Vault readiness
- `apps/server`: DGX 서버 health/runtime/heartbeat/model registry/completion proxy, vLLM probe, remote-run placeholder

실제 API 키는 저장하지 않고 `SecretRef` 개념으로만 표시합니다. DGX-02 vLLM 모델 호출은 server proxy 우선, direct fallback 보조 경로로 연결되어 있습니다. 터미널 실행은 보안/권한 경계가 더 잡힌 뒤 연결합니다.
## Stage12

- `DGX-02 vLLM` provider profile을 기본 등록한다.
- DGX-02 모델 레지스트리는 `qwen36-gio-lora-v5-prisma`를 노출한다.
- `Probe DGX`는 DGX-02 런타임 상태와 provider model discovery snapshot을 함께 갱신한다.
- `apps/server`는 `/models`에서 DGX-02 모델 레지스트리 placeholder를 제공한다.
- 실제 프롬프트 전송은 브라우저에서 provider secret을 들고 직접 호출하지 않고, DGX-02 `POST /provider-completions` server proxy를 통과한다.
- DeepSeek, APIFun, Grok OAuth, OpenClaw vLLM은 DGX-02 server-proxy provider로 등록하며, 모델 discovery는 `GET /provider-models?providerProfileId=...`를 우선 사용하고 실패 시 redacted static metadata로 fallback한다.
- untrusted provider completion은 Permission Matrix의 `provider_completion` approval item으로 올라가며, 승인 전에는 대화 전송을 막는다.

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

## PR0 Authority Correction

- DGX-02 is now the authoritative shared Event Storage and memory server.
- MacBook keeps a local SQLite cache/outbox and can continue with local models when DGX-02 is unavailable.
- Home PC also keeps a client cache, but normal operation assumes DGX-02 is online.
- Conflict handling uses `dgx02_authority_wins`.
- Local offline writes use `append_local_outbox_when_offline`; clients replay to DGX-02 when the authority returns.
- External legacy Telegram input is represented as `legacy_telegram` in persisted protocol data while UI labels may still say Telegram.
- Unknown external effects, device reboot, provider execution, secret access, and terminal actions are denied by default unless the Permission Matrix approves them.
- Windows Obsidian export defaults to `F:/obsidian/ai-headquarter`.
- Tauri is the accepted shell direction for Windows/macOS packaging; see `docs/21-tauri-desktop-shell.md`.
- DGX-02 public endpoint is `https://orchestrator.endruin.com`; see `docs/22-endruin-domain-dgx02.md`.
- DGX-02 provider registry source mapping is documented in `docs/23-dgx02-provider-registry.md`.

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

## Stage24

- 세션 이름 변경을 `session.renamed` 이벤트로 기록한다.
- DGX-02 session index projection은 `session.created`와 최신 `session.renamed` 이벤트를 함께 읽어 title을 계산한다.
- Desktop Sessions 패널에 active session 이름 변경 버튼을 추가했다.

## Stage25

- Backup projection snapshot과 Obsidian markdown destination을 `activeSessionId` 기준으로 생성한다.
- `applyStage7ProjectionStatuses`는 projection status를 되돌릴 때도 snapshot sessionId를 반영한다.
- 세션을 전환한 뒤 백업을 실행해도 다른 세션의 Obsidian/Notion/Mobile projection으로 섞이지 않게 했다.

## Stage26

- Obsidian vault export plan runtime을 추가했다.
- Obsidian artifact destination은 vault 내부 markdown 상대 경로만 허용하고, `.`/`..` traversal은 차단한다.
- Desktop 백업 생성 이벤트에 Obsidian export plan 메타데이터를 포함해 이후 Tauri/Electron 파일 writer와 바로 연결할 수 있게 했다.

## Stage27

- 좌측 네비게이션의 `프로바이더`를 등록 런처로 승격했다.
- 등록 메뉴에서 API Key/환경변수/Claude Code JSON, CLI 세션, OAuth 세션을 각각 추가할 수 있다.
- CLI/OAuth provider는 raw secret 없이 세션 바인딩으로 등록되고, 모델 discovery stub과 vault readiness가 바로 생성된다.
- 오른쪽 `Provider Profiles`의 기존 `+` 버튼은 API key/env 등록 단축 동작으로 유지한다.

## Stage28

- 오른쪽 레일의 `Provider Profiles` 패널을 제거하고, provider 등록/이름 변경/모델 discovery/삭제 관리를 좌측 `프로바이더` 메뉴로 이동했다.
- 오른쪽 레일은 `Agents`와 `Memento` 2단 구조로 바꿨다.
- `Agents` 패널은 3개 에이전트가 잘리지 않도록 높이를 확보하고, 남는 공간은 `Memento`에 배정했다.
- `Memento` 내부 리스트 높이 제한을 풀고 recall trace와 memory record 표시 개수를 늘렸다.

## Stage29

- 에이전트 설정 소스를 `internal`, `markdown`, `off` 중 하나만 선택하는 `configSource` 타입으로 명시했다.
- `internal`과 `markdown`을 동시에 실행 프롬프트에 주입하지 않도록 프로토콜 테스트를 추가했다.
- 좌측 레일에서 `프로바이더`를 선택하면 세션/시스템/ops 패널을 숨기고 provider 등록/관리 화면만 보이게 했다.
- Provider 관리 목록은 provider 모드에서 남은 왼쪽 높이를 모두 사용한다.

## Stage30

- Conversation 중앙 상단에 `Profile`, `SOUL.md`, `창의성`, `Memory`, `AGENTS.md`, `Preview`, `Edit` 컨트롤 바를 추가했다.
- 선택된 에이전트별 voice preset, AGENTS.md 경로, SOUL.md 경로, soul 요약, 운영 지침을 앱 내부 상태로 관리한다.
- 컨트롤 바 클릭 시 Agent Profile / Soul 설정 drawer가 열리고 `Profile`, `SOUL.md`, `AGENTS.md`, `창의성`, `Injection`, `Preview`, `Edit` 항목을 전환할 수 있다.
- `Injection` 탭에서 `internal`, `markdown`, `off` 중 하나만 실행 소스로 선택하게 해 markdown과 내부 설정 동시 주입을 피한다.

## Stage31

- Conversation 입력창에 최대 5개 이미지/문서 첨부 UI를 추가했다.
- `ModelDescriptor.inputModalities`를 protocol에 추가해 선택된 모델이 `image` 또는 `document` 입력을 지원할 때만 첨부 버튼이 활성화된다.
- 첨부 원본 파일은 아직 저장하지 않고, 파일명/종류/크기/mime type만 `metadata_only`로 메시지와 Event Storage payload에 기록한다.
- 전송된 메시지에는 첨부 chip이 함께 표시되어 이후 DGX object storage, Obsidian projection, 모바일 승인 화면으로 확장할 수 있다.

## Stage32

- Agent Profile drawer 내부의 7개 탭을 제거하고, 중앙 컨트롤 바에서 선택한 항목 하나만 단독 설정 화면으로 열리게 정리했다.
- `SOUL.md` 화면은 경로, 본문, 예시 대화, SOUL.md가 없을 때 쓸 제안 소울, soul injection mode만 다루도록 좁혔다.
- 기존 `Voice` 메뉴는 제거하고, 같은 위치에 `창의성` 설정을 배치했다.
- 창의성은 `보수적`, `신중`, `균형`, `창의적`, `실험적` 5단계로 고르고 각 단계가 temperature 값으로 표시된다.

## Stage33

- 중앙 작업판의 큰 모드를 `Conversation`, `Debate`, `Tmux` 3개로 확장했다.
- `Tmux` 모드는 `docs/17-role-based-tmux-agent-swarm.md`의 4~10 pane 역할 구조를 화면으로 보여주는 future runtime preview다.
- 실제 tmux 명령 실행은 여전히 비활성화되어 있으며, Event Storage / Permission / Redaction / Execution Slot 기반이 안정화된 뒤에만 구현한다.

## Stage34

- `Tmux` 탭을 Conversation/Debate 아래로 떨어지지 않게 중앙 상단 우측에 별도 모드 버튼으로 고정했다.
- Tmux 화면을 중앙 작업판 안에서 완전히 다른 인터페이스로 바꿨다.
- 왼쪽은 작은 글씨의 Operator Chat으로 최근 대화를 모니터링하고, 오른쪽은 최대 10개 logical pane의 agent 작업상태와 중요 메시지를 보여준다.
- `packages/protocol`에 `ExecutionSlot`, `AgentSession`, `RunRequestedEventPayload`, `RunCompletedEventPayload` 타입 기반을 추가했다.
- Gemini CLI는 연결 금지 상태로 표시하고, 실제 tmux command dispatch는 계속 비활성화했다.

## Stage35

- Tmux 모드에서는 기존 오른쪽 rail을 제거하고 중앙 작업판이 전체 폭을 쓰도록 바꿨다.
- Tmux 화면 오른쪽은 채팅 분할창이 아니라 agent pane별 세부 상태판으로 유지한다.
- 에이전트 연필 버튼을 이름/역할/프로필 이미지 설정 패널로 바꿨다.
- 프로필 이미지는 로컬 파일 경로가 아니라 embedded data URL로 보관해 원격 접속 화면에서 경로 깨짐을 피할 수 있게 준비했다.
- 실제 tmux 실행 전 필요한 게이트를 화면에 표시했다: 이벤트 저장소 mapping, Permission + Redaction, Gemini CLI 연결 금지, 첫 runner 미정, agent profile asset 저장 방식.

## Stage36

- Tmux 모드에서는 왼쪽 rail, 오른쪽 rail, 상단 runtime status bar, 하단 terminal dock, 우측 toolbar action을 모두 접는다.
- 중앙 작업판은 `grid-column: 1 / -1`, `grid-row: 1 / -1`로 확장되어 화면 왼쪽과 아래까지 모두 사용한다.
- Conversation/Debate/Tmux 전환 버튼만 남겨 tmux 화면에서 빠져나올 수 있게 했다.

## Stage37

- 좌측 네비게이션을 `세션`, `프로젝트`, `프로바이더`, `채널`, `백업` 각각의 독립 화면으로 분리했다.
- 프로젝트 메뉴는 현재 session, Coding Packet, agent run step, memory recall, event count를 보여준다.
- 채널 메뉴는 Telegram/OpenClaw/Mobile/API 진입점, 7중 ingress guard, approval queue, 0-token safety를 보여준다.
- 백업 메뉴는 Obsidian/Notion/Mobile projection과 redaction 상태, artifact destination을 보여준다.
- `scripts/setup-agent-swarm.sh`와 `scripts/swarm-send.sh`를 추가해 `ai-swarm` tmux 세션 생성과 역할별 pane 명령 전송을 지원한다.
- tmux helper는 pane id를 `.ai-swarm/ai-swarm.env`에 저장하고, obvious secret이 포함된 명령은 전송을 거부한다.

## Stage38

- Tmux Workbench에 오케스트레이터 추천 배치 패널을 추가했다.
- Coding Packet과 최근 대화의 복잡도, 서버/DGX, 권한, redaction, 백업, memory, tmux 키워드를 기준으로 `light / standard / complex / critical` 난이도를 계산한다.
- 난이도에 따라 4명, 6명, 8명, 10명 배치를 추천하고, 현재 추천 역할 chip을 화면에 표시한다.
- tmux pane 후보를 `Research Scout`와 `Memory Curator`까지 확장해 최대 10개 pane을 지원한다.
- `scripts/setup-agent-swarm.sh --panes 4..10` 옵션을 추가하고 기본값을 10개 pane으로 변경했다.

## Stage39

- 세션, 시스템, Ops, 프로젝트, 채널, 백업, 대화, 토론, tmux, 프로바이더, Agents, Memento, Coding Packet, Terminal/Run Log 창에 공통 `창 점검` UI를 추가했다.
- 각 창은 `준비 / 보강 / 잠금` 상태와 짧은 사유를 함께 보여줘 기능 누락, 보류, 의도적 잠금을 화면에서 바로 확인할 수 있다.
- 프로젝트 창에는 inspect 파일 후보와 verification 후보를 별도 리스트로 추가해 Coding Packet의 실행 준비 상태를 더 잘 보이게 했다.
- Terminal/Run Log에는 실행 잠금, 승인 대기열, Event Storage 동기화 상태를 별도 점검 카드로 넣어 실제 명령 dispatch 전에 빠진 게 없는지 확인하게 했다.

## Stage40

- 최초 Hada/tunaFlow 문서에서 빠져 있던 Branch/Adopt 모델을 Conversation Workbench에 추가했다. shadow branch는 별도 후보로 두고, `요약 채택` 시 summary만 main conversation에 주입한다.
- ContextPack `Lite / Standard / Full` tier를 추가해 engine을 바꿔도 identity, recent context, memory, skills, tool results 조립 정책을 한 곳에서 다룰 수 있게 했다.
- Coding Packet 하단에 `Quick / Deep Review`, 4D rubric(`plan_coverage`, `code_quality`, `test_coverage`, `convention`)과 `invariant_checks` UI를 추가했다.
- Insight 6분류(`Stability`, `Testing`, `Architecture`, `Performance`, `Security`, `Tech Debt`)를 추가해 패킷/이벤트/권한/메모리 상태를 빠르게 훑을 수 있게 했다.
- Project 메뉴에 Meta Agent Onboarding 신호와 적용 버튼을 추가해 현재 provider/model/agent 구성을 보고 빠진 역할을 추천 및 추가할 수 있게 했다.

## Stage41

- tmux를 단순 화면 미리보기가 아니라 `Terminal Session Runtime`으로 문서화했다.
- `packages/protocol`에 `TmuxSessionRef`, `TerminalPane`, `TerminalCommandIntent` 타입과 captured output event payload를 추가했다.
- tmux pane 역할을 `Research Scout`, `Memory Curator`까지 포함하는 10-pane 구조로 protocol에서도 고정했다.
- `scripts/swarm-capture.sh`를 추가해 `.ai-swarm/ai-swarm.env`의 pane id를 기준으로 read-only capture를 수행하고, obvious secret을 출력 전에 redaction한다.
- 실제 `send-keys` 자동 실행은 여전히 Permission Matrix, Redaction Layer, Event Storage mapping, approval gate 뒤에 둔다.
- `docs/19-tmux-session-runtime.md`에는 attach/detach/reconnect, pane capture, terminal.* event mapping, DGX-02/DGX-01 규칙을 정리했다.

## Stage42

- `agents/orchestrator/SOUL.md`와 `agents/orchestrator/AGENTS.md` 기본 프로필을 추가했다.
- 기본 프로필은 API 없이 로컬 Markdown과 앱 내부 persona 설정만으로 편집할 수 있다.
- Conversation의 Agent Profile drawer에 `기본값` 버튼을 추가해 선택된 에이전트의 SOUL/AGENTS/창의성 기본값을 다시 불러올 수 있게 했다.
- 기본 persona seed는 에이전트 이름이 아니라 역할 기반 경로(`agents/orchestrator/SOUL.md`)를 사용한다.
- `docs/20-dcinside-reference-1185913.md`에는 아직 본문 확인이 끝나지 않은 DCInside 추가 레퍼런스를 검증 대기 상태로 등록했다.
