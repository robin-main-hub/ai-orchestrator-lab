import type {
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryContextPacket,
  MemoryKind,
  MemoryLayer,
  MemoryRecord,
  MemoryReflectionIssue,
  MemoryRelation,
  MemoryScope,
  MemoryStats,
  MemoryTrace,
  ProviderProfile,
  RecallResult,
  Reflection,
  SourceTrust,
} from "@ai-orchestrator/protocol";
import { lexicalView, metadataView, rrfFuse, semanticView } from "./memoryViews";

export type Stage6MemoryInspector = {
  trace: MemoryTrace;
  records: MemoryRecord[];
  reflection: Reflection;
  contextPacket: MemoryContextPacket;
  relations: MemoryRelation[];
  issues: MemoryReflectionIssue[];
  stats: MemoryStats;
  layerCounts: Array<{
    layer: MemoryLayer;
    count: number;
  }>;
  scopeCounts: Array<{
    scope: MemoryScope;
    count: number;
  }>;
  kindCounts: Array<{
    kind: MemoryKind;
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
  projectId?: string;
  createdAt?: string;
};

export type Stage6RememberInput = {
  messages: ConversationMessage[];
  packet: CodingPacket;
  provider?: ProviderProfile;
  sessionId?: string;
  projectId?: string;
  createdAt?: string;
};

const defaultSessionId = "session_desktop_001";
const defaultProjectId = "project_ai_orchestrator_lab";
const layers: MemoryLayer[] = ["fragment", "episode", "reflection", "project_memory", "user_memory"];
const scopes: MemoryScope[] = ["global", "project", "session"];
const kinds: MemoryKind[] = [
  "preference",
  "architecture",
  "pattern",
  "decision",
  "context",
  "workflow",
  "relationship",
  "learning",
];
const trustLevels: SourceTrust[] = ["trusted", "limited", "untrusted"];
const blockedAutoRecallLayers: MemoryLayer[] = ["project_memory", "user_memory"];
const evolveMementoLexicalTopK = 10;
const evolveMementoSemanticTopK = 10;
const evolveMementoMetadataTopK = 10;
const evolveMementoContextBudget = 8;
const defaultImportance = 0.5;
const importanceDecayStep = 0.01;
const entityReinforcementStep = 0.1;
const entityReinforcementCap = 5;

export function createSeedMemoryRecords(createdAt: string): MemoryRecord[] {
  return [
    {
      id: "memory_seed_event_storage",
      layer: "project_memory",
      scope: "project",
      kind: "architecture",
      title: "Event Storage first",
      content:
        "Session logs, debates, coding packets, run artifacts, backup projections, and memory traces must be recorded through Event Storage before export.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["event-storage", "source-of-truth", "backup"],
      activationState: "active",
      createdAt,
      lastAccessedAt: createdAt,
      losslessRestatement:
        "AI Orchestrator Lab records session logs, debates, coding packets, run artifacts, backup projections, and memory traces through Event Storage before export.",
      keywords: ["event", "storage", "session", "debate", "coding", "backup", "memory"],
      entities: ["AI Orchestrator Lab", "Event Storage", "Coding Packet"],
      persons: [],
      topic: "Event Storage as primary recording path",
      importance: 0.7,
      entityReinforcement: 0,
      pinned: true,
    },
    {
      id: "memory_seed_dgx02_authority",
      layer: "project_memory",
      scope: "project",
      kind: "architecture",
      title: "DGX-02 authority server",
      content:
        "DGX-02 is the authoritative server for Event Store, MemoryRecord, WorkItem, approvals, drafts, and continuity storage. MacBook is the primary work client with a local cache/outbox for offline work, and syncs back to DGX-02 when online.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["dgx-02", "authority", "sync", "fallback"],
      activationState: "active",
      createdAt,
      lastAccessedAt: createdAt,
      losslessRestatement:
        "DGX-02 is the authoritative server for Event Store, MemoryRecord, WorkItem, approvals, drafts, and continuity storage, while MacBook works as a client cache and outbox.",
      keywords: ["dgx-02", "authority", "server", "sync", "macbook", "outbox", "continuity"],
      entities: ["DGX-02", "MacBook", "Event Store", "MemoryRecord", "WorkItem"],
      persons: [],
      topic: "DGX-02 authority and MacBook client cache",
      importance: 0.7,
      entityReinforcement: 0,
      pinned: true,
    },
    {
      id: "memory_seed_untrusted_provider_guard",
      layer: "reflection",
      scope: "project",
      kind: "decision",
      title: "Untrusted provider guard",
      content:
        "Reseller or custom base URL providers must not receive automatic project or user memory. Only explicitly activated memories may be sent.",
      sourceChannel: "agent",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["provider", "redaction", "trust-policy"],
      activationState: "suggested",
      createdAt,
      losslessRestatement:
        "AI Orchestrator Lab blocks reseller and custom base URL providers from automatic project or user memory unless the memory is explicitly activated.",
      keywords: ["provider", "reseller", "redaction", "trust", "memory", "activation"],
      entities: ["AI Orchestrator Lab", "Provider Profile", "MemoryRecord"],
      persons: [],
      topic: "Untrusted provider memory guard",
      importance: 0.5,
      entityReinforcement: 0,
      pinned: false,
    },
    {
      id: "memory_seed_telegram_quarantine",
      layer: "fragment",
      scope: "session",
      kind: "workflow",
      title: "Telegram input quarantine",
      content:
        "Commands from Telegram are untrusted by default. File writes, terminal runs, remote commands, and secret access require approval before execution or memory promotion.",
      sourceChannel: "legacy_telegram",
      trustLevel: "untrusted",
      sessionId: defaultSessionId,
      tags: ["telegram", "approval", "ingress"],
      activationState: "quarantined",
      createdAt,
      losslessRestatement:
        "Telegram commands enter AI Orchestrator Lab as untrusted input and require approval before file writes, terminal runs, remote commands, secret access, or memory promotion.",
      keywords: ["telegram", "approval", "ingress", "quarantine", "terminal", "secret"],
      entities: ["Telegram", "AI Orchestrator Lab", "Permission Matrix"],
      persons: [],
      topic: "Telegram input quarantine",
      importance: 0.5,
      entityReinforcement: 0,
      pinned: false,
    },
    {
      id: "memory_seed_memento_shape",
      layer: "project_memory",
      scope: "project",
      kind: "pattern",
      title: "Memento MCP shape",
      content:
        "Memento needs remember, recall, memory_context, reflect, stats, relation creation, and activation. Records should carry scope, kind, source trust, and trace metadata.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["memento", "memory-context", "relations", "activation"],
      activationState: "suggested",
      createdAt,
      losslessRestatement:
        "EvolveMemento keeps remember, recall, memory_context, reflect, stats, relation creation, and activation as explicit memory operations with scope, kind, source trust, and trace metadata.",
      keywords: ["evolvememento", "memento", "recall", "memory_context", "relations", "activation"],
      entities: ["EvolveMemento", "MemoryAPI", "MemoryContextPacket"],
      persons: [],
      topic: "EvolveMemento API shape",
      importance: 0.7,
      entityReinforcement: 0,
      pinned: true,
    },
  ];
}

export function createStage6MemoryInspector({
  records,
  messages,
  packet,
  events,
  provider,
  sessionId: targetSessionId = defaultSessionId,
  projectId = defaultProjectId,
  createdAt = new Date().toISOString(),
}: Stage6MemorySnapshotInput): Stage6MemoryInspector {
  const query = createRecallQuery(messages, packet);
  const activeRecordsBeforeRecall = records.filter((record) => !record.tombstonedAt);
  const extracted = extractRecallMetadata(query, activeRecordsBeforeRecall);
  const activeRecords = reconcileEvolveMementoRecords(activeRecordsBeforeRecall, extracted);
  const policy = createRecallPolicy(provider);
  const relations = createMemoryRelations(activeRecords, createdAt);
  const recall = recallMemory(activeRecords, query, policy, relations, extracted);
  const results = recall.results;
  appendEvolveMementoRecallLog({
    sessionId: targetSessionId,
    query,
    extracted,
    lexicalSize: recall.viewSizes.lexical,
    semanticSize: recall.viewSizes.semantic,
    metadataSize: recall.viewSizes.metadata,
    results,
    policy,
    createdAt,
  });
  const contextPacket = createMemoryContextPacket({
    sessionId: targetSessionId,
    query,
    results,
    relations,
    createdAt,
  });
  const reflection = createReflection(packet, results, createdAt, targetSessionId);
  const issues = createReflectionIssues(activeRecords, relations, createdAt);
  const stats = createMemoryStats(activeRecords, relations, issues);
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
    contextPacket,
    relations,
    issues,
    stats,
    layerCounts: layers.map((layer) => ({
      layer,
      count: activeRecords.filter((record) => record.layer === layer).length,
    })),
    scopeCounts: scopes.map((scope) => ({
      scope,
      count: activeRecords.filter((record) => (record.scope ?? inferScope(record)) === scope).length,
    })),
    kindCounts: kinds.map((kind) => ({
      kind,
      count: activeRecords.filter((record) => record.kind === kind).length,
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
      conflictCount: issues.filter((issue) => issue.kind === "contradiction" || issue.severity === "high").length,
    },
  };
}

export function rememberStage6Context({
  messages,
  packet,
  provider,
  sessionId = defaultSessionId,
  projectId = defaultProjectId,
  createdAt = new Date().toISOString(),
}: Stage6RememberInput): MemoryRecord[] {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const trustLevel = provider?.trustLevel ?? "limited";
  const seed = stableId(`${packet.goal}:${lastUserMessage?.content ?? ""}`, createdAt);

  return [
    {
      id: `memory_episode_${seed}`,
      layer: "episode",
      scope: "session",
      kind: "workflow",
      title: "Conversation work session",
      content: lastUserMessage?.content ?? packet.goal,
      sourceChannel: "desktop",
      trustLevel,
      projectId,
      sessionId,
      tags: ["conversation", "workbench"],
      activationState: "suggested",
      createdAt,
      losslessRestatement: `The user worked in a conversation session on ${createdAt} about ${lastUserMessage?.content ?? packet.goal}.`,
      keywords: extractKeywords(`${lastUserMessage?.content ?? ""} ${packet.goal} conversation workbench`),
      entities: extractInlineEntities(`${lastUserMessage?.content ?? ""} ${packet.goal}`),
      persons: extractInlinePersons(`${lastUserMessage?.content ?? ""} ${packet.goal}`),
      topic: "Conversation work session",
      importance: defaultImportance,
      entityReinforcement: 0,
      pinned: false,
    },
    {
      id: `memory_reflection_${seed}`,
      layer: "reflection",
      scope: "project",
      kind: "decision",
      title: "Coding handoff reflection",
      content: `${packet.decisions[0] ?? packet.goal} / verification: ${packet.verificationPlan[0] ?? "pending"}`,
      sourceChannel: "agent",
      trustLevel: trustLevel === "untrusted" ? "limited" : trustLevel,
      projectId,
      sessionId,
      tags: ["coding-packet", "reflection"],
      activationState: "suggested",
      createdAt,
      losslessRestatement: `The coding handoff on ${createdAt} recorded ${packet.decisions[0] ?? packet.goal} with verification ${packet.verificationPlan[0] ?? "pending"}.`,
      keywords: extractKeywords(`${packet.goal} ${packet.decisions.join(" ")} ${packet.verificationPlan.join(" ")}`),
      entities: extractInlineEntities(`${packet.goal} ${packet.decisions.join(" ")}`),
      persons: extractInlinePersons(`${packet.goal} ${packet.decisions.join(" ")}`),
      topic: "Coding handoff reflection",
      importance: defaultImportance,
      entityReinforcement: 0,
      pinned: false,
    },
  ];
}

export function pinMemoryRecord(records: MemoryRecord[], recordId: string, updatedAt = new Date().toISOString()): MemoryRecord[] {
  return records.map((record) =>
    record.id === recordId
      ? { ...record, pinned: true, activationState: "active", lastAccessedAt: updatedAt, updatedAt }
      : record,
  );
}

export function activateMemoryRecord(
  records: MemoryRecord[],
  recordId: string,
  updatedAt = new Date().toISOString(),
): MemoryRecord[] {
  return records.map((record) =>
    record.id === recordId ? { ...record, activationState: "active", lastAccessedAt: updatedAt, updatedAt } : record,
  );
}

export function forgetMemoryRecord(
  records: MemoryRecord[],
  recordId: string,
  tombstonedAt = new Date().toISOString(),
): MemoryRecord[] {
  return records.map((record) =>
    record.id === recordId ? { ...record, activationState: "inactive", tombstonedAt } : record,
  );
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
  policy: MemoryTrace["policy"],
  relations: MemoryRelation[],
  extracted: { persons: string[]; entities: string[] },
): { results: RecallResult[]; viewSizes: { lexical: number; semantic: number; metadata: number } } {
  const lexicalResults = lexicalView(query, records, evolveMementoLexicalTopK);
  const semanticResults = semanticView(query, records, evolveMementoSemanticTopK);
  const metadataResults = metadataView(query, records, evolveMementoMetadataTopK, extracted);
  const fusedResults = rrfFuse([lexicalResults, semanticResults, metadataResults]).slice(0, evolveMementoContextBudget);
  const fusedByRecord = new Map(fusedResults.map((result) => [result.recordId, result]));
  const relatedRecords = new Set(fusedResults.map((result) => result.recordId));

  for (const record of records) {
    if (record.pinned || record.activationState === "active") {
      relatedRecords.add(record.id);
    }
  }

  const results = [...relatedRecords]
    .map((recordId) => {
      const record = records.find((candidate) => candidate.id === recordId);
      if (!record) {
        return undefined;
      }
      const fusion = fusedByRecord.get(record.id);
      const fusedScore = fusion?.fusedScore ?? 0;
      const score = scoreRecord(record, relations, fusedScore);
      const blockedByLayer = policy.blockedLayers.includes(record.layer);
      const explicitlyActivated = record.pinned || record.activationState === "active";
      const blockedByTrust = record.trustLevel === "untrusted" && !explicitlyActivated;
      const usedInDecision = policy.autoRecallAllowed && !blockedByLayer && !blockedByTrust && (score >= 0.18 || explicitlyActivated);
      const activationState: NonNullable<RecallResult["activationState"]> = usedInDecision
        ? "active"
        : blockedByTrust
          ? "quarantined"
          : score >= 0.18
            ? "suggested"
            : "inactive";

      const result: RecallResult = {
        record,
        score,
        fusionDetail: fusion
          ? {
              views: fusion.viewBreakdown.map((view) => ({
                view: view.view,
                rank: view.rank,
                rawScore: view.rawScore,
              })),
              fusionMode: "rrf" as const,
            }
          : undefined,
        usedInDecision,
        activationState,
        reason: usedInDecision
          ? "query overlap and trust policy passed"
          : blockedByLayer
            ? "blocked by provider trust policy"
            : blockedByTrust
              ? "untrusted memory is quarantined until pinned"
              : "low query overlap",
      };
      return result;
    })
    .filter((result): result is RecallResult => Boolean(result))
    .filter((result) => result.score > 0.05 || result.record.pinned || result.record.activationState === "active")
    .sort(
      (left, right) =>
        Number(right.record.activationState === "active") - Number(left.record.activationState === "active") ||
        Number(right.record.pinned) - Number(left.record.pinned) ||
        right.score - left.score,
    )
    .slice(0, evolveMementoContextBudget);

  return {
    results,
    viewSizes: {
      lexical: lexicalResults.length,
      semantic: semanticResults.length,
      metadata: metadataResults.length,
    },
  };
}

function createRecallQuery(messages: ConversationMessage[], packet: CodingPacket): string {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return [packet.goal, packet.decisions.join(" "), packet.constraints.join(" "), lastUserMessage].join(" ");
}

function createMemoryContextPacket({
  sessionId,
  query,
  results,
  relations,
  createdAt,
}: {
  sessionId: string;
  query: string;
  results: RecallResult[];
  relations: MemoryRelation[];
  createdAt: string;
}): MemoryContextPacket {
  const activeRecordIds = results.filter((result) => result.usedInDecision).map((result) => result.record.id);
  const blockedRecordIds = results.filter((result) => !result.usedInDecision).map((result) => result.record.id);
  const relationIds = relations
    .filter((relation) => activeRecordIds.includes(relation.fromRecordId) || activeRecordIds.includes(relation.toRecordId))
    .map((relation) => relation.id);

  return {
    id: `memory_context_${stableId(`${query}:${activeRecordIds.join(",")}`, createdAt)}`,
    sessionId,
    query,
    activeRecordIds,
    blockedRecordIds,
    relationIds,
    summary: `${activeRecordIds.length} active memories, ${blockedRecordIds.length} held back, ${relationIds.length} related links.`,
    createdAt,
  };
}

function createMemoryRelations(records: MemoryRecord[], createdAt: string): MemoryRelation[] {
  const relations: MemoryRelation[] = [];

  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex]!;
      const right = records[rightIndex]!;
      const confidence = relationConfidence(left, right);

      if (confidence < 0.22) {
        continue;
      }

      const kind = hasContradictionSignal(left, right) ? "contradicts" : left.kind === right.kind ? "supports" : "related";
      relations.push({
        id: `memory_relation_${stableId(`${left.id}:${right.id}:${kind}`, createdAt)}`,
        fromRecordId: left.id,
        toRecordId: right.id,
        kind,
        confidence: Number(confidence.toFixed(2)),
        reason: kind === "contradicts" ? "overlapping topic with opposite action language" : "shared tags, terms, scope, or kind",
        createdAt,
      });
    }
  }

  return relations.slice(0, 24);
}

