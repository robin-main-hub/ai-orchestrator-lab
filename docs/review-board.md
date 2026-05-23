# 외부 검토 보드

## 목적

Claude, GPT, Gemini, 로컬 모델, 코딩 특화 모델의 검토 결과를 한곳에 모아 제품 설계에 반영할지 판단한다.

## 검토 상태

| 검토자 | 상태 | 링크/원문 | 요약 |
| --- | --- | --- | --- |
| Grok 종합 리뷰 | 완료 | 사용자 제공 원문 | 복잡도, 폴백 경계, Event Store, Redaction, Permission, Conversation 기본 모드 지적 |
| Claude 계열 | 완료 | 사용자 제공 원문 | 제품 범위, UX 무게, soul 우선순위, memory trust, 리셀러 위험, replay 용어 지적 |
| GPT 계열 | 완료 | 사용자 제공 GPT-5.5 Pro 전달문 | Codex 구현 착수 지시: protocol-first, Orchestrator Board, provider/runtime stub, Event Store/permission 경계 유지 |
| Gemini 계열 | 완료 | 사용자 제공 원문 | GPTers/OpenClaw 레퍼런스 기반 에이전트 토폴로지, 세션 통신, 7중 guard, confidence routing 제안 |
| 로컬 모델 | 대기 |  |  |
| 코딩 특화 모델 | 대기 |  |  |

## 공통 지적

- DGX 서버와 로컬 폴백 경계가 모호해지면 기능 활성/비활성 판단이 복잡해진다.
- Event Store가 진짜 단일 진실 공급원이 되지 않으면 Obsidian, Notion, 모바일, 서버 동기화가 서로 어긋난다.
- Redaction Layer와 Permission Matrix는 나중에 붙이기 어렵기 때문에 protocol 단계에서 같이 설계해야 한다.
- Agent Soul, Memento recall, Coding Packet을 매번 모두 넣으면 토큰과 비용이 폭발할 수 있다.
- Conversation Workbench, Debate Table, Coding Handoff가 같은 중앙 작업판에서 바뀔 때 사용자가 현재 상태를 잃을 수 있다.
- 1인 프로젝트에서 전체 범위를 한 번에 구현하려 하면 실제로 매일 쓰는 제품이 되기 전에 배관만 커질 수 있다.
- 리셀러/커스텀 base URL과 장기 메모리 recall이 결합되면 누적된 민감 맥락이 신뢰 낮은 프록시로 흘러갈 수 있다.
- Telegram 같은 외부 채널은 실행 승인만으로는 충분하지 않고, memory/context poisoning을 막기 위한 trust 정책이 필요하다.
- 외부 채널은 AI에 직접 연결하지 말고 guard pipeline과 confidence routing을 통과해야 한다.
- 비공개 agent-to-agent 세션은 Human Peek 같은 관찰 UI 없이는 블랙박스가 된다.

## 모델별 고유 지적

### Grok 종합 리뷰

- `docs/07-dgx-local-fallback.md`의 Online/Degraded/Offline/Syncing 상태만으로는 WebSocket, HTTP, PTY, job queue, pending sync 충돌을 충분히 설명하기 어렵다.
- `docs/09-agent-soul.md`의 Full/Summary/Retrieved/Off 모드는 좋지만, 프롬프트 조립 단계에서 토큰 예산을 강제하는 정책이 필요하다.
- `docs/10-backup-and-mobile.md`의 Redaction Layer는 이름만 있고 실행 위치가 불명확하다.
- Conversation Mode를 기본 모드로 두고 Debate Mode는 승격 기능으로 두는 편이 실제 사용 흐름에 더 맞다.
- UI의 여러 상태는 장식용 orb가 아니라 클릭 가능한 `Status Hub`로 통합하는 편이 좋다.

### Claude 제품/UX 리뷰

- "쓰려고 짓는가, 배우려고 짓는가"라는 전략 질문에 먼저 답해야 한다.
- Conversation Mode가 기본이라면 토론과 soul보다 먼저 `대화 -> 핸드오프 -> 실행 기록` 수직 흐름이 작동해야 한다.
- 기본 대화 모드에 soul, recall, trace를 항상 얹으면 매일 쓰는 감각이 무거워진다.
- Recall Trace와 Memory Inspector는 상시 노출보다 on-demand 패널이 맞다.
- `Replay`라는 단어는 기록 보기와 재실행을 혼동시킨다. UI 용어를 `기록 보기`와 `재실행`으로 분리해야 한다.
- 같은 모델에서 만든 가상 에이전트의 합의는 독립적 합의가 아니라 상관된 출력일 수 있음을 명시해야 한다.

### GPT-5.5 Pro 구현 전달

