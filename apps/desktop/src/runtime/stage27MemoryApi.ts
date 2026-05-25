import type {
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryAPI,
  MemoryInput,
  MemoryRecord,
  ProviderProfile,
  RecallQuery,
  Reflection,
} from "@ai-orchestrator/protocol";
import type {
  MemoryAdapter,
  MemoryAdapterContext,
  MemoryAdapterKind,
} from "@ai-orchestrator/memory";
import {
  activateMemoryRecord,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
} from "./stage6Memory";

export type LocalMementoMemoryApi = MemoryAPI & {
  snapshot(): MemoryRecord[];
};

export type AdapterBackedMementoMemoryApi = MemoryAPI & {
  adapterKind: MemoryAdapterKind;
  adapterProfileId: string;
};

export type LocalMementoMemoryApiOptions = {
  records: MemoryRecord[];
  provider?: ProviderProfile;
  events?: EventEnvelope[];
  createdAt?: string;
};

export type AdapterBackedMementoMemoryApiOptions = {
  adapter: MemoryAdapter;
  context?: Partial<MemoryAdapterContext>;
  createdAt?: string;
};

const defaultSessionId = "session_desktop_001";
const defaultProjectId = "project_ai_orchestrator_lab";

export function createLocalMementoMemoryApi({
  records,
  provider,
  events = [],
  createdAt = new Date().toISOString(),
}: LocalMementoMemoryApiOptions): LocalMementoMemoryApi {
  let memoryRecords = [...records];

  function createInspector(query: RecallQuery) {
    const sessionId = query.sessionId ?? defaultSessionId;
    const filteredRecords = memoryRecords
      .filter((record) => !record.tombstonedAt)
      .filter((record) => (query.layers ? query.layers.includes(record.layer) : true))
      .filter((record) => (query.scopes ? query.scopes.includes(record.scope ?? inferScope(record)) : true))
      .filter((record) => (query.kinds ? query.kinds.includes(record.kind ?? "context") : true))
      .filter((record) => (query.includeUntrusted ? true : record.trustLevel !== "untrusted"));

    return createStage6MemoryInspector({
      records: filteredRecords,
      messages: [createQueryMessage(query.query, sessionId, createdAt)],
      packet: createQueryPacket(query.query),
      events,
      provider,
      sessionId,
      projectId: query.projectId ?? defaultProjectId,
      createdAt,
    });
  }

  return {
    async recall(query) {
      const inspector = createInspector(query);
      return inspector.trace.results.slice(0, query.limit ?? inspector.trace.results.length);
    },
    async remember(input) {
      const record: MemoryRecord = {
        id: `memory_api_${stableId(`${input.title}:${input.content}`, createdAt)}`,
        layer: input.layer,
        scope: input.scope ?? inferScope({ layer: input.layer } as MemoryRecord),
        kind: input.kind ?? "context",
        title: input.title,
        content: input.content,
        sourceChannel: input.sourceChannel,
        trustLevel: input.trustLevel,
        projectId: input.projectId ?? defaultProjectId,
        sessionId: input.sessionId,
        tags: input.tags ?? [],
        activationState: input.trustLevel === "untrusted" ? "quarantined" : "suggested",
        createdAt,
        pinned: false,
      };
      memoryRecords = [record, ...memoryRecords.filter((candidate) => candidate.id !== record.id)];
      return record;
    },
    async reflect(sessionId) {
      return createInspector({ sessionId, query: sessionId }).reflection;
    },
    async memoryContext(query) {
      return createInspector(query).contextPacket;
    },
    async stats() {
      return createInspector({ query: "memory stats", includeUntrusted: true }).stats;
    },
    async createRelations(recordIds) {
      const inspector = createInspector({ query: recordIds.join(" "), includeUntrusted: true });
      return inspector.relations.filter(
        (relation) => recordIds.includes(relation.fromRecordId) || recordIds.includes(relation.toRecordId),
      );
    },
    async activateMemories(recordIds) {
      memoryRecords = recordIds.reduce(
        (nextRecords, recordId) => activateMemoryRecord(nextRecords, recordId, createdAt),
        memoryRecords,
      );
    },
    async pin(recordId) {
      memoryRecords = pinMemoryRecord(memoryRecords, recordId, createdAt);
    },
    async forget(recordId) {
      memoryRecords = forgetMemoryRecord(memoryRecords, recordId, createdAt);
    },
    snapshot() {
      return [...memoryRecords];
    },
  };
}

export function createAdapterBackedMementoMemoryApi({
  adapter,
  context = {},
  createdAt = new Date().toISOString(),
}: AdapterBackedMementoMemoryApiOptions): AdapterBackedMementoMemoryApi {
  function createContext(): MemoryAdapterContext {
    return {
      permissionDecision: "allow",
      callerTrustLevel: "trusted",
      now: () => createdAt,
      ...context,
    };
  }

  return {
    adapterKind: adapter.kind,
    adapterProfileId: adapter.profileId,
    recall(query) {
      return adapter.recall(query, createContext());
    },
    remember(input) {
      return adapter.remember(input, createContext());
    },
    reflect(sessionId) {
      if (adapter.reflect) {
        return adapter.reflect(sessionId, createContext());
      }
      return Promise.resolve({
        sessionId,
        summary: `${adapter.profileId} does not expose reflect(); using adapter-backed Memento fallback.`,
        decisions: [],
        risks: [],
        createdAt,
      } satisfies Reflection);
    },
    memoryContext(query) {
      return adapter.memoryContext(query, createContext());
    },
    stats() {
      return adapter.stats(createContext());
    },
    createRelations(recordIds) {
      return adapter.createRelations(recordIds, createContext());
    },
    activateMemories(recordIds) {
      return adapter.activateMemories(recordIds, createContext());
    },
    pin(recordId) {
      return adapter.pin(recordId, createContext());
    },
    forget(recordId) {
      return adapter.forget(recordId, createContext());
    },
  };
}

function createQueryMessage(query: string, sessionId: string, createdAt: string): ConversationMessage {
  return {
    id: `memory_api_query_${stableId(query, createdAt)}`,
    sessionId,
    role: "user",
    content: query,
    createdAt,
  };
}

function createQueryPacket(query: string): CodingPacket {
  return {
    goal: query,
    context: [],
    decisions: [],
    rejectedOptions: [],
    constraints: [],
    filesToInspect: [],
    implementationPlan: [],
    verificationPlan: [],
    reviewerNotes: [],
  };
}

function inferScope(record: Pick<MemoryRecord, "layer">): NonNullable<MemoryRecord["scope"]> {
  if (record.layer === "user_memory") {
    return "global";
  }
  if (record.layer === "episode" || record.layer === "fragment") {
    return "session";
  }
  return "project";
}

function stableId(value: string, salt: string) {
  let hash = 0;
  for (const char of `${value}:${salt}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