function createReflectionIssues(
  records: MemoryRecord[],
  relations: MemoryRelation[],
  createdAt: string,
): MemoryReflectionIssue[] {
  const issues: MemoryReflectionIssue[] = [];
  const duplicatePairs = findDuplicatePairs(records);

  duplicatePairs.slice(0, 4).forEach(([left, right]) => {
    issues.push({
      id: `memory_issue_duplicate_${stableId(`${left.id}:${right.id}`, createdAt)}`,
      kind: "duplicate",
      recordIds: [left.id, right.id],
      severity: "medium",
      recommendation: "Merge these fragments or keep the newer one as the authoritative memory.",
    });
  });

  relations
    .filter((relation) => relation.kind === "contradicts")
    .slice(0, 4)
    .forEach((relation) => {
      issues.push({
        id: `memory_issue_contradiction_${relation.id}`,
        kind: "contradiction",
        recordIds: [relation.fromRecordId, relation.toRecordId],
        severity: "high",
        recommendation: "Review which memory should win before automatic recall uses both.",
      });
    });

  records
    .filter((record) => record.trustLevel === "untrusted" && (record.pinned || record.activationState === "active"))
    .forEach((record) => {
      issues.push({
        id: `memory_issue_untrusted_active_${record.id}`,
        kind: "untrusted_active",
        recordIds: [record.id],
        severity: "high",
        recommendation: "Demote, redact, or re-verify this memory before sending it to strong or remote models.",
      });
    });

  records
    .filter((record) => isStale(record.createdAt, createdAt))
    .slice(0, 4)
    .forEach((record) => {
      issues.push({
        id: `memory_issue_stale_${record.id}`,
        kind: "stale",
        recordIds: [record.id],
        severity: "low",
        recommendation: "Refresh this old memory or let the curator archive it.",
      });
    });

  if (records.filter((record) => record.pinned).length > 1 && relations.length === 0) {
    issues.push({
      id: `memory_issue_missing_relation_${stableId(records.map((record) => record.id).join(","), createdAt)}`,
      kind: "missing_relation",
      recordIds: records.filter((record) => record.pinned).map((record) => record.id),
      severity: "low",
      recommendation: "Pinned memories should be linked so the context packet can restore the project map.",
    });
  }

  return issues.slice(0, 10);
}

