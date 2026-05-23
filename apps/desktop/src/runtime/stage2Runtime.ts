import type {
  AgentProfile,
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  EventSource,
  EventStore,
  EventStoreAppendOptions,
  ProviderProfile,
  SourceTrust,
} from "@ai-orchestrator/protocol";

const sessionId = "session_desktop_001";

const sensitiveKeyPattern = /(api[-_]?key|auth[-_]?header|authorization|bearer|cookie|password|secret|token)/i;
const redactionRules = [
  {
    name: "openai_style_key",
    pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[REDACTED:api_key]",
  },
  {
    name: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
    replacement: "Bearer [REDACTED:bearer_token]",
  },
  {
    name: "env_secret",
    pattern: /\b(ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*=\s*[^\s"']+/gi,
    replacement: "$1=[REDACTED:env_secret]",
  },
];

export type Stage2EventInput<T> = {
  type: string;
  payload: T;
  source?: EventSource;
  sourceTrust?: SourceTrust;
  createdAt?: string;
  correlationId?: string;
};

export type CodingPacketInput = {
  messages: ConversationMessage[];
  agent?: AgentProfile;
  provider?: ProviderProfile;
};

export type ObsidianProjectionInput = {
  messages: ConversationMessage[];
  packet: CodingPacket;
  events: EventEnvelope[];
  createdAt?: string;
};

export function createStage2Event<T>({
  type,
  payload,
  source = "desktop",
  sourceTrust = "trusted",
  createdAt = new Date().toISOString(),
  correlationId,
}: Stage2EventInput<T>): EventEnvelope<T> {
  const redactedPayload = redactForEventStore(payload) as T;
  const wasRedacted = stableStringify(payload) !== stableStringify(redactedPayload);

  return {
    id: `event_${crypto.randomUUID()}`,
    sessionId,
    type,
    payload: redactedPayload,
    createdAt,
    source,
    sourceTrust,
    redacted: wasRedacted,
    correlationId,
  };
}

export function appendEventToLog<T>(events: EventEnvelope[], event: EventEnvelope<T>, limit = 48): EventEnvelope[] {
  return [event, ...events].slice(0, limit);
}

export function redactForEventStore(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactForEventStore(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED:secret_ref_only]" : redactForEventStore(entry),
      ]),
    );
  }

  return value;
}

export function buildMockAssistantReply(params: {
  content: string;
  agent: AgentProfile;
  provider: ProviderProfile;
}): string {
  const modelId = params.agent.modelId ?? params.provider.defaultModel ?? "model pending";

  return [
    `${params.agent.name}이 ${params.provider.name} / ${modelId} 바인딩으로 응답했어.`,
    "Stage2에서는 실제 네트워크 호출 대신 이 턴을 Event Store에 남기고, 이후 Coding Packet과 백업 projection으로 넘길 수 있게 처리한다.",
    `입력 길이: ${params.content.length}자.`,
  ].join(" ");
}

