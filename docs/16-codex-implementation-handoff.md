# Codex 구현 전달 문서

## 목적

이 문서는 사용자 제공 GPT-5.5 Pro 전달문을 실제 Codex 구현 작업에 바로 사용할 수 있도록 정리한 실행 지시서다.

원문의 핵심은 단순하다. 이 프로젝트를 작은 채팅 앱으로 축소하지 말고, 전체 제품의 경계를 유지한 채 먼저 공통 타입과 이벤트 구조, 데스크톱 오케스트레이터 골격을 세운다.

## 해석 원칙

- 최종 제품 범위는 축소하지 않는다.
- 첫 구현은 전체 기능을 한 번에 완성하는 것이 아니라, 나중에 provider, agent runtime, DGX server, memory, backup을 꽂을 수 있는 타입 경계와 UI 골격을 만드는 것이다.
- 첫 화면은 랜딩 페이지가 아니라 Orchestrator Board다.
- Conversation Mode는 기본 작업 방식이고, Debate Mode는 필요할 때 승격되는 의사결정 흐름이다.
- 토론 결과는 자연어 요약으로 끝나지 않고 반드시 Coding Packet으로 이어질 수 있어야 한다.
- 실제 API 호출, 실제 터미널 실행, 실제 DGX 실행은 첫 구현에서 제외한다.
- 보안/권한/Event Store/Redaction은 polish가 아니라 초기 구조다.

## 현재 적용 기준

| 원문 지시 | 현재 적용 |
| --- | --- |
| ProviderProfile에 `apiKey` 직접 포함 가능 | 실제 저장은 `secretRef` 또는 `apiKeyRef`로 추상화한다. 원문 API 키는 Event Store와 로그에 저장하지 않는다. |
| 작은 MVP 금지 | 채팅 앱으로 축소하지 말라는 뜻으로 적용한다. 구현은 `docs/14-product-strategy-vertical-slice.md`의 수직 슬라이스 원칙을 따른다. |
| 실제 모델 호출은 무리하지 말 것 | provider adapter interface와 mock provider까지만 만든다. |
| 터미널 실행은 아직 붙이지 말 것 | 실행 슬롯 UI와 permission type까지만 만든다. |
| 모든 타입은 protocol에서 export | desktop, server, providers, agents는 `packages/protocol` 타입을 재사용한다. |
| Obsidian/Notion 백업 | 첫 구현에서는 projection interface와 상태 표시까지만 둔다. 원본은 Event Store다. |

## 첫 구현 체크리스트

1. package manager와 workspace 구조 설정
2. `apps/desktop` 생성
3. `apps/server` 생성 또는 placeholder 생성
4. `packages/protocol` 생성
5. `packages/providers` 생성
6. `packages/agents` 생성
7. protocol에 핵심 타입 정의
8. desktop에 Orchestrator Layout 구현
9. Conversation/Debate 토글 구현
10. RuntimeStatus 상태 바 구현
11. Provider Profiles 화면 stub 구현
12. Coding Packet 화면 stub 구현
13. EventStore interface stub 구현
14. 기본 lint/test/typecheck 스크립트 추가
15. README에 실행 방법과 현재 구현 범위 기록

## desktop 첫 화면 요구사항

첫 화면은 바로 작업실이어야 한다.

- 좌측: 세션, 프로젝트, 프로바이더, 채널 네비게이션
- 중앙: Conversation Workbench 또는 Debate Table
- 우측: 모델, 에이전트, 메모리, provider 상태
- 상단: DGX 연결, 로컬 모델, 현재 실행 프로파일, 메모리 동기화, 최근 오류를 보여주는 Runtime Status Bar
- 하단: 실제 실행 없이 터미널 슬롯과 실행 로그 stub

## Conversation Workbench 요구사항

Conversation Mode는 기본 작업 방식이다. 단순 채팅 UI로 만들지 않는다.

필수 액션:

- 토론으로 전환
- 코딩 패킷 만들기
- 실행 슬롯으로 보내기
- 메모리에 저장
- Obsidian/Notion 백업 상태 보기
- 외부 인입에서 이어받기

사용자가 "여러 모델에게 물어보자", "토론으로 돌려봐"라고 하면 현재 대화를 Debate Context로 승격할 수 있어야 한다. 첫 구현에서는 실제 승격 실행 대신 context preview stub을 둔다.

## Debate Table 요구사항

Debate Mode는 모델별 말풍선 나열이 아니라 의사결정 엔진이다.

발언 태그:

- 합의
- 반대
- 근거
- 리스크
- 코딩 영향

라운드:

