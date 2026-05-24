# Event Store, 권한, Redaction 설계

## 목표

AI Orchestrator Lab의 모든 대화, 토론, 실행, 백업, 모바일 승인, Telegram 브리지 이벤트는 하나의 Event Store 계열을 기준으로 기록된다. 중앙 권위는 DGX-02 Event Store이며, 맥북과 집 PC는 로컬 SQLite cache/outbox를 가진 client replica로 동작한다. Obsidian, Notion, 모바일 대시보드는 모두 projection이다.

이 문서는 구현 초기에 반드시 고정해야 할 세 가지를 정의한다.

- DGX-02 Event Store authority
- client local SQLite cache/outbox
- Redaction Layer
- Permission Matrix

## 핵심 원칙

- DGX-02 Event Store와 client local cache/outbox에는 평문 API 키, auth token, bearer token, `.env` secret을 저장하지 않는다.
- Redaction은 저장 직전이 아니라 event emit 직전에 수행한다.
- 실행성 이벤트는 Permission Matrix를 통과해야 한다.
- Telegram, 모바일, API에서 들어온 위험 명령은 기본적으로 `pending approval`이다.
- Obsidian/Notion export는 Event Store의 projection이며 원본이 아니다.

## 저장소 선택

초기 저장소는 DGX-02의 중앙 Event Store와 각 클라이언트의 로컬 SQLite outbox/cache를 기본으로 한다.

| 후보 | 판단 |
| --- | --- |
| SQLite | 1차 선택. DGX-02 authority와 클라이언트 로컬 outbox/cache 모두에 적용하기 쉽다. |
| JSONL | export와 debug에는 좋지만 query와 sync conflict 관리가 약하다. |
| Postgres | DGX 서버에서는 장기적으로 좋지만 첫 구현에는 SQLite authority로 충분하다. |
| CRDT | 멀티 디바이스 동시 편집에는 강하지만 초기 복잡도가 크다. 보류한다. |

기본 구조는 `DGX-02 SQLite authority + client SQLite append-only outbox + artifact files + server sync`로 시작한다. DGX-02는 추후 Postgres로 승격할 수 있게 event envelope를 저장소 독립적으로 유지한다.

## 멀티 클라이언트 동기화 모델

맥북과 집 PC는 둘 다 같은 DGX-02에 접속한다.

```text
MacBook local SQLite outbox
  -> DGX-02 Event Store authority
  -> Home PC local SQLite cache
  -> Obsidian/Notion/Mobile projections
```

원칙:

- DGX-02가 온라인이면 모든 이벤트의 최종 authority는 DGX-02다.
- 맥북이 오프라인이면 로컬 SQLite outbox에 append한다.
- 온라인 복구 시 `client_id`, `device_id`, `idempotency_key`, `base_revision`을 함께 보내 DGX-02에 동기화한다.
- 충돌은 초기에는 server revision + last-write-wins + `sync.conflict.detected` 이벤트로 처리한다.
- 사용자가 직접 작성한 결정, Coding Packet, memory pin/forget처럼 의미 충돌이 큰 이벤트는 자동 덮어쓰기보다 conflict UI에서 확인한다.
- 집 PC는 같은 방식으로 DGX-02에서 pull하고, 필요한 경우 자기 local outbox를 push한다.

## Event Envelope

```ts
export const EventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.number().int(),
  eventType: z.string(),
  sessionId: z.string().uuid(),
  projectId: z.string().optional(),
  source: z.enum(["desktop", "server", "legacy_telegram", "mobile", "api", "system"]),
  sourceTrust: z.enum(["trusted", "limited", "untrusted"]),
  actorId: z.string(),
  createdAt: z.string().datetime(),
  localSeq: z.number().int(),
  serverSeq: z.number().int().optional(),
  idempotencyKey: z.string(),
  permission: z.object({
    risk: z.enum(["read", "write", "execute", "network", "secret", "destructive"]),
    status: z.enum(["allowed", "pending", "denied"]),
    approvalId: z.string().optional(),
  }),
  redaction: z.object({
    status: z.enum(["clean", "redacted", "blocked"]),
    rulesApplied: z.array(z.string()),
  }),
  payload: z.unknown(),
});
```

## Source Trust

모든 이벤트와 메모리 후보에는 출처 신뢰도를 붙인다.

| 출처 | 기본 trust | 설명 |
| --- | --- | --- |
| Desktop | trusted | 사용자가 직접 앱에서 입력하거나 승인한 이벤트 |
| Server | limited | 서버 에이전트가 생성했지만 사용자 승인이 필요한 이벤트 |
| Telegram | untrusted | 외부 채널에서 들어온 메시지. 자동 실행/자동 recall 제한 |
| Mobile | limited | 승인 UI는 가능하지만 secret/터미널 직접 제어는 제한 |
| API | untrusted | 외부 자동화 입력. 기본 승인 대기 |
| System | trusted | 앱 내부 상태 이벤트 |

`untrusted` 출처의 내용은 바로 장기 메모리나 권한 있는 에이전트 컨텍스트에 자동 주입하지 않는다. Memory Curator나 사용자의 승인을 거쳐 `limited` 또는 `trusted`로 승격할 수 있다.

