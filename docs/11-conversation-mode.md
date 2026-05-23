# 대화형 작업 모드

## 목표

토론 기능을 끈 상태에서도 사용자가 AI와 1:1 대화하듯이 일을 진행할 수 있어야 한다. 이 모드는 Telegram에서 OpenClaw와 대화하면서 일하는 흐름을 데스크톱 오케스트레이터 안으로 가져온 것이다.

대화형 작업 모드는 단순 채팅방이 아니다. 겉으로는 AI와 대화하지만, 뒤에서는 세션 기록, Memento recall, 코딩 전달 패킷, Obsidian/Notion 백업, 실행 승인, 터미널 슬롯 연결이 계속 작동한다.

## 모드 정의

| 모드 | 설명 |
| --- | --- |
| Debate Mode | 여러 에이전트가 라운드 기반으로 토론한다. |
| Conversation Mode | 사용자가 선택한 한 AI 또는 한 에이전트와 대화한다. |
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
- 대화 중 `토론으로 전환` 버튼
- 대화 중 `코딩 패킷 만들기` 버튼
- 대화 중 `실행 슬롯으로 보내기` 버튼
- 대화 중 `메모리에 저장` 버튼
- 대화 중 `Obsidian/Notion에 백업` 상태 표시

## 세션 모델

```ts
export type ConversationSession = {
  id: string;
  mode: "conversation";
  channel: "desktop" | "telegram" | "mobile" | "api";
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

대화가 충분히 정리되면 바로 Coding Packet으로 바꾼다.

- 목표
- 배경
- 결정 사항
- 미해결 질문
- 구현 계획
- 검증 계획
- 위험 요소
- 사용자 승인 여부

## 권한과 안전

Conversation Mode는 편하게 말할 수 있어야 하지만, 실행 권한은 분리한다.

- 대화만 하는 것은 자유롭게 허용
- 파일 변경은 사용자 승인 필요
- 터미널 실행은 권한 정책에 따름
- API 키와 토큰은 대화 로그/백업에서 제거
- Telegram에서 온 명령은 위험 작업 전에 데스크톱 또는 모바일 승인 필요

## 결론

Conversation Mode는 토론 모드의 반대가 아니라, 가장 자연스러운 기본 작업 방식이다. 사용자는 평소처럼 AI와 대화하고, 필요할 때만 토론, 코딩, 리뷰, 검증으로 확장한다.
