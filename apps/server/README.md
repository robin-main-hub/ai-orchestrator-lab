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

- Node HTTP 기반 `/health` placeholder
- `RuntimeSnapshot` 반환
- `/models`에서 DGX-02 vLLM 모델 레지스트리 제공
- `POST /provider-completions`에서 DGX-02 vLLM completion 프록시 제공
- CORS preflight 처리
- 원격 workspace 실행과 메모리 동기화는 capability 이름만 노출
- WebSocket, job queue는 아직 구현하지 않음

## DGX-02 completion proxy

데스크톱은 raw vLLM endpoint나 secret을 request body에 넣지 않고 `providerProfileId`, `modelId`, 메시지만 보냅니다. 서버는 `DGX02_VLLM_BASE_URL` 환경변수가 있으면 그 값을 쓰고, 없으면 `http://dgx-02:8001/v1`로 vLLM에 연결합니다.

```bash
corepack pnpm --filter @ai-orchestrator/server build
corepack pnpm --filter @ai-orchestrator/server start
```
