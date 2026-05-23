# 외부 검토 보드

## 목적

Claude, GPT, Gemini, 로컬 모델, 코딩 특화 모델의 검토 결과를 한곳에 모아 제품 설계에 반영할지 판단한다.

## 검토 상태

| 검토자 | 상태 | 링크/원문 | 요약 |
| --- | --- | --- | --- |
| Grok 종합 리뷰 | 완료 | 사용자 제공 원문 | 복잡도, 폴백 경계, Event Store, Redaction, Permission, Conversation 기본 모드 지적 |
| Claude 계열 | 대기 |  |  |
| GPT 계열 | 대기 |  |  |
| Gemini 계열 | 대기 |  |  |
| 로컬 모델 | 대기 |  |  |
| 코딩 특화 모델 | 대기 |  |  |

## 공통 지적

- DGX 서버와 로컬 폴백 경계가 모호해지면 기능 활성/비활성 판단이 복잡해진다.
- Event Store가 진짜 단일 진실 공급원이 되지 않으면 Obsidian, Notion, 모바일, 서버 동기화가 서로 어긋난다.
- Redaction Layer와 Permission Matrix는 나중에 붙이기 어렵기 때문에 protocol 단계에서 같이 설계해야 한다.
- Agent Soul, Memento recall, Coding Packet을 매번 모두 넣으면 토큰과 비용이 폭발할 수 있다.
- Conversation Workbench, Debate Table, Coding Handoff가 같은 중앙 작업판에서 바뀔 때 사용자가 현재 상태를 잃을 수 있다.

## 모델별 고유 지적

### Grok 종합 리뷰

- `docs/07-dgx-local-fallback.md`의 Online/Degraded/Offline/Syncing 상태만으로는 WebSocket, HTTP, PTY, job queue, pending sync 충돌을 충분히 설명하기 어렵다.
- `docs/09-agent-soul.md`의 Full/Summary/Retrieved/Off 모드는 좋지만, 프롬프트 조립 단계에서 토큰 예산을 강제하는 정책이 필요하다.
- `docs/10-backup-and-mobile.md`의 Redaction Layer는 이름만 있고 실행 위치가 불명확하다.
- Conversation Mode를 기본 모드로 두고 Debate Mode는 승격 기능으로 두는 편이 실제 사용 흐름에 더 맞다.
- UI의 여러 상태는 장식용 orb가 아니라 클릭 가능한 `Status Hub`로 통합하는 편이 좋다.

## 바로 반영할 것

- protocol 단계에서 Zod 스키마를 함께 정의한다.
- `Event Store + Redaction Layer + Permission Matrix`를 1.5단계가 아니라 사실상 1단계 핵심 산출물로 끌어올린다.
- Provider Profile과 모델 discovery를 데스크톱 UI 완성보다 먼저 만든다.
- Conversation Mode를 기본 작업 모드로 명시하고, Debate Mode는 필요할 때 승격하는 흐름으로 정리한다.
- Telegram에서 들어온 실행성 명령은 기본적으로 `pending approval`로 둔다.
- Redaction은 저장 직전이 아니라 event emit 직전에 수행한다.
- API 키와 토큰은 Event Store에 평문 저장하지 않고 OS keychain 또는 secret vault에 분리한다.
- PTY/터미널 슬롯은 후반 기능이지만 프로토콜 위험이 크므로 초기에 얇은 프로토타입을 만든다.

## 보류할 것

- CRDT 기반 동기화: 처음부터 도입하지 않는다. append-only event log + idempotency key + conflict UI로 시작한다.
- 모든 기능의 모바일 제어: 초기는 읽기, 승인, 중단, 재시도 중심으로 제한한다.
- Soul 전체 자동 주입: 기본값은 Summary 또는 Retrieved로 두고 Full은 명시 선택으로 둔다.

## 반영하지 않을 것

- 장식용 floating orb UI: 기능 상태 표시용 `Status Hub`는 채택하되, 장식용 orb나 시각 효과 중심 요소는 만들지 않는다.

## 새로 생긴 질문

1. Event Store의 1차 저장소는 SQLite로 충분한가, 아니면 초기에 서버 동기화를 고려한 Postgres 스키마도 함께 정의할 것인가?
2. Coding Packet 생성은 자동 제안으로 둘 것인가, 사용자의 `패킷 만들기` 액션을 필수로 할 것인가?
3. Soul injection은 데스크톱에서 조립할 것인가, 서버에서 조립할 것인가, 아니면 protocol package의 pure builder로 둘 것인가?
4. Tauri 선택 시 PTY와 native file access를 어떤 Rust 플러그인 경계로 묶을 것인가?
5. Adopt/Reject는 git worktree, patch file, branch 중 무엇을 기본 단위로 삼을 것인가?

## 반영 결정 로그

| 날짜 | 결정 | 근거 | 관련 문서/이슈 |
| --- | --- | --- | --- |
| 2026-05-24 | Grok 종합 리뷰를 첫 외부 리뷰로 기록 | 복잡도, 폴백, 권한, 이벤트 저장소 지적이 구현 전에 반영할 가치가 큼 | `docs/review-board.md` |
| 2026-05-24 | Event Store, Redaction, Permission Matrix를 선행 설계로 채택 | 나중에 고치기 가장 어렵고 모든 exporter/bridge/executor가 의존함 | `docs/13-event-store-permission-redaction.md` |
| 2026-05-24 | Conversation Mode를 기본 모드로 강화 | 실제 사용자의 80% 흐름은 1:1 대화에서 시작될 가능성이 높음 | `docs/11-conversation-mode.md` |
| 2026-05-24 | Status Orb 제안을 기능형 Status Hub로 변환 채택 | 상태는 통합하되 장식용 orb UI는 피함 | `docs/08-ui-direction.md` |
