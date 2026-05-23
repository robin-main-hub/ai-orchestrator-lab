# AI Orchestrator Lab

맥북에서 실행되는 데스크톱 AI 오케스트레이터와 `dgx-02` 서버를 함께 사용하는 멀티 에이전트 작업실입니다.

이 저장소는 단순한 채팅 앱이나 토론 UI가 아니라, 여러 모델과 여러 에이전트를 한 화면에서 조율하고, 토론 결과를 실제 코딩 작업으로 넘기며, 서버가 죽었을 때도 로컬 모델로 제한 운용되는 전체 시스템을 목표로 합니다.

## 목표

- 데스크톱 앱이 전체 지휘실 역할을 한다.
- `dgx-02`는 강한 모델, 로컬 LLM 서버, 장기 메모리, 원격 작업 실행을 담당한다.
- 서버 접속이 불가능하면 맥북의 로컬 모델과 로컬 CLI만으로 오케스트레이션/토론을 계속한다.
- 하나의 API 또는 하나의 모델에서도 여러 가상 에이전트를 만들어 병렬 토론과 역할 분담을 수행한다.
- 여러 프로바이더 프로파일을 동시에 등록하고, 실행마다 모델/API 키/검증 모델을 바꿀 수 있다.
- 토론은 의사결정뿐 아니라 코딩 작업을 위한 구현 지시서, 컨텍스트 팩, 리뷰 패킷으로 이어진다.
- 일부 에이전트는 `soul.md`를 통해 장기 정체성과 판단 기준을 유지한다.
- 토론 결과와 실행 기록은 Obsidian/Notion으로 자동 백업하고, 폰에서는 읽기와 제한적 승인 중심으로 접근한다.

## 핵심 기능

- 데스크톱 오케스트레이터
- 멀티 에이전트 토론 라운드테이블
- 코딩 작업 전달 모드
- 실시간 터미널/CLI 에이전트 슬롯
- 프로바이더 프로파일 다중 등록
- API 키/환경변수 붙여넣기 파서
- 사용 가능 모델 자동 조회
- 강한 모델 검증 또는 동일 로컬 모델 검증
- DGX 원격 실행 및 로컬 폴백
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
  research-notes.md
```

## 현재 상태

초기 설계 저장소입니다. 먼저 전체 제품 방향과 시스템 구조를 한국어 문서로 고정한 뒤, 데스크톱 앱/서버/프로토콜 패키지를 순서대로 구현합니다.
