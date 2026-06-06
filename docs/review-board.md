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
- External Ingress 같은 외부 채널은 실행 승인만으로는 충분하지 않고, memory/context poisoning을 막기 위한 trust 정책이 필요하다.
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
- Conversation Mode는 단순 채팅이 아니라 Debate 승격, Coding Packet 생성, 실행 슬롯 전달, 메모리 저장, 백업 상태, External Ingress 이어받기와 연결된 기본 작업 방식이어야 한다.
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

> Ship status 표기 (2026-05-25 retrospective): ✅ shipped / ⚠️ partial 또는 design-only / ❌ not started

- ✅ protocol 단계에서 Zod 스키마를 함께 정의한다. — `packages/protocol/src/index.ts` 전체가 Zod 스키마 + 추론 타입으로 운영 중.
- ✅ `Event Store + Redaction Layer + Permission Matrix`를 1.5단계가 아니라 사실상 1단계 핵심 산출물로 끌어올린다. — F1~F10 모두 main 머지.
- ✅ Provider Profile과 모델 discovery를 데스크톱 UI 완성보다 먼저 만든다. — OpenAI-compat / Anthropic / Ollama / Codex CLI / OpenRouter 5종 adapter + contract test ship.
- ⚠️ Conversation Mode를 기본 작업 모드로 명시하고, Debate Mode는 필요할 때 승격하는 흐름으로 정리한다. — Conversation UI 기본 흐름 작동, Debate engine은 R3.2 다음 라운드에서 본격 구현 진입 예정.
- ⚠️ 외부 인입에서 들어온 실행성 명령은 기본적으로 `pending approval`로 둔다. — Ingress Guard 스키마(F9)로 골격은 있으나 External Ingress 채널 실제 연결은 미착수.
- ✅ Redaction은 저장 직전이 아니라 event emit 직전에 수행한다. — Event Store emit pipeline에 redaction hook 적용.
- ✅ API 키와 토큰은 Event Store에 평문 저장하지 않고 OS keychain 또는 secret vault에 분리한다. — `SecretRef` / `apiKeyRef` 분리, 평문 저장 금지가 contract test로 강제됨.
- ✅ PTY/터미널 슬롯은 후반 기능이지만 프로토콜 위험이 크므로 초기에 얇은 프로토타입을 만든다. — F10 tmux dispatch gate (double env-var 안전장치) 머지.
- ✅ 제품 목적은 "쓰려고 만든다"로 둔다. 학습은 수단이며, 구현은 수직 슬라이스 우선으로 진행한다. — `docs/14-product-strategy-vertical-slice.md` 채택, 모든 PR이 수직 슬라이스 원칙 준수.
- ✅ Conversation Mode 기본값은 `soul: Off` 또는 `Summary`, recall은 자동 과주입이 아니라 명시/제안 기반으로 둔다. — defaultAgentProfiles의 soulMode 분배: orchestrator/architect/builder = summary, reviewer/skeptic = retrieved, executor = off.
- ✅ memory record에 `source_channel`, `trust_level`을 추가하고 External Ingress 등 untrusted 출처의 자동 recall을 제한한다. — protocol에 두 필드 추가, low trust는 자동 recall에서 제외.
- ⚠️ `Replay`를 `Record View`와 `Re-run`으로 분리한다. — 문서 용어 분리는 완료, 데스크톱 UI 컴포넌트 적용은 pending.
- ⚠️ 리셀러/커스텀 base URL 사용 시 memory 전송 위험 경고와 라우팅 제한을 제공한다. — adapter 측에서 baseUrl override 지원 + apikey.fun 등 프록시 식별 가능, UI 경고 배너는 pending.
- ✅ External Agent는 기본 read-only, exec/write/browser/secret denied로 시작한다. — permissionLevel = read_only 기본 + Misato persona ship.
- ✅ 외부 유입 요청용 Ingress Guard 스키마와 guard 적용 로그를 protocol에 포함한다. — F9 머지.
- ⚠️ 비공개 세션 통신 이벤트와 Human Peek 패널을 설계에 추가한다. — 설계 단계, 구현 미착수.
- ⚠️ 0-token safety cron을 LLM 장애 감시와 pending 요청 누락 감지용으로 추가한다. — 설계만, scheduler 미구현.
- ✅ GPT-5.5 Pro 전달문을 `docs/16-codex-implementation-handoff.md`로 분리하고 첫 코드 작업의 체크리스트로 사용한다.
- ✅ 첫 코드 작업은 monorepo/workspace, protocol 타입, desktop Orchestrator layout, provider/runtime/event store stub까지로 제한한다. — vertical slice 완료, 이후 R2(권한/이벤트 F1~F10), R3(provider adapter), R3.1(SAFETY/persona loader), R3.2(17 persona)로 확장.