function createMemoryStats(
  records: MemoryRecord[],
  relations: MemoryRelation[],
  issues: MemoryReflectionIssue[],
): MemoryStats {
  const duplicateCandidates = issues.filter((issue) => issue.kind === "duplicate").length;
  const contradictionCandidates = issues.filter((issue) => issue.kind === "contradiction").length;
  const staleCandidates = issues.filter((issue) => issue.kind === "stale").length;
  const quarantinedRecords = records.filter(
    (record) => record.trustLevel === "untrusted" || record.activationState === "quarantined",
  ).length;
  const health =
    contradictionCandidates > 0 || issues.some((issue) => issue.severity === "high")
      ? "needs_review"
      : duplicateCandidates > 1 || staleCandidates > 0
        ? "watch"
        : "good";

  return {
    totalRecords: records.length,
    activeRecords: records.filter((record) => record.activationState === "active" || record.pinned).length,
    pinnedRecords: records.filter((record) => record.pinned).length,
    quarantinedRecords,
    relationCount: relations.length,
    duplicateCandidates,
    contradictionCandidates,
    staleCandidates,
    health,
  };
}

function createReflection(
  packet: CodingPacket,
  results: RecallResult[],
  createdAt: string,
  targetSessionId: string,
): Reflection {
  return {
    sessionId: targetSessionId,
    summary: `${packet.goal} checked ${results.length} memory fragments before handoff.`,
    decisions: results.filter((result) => result.usedInDecision).map((result) => result.record.title).slice(0, 4),
    risks: results.filter((result) => !result.usedInDecision).map((result) => result.reason).slice(0, 4),
    createdAt,
  };
}