export function createCodingPacketFromConversation({ messages, agent, provider }: CodingPacketInput): CodingPacket {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const recentContext = messages.slice(-8).map((message) => `${message.role}: ${message.content}`);
  const agentLine = agent
    ? `${agent.name} / ${agent.role} / ${agent.modelId ?? "model pending"}`
    : "agent pending";
  const providerLine = provider
    ? `${provider.name} / ${provider.kind} / ${provider.defaultModel ?? "model pending"}`
    : "provider pending";

  return {
    goal: lastUserMessage?.content ?? "Conversation Workbench에서 코딩 목표 정리",
    context: [
      "Conversation Workbench에서 생성된 Stage2 Coding Packet.",
      `selected agent: ${agentLine}`,
      `selected provider: ${providerLine}`,
      ...recentContext,
    ],
    decisions: [
      "대화 기록은 Event Store 이벤트로 먼저 남긴다.",
      "코딩 전달은 자연어 요약이 아니라 CodingPacket 구조로 유지한다.",
      "실제 모델 호출과 터미널 실행은 provider/runtime permission 연결 전까지 mock 상태로 둔다.",
    ],
    rejectedOptions: [
      "대화 전문을 그대로 실행 에이전트에게 넘기기",
      "Obsidian/Notion을 원본 저장소처럼 사용하기",
    ],
    constraints: [
      "API key, bearer token, auth token은 event emit 직전 redaction을 통과해야 한다.",
      "DGX-02가 offline이면 로컬 outbox와 mock/local model 흐름만 활성화한다.",
      "터미널 실행은 approval state가 붙기 전까지 UI slot으로만 표시한다.",
    ],
    filesToInspect: [
      "apps/desktop/src/App.tsx",
      "apps/desktop/src/runtime/stage2Runtime.ts",
      "packages/protocol/src/index.ts",
      "packages/providers/src/index.ts",
    ],
    implementationPlan: [
      "Conversation 메시지를 redacted EventEnvelope로 append한다.",
      "현재 대화에서 CodingPacket을 재생성한다.",
      "Obsidian Markdown projection을 Event Store에서 파생한다.",
      "다음 단계에서 provider adapter discovery와 로컬 SQLite outbox를 연결한다.",
    ],
    verificationPlan: [
      "corepack pnpm --filter @ai-orchestrator/desktop typecheck",
      "corepack pnpm test",
      "브라우저에서 패킷 생성과 백업 projection 이벤트 표시 확인",
    ],
    reviewerNotes: [
      "Stage2는 실제 비밀키 저장소나 모델 호출을 만들지 않는다.",
      "Event Store authority는 DGX-02로 유지하고 MacBook/Home PC는 client replica 전제로 둔다.",
    ],
  };
}

export function renderObsidianMarkdown({
  messages,
  packet,
  events,
  createdAt = new Date().toISOString(),
}: ObsidianProjectionInput): string {
  const safeMessages = redactForEventStore(messages) as ConversationMessage[];
  const safePacket = redactForEventStore(packet) as CodingPacket;

  return [
    "---",
    "type: ai-orchestrator-session",
    `session: ${sessionId}`,
    `created: ${createdAt}`,
    "source: event-store-projection",
    "---",
    "",
    "# AI Orchestrator Session",
    "",
    "## Goal",
    safePacket.goal,
    "",
    "## Decisions",
    formatList(safePacket.decisions),
    "",
    "## Constraints",
    formatList(safePacket.constraints),
    "",
    "## Conversation",
    ...safeMessages.map((message) => `- **${message.role}**: ${message.content}`),
    "",
    "## Recent Events",
    ...events.slice(0, 10).map((event) => `- ${event.createdAt} :: ${event.type}`),
    "",
  ].join("\n");
}

export class InMemoryEventStore implements EventStore {
  private readonly events: EventEnvelope[] = [];

  async append<T>(event: EventEnvelope<T>, options?: EventStoreAppendOptions): Promise<EventEnvelope<T>> {
    const eventToPersist = options?.redactBeforePersist
      ? ({
          ...event,
          payload: redactForEventStore(event.payload) as T,
          redacted: true,
        } satisfies EventEnvelope<T>)
      : event;

    this.events.unshift(eventToPersist);
    return eventToPersist;
  }

  async listBySession(targetSessionId: string): Promise<EventEnvelope[]> {
    return this.events.filter((event) => event.sessionId === targetSessionId);
  }

  async getEvent(eventId: string): Promise<EventEnvelope | undefined> {
    return this.events.find((event) => event.id === eventId);
  }

  async markRedacted(eventId: string, _reason: string): Promise<void> {
    const index = this.events.findIndex((event) => event.id === eventId);
    if (index < 0) {
      return;
    }

    const existingEvent = this.events[index];
    if (!existingEvent) {
      return;
    }

    this.events[index] = {
      ...existingEvent,
      payload: redactForEventStore(existingEvent.payload),
      redacted: true,
    };
  }
}

function redactString(value: string): string {
  return redactionRules.reduce(
    (current, rule) => current.replace(rule.pattern, rule.replacement),
    value,
  );
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- ${item}`).join("\n");
}
