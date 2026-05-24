# 대화형 작업 모드

## 목표

토론 기능을 끈 상태에서도 사용자가 AI와 1:1 대화하듯이 일을 진행할 수 있어야 한다. 이 모드는 Telegram에서 OpenClaw와 대화하면서 일하는 흐름을 데스크톱 오케스트레이터 안으로 가져온 것이다.

대화형 작업 모드는 단순 채팅방이 아니다. 겉으로는 AI와 대화하지만, 뒤에서는 세션 기록, Memento recall, 코딩 전달 패킷, Obsidian/Notion 백업, 실행 승인, 터미널 슬롯 연결이 계속 작동한다.

## 기본 모드 원칙

Conversation Mode는 기본 작업 모드다. 사용자는 먼저 한 AI와 대화하듯 작업을 시작하고, 문제가 복잡해지거나 여러 관점이 필요할 때 Debate Mode로 승격한다.

토론은 항상 켜져 있는 회의실이 아니라, 대화 중 필요할 때 호출하는 구조화된 도구다.

## 모드 정의

| 모드 | 설명 |
| --- | --- |
| Conversation Mode | 사용자가 선택한 한 AI 또는 한 에이전트와 대화한다. |
| Debate Mode | Conversation에서 승격되어 여러 에이전트가 라운드 기반으로 토론한다. |
| Coding Mode | 대화나 토론 결과를 실제 코딩 에이전트/터미널에 전달한다. |
| Review Mode | 변경사항, 계획, 결과를 검토한다. |

## Conversation Mode에서 가능한 것

- OpenClaw처럼 AI와 자연스럽게 대화
- 작업 목표 정리
- 파일/프로젝트 맥락 설명
- 바로 코드 작성 요청
- 토론 없이 단일 에이전트에게 실행 지시
- 필요할 때만 Debate Mode로 승격
- 대화 내용을 Coding Packet으로 변환
- 대화 결과를 Obsidian/Notion에 자동 백업
- 폰에서 이어 보기 또는 승인하기

## OpenClaw / Telegram 연동 방향

Telegram은 별도의 진입 채널로 취급한다.

```text
Telegram
  -> OpenClaw Bot / Bridge
  -> Conversation Session
  -> Orchestrator Event Store
  -> Memory / Backup / Handoff
```

가능한 흐름:

1. 사용자가 Telegram에서 OpenClaw와 대화한다.
2. 브리지가 메시지를 오케스트레이터 세션 이벤트로 저장한다.
3. 데스크톱 앱에서 같은 세션을 열어 이어서 작업한다.
4. 필요하면 해당 대화를 토론 모드로 승격한다.
5. 결과를 코딩 에이전트나 터미널 슬롯에 전달한다.

## UI 요구사항

- 토론 토글: On이면 Debate Table, Off이면 Conversation Workbench
- 대화 상대 선택: OpenClaw, Claude, Codex, 로컬 모델, 커스텀 에이전트
- 대화 상대 roster는 고정 개수가 아니라 사용자가 추가/제거할 수 있어야 한다.
- 선택된 봇의 provider/model/API/OAuth binding을 대화창 상단에 표시한다.
- 대화 중 `토론으로 전환` 버튼
- 대화 중 `코딩 패킷 만들기` 버튼
- 대화 중 `실행 슬롯으로 보내기` 버튼
- 대화 중 `메모리에 저장` 버튼
- 대화 중 `Obsidian/Notion에 백업` 상태 표시

## 대화 대상 봇과 인증 바인딩

Conversation Workbench는 하나의 고정 챗봇이 아니다. 사용자는 우측 Agent roster에서 대화할 봇을 선택하고, 필요하면 새 봇을 추가하거나 제거한다.

각 봇은 실행 바인딩을 가진다.

- `provider_profile`: API key 또는 custom base URL이 연결된 provider profile을 사용한다.
- `oauth`: OpenClaw, Codex, Claude Desktop 같은 OAuth/session 기반 도구 연결을 사용한다.
- `local`: Ollama, LM Studio, mock/local runtime처럼 로컬 실행을 사용한다.

UI는 선택된 봇의 이름, 역할, provider/model, credential binding을 대화창 상단에 표시한다. 실제 API key나 OAuth token 원문은 표시하지 않고 `secretRef`, `oauthRef`만 표시한다.

초기 구현에서는 실제 네트워크 호출을 하지 않고 stub 응답으로 Event Store 경계만 확인한다. 이후 provider adapter가 연결되면 선택된 봇의 `authBinding`을 통해 해당 API/OAuth 세션을 resolve한 뒤 메시지를 전송한다.

## 세션 모델

```ts
export type ConversationSession = {
  id: string;
  mode: "conversation";
  channel: "desktop" | "legacy_telegram" | "mobile" | "api";
  primaryAgentId: string;
  providerProfileId?: string;
  modelId?: string;
  messages: ConversationMessage[];
  linkedRuns: string[];
  linkedDebates: string[];
  memoryTraceIds: string[];
  backupStatus: "pending" | "synced" | "failed";
};
```

## Debate로 승격

대화하다가 사용자가 `이거 여러 모델에게 물어보자` 또는 `토론으로 돌려봐`라고 하면 현재 대화가 Debate Context로 변환된다.

변환되는 정보:

- 현재 문제 정의
- 지금까지의 대화 요약
- 중요한 제약
- 결정되지 않은 쟁점
- 사용자가 선호한 방향
- 관련 메모리

## Coding으로 전달

대화가 충분히 정리되면 `코딩 패킷 만들기` 액션으로 Coding Packet을 만든다. 오케스트레이터는 자동 제안을 할 수 있지만, 실제 전달은 사용자의 명시 액션을 기본으로 한다.

- 목표
- 배경
- 결정 사항
- 미해결 질문
- 구현 계획
- 검증 계획
- 위험 요소
- 사용자 승인 여부

## 토큰 예산

Conversation Mode에서는 raw transcript 전체를 계속 넣지 않는다. 기본 컨텍스트 우선순위는 다음과 같다.

1. 현재 사용자 메시지
2. 최근 대화 요약
3. 작업에 필요한 프로젝트 컨텍스트
4. 사용자가 허용했거나 오케스트레이터가 제안한 Memento recall 결과
5. agent soul summary
6. 긴 과거 transcript 링크

Conversation Mode의 기본값은 `soul: Off` 또는 `soul: Summary`다. `Retrieved`와 `Full`은 사용자가 명시적으로 선택하거나 특정 에이전트 역할이 필요할 때만 사용한다. Recall Trace와 Memory Inspector는 기본 접힘 상태로 두고, 사용자가 클릭할 때 자세히 보여준다.

## 권한과 안전

Conversation Mode는 편하게 말할 수 있어야 하지만, 실행 권한은 분리한다.

- 대화만 하는 것은 자유롭게 허용
- 파일 변경은 사용자 승인 필요
- 터미널 실행은 권한 정책에 따름
- API 키와 토큰은 대화 로그/백업에서 제거
- Telegram에서 온 명령은 위험 작업 전에 데스크톱 또는 모바일 승인 필요
- Telegram에서 온 내용은 기본적으로 `untrusted` memory candidate로 저장하고 자동 recall하지 않는다.

## 결론

Conversation Mode는 토론 모드의 반대가 아니라, 가장 자연스러운 기본 작업 방식이다. 사용자는 평소처럼 AI와 대화하고, 필요할 때만 토론, 코딩, 리뷰, 검증으로 확장한다.
