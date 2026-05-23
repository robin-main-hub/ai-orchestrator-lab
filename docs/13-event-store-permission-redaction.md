# Event Store, 권한, Redaction 설계

## 목표

AI Orchestrator Lab의 모든 대화, 토론, 실행, 백업, 모바일 승인, Telegram 브리지 이벤트는 하나의 Event Store를 기준으로 기록된다. Event Store는 단일 진실 공급원이며, Obsidian, Notion, 모바일 대시보드, 서버 동기화는 모두 projection이다.

이 문서는 구현 초기에 반드시 고정해야 할 세 가지를 정의한다.

- Event Store
- Redaction Layer
- Permission Matrix

## 핵심 원칙

- Event Store에는 평문 API 키, auth token, bearer token, `.env` secret을 저장하지 않는다.
- Redaction은 저장 직전이 아니라 event emit 직전에 수행한다.
- 실행성 이벤트는 Permission Matrix를 통과해야 한다.
- Telegram, 모바일, API에서 들어온 위험 명령은 기본적으로 `pending approval`이다.
- Obsidian/Notion export는 Event Store의 projection이며 원본이 아니다.

## 저장소 선택

초기 저장소는 데스크톱 로컬 SQLite를 기본으로 한다.

| 후보 | 판단 |
| --- | --- |
| SQLite | 1차 선택. 데스크톱 로컬, WAL, transaction, 검색, migration이 쉽다. |
| JSONL | export와 debug에는 좋지만 query와 sync conflict 관리가 약하다. |
| Postgres | DGX 서버에서는 좋지만 맥북 로컬 원본으로는 무겁다. |
| CRDT | 멀티 디바이스 동시 편집에는 강하지만 초기 복잡도가 크다. 보류한다. |

기본 구조는 `SQLite append-only events + artifact files + optional server sync`로 시작한다.

## Event Envelope

```ts
export const EventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.number().int(),
  eventType: z.string(),
  sessionId: z.string().uuid(),
  projectId: z.string().optional(),
  source: z.enum(["desktop", "server", "telegram", "mobile", "api", "system"]),
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

## 이벤트 종류

| 이벤트 | 예시 |
| --- | --- |
| `conversation.message.created` | 사용자가 Conversation Workbench에 메시지 입력 |
| `debate.round.started` | 토론 라운드 시작 |
| `agent.response.received` | 모델/에이전트 응답 수신 |
| `coding_packet.created` | 대화/토론 결과를 코딩 패킷으로 변환 |
| `run.requested` | 터미널/CLI 실행 요청 |
| `run.approval.requested` | 위험 작업 승인 요청 |
| `run.completed` | 실행 종료 |
| `memory.recall.used` | Memento recall 결과 사용 |
| `backup.exported` | Obsidian/Notion export 성공 |
| `sync.conflict.detected` | Offline 이후 동기화 충돌 발견 |

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

## Permission Matrix

| 채널 | 읽기 | 파일 쓰기 | 터미널 실행 | 네트워크 호출 | secret 조회 | destructive |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop | allowed | pending/allowed | pending/allowed | allowed | pending | pending |
| Mobile | allowed | pending | pending | pending | denied | denied |
| Telegram | allowed | pending | pending | pending | denied | denied |
| Server agent | allowed | pending/allowed | pending/allowed | allowed | denied by default | pending |
| Exporter | allowed | denied | denied | allowed | denied | denied |

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
5. Conversation event 저장
6. Provider profile secret ref 저장
7. Obsidian exporter projection 구현
8. Telegram/mobile approval event 연결

## 결론

Event Store, Redaction, Permission Matrix는 부가 기능이 아니라 오케스트레이터의 뼈대다. 이것이 먼저 잡혀야 Conversation, Debate, Coding, Memory, Backup, Mobile이 같은 제품으로 움직인다.