function scoreRecord(record: MemoryRecord, relations: MemoryRelation[], fusedScore: number): number {
  const relationBoost = Math.min(
    relations.filter((relation) => relation.fromRecordId === record.id || relation.toRecordId === record.id).length * 0.04,
    0.16,
  );
  const trustBoost = record.trustLevel === "trusted" ? 0.18 : record.trustLevel === "limited" ? 0.08 : 0;
  const pinBoost = record.pinned ? 0.2 : record.activationState === "active" ? 0.14 : 0;
  const importanceBoost = 0.2 * (record.importance ?? defaultImportance);
  const reinforcementBoost = 0.1 * (record.entityReinforcement ?? 0);
  return Math.min(fusedScore + relationBoost + trustBoost + pinBoost + importanceBoost + reinforcementBoost, 0.99);
}

function reconcileEvolveMementoRecords(
  records: MemoryRecord[],
  extracted: { persons: string[]; entities: string[] },
): MemoryRecord[] {
  const queryPersons = new Set(extracted.persons.map(normalizeMetadataValue));
  const queryEntities = new Set(extracted.entities.map(normalizeMetadataValue));

  return records.map((record) => {
    const recordPersons = new Set((record.persons ?? []).map(normalizeMetadataValue));
    const recordEntities = new Set((record.entities ?? []).map(normalizeMetadataValue));
    const matchesMetadata =
      hasIntersection(queryPersons, recordPersons) || hasIntersection(queryEntities, recordEntities);
    const nextImportance = Math.max(0.1, (record.importance ?? defaultImportance) - importanceDecayStep);
    const nextReinforcement = matchesMetadata
      ? Math.min(entityReinforcementCap, (record.entityReinforcement ?? 0) + entityReinforcementStep)
      : (record.entityReinforcement ?? 0);

    return {
      ...record,
      importance: Number(nextImportance.toFixed(2)),
      entityReinforcement: Number(nextReinforcement.toFixed(2)),
    };
  });
}

