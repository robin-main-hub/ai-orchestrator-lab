# 아키텍처

## 전체 구조

```mermaid
flowchart LR
  User[사용자] --> Desktop[MacBook 데스크톱 앱]
  Desktop --> LocalRuntime[로컬 런타임]
  Desktop --> DGX[dgx-02 오케스트레이션 서버]
  LocalRuntime --> LocalModels[Ollama / LM Studio / 로컬 CLI]
  LocalRuntime --> LocalTmux[local tmux / CLI agent panes]
  DGX --> RemoteModels[vLLM / 원격 모델 서버]
  DGX --> DgxTmux[DGX-02 tmux / remote CLI panes]
  DGX --> Memory[Memento Memory / SimpleMem 검색 인덱스]
  DGX --> Workspaces[원격 워크스페이스 / 터미널 세션]
  Desktop --> Profiles[프로바이더 프로파일 저장소]
  Desktop --> EventStore[SQLite Event Store]
  EventStore --> Sessions[세션 로그 / 리플레이]
  EventStore --> Exports[Obsidian / Notion / Mobile Projection]
```

## 데스크톱 앱

데스크톱 앱은 사용자가 실제로 보는 지휘실이다. 모델 선택, 프로바이더 프로파일 관리, 토론 패널, 코딩 전달, 터미널 세션, 메모리 조회, 실행 리플레이를 담당한다.

예상 기술 스택은 Tauri 또는 Electron + React + TypeScript다. 로컬 시스템 접근과 맥북 배포 안정성을 고려해 초기에는 Tauri를 우선 검토한다.

DGX-02를 중앙 Event Store와 MemoryRecord의 권위(authority)로 둔다. MacBook은 주 작업 클라이언트이며, 집 PC와 모바일은 DGX projection을 보는 client replica로 동작한다. MacBook이 오프라인이면 로컬 cache/outbox에 임시 저장하고, 온라인 복귀 시 DGX-02 authority로 동기화한다.

온라인 상태에서는 이벤트가 DGX-02에 append되고, 각 클라이언트는 필요한 projection과 캐시를 동기화한다. MacBook이 오프라인이면 대화, 토론, 로컬 실행 기록은 로컬 SQLite outbox에 append하고, 다시 온라인이 되면 DGX-02에 idempotency key와 revision 정보를 함께 전송해 동기화한다.

Obsidian/Notion/mobile은 여전히 원본 저장소가 아니라 Event Store의 projection이다. SimpleMem은 DGX-02 authority의 MemoryRecord에서 파생된 검색 인덱스이며, 원본 DB가 아니다.

## dgx-02 서버

`dgx-02`는 무거운 작업을 담당한다.

- 원격 모델 실행
- 멀티 에이전트 라운드 관리
- 장기 메모리 서버와 SimpleMem 검색 인덱스
- 원격 워크스페이스 실행
- 로그 저장 및 검색
- 비용/토큰/속도 집계

서버는 FastAPI 또는 Node 기반 서버로 시작할 수 있다. 모델 서버가 Python 생태계와 가까우면 FastAPI가 유리하고, 데스크톱과 타입 공유를 강하게 가져가려면 Node 계열이 유리하다.

## 로컬 폴백

서버가 꺼져 있거나 네트워크가 불안정하면 데스크톱 앱은 다음 기능만 활성화한다.

- 로컬 모델 토론
- 로컬 CLI 에이전트 실행
- 로컬 세션 로그
- 로컬 프로바이더 프로파일
- 캐시된 메모리 검색

다음 기능은 제한된다.

- DGX 원격 모델
- 중앙 Memento 메모리 업데이트
- 원격 워크스페이스 실행
- 서버 기반 비용 집계

## 통신 방식

- 데스크톱과 서버: WebSocket + HTTP API
- 긴 실행 로그: streaming event
- 터미널: PTY 스트림
- tmux terminal runtime: session/pane ref, read-only capture, permissioned command intent
- 에이전트 실행: job id 기반 비동기 실행
- 메모리: recall/remember/reflect API

## Event Store와 권한

Event Store의 중앙 원본은 DGX-02다. 각 클라이언트의 로컬 SQLite는 offline cache/outbox 역할을 하며, API 키와 토큰은 Event Store에 평문 저장하지 않고 OS keychain 또는 DGX secret vault에 secret reference로만 연결한다.

모든 event는 저장 전에 Redaction Layer와 Permission Matrix를 통과한다. External Ingress, 모바일, 외부 API에서 들어온 파일 쓰기/터미널 실행/네트워크 실행 요청은 기본적으로 `pending approval` 상태가 된다.

자세한 설계는 `docs/13-event-store-permission-redaction.md`에 둔다.

## 패키지 경계

- `packages/protocol`: 모든 이벤트와 요청/응답 스키마
- `packages/providers`: 모델 프로바이더별 어댑터
- `packages/agents`: 에이전트 런타임과 토론 엔진
- `apps/desktop`: UI와 로컬 런타임 연결
- `apps/server`: DGX 서버와 원격 실행 계층
