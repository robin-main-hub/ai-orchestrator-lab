import type { ConversationMessage, EventEnvelope, EventSyncPullResponse } from "@ai-orchestrator/protocol";
import { DEFAULT_DGX_SERVER_BASE_URL } from "./stage30DgxEndpoints";

export type Stage18EventReplayStatus = "restored" | "empty" | "failed";

export type Stage18EventReplayInput = {
  sessionId?: string;
  afterRevision?: number;
  serverBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type Stage18EventReplayResult = {
  status: Stage18EventReplayStatus;
  events: EventEnvelope[];
  messages: ConversationMessage[];
  serverRevision?: number;
  importedCount: number;
  createdAt?: string;
  error?: string;
};

type ConversationMessageCreatedPayload = {
  messageId?: string;
  role?: ConversationMessage["role"];
  content?: string;
  metadata?: Record<string, unknown>;
  agentName?: string;
  providerProfileId?: string;
  channel?: string;
  ingressEventId?: string;
  sourceTrust?: string;
};

const DEFAULT_DGX_EVENT_REPLAY_BASE_URL = DEFAULT_DGX_SERVER_BASE_URL;

export async function pullAndReplayDgxEventStorage({
  sessionId = "session_desktop_001",
  afterRevision,
  serverBaseUrl = DEFAULT_DGX_EVENT_REPLAY_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 1_500,
}: Stage18EventReplayInput = {}): Promise<Stage18EventReplayResult> {
  const endpoint = new URL(`${serverBaseUrl.replace(/\/$/, "")}/events`);
  endpoint.searchParams.set("sessionId", sessionId);
  if (typeof afterRevision === "number") {
    endpoint.searchParams.set("afterRevision", String(afterRevision));
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, endpoint.toString(), timeoutMs);
    const rawText = await response.text();

    if (!response.ok) {
      throw new Error(`DGX-02 Event Storage replay failed: ${response.status} ${rawText.slice(0, 240)}`);
    }

    const pullResponse = JSON.parse(rawText) as EventSyncPullResponse;
    const events = sortEventsOldestFirst(pullResponse.events ?? []);
    const messages = rebuildConversationMessagesFromEvents(events);

    return {
      status: events.length === 0 ? "empty" : "restored",
      events,
      messages,
      serverRevision: pullResponse.serverRevision,
      importedCount: events.length,
      createdAt: pullResponse.createdAt,
    };
  } catch (error) {
    return {
      status: "failed",
      events: [],
      messages: [],
      importedCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function rebuildConversationMessagesFromEvents(events: EventEnvelope[]): ConversationMessage[] {
  return sortEventsOldestFirst(events)
    .filter((event) => event.type === "conversation.message.created")
    .map((event) => toConversationMessage(event))
    .filter((message): message is ConversationMessage => Boolean(message));
}

export function mergeConversationMessages(
  currentMessages: ConversationMessage[],
  replayedMessages: ConversationMessage[],
): ConversationMessage[] {
  const byId = new Map<string, ConversationMessage>();
  for (const message of [...currentMessages, ...replayedMessages]) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function mergeEventReplayLogs(
  currentEvents: EventEnvelope[],
  replayedEvents: EventEnvelope[],
  limit = 96,
): EventEnvelope[] {
  const byId = new Map<string, EventEnvelope>();
  for (const event of [...currentEvents, ...replayedEvents]) {
    byId.set(event.id, event);
  }

  return [...byId.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

function toConversationMessage(event: EventEnvelope): ConversationMessage | undefined {
  const payload = asConversationPayload(event.payload);
  if (!payload?.messageId || !payload.role || typeof payload.content !== "string") {
    return undefined;
  }

  return {
    id: payload.messageId,
    sessionId: event.sessionId,
    role: payload.role,
    content: payload.content,
    createdAt: event.createdAt,
    metadata: {
      ...(payload.metadata ?? {}),
      agentName: payload.agentName,
      providerProfileId: payload.providerProfileId,
      channel: payload.channel,
      ingressEventId: payload.ingressEventId,
      sourceTrust: payload.sourceTrust ?? event.sourceTrust,
      replayedFromEventId: event.id,
    },
  };
}

function asConversationPayload(value: unknown): ConversationMessageCreatedPayload | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const payload = value as ConversationMessageCreatedPayload;
  if (payload.role && !["user", "assistant", "system", "tool"].includes(payload.role)) {
    return undefined;
  }

  return payload;
}

function sortEventsOldestFirst(events: EventEnvelope[]) {
  return [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      method: "GET",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