## 이벤트 종류

| 이벤트 | 예시 |
| --- | --- |
| `conversation.message.created` | 사용자가 Conversation Workbench에 메시지 입력 |
| `ingress.received` | 외부 채널/webhook 입력 수신 |
| `ingress.guard.applied` | Ingress Guard 적용 결과 |
| `ingress.blocked` | guard 또는 permission에 의해 외부 입력 차단 |
| `confidence.classified` | 외부 응답 confidence 분류 |
| `debate.round.started` | 토론 라운드 시작 |
| `agent.response.received` | 모델/에이전트 응답 수신 |
| `agent.session.spawned` | 하위 에이전트 세션 생성 |
| `agent.session.message.sent` | 에이전트 세션 간 메시지 전달 |
| `agent.session.yielded` | 하위 세션 결과 대기 |
| `coding_packet.created` | 대화/토론 결과를 코딩 패킷으로 변환 |
| `terminal.session.detected` | tmux session 발견 |
| `terminal.session.attached` | tmux session attach 또는 UI 연결 |
| `terminal.session.detached` | tmux session detach. session은 백그라운드에 유지 |
| `terminal.pane.detected` | tmux pane id/title/role 발견 |
| `terminal.command.intent.created` | 실제 전송 전 command intent 기록 |
| `terminal.command.blocked` | 권한, redaction, 정책으로 command dispatch 차단 |
| `terminal.command.sent` | 승인된 command를 pane에 전송 |
| `terminal.pane.output.captured` | pane output을 read-only capture하고 redaction 적용 |
| `terminal.pane.stale` | pane 출력이 오래 갱신되지 않음 |
| `run.requested` | 터미널/CLI 실행 요청 |
| `run.approval.requested` | 위험 작업 승인 요청 |
| `run.completed` | 실행 종료 |
| `memory.recall.used` | Memento recall 결과 사용 |
| `memory.candidate.created` | 외부 입력에서 메모리 후보 생성 |
| `memory.trust.updated` | 메모리 신뢰도 변경 |
| `backup.exported` | Obsidian/Notion export 성공 |
| `sync.conflict.detected` | Offline 이후 동기화 충돌 발견 |
| `record.viewed` | 이전 기록 보기 |
| `run.rerun.requested` | 과거 실행을 새 조건으로 재실행 요청 |
| `safety_cron.missing_alert.detected` | 0-token safety cron이 누락 요청 감지 |

## Redaction Layer

Redaction은 모든 이벤트 생성 경로의 입구에 있다.

```text
User / Agent / Bridge / Executor
  -> createEvent(input)
  -> redact(input)
  -> classifyPermission(redacted)
  -> persist(event)
  -> project(exporters)
```

Redaction 대상:

- `sk-...` 형태 API key
- `Bearer ...`
- `ANTHROPIC_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `.env` 파일 내용
- private key block
- cookie/session token
- 사용자가 민감 경로로 지정한 문자열
- tmux pane output, shell history, command preview 안의 secret/token/env 값

Redaction 결과는 원문을 대체한다.

```text
ANTHROPIC_AUTH_TOKEN="[REDACTED:anthropic_token]"
```

## Secret 저장소

API 키와 토큰은 Event Store에 저장하지 않는다.

- macOS Keychain
- OS secret storage
- 사용자가 명시한 임시 세션 메모리
- DGX 서버 secret vault

Event Store에는 secret reference만 저장한다.

```ts
type SecretRef = {
  providerProfileId: string;
  secretKey: "apiKey" | "authToken";
  storage: "macos-keychain" | "session-memory" | "dgx-vault";
};
```

## 리셀러와 커스텀 프로바이더

커스텀 base URL, 리셀러 프록시, 비공식 호환 API는 `limited` 또는 `untrusted` provider로 표시한다.

정책:

- 기본적으로 User Memory와 Project Memory의 자동 recall을 차단한다.
- 사용자가 허용하면 해당 실행에 한해 selected memory만 전달한다.
- UI에는 "이 provider는 프롬프트와 메모리를 외부 프록시에 보낼 수 있음" 경고를 표시한다.
- 민감 프로젝트에서는 custom provider 사용을 denied로 둘 수 있다.

## Permission Matrix

| 채널 | 읽기 | 파일 쓰기 | 터미널 실행 | 네트워크 호출 | secret 조회 | destructive |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop | allowed | pending/allowed | pending/allowed | allowed | pending | pending |
| Mobile | allowed | pending | pending | pending | denied | denied |
| Telegram | allowed | pending | pending | pending | denied | denied |
| Server agent | allowed | pending/allowed | pending/allowed | allowed | denied by default | pending |
| Exporter | allowed | denied | denied | allowed | denied | denied |

tmux runtime policy:

- `terminal.command.intent.created` may be recorded after redaction even when dispatch is not allowed.
- `terminal.command.sent` requires approval whenever the command touches files, terminal execution, network, secret, destructive operations, or remote workspace.
- `terminal.pane.output.captured` is read-only but still must pass redaction before persistence/export.
- Telegram, mobile, and external API events must never go directly to `tmux send-keys`; they must become permissioned command intents first.

정책은 프로젝트와 에이전트별로 더 좁힐 수 있어야 한다.

## Approval Flow

```text
run.requested
  -> permission.status = pending
  -> user approves from desktop/mobile
  -> run.approval.granted
  -> executor starts
  -> run.completed