## 보류할 것

> 2026-05-25 status review: soul.md 시스템과 External/Auditor는 보류 → 채택으로 상태 변경됨.

- CRDT 기반 동기화: 처음부터 도입하지 않는다. append-only event log + idempotency key + conflict UI로 시작한다. *(여전히 보류)*
- 모든 기능의 모바일 제어: 초기는 읽기, 승인, 중단, 재시도 중심으로 제한한다. *(여전히 보류, PWA-iOS Safari 경로 유지)*
- Soul 전체 자동 주입: 기본값은 Summary 또는 Retrieved로 두고 Full은 명시 선택으로 둔다. *(여전히 보류, soulMode enum의 full은 명시 선택만 허용)*
- ~~soul.md 시스템은 설계는 유지하되 v0의 필수 경로에서는 제외한다.~~ → **R3.1/R3.2 라운드에서 채택**: persona loader + SAFETY.md auto-injection + 17 persona ship. 보류 결정 취소.
- 분산 메모리 충돌 해결은 초기에 LWW + 충돌 기록으로 시작하고, 복잡한 merge UI는 뒤로 미룬다. *(여전히 보류)*
- ChannelTalk/n8n/Linear 특정 구현은 보류하고 provider 추상화로 둔다. *(여전히 보류)*
- ~~External Agent와 Auditor는 v0 필수 경로에서 제외한다.~~ → **R3.2 라운드에서 채택**: External (Misato) / Auditor (Sora) persona ship. enum + defaultAgentProfiles 추가. 보류 결정 취소.

## 반영하지 않을 것

- 장식용 floating orb UI: 기능 상태 표시용 `Status Hub`는 채택하되, 장식용 orb나 시각 효과 중심 요소는 만들지 않는다.

## 새로 생긴 질문

> 2026-05-25 retrospective: 일부 질문은 R2/R3 라운드를 거치며 답이 결정됨. 답해진 항목은 인라인으로 표시.

1. Event Store의 1차 저장소는 SQLite로 충분한가, 아니면 초기에 서버 동기화를 고려한 Postgres 스키마도 함께 정의할 것인가? *(미결)*
2. Coding Packet 생성은 자동 제안으로 둘 것인가, 사용자의 `패킷 만들기` 액션을 필수로 할 것인가? → **답: 명시적 액션 필수.** debate `coding_packet` 라운드에 도달했을 때 사용자가 confirm해야 packet draft가 생성된다. `createCodingPacketDraft` + `assertSafeCodingPacket`이 path traversal / 절대 경로 / null byte를 차단하므로, 자동 emit이 곧 자동 실행 권한과 결합되는 위험을 피한다.
3. Soul injection은 데스크톱에서 조립할 것인가, 서버에서 조립할 것인가, 아니면 protocol package의 pure builder로 둘 것인가? → **답: persona loader가 protocol-pure builder로 조립.** SAFETY.md auto-injection 포함, 데스크톱/서버 어느 쪽에서 호출해도 동일한 프롬프트가 나오도록 결정성을 유지한다.
4. Tauri 선택 시 PTY와 native file access를 어떤 Rust 플러그인 경계로 묶을 것인가? *(미결, F10 tmux dispatch gate가 임시 우회)*
5. Adopt/Reject는 git worktree, patch file, branch 중 무엇을 기본 단위로 삼을 것인가? *(미결)*
6. 프로젝트 목적을 "쓰려고 만든다"로 고정할 때, 첫 수직 슬라이스의 완료 기준은 무엇인가? → **답 (잠정): "Conversation → Debate 승격 → Coding Packet → Permission Gate → 실행 슬롯 → Event Store 기록"이 한 번 끝까지 흐르는 것.** R3.2 시점에서 packet 생성 직전까지 도달. debate engine 라운드 ship 후 재평가.
7. 리셀러/커스텀 프로바이더에서 memory recall을 기본 차단할 것인가, 경고 후 허용할 것인가? → **답: 기본 차단.** ProviderProfile.baseUrl이 vendor canonical과 다르면 memory recall은 default-deny, 명시 opt-in만 허용. 사용자 본인이 apikey.fun 같은 신뢰 프록시를 쓰는 경우라도 opt-in 단계가 필요하다.
8. Human Peek는 데스크톱 UI의 어느 위치에 들어가야 하는가? *(미결)*
9. SSOT provider의 v0 기본값은 로컬 Markdown, GitHub Issues, Notion 중 무엇인가? *(미결, 사용자 활용 패턴 관찰 후 결정 예정)*

