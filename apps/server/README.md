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