```

Telegram에서 온 명령은 파일 쓰기, 터미널 실행, 네트워크 호출을 모두 pending으로 둔다.

## Ingress Guard 연결

외부 입력은 Redaction/Permission 전에 Shape Unification과 Noise Filter를 먼저 통과한다.

```text
external payload
  -> shape unification
  -> noise/self-response/debounce guards
  -> redaction
  -> permission classification
  -> Event Store
```

Guard 적용 결과는 `ingress.guard.applied` 이벤트로 남긴다. 차단된 입력은 `ingress.blocked`로 기록하되, payload는 redacted 형태만 저장한다.

## Conflict 처리

Offline 이후 Online으로 돌아오면 다음 충돌을 검사한다.

- 같은 세션의 서로 다른 요약
- 같은 soul 파일의 동시 수정
- 같은 memory record의 pin/delete 충돌
- 같은 run artifact의 중복 업로드
- 같은 Coding Packet의 상이한 버전

초기 전략:

- append-only event는 삭제하지 않는다.
- projection 충돌은 conflict UI에서 병합한다.
- idempotency key로 중복 실행을 제거한다.
- soul과 memory는 revision id를 사용한다.

## Forget과 보존

Event Store는 append-only를 기본으로 한다. 따라서 `forget`은 과거 이벤트를 조용히 삭제하는 의미가 아니다.

초기 정책:

- 원본 이벤트는 tombstone 이벤트로 무효화한다.
- projection에서는 해당 기록을 제거하거나 `[FORGOTTEN]`으로 대체한다.
- secret은 secret storage에서 실제 삭제한다.
- Obsidian/Notion export는 다음 sync에서 소급 제거한다.
- 법적/조직 정책상 물리 삭제가 필요하면 별도 compaction 절차를 제공한다.

## 기록 보기와 재실행

`Replay`라는 용어는 두 기능을 혼동시킬 수 있으므로 UI와 이벤트에서 분리한다.

| 기능 | 의미 |
| --- | --- |
| Record View | 당시 입력, 출력, 모델, 비용, 권한, 메모리 trace를 그대로 보기 |
| Re-run | 같은 입력 또는 수정된 입력으로 새 실행을 시작하기. LLM 결과는 비결정적일 수 있음 |

## 프롬프트 예산 정책

Soul, Memento recall, Coding Packet은 토큰 예산을 공유한다.

기본 우선순위:

1. 현재 사용자 지시
2. 실행에 필요한 파일/프로젝트 컨텍스트
3. Coding Packet 핵심 필드
4. Memento recall 상위 결과
5. soul summary
6. 긴 raw transcript

Full soul 주입은 명시 선택일 때만 사용한다. 기본값은 Summary 또는 Retrieved다.

## 구현 순서

1. Zod schema로 EventEnvelope와 주요 event payload 정의
2. SQLite append-only event table 생성
3. Redaction rule registry 구현
4. Permission Matrix와 approval state 구현
5. source trust와 memory trust 정책 구현
6. Conversation event 저장
7. Provider profile secret ref 저장
8. Obsidian exporter projection 구현
9. Telegram/mobile approval event 연결

## 결론

Event Store, Redaction, Permission Matrix는 부가 기능이 아니라 오케스트레이터의 뼈대다. 이것이 먼저 잡혀야 Conversation, Debate, Coding, Memory, Backup, Mobile이 같은 제품으로 움직인다.
## Stage9 구현 경계

Stage9에서는 `PermissionMatrixSnapshot`을 protocol에 추가하고, desktop mock runtime에서 외부 ingress approval, terminal slot, agent run step, mobile policy를 하나의 matrix로 합친다.

- Telegram/OpenClaw 등 외부 채널에서 온 실행성 요청은 `external_channel` actor로 기록한다.
- terminal/run slot은 실제 명령을 실행하지 않고 `terminal_run` permission item으로만 표현한다.
- Coding handoff run step은 `write_files`, `run_safe_commands`, `remote_workspace` 권한을 요구하는 approval item으로 표현한다.
- provider completion도 Permission Matrix에 들어간다. `ready` provider는 `not_required`, untrusted provider는 `provider_completion` approval item, credential missing/blocked provider는 deny 상태가 된다.
- mobile dashboard는 read/approve/stop/retry만 허용하고 terminal typing과 secret view는 `deny` 상태로 남긴다.
- approve/reject 버튼은 Event Store에 `permission.approved`, `permission.rejected`, `permission.queue.updated` 이벤트를 남긴다.

아직 실제 파일 변경, 터미널 입력, 원격 workspace 실행은 연결하지 않는다. Stage9의 목적은 모든 실행성 행동이 같은 approval queue와 permission summary를 통과하게 만드는 것이다.