## R3 라운드 이후 새로 생긴 질문

10. Persona가 17개로 확장된 상태에서 debate round 당 발화 agent 수의 상한은? (전부 동시 발화는 토큰/UX 양쪽 모두 비현실적)
11. `personaName` override로 한 role에 여러 persona가 매핑되는 패턴(예: skeptic = 기본 + yohane)이 표준이 될 경우, profile selector UI는 어떤 단위로 정렬해야 하는가?
12. Executor 슬롯에 실제 명령 실행을 붙일 때, 17-persona 권한 정책(`permissionLevel`)과 OS-level sandbox는 어떻게 정합시키는가?
13. SAFETY.md auto-injection이 모든 persona 프롬프트의 토큰을 일정량 잡아먹는데, debate round 후반(이미 SAFETY context가 누적된 상태)에는 생략 가능한가?

## 반영 결정 로그

| 날짜 | 결정 | 근거 | 관련 문서/이슈 |
| --- | --- | --- | --- |
| 2026-05-24 | Grok 종합 리뷰를 첫 외부 리뷰로 기록 | 복잡도, 폴백, 권한, 이벤트 저장소 지적이 구현 전에 반영할 가치가 큼 | `docs/review-board.md` |
| 2026-05-24 | Event Store, Redaction, Permission Matrix를 선행 설계로 채택 | 나중에 고치기 가장 어렵고 모든 exporter/bridge/executor가 의존함 | `docs/13-event-store-permission-redaction.md` |
| 2026-05-24 | Conversation Mode를 기본 모드로 강화 | 실제 사용자의 80% 흐름은 1:1 대화에서 시작될 가능성이 높음 | `docs/11-conversation-mode.md` |
| 2026-05-24 | Status Orb 제안을 기능형 Status Hub로 변환 채택 | 상태는 통합하되 장식용 orb UI는 피함 | `docs/08-ui-direction.md` |
| 2026-05-24 | Claude 제품/UX 리뷰를 기록 | 실제 사용 흐름, 범위 관리, soul/memory UX 위험을 보완함 | `docs/review-board.md` |
| 2026-05-24 | 제품 목적을 "쓰려고 만든다"로 확정 | 학습은 수단이며, 사용 가능한 수직 슬라이스를 먼저 관통시켜야 함 | `docs/14-product-strategy-vertical-slice.md` |
| 2026-05-24 | memory trust level을 채택 | External Ingress/context poisoning과 리셀러 프록시 유출을 줄이기 위함 | `docs/13-event-store-permission-redaction.md`, `docs/05-memory-memento.md` |
| 2026-05-24 | Gemini 레퍼런스 리뷰를 기록 | 외부 채널 guard, 계층형 에이전트, 0-token safety cron이 보안/운영 안정성에 유용함 | `docs/15-agent-topology-and-ingress-guards.md` |
| 2026-05-24 | GPT-5.5 Pro Codex 전달문을 구현 지시서로 기록 | 첫 코드 작업의 범위와 금지사항이 명확하며, protocol-first 원칙을 강화함 | `docs/16-codex-implementation-handoff.md` |
| 2026-05-25 | R2 라운드: Event Store / Redaction / Permission Matrix를 F1~F10 마일스톤으로 분해해 모두 main 머지 | 가장 되돌리기 어려운 protocol 경계를 먼저 굳혀 두면 이후 라운드의 변경 비용이 낮아짐 | F1~F10 PR 시리즈 |
| 2026-05-25 | Redaction 실행 위치를 event emit 직전으로 고정 | 저장소 직전에 두면 in-memory 분석 코드가 평문을 먼저 봄. emit-time redaction은 모든 consumer(persist/exporter/bridge)에게 동일하게 적용됨 | F1~F3 |
| 2026-05-25 | API 키 평문 저장 금지를 contract test로 강제 (`SecretRef` / `apiKeyRef`) | 정책 문서만으로는 회귀를 막을 수 없음. 빌드/테스트 게이트가 유일한 강제 수단 | `packages/protocol`, `packages/providers` |
| 2026-05-25 | memory record에 `source_channel` + `trust_level` 추가 | External Ingress/외부 채널/리셀러 프록시 모두 trust 차등이 필요. low trust는 자동 recall 차단 | `packages/protocol`, F4~F6 |
| 2026-05-25 | Ingress Guard 스키마(F9) 채택 — Shape Unification / Noise Filter / PII Block / Logging / Checklist Injection | Gemini 레퍼런스 리뷰의 7중 guard를 우리 환경에 맞춰 축소 적용. 외부 채널 직결을 막는 protocol-level 경계 | F9 |
| 2026-05-25 | PTY/터미널 실행을 tmux dispatch gate로 임시 구현 (double env-var 안전장치) | Tauri PTY 플러그인 경계가 미정인 상태에서 실험을 막지 않으면서도 prod 환경에서 우발 실행을 차단 | F10 |
| 2026-05-25 | R3 라운드: 5종 LlmAdapter(OpenAI-compat / Anthropic / Ollama / Codex CLI OAuth / OpenRouter) ship | provider 다양성은 사용자(한국 B2B + apikey.fun 프록시 + DGX 로컬)의 실사용 환경에 직접 대응. 모든 adapter는 contract test STANDARD_CONTRACT_CASES 통과 | `packages/providers` |
| 2026-05-25 | AdapterError 9-category taxonomy 고정 | provider별 에러 메시지를 통일된 카테고리로 normalize해야 UI/재시도/사용자 알림 로직이 single switch로 끝남 | `packages/providers` |
| 2026-05-25 | R3.1 라운드: SAFETY.md auto-injection을 persona loader에 내장 | 보안 문구를 각 persona 파일에 복붙하면 회귀가 발생함. loader가 단일 진실 공급원으로 SAFETY.md를 주입 | `packages/agents`, `agents/SAFETY.md` |
| 2026-05-25 | Persona는 role 키로 디렉터리 lookup, 단 `personaName` override로 한 role에 여러 persona 매핑 가능 | Yohane(skeptic 2호) 같은 다중 persona 케이스를 enum 확장 없이 수용 — protocol에 `personaName?: string` 추가만 함 | `packages/protocol`, PR #74 |
| 2026-05-25 | R3.2 라운드: AgentRole enum을 6종 확장 (researcher / negotiator / risk_officer / mediator / watchdog / domain_expert) | 17 persona 운영을 enum-level로 표현. additive-only 변경으로 기존 코드 회귀 0 | `packages/protocol`, PR #82 |
| 2026-05-25 | 17 persona roster ship — 캐릭터별 AGENTS.md + SOUL.md | Sparkle(negotiator) 5막 협상 / Maomao(researcher) 5-step workflow / C.C.(risk_officer) 5-step quantitative algorithm / Sora(auditor) independent compliance / Misato(external) / Robin(mediator) / Frieren(watchdog) / Herta(domain_expert) / Yohane(skeptic 2호) 등 | `agents/*` |
| 2026-05-25 | 외부 AI에 회사명 노출 금지 (Example Domain → REFLECORE) — Maomao(researcher) AGENTS.md에 명문화 | 외부 위탁 리서치 흐름에서 회사명이 third-party 모델 학습 로그에 남는 risk를 protocol-level 규칙으로 차단 | `agents/researcher/AGENTS.md` |
| 2026-05-25 | Sora 페르소나는 Executor 거절 → Auditor로 재배치 | 원본 캐릭터의 anti-cooperation/possessive 요소가 swarm cooperation을 깨므로 Executor 부적합. 독립 감시 권한이 본질인 Auditor 역할에서 "독단"이 자연스럽게 기능 | `agents/auditor/AGENTS.md` |
| 2026-05-25 | "오빠" 호칭은 한국 사무실 문화 reflect로 유지 결정 (Sora-Auditor) | 한국 office context에서 "오빠"는 workplace-familiar로 통용. 서구권 lens로 일괄 "사용자님" 치환했던 직전 변경을 되돌림 | `agents/auditor/AGENTS.md` |
| 2026-05-25 | Coding Packet 생성은 명시적 사용자 액션으로 고정 (질문 #2 답) | `createCodingPacketDraft` + `assertSafeCodingPacket` 조합이 path traversal / 절대 경로 / null byte / 길이 폭주를 차단하지만, 자동 emit + 자동 실행 결합 시 우회 가능성이 남음 | `packages/agents/src/index.ts` |
| 2026-05-25 | Soul injection은 protocol-pure builder로 조립 (질문 #3 답) | 데스크톱/서버 어느 쪽에서 호출해도 동일 prompt가 나와야 reproducibility 확보. SAFETY.md auto-injection도 동일 builder가 책임짐 | `packages/agents` |
| 2026-05-25 | 리셀러/커스텀 baseUrl에서 memory recall 기본 차단 (질문 #7 답) | vendor canonical baseUrl이 아닌 경우 default-deny. 사용자 본인의 신뢰 프록시(apikey.fun 등)도 명시 opt-in 필요 | `packages/providers`, `packages/protocol` |