- 이 문서는 비평보다 Codex에게 넘기는 구현 지시서에 가깝다. 별도 구현 전달 문서로 분리해 첫 작업 기준으로 삼는다.
- 첫 화면은 랜딩 페이지나 평범한 채팅창이 아니라 좌측 네비게이션, 중앙 Orchestrator Board, 우측 상태/모델 패널, 하단 터미널/로그 슬롯을 가진 작업실이어야 한다.
- Conversation Mode는 단순 채팅이 아니라 Debate 승격, Coding Packet 생성, 실행 슬롯 전달, 메모리 저장, 백업 상태, Telegram 이어받기와 연결된 기본 작업 방식이어야 한다.
- Debate Mode는 모델별 발언을 나열하는 장난감 UI가 아니라 `합의`, `반대`, `근거`, `리스크`, `코딩 영향` 태그와 라운드 흐름을 가진 의사결정 엔진이어야 한다.
- 첫 구현은 실제 모델 호출보다 `packages/protocol` 타입 경계, EventStore 인터페이스, provider adapter interface, desktop layout stub을 우선한다.
- ProviderProfile 원문에는 `apiKey` 필드가 있으나 현재 보안 결정에 따라 실제 구현은 `secretRef` 또는 `apiKeyRef`를 사용한다.
- 터미널 실행은 초기에 실제 명령 실행을 붙이지 않고 permission type과 실행 슬롯 UI까지만 만든다.
- "작은 챗봇 MVP 금지"는 최종 제품 범위를 축소하지 말라는 의미로 해석한다. 구현 순서는 `docs/14-product-strategy-vertical-slice.md`의 수직 슬라이스 원칙과 충돌하지 않게 적용한다.

### Gemini 전략/레퍼런스 리뷰

- 상위 관리자, 실무 실행자, 외부 채널 담당, 감사 에이전트의 계층형 토폴로지는 우리 Orchestrator/Worker/External/Auditor 구조에 적용 가능하다.
- `sessions.spawn`, `sessions.send`, `sessions.yield` 같은 비공개 세션 통신은 공개 채널 소음을 줄이지만 Human Peek가 필요하다.
- 외부 채널은 n8n 같은 proxy 또는 webhook receiver 뒤에서 Shape Unification, Noise Filter, Self-Response Prevention, Debounce, PII Block, Logging, Checklist Injection을 통과해야 한다.
- HIGH/LOW confidence routing은 자동 응답과 인간 승인을 나누는 좋은 기준이다.
- 0-token safety cron은 LLM 장애에도 누락 요청을 잡는 비-AI 안전망으로 유용하다.
- Linear 강제 SSOT는 우리 제품에는 과하므로, 프로젝트별 SSOT provider 추상화로 받아들인다.

## 바로 반영할 것

- protocol 단계에서 Zod 스키마를 함께 정의한다.
- `Event Store + Redaction Layer + Permission Matrix`를 1.5단계가 아니라 사실상 1단계 핵심 산출물로 끌어올린다.
- Provider Profile과 모델 discovery를 데스크톱 UI 완성보다 먼저 만든다.
- Conversation Mode를 기본 작업 모드로 명시하고, Debate Mode는 필요할 때 승격하는 흐름으로 정리한다.
- Telegram에서 들어온 실행성 명령은 기본적으로 `pending approval`로 둔다.
- Redaction은 저장 직전이 아니라 event emit 직전에 수행한다.
- API 키와 토큰은 Event Store에 평문 저장하지 않고 OS keychain 또는 secret vault에 분리한다.
- PTY/터미널 슬롯은 후반 기능이지만 프로토콜 위험이 크므로 초기에 얇은 프로토타입을 만든다.
- 제품 목적은 "쓰려고 만든다"로 둔다. 학습은 수단이며, 구현은 수직 슬라이스 우선으로 진행한다.
- Conversation Mode 기본값은 `soul: Off` 또는 `Summary`, recall은 자동 과주입이 아니라 명시/제안 기반으로 둔다.
- memory record에 `source_channel`, `trust_level`을 추가하고 Telegram 등 untrusted 출처의 자동 recall을 제한한다.
- `Replay`를 `Record View`와 `Re-run`으로 분리한다.
- 리셀러/커스텀 base URL 사용 시 memory 전송 위험 경고와 라우팅 제한을 제공한다.
- External Agent는 기본 read-only, exec/write/browser/secret denied로 시작한다.
- 외부 유입 요청용 Ingress Guard 스키마와 guard 적용 로그를 protocol에 포함한다.
- 비공개 세션 통신 이벤트와 Human Peek 패널을 설계에 추가한다.
- 0-token safety cron을 LLM 장애 감시와 pending 요청 누락 감지용으로 추가한다.
- GPT-5.5 Pro 전달문을 `docs/16-codex-implementation-handoff.md`로 분리하고 첫 코드 작업의 체크리스트로 사용한다.
- 첫 코드 작업은 monorepo/workspace, protocol 타입, desktop Orchestrator layout, provider/runtime/event store stub까지로 제한한다.