1. 문제 정의
2. 각 에이전트의 1차 제안
3. 상호 비판
4. 오케스트레이터 요약
5. 보완 라운드
6. 최종 결정
7. 코딩 전달 패킷 생성

첫 구현에서는 mock debate state를 보여주고, 결과가 Coding Packet stub으로 이어지는 경로를 만든다.

## Protocol 우선 타입

`packages/protocol`은 최소한 다음 범주를 가진다.

- RuntimeStatus
- WorkMode
- ProviderKind
- ProviderProfile
- AgentKind, AgentRole, AgentProfile
- SoulInjectionMode
- ConversationSession, ConversationMessage
- DebateTag, DebateUtterance
- CodingPacket
- EventEnvelope
- EventStore interface
- PermissionLevel, ApprovalState
- BackupStatus
- Memory API 관련 타입

가능하면 타입과 Zod schema를 함께 둔다.

## 보안 금지사항

- API 키 원문을 Event Store, 로그, UI 상태, localStorage에 저장하지 않는다.
- 리셀러/custom provider는 기본적으로 trust가 낮은 provider로 취급한다.
- external, mobile, external API에서 들어온 실행성 명령은 pending approval로 둔다.
- 터미널 명령 실행, 파일 변경, 원격 workspace 실행은 permission policy를 통과해야 한다.
- Redaction은 export 직전만이 아니라 event emit 직전에 적용한다.

## 첫 구현 제외 범위

- 실제 OpenAI/Anthropic/OpenRouter/Ollama 호출
- 실제 모델 discovery API 호출
- 실제 DGX 원격 실행
- 실제 터미널 명령 실행
- 실제 Memento vector recall
- 실제 Obsidian/Notion export
- 실제 외부 인입 bridge
- 실제 모바일 대시보드

이 기능들은 interface와 UI 상태만 먼저 둔다.

## 완료 기준

- 루트 workspace에서 install, typecheck, test 또는 stub test가 동작한다.
- `packages/protocol`의 타입을 desktop/server/providers/agents가 가져다 쓸 수 있다.
- desktop 첫 화면이 Orchestrator Board 구조를 가진다.
- Conversation/Debate 토글이 중앙 작업판을 전환한다.
- Provider Profile stub은 원문 키 저장 없이 secret reference 개념을 보여준다.
- Coding Packet stub은 구조화 필드를 가진다.
- Runtime Status Bar는 online/degraded/offline/syncing 상태를 표현한다.
- EventStore interface와 permission 타입이 protocol에 존재한다.

## Future Local Agent Swarm

A future role-based tmux workflow is defined in:

```text
docs/17-role-based-tmux-agent-swarm.md
docs/19-tmux-session-runtime.md
```

This is not part of the v0 required implementation path.

Codex must not implement real tmux execution until the protocol package, Event Store, Redaction Layer, Permission Matrix, Coding Packet flow, and execution slot UI stub are stable.

For now, Codex may prepare types, UI concepts, documentation, and read-only pane capture helpers that make future swarm integration possible.

Allowed now:

- `TmuxSessionRef`, `TerminalPane`, and `TerminalCommandIntent` protocol boundaries
- tmux preview UI
- read-only `capture-pane` helper with redaction
- terminal event mapping

Still gated:

- automatic `tmux send-keys`
- Gemini CLI connection
- commands from external/mobile/API
- destructive or secret-bearing commands

## PR0 Authority / Permission Update

Implementation note updated on 2026-05-25:

- DGX-02 is the authoritative shared server for Event Store, MemoryRecord, WorkItem, approvals, drafts, and continuity storage.
- MacBook is the primary work client with a persistent local cache/outbox and can continue with local models when DGX-02 is offline.
- Home PC and Phone are clients over the DGX-02 projection; remote inputs sync to DGX-02 rather than becoming a separate source of truth.
- Conflict policy is `dgx02_authority_wins` for mechanical conflicts and `manual_review` for semantic conflicts.
- Offline and remote write policy is pending outbox/input first, then DGX-02 sync.
- 레거시 외부 인입 UI는 범용 외부 인입으로 표시하고, 저장 프로토콜 값은 `external_legacy`를 사용한다.
- Unknown external effects are denied by default; customer replies, email sends, provider execution, device reboot, and terminal actions require approval.
- `stage29LocalEventStore` remains a client-side cache/outbox layer.
- Memento MCP remains a future adapter. DGX-02 SimpleMem is a derived retrieval index over DGX-02 MemoryRecord, not a separate original memory source.
- The Windows Obsidian default vault root is `F:/obsidian/ai-headquarter`.