function extractRecallMetadata(query: string, records: MemoryRecord[]) {
  const knownEntities = unique(records.flatMap((record) => record.entities ?? []));
  const knownPersons = unique(records.flatMap((record) => record.persons ?? []));
  const entities = unique([
    ...knownEntities.filter((entity) => includesMetadataValue(query, entity)),
    ...extractInlineEntities(query),
  ]);
  const persons = unique([
    ...knownPersons.filter((person) => includesMetadataValue(query, person)),
    ...extractInlinePersons(query),
  ]);

  return { persons, entities };
}

function extractInlineEntities(value: string): string[] {
  const entities = value.match(/\b(?:DGX-02|DGX-01|MacBook|Event Store|Event Storage|MemoryRecord|WorkItem|Telegram|Coding Packet|EvolveMemento|Memento|SimpleMem|OpenClaw)\b/gi) ?? [];
  return unique(entities.map((entity) => canonicalEntityName(entity)));
}

function extractInlinePersons(value: string): string[] {
  const matches = value.match(/\b[A-Z][A-Za-z0-9_-]{1,}\b/g) ?? [];
  return unique(matches.filter((match) => !commonCapitalizedWords.has(match)));
}

function extractKeywords(value: string): string[] {
  return unique(tokenize(value).filter((term) => term.length >= 3)).slice(0, 7);
}

