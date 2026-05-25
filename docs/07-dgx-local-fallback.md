# DGX 서버와 로컬 폴백

## 기본 전제

프로그램은 주로 MacBook에서 실행된다. 하지만 `dgx-02`가 메인 서버이자 원본 저장소 authority다. `dgx-02`는 강한 실행, 장기 메모리, projection server, SimpleMem index host를 담당한다.

서버 접속이 불가능할 때도 앱은 완전히 멈추지 않고, MacBook 로컬 모델과 로컬 CLI 중심으로 기능이 축소되어야 한다. MacBook을 못 쓰는 시간에는 Phone/Home PC가 DGX-02 projection을 통해 읽기, 승인, 중단, 재시도, remote input을 남긴다.

## 상태 모델

| 상태 | 설명 | 활성 기능 |
| --- | --- | --- |
| Online | DGX 연결 정상 | 모든 기능 |
| Degraded | 연결은 되지만 일부 서비스 실패 | 로컬 대체 가능한 기능은 로컬로 전환 |
| Offline | DGX 접속 불가 | 로컬 모델 토론, 로컬 오케스트레이션, 로컬 로그 |
| Syncing | 서버 복구 후 동기화 중 | 로컬 pending 기록 업로드 |

## 감지 방식

- 주기적 health check
- WebSocket heartbeat
- 모델 서버 ping
- 메모리 서버 ping
- 워크스페이스 실행 권한 확인

## Stage5 구현 경계

현재 구현은 실제 DGX 명령을 실행하지 않고 다음 경계만 먼저 고정한다.

- `RuntimeSnapshot`은 DGX-01, DGX-02, 로컬 모델, MacBook/Home PC client sync 상태를 한 번에 표현한다.
- `DgxHeartbeat`은 DGX-02 authority와 compute/projection server가 reachable인지 확인하는 이벤트 단위다.
- `RemoteExecutionRequest`는 run id, target node, command preview, approval state만 담고 원문 명령 실행은 하지 않는다.
- `RemoteExecutionResponse`는 approval 전에는 `blocked`, DGX가 죽으면 `fallback_required`, 연결/승인 조건이 맞으면 `queued`로만 표현한다.
- 데스크톱은 DGX가 unreachable이면 로컬 CLI/local model outbox를 유지하고, 온라인 복구 시 server snapshot을 merge한다.

## Offline에서 가능한 것

- 로컬 모델로 오케스트레이션
- 로컬 모델로 토론
- 로컬 CLI 에이전트 실행
- 로컬 세션 로그 저장
- 캐시된 메모리 읽기
- 프로바이더 프로파일 편집

## Offline에서 제한되는 것

- DGX 원격 모델 실행
- 중앙 Memento 쓰기
- 원격 워크스페이스 실행
- 서버 기반 병렬 실행
- 서버 측 비용 집계

## 복구 흐름

1. DGX 연결 복구 감지
2. 로컬 pending queue 확인
3. 세션 로그 업로드
4. 메모리 충돌 검사
5. 필요한 경우 사용자에게 병합 선택 요청
6. 정상 Online 상태로 전환

## UI 표시

상단 상태 바에는 다음 정보를 항상 표시한다.

- DGX 연결 상태
- 로컬 모델 상태
- 현재 실행 프로파일
- 메모리 동기화 상태
- 최근 오류
