# 구현 순서

이 프로젝트는 작은 MVP로 기능을 줄이는 방향이 아니라, 전체 목표를 유지한 채 의존성이 낮은 것부터 작동시키는 방식으로 진행한다.

## 1단계: 저장소와 프로토콜

- 모노레포 구성
- 공통 타입 패키지
- Zod 기반 런타임 검증 스키마
- 세션, 이벤트, 에이전트, 프로바이더, 모델, 메모리 스키마 정의
- Event Store envelope 정의
- Redaction rule과 Permission Matrix 정의
- 기본 테스트 환경 구성

## 1.5단계: Event Store, Redaction, Permission

- SQLite append-only Event Store
- event emit 직전 Redaction Layer
- OS keychain 기반 secret reference
- Permission Matrix와 pending approval 상태
- Obsidian/Notion/mobile exporter가 읽을 projection 경계
- Offline pending queue와 sync conflict 기본 모델

## 2단계: 프로바이더 프로파일과 모델 discovery

- OpenAI 호환 어댑터
- Anthropic/Claude Code 리셀러 형식 파서
- OpenRouter 어댑터
- Ollama/LM Studio 로컬 어댑터
- 모델 목록 조회
- 비용/토큰 추적
- 프로파일별 secret reference 저장

## 3단계: 데스크톱 프론트엔드 골격

- Conversation Workbench 기본 화면
- Debate Mode 승격 UI
- 오케스트레이터 중심 레이아웃
- 프로바이더 프로파일 화면
- 모델 선택 화면
- Status Hub
- 얇은 PTY/터미널 슬롯 프로토타입
- DGX 연결 상태 표시

## 4단계: 에이전트 런타임

- 가상 에이전트 생성
- 단일 대화 에이전트 실행
- 라운드 기반 토론 엔진
- 코딩 전달 패킷 생성
- soul Summary/Retrieved 주입
- Memento recall/remember 1차 연동
- 검증자 실행
- 실행 리플레이 저장

## 5단계: DGX 서버

- 서버 API
- WebSocket 이벤트 스트림
- 원격 모델 실행
- 원격 워크스페이스 실행
- 서버 상태 감지
- 로컬 폴백 전환

## 6단계: 메모리 고도화

- Memento-MCP 연동
- reflect 흐름
- Recall Trace UI
- Memory Inspector
- 로컬 캐시와 pending queue

## 7단계: 실제 코딩 워크플로우

- CLI 에이전트 연결
- 터미널 슬롯 제어
- 브랜치/작업 디렉터리 관리
- Adopt/Reject 플로우
- 리뷰와 검증 자동화

## 8단계: polish

- 단축키
- 세션 검색
- 비용 대시보드
- 프로파일 가져오기/내보내기
- 실패 복구
- 설치 패키징