function appendEvolveMementoRecallLog({
  sessionId,
  query,
  extracted,
  lexicalSize,
  semanticSize,
  metadataSize,
  results,
  policy,
  createdAt,
}: {
  sessionId: string;
  query: string;
  extracted: { persons: string[]; entities: string[] };
  lexicalSize: number;
  semanticSize: number;
  metadataSize: number;
  results: RecallResult[];
  policy: MemoryTrace["policy"];
  createdAt: string;
}) {
  if (getRuntimeEnv("MEMENTO_RECALL_LOG_DISABLED") === "1") {
    return;
  }

  try {
    const requireNode = getNodeRequire();
    if (!requireNode) {
      return;
    }
    const fs = requireNode("node:fs") as {
      mkdirSync(path: string, options: { recursive: boolean }): void;
      appendFileSync(path: string, content: string): void;
    };
    const path = requireNode("node:path") as {
      join(...parts: string[]): string;
      resolve(...parts: string[]): string;
    };
    const logDir = path.resolve("apps", "desktop", ".cache");
    const logPath = path.join(logDir, "memento_recall_log.jsonl");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      logPath,
      `${JSON.stringify({
        ts: createdAt,
        sessionId,
        query,
        extractedEntities: extracted.entities,
        extractedPersons: extracted.persons,
        viewSizes: { lexical: lexicalSize, semantic: semanticSize, metadata: metadataSize },
        returned: results.map((result) => ({
          recordId: result.record.id,
          fusedScore: result.fusionDetail?.views.length ? Number((result.score ?? 0).toFixed(4)) : 0,
          viewBreakdown: result.fusionDetail?.views ?? [],
        })),
        policy: { autoRecallAllowed: policy.autoRecallAllowed, reason: policy.reason },
      })}\n`,
    );
  } catch (error) {
    console.warn("EvolveMemento recall log append skipped", error);
  }
}

function getRuntimeEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

function getNodeRequire(): ((id: string) => unknown) | undefined {
  try {
    return Function("return typeof require === 'function' ? require : undefined")() as ((id: string) => unknown) | undefined;
  } catch {
    return undefined;
  }
}

function normalizeMetadataValue(value: string) {
  return value.trim().toLowerCase();
}

function includesMetadataValue(value: string, candidate: string) {
  return normalizeMetadataValue(value).includes(normalizeMetadataValue(candidate));
}

function hasIntersection(left: Set<string>, right: Set<string>) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function canonicalEntityName(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "event storage") {
    return "Event Storage";
  }
  if (normalized === "event store") {
    return "Event Store";
  }
  if (normalized === "coding packet") {
    return "Coding Packet";
  }
  if (normalized === "simplemem") {
    return "SimpleMem";
  }
  if (normalized === "evolvememento") {
    return "EvolveMemento";
  }
  return value;
}

const commonCapitalizedWords = new Set([
  "Event",
  "Storage",
  "Store",
  "MemoryRecord",
  "WorkItem",
  "Coding",
  "Packet",
  "Memento",
  "EvolveMemento",
  "SimpleMem",
]);

function relationConfidence(left: MemoryRecord, right: MemoryRecord): number {
  const leftTerms = tokenize(`${left.title} ${left.content} ${(left.tags ?? []).join(" ")}`);
  const rightTerms = tokenize(`${right.title} ${right.content} ${(right.tags ?? []).join(" ")}`);
  const sharedTerms = leftTerms.filter((term) => rightTerms.includes(term)).length;
  const sharedTags = (left.tags ?? []).filter((tag) => (right.tags ?? []).includes(tag)).length;
  const kindBoost = left.kind && left.kind === right.kind ? 0.1 : 0;
  const scopeBoost = (left.scope ?? inferScope(left)) === (right.scope ?? inferScope(right)) ? 0.08 : 0;

  return Math.min(sharedTerms / Math.max(Math.min(leftTerms.length, rightTerms.length), 1) + sharedTags * 0.12 + kindBoost + scopeBoost, 0.99);
}

