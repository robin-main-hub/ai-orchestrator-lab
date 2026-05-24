# 기능 지도

## 오케스트레이터

| 기능 | 설명 |
| --- | --- |
| 작업 모드 선택 | 대화, 토론, 코딩, 리뷰, 리서치, 계획, 검증 모드 선택 |
| 대화형 작업 모드 | 토론을 끄고 OpenClaw/Claude/Codex/로컬 모델과 1:1 대화하듯 작업 |
| 라운드 관리 | 에이전트 발언 순서, 반박, 합의, 최종 판단 관리 |
| 전달 패킷 | 대화 또는 토론 결과를 코딩 에이전트가 이해하는 구조로 변환 |
| 기록 보기 | 이전 실행의 입력, 모델, 출력, 비용, 권한, 결정 이유 확인 |
| 재실행 | 이전 실행을 새 실행으로 다시 시작. 결과는 달라질 수 있음 |
| Adopt/Reject | 제안된 코드 변경이나 결정안을 채택/거절/보류 |

## 에이전트

| 기능 | 설명 |
| --- | --- |
| 실제 CLI 에이전트 | Claude Code, Codex, OpenCode 같은 터미널 기반 에이전트 연결 |
| 가상 에이전트 | 하나의 모델/API에서 여러 역할을 만든 뒤 라운드 참여 |
| 합의 한계 표시 | 같은 모델 기반 가상 에이전트 합의가 독립 검증이 아님을 표시 |
| 단일 대화 에이전트 | 토론 없이 한 에이전트와 대화하며 작업을 진행 |
| External Agent | 외부 채널 담당. read-only 중심, 위험 도구 기본 차단 |
| Auditor Agent | 실행 로그와 병목을 분석하는 read-only 개선 제안자 |
| 역할 템플릿 | 설계자, 구현자, 리뷰어, 반대자, 보안 검토자, 비용 감시자 |
| 모델별 에이전트 | OpenAI/Anthropic/OpenRouter/Ollama 등 서로 다른 모델을 한 판에 배치 |
| 검증자 | 강한 모델 또는 같은 로컬 모델로 최종 검증 |
| tmux 세션 런타임 | local Mac 또는 DGX-02의 `ai-swarm` tmux session을 실행 슬롯 backend로 사용 |
| pane read-only capture | `tmux capture-pane` 출력은 redaction 후 Event Store 후보 이벤트로 기록 |
| Command Intent | `send-keys` 전에 명령 의도, 권한, 승인 상태, redacted preview를 먼저 남김 |
| tmux Control Mode | 실시간 pane stream parser는 basic capture와 permission flow 이후 단계로 보류 |

## 채널

| 기능 | 설명 |
| --- | --- |
| 데스크톱 대화 | 오케스트레이터 창 안에서 AI와 직접 대화 |
| Telegram 브리지 | Telegram/OpenClaw 대화를 오케스트레이터 세션으로 기록하고 이어받기 |
| 모바일 대시보드 | 폰에서 세션 읽기, 승인, 중단, 재시도 수행 |
| 채널 승격 | 대화 세션을 토론/코딩/리뷰 세션으로 전환 |
| Ingress Guard | 외부 webhook/API/Telegram 입력을 정규화, 필터링, 권한 분류 후 Event Store로 전달 |
| Confidence Routing | HIGH/MEDIUM/LOW 신뢰도에 따라 자동 응답, 빠른 승인, 검토 대기로 분기 |

## Event Store와 권한

| 기능 | 설명 |
| --- | --- |
| 단일 Event Store | 대화, 토론, 실행, 승인, 백업 이벤트의 원본 저장소 |
| Redaction Layer | event emit 직전에 API key, token, `.env` secret 제거 |
| Secret Reference | API 키 원문 대신 OS keychain/DGX vault 참조만 저장 |
| Permission Matrix | 채널과 액션별 allowed/pending/denied 정책 |
| Approval Queue | Telegram/mobile/위험 실행 요청을 승인 대기 상태로 관리 |
| Sync Conflict | Offline 이후 soul, memory, session, artifact 충돌 감지 |
| Guard Log | 외부 입력 guard 적용 결과와 차단 이유 기록 |

## 프로바이더

| 기능 | 설명 |
| --- | --- |
| 다중 프로파일 | 여러 API 키와 base URL을 동시에 등록 |
| 환경변수 파서 | export, PowerShell, JSON 형식 붙여넣기 지원 |
| 모델 조회 | 키 입력 후 사용 가능한 모델 목록 로드 |
| 리셀러 호환 | OpenAI/Anthropic 호환 base URL과 auth token 지원 |
| 비용 가드 | 토큰/비용/속도 제한과 실행 전 예상 비용 표시 |

## 메모리

| 기능 | 설명 |
| --- | --- |
| 세션 기억 | 작업 목표, 결정, 결과, 파일 변경 기록 |
| Recall Trace | 어떤 기억이 왜 호출됐는지 추적 |
| Memory Inspector | 기억 조각을 검색, 고정, 삭제, 병합하고 trust level 관리 |
| Reflect | 긴 세션 후 핵심 교훈과 사용자 선호를 요약 |
| 작업별 격리 | 프로젝트, 브랜치, 워크스페이스 단위로 기억 범위 분리 |

## 프론트엔드

| 기능 | 설명 |
| --- | --- |
| 오케스트레이터 중심 레이아웃 | 토론이 아니라 지휘실을 첫 화면으로 둠 |
| Conversation Workbench | 토론 off 상태에서 AI와 1:1로 대화하며 작업 |
| 모델 패널 | 각 모델/에이전트의 상태와 발언을 분리 표시 |
| 터미널 슬롯 | 여러 CLI 에이전트를 카드가 아닌 작업 슬롯으로 표시 |
| 전달 버튼 | 대화/토론 결과를 바로 구현/리뷰/검증으로 넘김 |
| Status Hub | DGX, 로컬 모델, 비용, 권한, 백업, 메모리 상태를 한곳에 요약 |
