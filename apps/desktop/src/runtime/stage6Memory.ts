import type {
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryLayer,
  MemoryRecord,
  MemoryTrace,
  ProviderProfile,
  RecallResult,
  Reflection,
  SourceTrust,
} from "@ai-orchestrator/protocol";

export type Stage6MemoryInspector = {
  trace: MemoryTrace;
  records: MemoryRecord[];
  reflection: Reflection;
  layerCounts: Array<{
    layer: MemoryLayer;
    count: number;
  }>;
  trustCounts: Record<SourceTrust, number>;
  pinnedCount: number;
  blockedCount: number;
  eventProjection: {
    recentEventIds: string[];
    pendingWrites: number;
    conflictCount: number;
  };
};

export type Stage6MemorySnapshotInput = {
  records: MemoryRecord[];
  messages: ConversationMessage[];
  packet: CodingPacket;
  events: EventEnvelope[];
  provider?: ProviderProfile;
  sessionId?: string;
  createdAt?: string;
};

export type Stage6RememberInput = {
  messages: ConversationMessage[];
  packet: CodingPacket;
  provider?: ProviderProfile;
  createdAt?: string;
};

const sessionId = "session_desktop_001";
const layers: MemoryLayer[] = ["fragment", "episode", "reflection", "project_memory", "user_memory"];
const trustLevels: SourceTrust[] = ["trusted", "limited", "untrusted"];
const blockedAutoRecallLayers: MemoryLayer[] = ["project_memory", "user_memory"];

export function createSeedMemoryRecords(createdAt: string): MemoryRecord[] {
  return [
    {
      id: "memory_seed_event_store",
      layer: "project_memory",
      title: "Event Store first",
      content: "세션 로그, 토론, 코딩 패킷, 실행 기록, 백업은 Event Store를 원본으로 두고 projection으로 내보낸다.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      createdAt,
      pinned: true,
    },
    {
      id: "memory_seed_dgx",
      layer: "project_memory",
      title: "DGX-02 authority",
      content: "DGX-02는 메인 서버이며 MacBook과 Home PC는 로컬 SQLite outbox를 통해 복구 시 동기화한다.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      createdAt,
      pinned: true,
    },
    {
      id: "memory_seed_proxy",
      layer: "reflection",
      title: "Untrusted provider guard",
      content: "리셀러나 custom base URL은 장기 User/Project Memory 자동 전달을 막고, 필요한 selected memory만 승인 후 전달한다.",
      sourceChannel: "agent",
      trustLevel: "trusted",
      createdAt,
      pinned: false,
    },
    {
      id: "memory_seed_telegram",
      layer: "fragment",
      title: "Telegram ingress quarantine",
      content: "Telegram에서 들어온 명령은 위험 작업 전에 승인을 요구하고 memory candidate는 untrusted로 격리한다.",
      sourceChannel: "telegram",
      trustLevel: "untrusted",
      createdAt,
      pinned: false,
    },
  ];
}

export function createStage6MemoryInspector({
  records,
  messages,
  packet,
  events,
  provider,
  sessionId: targetSessionId = sessionId,
  createdAt = new Date().toISOString(),
}: Stage6MemorySnapshotInput): Stage6MemoryInspector {
  const activeRecords = records.filter((record) => !record.tombstonedAt);
  const query = createRecallQuery(messages, packet);
  const policy = createRecallPolicy(provider);
  const results = recallMemory(activeRecords, query, policy.blockedLayers, policy.autoRecallAllowed);
  const reflection = createReflection(packet, results, createdAt);
  const blockedCount = results.filter((result) => !result.usedInDecision).length;

  return {
    trace: {
      id: `memory_trace_${stableId(query, createdAt)}`,
      sessionId: targetSessionId,
      query,
      results,
      policy,
      createdAt,
    },
    records: activeRecords,
    reflection,
    layerCounts: layers.map((layer) => ({
      layer,
      count: activeRecords.filter((record) => record.layer === layer).length,
    })),
    trustCounts: trustLevels.reduce(
      (counts, trustLevel) => ({
        ...counts,
        [trustLevel]: activeRecords.filter((record) => record.trustLevel === trustLevel).length,
      }),
      { trusted: 0, limited: 0, untrusted: 0 } satisfies Record<SourceTrust, number>,
    ),
    pinnedCount: activeRecords.filter((record) => record.pinned).length,
    blockedCount,
    eventProjection: {
      recentEventIds: events.slice(0, 6).map((event) => event.id),
      pendingWrites: events.filter((event) => event.type.includes("memory") || event.type.includes("backup")).length,
      conflictCount: activeRecords.filter((record) => record.trustLevel === "untrusted" && record.pinned).length,
    },
  };
}