function hasContradictionSignal(left: MemoryRecord, right: MemoryRecord): boolean {
  const topicOverlap = relationConfidence(left, right) > 0.24;
  const leftText = `${left.title} ${left.content}`.toLowerCase();
  const rightText = `${right.title} ${right.content}`.toLowerCase();
  const leftBlocks = /\b(block|deny|forbid|disable|quarantine|never)\b/.test(leftText);
  const rightAllows = /\b(allow|enable|always|auto|automatic)\b/.test(rightText);
  const rightBlocks = /\b(block|deny|forbid|disable|quarantine|never)\b/.test(rightText);
  const leftAllows = /\b(allow|enable|always|auto|automatic)\b/.test(leftText);

  return topicOverlap && ((leftBlocks && rightAllows) || (rightBlocks && leftAllows));
}

function findDuplicatePairs(records: MemoryRecord[]): Array<[MemoryRecord, MemoryRecord]> {
  const pairs: Array<[MemoryRecord, MemoryRecord]> = [];

  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex]!;
      const right = records[rightIndex]!;
      const sameKind = left.kind === right.kind;
      const titleMatch = normalizeTitle(left.title) === normalizeTitle(right.title);
      const confidence = relationConfidence(left, right);

      if (titleMatch || (sameKind && confidence > 0.68)) {
        pairs.push([left, right]);
      }
    }
  }

  return pairs;
}

function inferScope(record: MemoryRecord): MemoryScope {
  if (record.layer === "user_memory") {
    return "global";
  }
  if (record.layer === "episode" || record.layer === "fragment") {
    return "session";
  }
  return "project";
}

function isStale(recordCreatedAt: string, now: string) {
  const created = Date.parse(recordCreatedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(created) || !Number.isFinite(current)) {
    return false;
  }

  return current - created > 1000 * 60 * 60 * 24 * 45;
}

function normalizeTitle(value: string) {
  return tokenize(value).join("-");
}

function tokenize(value: string): string[] {
  return Array.from(new Set(value.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []));
}

function stableId(value: string, salt: string) {
  let hash = 0;
  for (const char of `${value}:${salt}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
