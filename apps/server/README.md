# Server App

`dgx-02`에서 실행되는 원격 오케스트레이션 서버입니다.

## 역할

- 원격 모델 실행
- 에이전트 라운드 관리
- WebSocket 스트리밍
- 원격 워크스페이스/터미널 실행
- Memento-MCP 연동
- 세션 로그 저장
- 비용/토큰 집계

## 후보 스택

- FastAPI 또는 Node.js
- WebSocket
- SQLite/Postgres
- Memento-MCP
- vLLM/Ollama/LM Studio/OpenAI 호환 모델 서버

서버는 없어도 앱이 최소 로컬 모드로 작동해야 하므로, 모든 서버 API에는 폴백 정책이 붙습니다.

## 현재 구현

- Node HTTP 기반 `/health`, `/runtime`, `/heartbeat`
- vLLM `/models` probe 기반 `RuntimeSnapshot` 반환
- `/models`에서 DGX-02 vLLM 모델 레지스트리 제공
- `POST /provider-completions`에서 DGX-02 vLLM completion 프록시 제공
- CORS preflight 처리
- 원격 workspace 실행과 메모리 동기화는 capability 이름만 노출
- WebSocket, job queue는 아직 구현하지 않음

## DGX-02 completion proxy

데스크톱은 raw vLLM endpoint나 secret을 request body에 넣지 않고 `providerProfileId`, `modelId`, 메시지만 보냅니다. 서버는 `DGX02_VLLM_BASE_URL` 환경변수가 있으면 그 값을 쓰고, 없으면 `http://dgx-02:8001/v1`로 vLLM에 연결합니다. DGX-02에서 상시 구동할 때는 `scripts/dgx-02/run-server.sh`가 `http://127.0.0.1:8001/v1`을 기본 vLLM 주소로 사용합니다.

```bash
corepack pnpm --filter @ai-orchestrator/server build
corepack pnpm --filter @ai-orchestrator/server start
```

Smoke test:

```bash
corepack pnpm server:smoke
```

DGX-02 user service 예시는 `scripts/dgx-02/ai-orchestrator-server.service`에 있습니다.

## Stage17 Event Storage

- `POST /events/sync`는 accepted 이벤트를 `data/events/events.jsonl`에 append-only로 저장합니다.
- `GET /events?sessionId=...&afterRevision=...`는 JSONL에서 복원된 서버 revision 기준으로 이벤트를 반환합니다.
- `GET /event-storage`는 현재 storage mode, JSONL path, revision, event/session count를 반환합니다.
- `EVENT_STORAGE_DIR=/path/to/events` 환경변수로 저장 위치를 바꿀 수 있습니다.
- 같은 `SMOKE_EVENT_ID`로 `corepack pnpm server:smoke`를 재실행하면 서버 재시작 후에도 duplicate 판정이 유지되는지 확인할 수 있습니다.

## Stage18 Replay Contract

- Desktop은 `GET /events?sessionId=...`를 사용해 DGX-02 Event Storage에서 세션 이벤트를 다시 가져옵니다.
- `conversation.message.created` 이벤트 payload에 `messageId`, `role`, redacted `content`, `metadata`가 있으면 데스크톱 대화창으로 복원할 수 있습니다.
- 서버는 이벤트 원본을 append-only JSONL로 보관하고, MacBook/Home PC 화면 복원은 클라이언트 projection으로 처리합니다.

## Stage20 Session Index

- `GET /sessions`는 DGX-02 Event Storage에 저장된 세션 목록을 최신 이벤트 순서로 반환합니다.
- 각 항목은 `sessionId`, `eventCount`, `firstEventAt`, `lastEventAt`, `lastEventType`, `sources`, `sourceTrust`를 포함합니다.
- MacBook/Home PC 클라이언트는 이 인덱스를 먼저 읽고 필요한 세션만 `/events?sessionId=...`로 복원합니다.
- Stage23부터 `session.created` 이벤트가 있으면 `title`과 `createdByClient`도 session index에 포함합니다.
- Stage24부터 `session.renamed` 이벤트가 있으면 최신 rename title을 session index의 title로 사용합니다.