export function rememberStage6Context({
  messages,
  packet,
  provider,
  createdAt = new Date().toISOString(),
}: Stage6RememberInput): MemoryRecord[] {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const trustLevel = provider?.trustLevel ?? "limited";
  const sourceChannel = "desktop";
  const seed = stableId(`${packet.goal}:${lastUserMessage?.content ?? ""}`, createdAt);

  return [
    {
      id: `memory_episode_${seed}`,
      layer: "episode",
      title: "Conversation work session",
      content: lastUserMessage?.content ?? packet.goal,
      sourceChannel,
      trustLevel,
      createdAt,
      pinned: false,
    },
    {
      id: `memory_reflection_${seed}`,
      layer: "reflection",
      title: "Coding handoff reflection",
      content: `${packet.decisions[0] ?? packet.goal} / 검증: ${packet.verificationPlan[0] ?? "pending"}`,
      sourceChannel: "agent",
      trustLevel: trustLevel === "untrusted" ? "limited" : trustLevel,
      createdAt,
      pinned: false,
    },
  ];
}

export function pinMemoryRecord(records: MemoryRecord[], recordId: string): MemoryRecord[] {
  return records.map((record) => (record.id === recordId ? { ...record, pinned: true } : record));
}

export function forgetMemoryRecord(
  records: MemoryRecord[],
  recordId: string,
  tombstonedAt = new Date().toISOString(),
): MemoryRecord[] {
  return records.map((record) => (record.id === recordId ? { ...record, tombstonedAt } : record));
}

function createRecallPolicy(provider?: ProviderProfile): MemoryTrace["policy"] {
  if (provider?.trustLevel === "untrusted") {
    return {
      providerProfileId: provider.id,
      providerTrustLevel: "untrusted",
      autoRecallAllowed: false,
      blockedLayers: blockedAutoRecallLayers,
      reason: "untrusted provider: project/user memory requires explicit selection",
    };
  }

  return {
    providerProfileId: provider?.id,
    providerTrustLevel: provider?.trustLevel ?? "limited",
    autoRecallAllowed: true,
    blockedLayers: [],
    reason: provider ? "provider trust allows automatic recall trace" : "provider pending: limited recall preview",
  };
}

function recallMemory(
  records: MemoryRecord[],
  query: string,
  blockedLayers: MemoryLayer[],
  autoRecallAllowed: boolean,
): RecallResult[] {
  return records
    .map((record) => {
      const score = scoreRecord(record, query);
      const blockedByLayer = blockedLayers.includes(record.layer);
      const blockedByTrust = record.trustLevel === "untrusted" && !record.pinned;
      const usedInDecision = autoRecallAllowed && !blockedByLayer && !blockedByTrust && score >= 0.18;
      return {
        record,
        score,
        usedInDecision,
        reason: usedInDecision
          ? "query overlap and trust policy passed"
          : blockedByLayer
            ? "blocked by provider trust policy"
            : blockedByTrust
              ? "untrusted memory is quarantined until pinned"
              : "low query overlap",
      };
    })
    .filter((result) => result.score > 0.05 || result.record.pinned)
    .sort((left, right) => Number(right.record.pinned) - Number(left.record.pinned) || right.score - left.score)
    .slice(0, 6);
}

function createRecallQuery(messages: ConversationMessage[], packet: CodingPacket): string {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return [packet.goal, packet.decisions.join(" "), packet.constraints.join(" "), lastUserMessage].join(" ");
}

function scoreRecord(record: MemoryRecord, query: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return record.pinned ? 0.4 : 0.1;
  }

  const haystack = tokenize(`${record.title} ${record.content} ${record.layer}`);
  const overlap = terms.filter((term) => haystack.includes(term)).length;
  const trustBoost = record.trustLevel === "trusted" ? 0.18 : record.trustLevel === "limited" ? 0.08 : 0;
  const pinBoost = record.pinned ? 0.2 : 0;
  return Math.min(overlap / Math.max(terms.length, 1) + trustBoost + pinBoost, 0.99);
}

function createReflection(packet: CodingPacket, results: RecallResult[], createdAt: string): Reflection {
  return {
    sessionId,
    summary: `${packet.goal} 작업에 ${results.length}개 기억 후보를 대조했다.`,
    decisions: results.filter((result) => result.usedInDecision).map((result) => result.record.title).slice(0, 4),
    risks: results.filter((result) => !result.usedInDecision).map((result) => result.reason).slice(0, 4),
    createdAt,
  };
}

function tokenize(value: string): string[] {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9가-힣-]{2,}/g) ?? []));
}

function stableId(value: string, salt: string) {
  let hash = 0;
  for (const char of `${value}:${salt}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