## 보류할 것

- CRDT 기반 동기화: 처음부터 도입하지 않는다. append-only event log + idempotency key + conflict UI로 시작한다.
- 모든 기능의 모바일 제어: 초기는 읽기, 승인, 중단, 재시도 중심으로 제한한다.
- Soul 전체 자동 주입: 기본값은 Summary 또는 Retrieved로 두고 Full은 명시 선택으로 둔다.
- soul.md 시스템은 설계는 유지하되 v0의 필수 경로에서는 제외한다.
- 분산 메모리 충돌 해결은 초기에 LWW + 충돌 기록으로 시작하고, 복잡한 merge UI는 뒤로 미룬다.
- ChannelTalk/n8n/Linear 특정 구현은 보류하고 provider 추상화로 둔다.
- External Agent와 Auditor는 v0 필수 경로에서 제외한다.

## 반영하지 않을 것

- 장식용 floating orb UI: 기능 상태 표시용 `Status Hub`는 채택하되, 장식용 orb나 시각 효과 중심 요소는 만들지 않는다.

## 새로 생긴 질문

1. Event Store의 1차 저장소는 SQLite로 충분한가, 아니면 초기에 서버 동기화를 고려한 Postgres 스키마도 함께 정의할 것인가?
2. Coding Packet 생성은 자동 제안으로 둘 것인가, 사용자의 `패킷 만들기` 액션을 필수로 할 것인가?
3. Soul injection은 데스크톱에서 조립할 것인가, 서버에서 조립할 것인가, 아니면 protocol package의 pure builder로 둘 것인가?
4. Tauri 선택 시 PTY와 native file access를 어떤 Rust 플러그인 경계로 묶을 것인가?
5. Adopt/Reject는 git worktree, patch file, branch 중 무엇을 기본 단위로 삼을 것인가?
6. 프로젝트 목적을 "쓰려고 만든다"로 고정할 때, 첫 수직 슬라이스의 완료 기준은 무엇인가?
7. 리셀러/커스텀 프로바이더에서 memory recall을 기본 차단할 것인가, 경고 후 허용할 것인가?
8. Human Peek는 데스크톱 UI의 어느 위치에 들어가야 하는가?
9. SSOT provider의 v0 기본값은 로컬 Markdown, GitHub Issues, Notion 중 무엇인가?

## 반영 결정 로그

| 날짜 | 결정 | 근거 | 관련 문서/이슈 |
| --- | --- | --- | --- |
| 2026-05-24 | Grok 종합 리뷰를 첫 외부 리뷰로 기록 | 복잡도, 폴백, 권한, 이벤트 저장소 지적이 구현 전에 반영할 가치가 큼 | `docs/review-board.md` |
| 2026-05-24 | Event Store, Redaction, Permission Matrix를 선행 설계로 채택 | 나중에 고치기 가장 어렵고 모든 exporter/bridge/executor가 의존함 | `docs/13-event-store-permission-redaction.md` |
| 2026-05-24 | Conversation Mode를 기본 모드로 강화 | 실제 사용자의 80% 흐름은 1:1 대화에서 시작될 가능성이 높음 | `docs/11-conversation-mode.md` |
| 2026-05-24 | Status Orb 제안을 기능형 Status Hub로 변환 채택 | 상태는 통합하되 장식용 orb UI는 피함 | `docs/08-ui-direction.md` |
| 2026-05-24 | Claude 제품/UX 리뷰를 기록 | 실제 사용 흐름, 범위 관리, soul/memory UX 위험을 보완함 | `docs/review-board.md` |
| 2026-05-24 | 제품 목적을 "쓰려고 만든다"로 확정 | 학습은 수단이며, 사용 가능한 수직 슬라이스를 먼저 관통시켜야 함 | `docs/14-product-strategy-vertical-slice.md` |
| 2026-05-24 | memory trust level을 채택 | Telegram/context poisoning과 리셀러 프록시 유출을 줄이기 위함 | `docs/13-event-store-permission-redaction.md`, `docs/05-memory-memento.md` |
| 2026-05-24 | Gemini 레퍼런스 리뷰를 기록 | 외부 채널 guard, 계층형 에이전트, 0-token safety cron이 보안/운영 안정성에 유용함 | `docs/15-agent-topology-and-ingress-guards.md` |
| 2026-05-24 | GPT-5.5 Pro Codex 전달문을 구현 지시서로 기록 | 첫 코드 작업의 범위와 금지사항이 명확하며, protocol-first 원칙을 강화함 | `docs/16-codex-implementation-handoff.md` |
