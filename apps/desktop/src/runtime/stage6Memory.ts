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
      pinned: true,
    },
    {
      id: "memory_seed_macbook_authority",
      layer: "project_memory",
      scope: "project",
      kind: "architecture",
      title: "MacBook canonical authority",
      content:
        "MacBook is the authoritative work machine and canonical source for Event Store and MemoryRecord. DGX-02 is the always-on continuity mirror, compute node, projection server, and SimpleMem index host.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["macbook", "dgx-02", "continuity", "simplemem"],
      activationState: "active",
      createdAt,
      lastAccessedAt: createdAt,
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
  const activeRecords = records.filter((record) => !record.tombstonedAt);
  const query = createRecallQuery(messages, packet);
  const policy = createRecallPolicy(provider);
  const relations = createMemoryRelations(activeRecords, createdAt);
  const results = recallMemory(activeRecords, query, policy, relations);
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
): RecallResult[] {
  return records
    .map((record) => {
      const score = scoreRecord(record, query, relations);
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

      return {
        record,
        score,
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
    })
    .filter((result) => result.score > 0.05 || result.record.pinned || result.record.activationState === "active")
    .sort(
      (left, right) =>
        Number(right.record.activationState === "active") - Number(left.record.activationState === "active") ||
        Number(right.record.pinned) - Number(left.record.pinned) ||
        right.score - left.score,
    )
    .slice(0, 8);
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
      recommendation: "Merge these fragments or keep the newer one as the canonical memory.",
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

function scoreRecord(record: MemoryRecord, query: string, relations: MemoryRelation[]): number {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return record.pinned ? 0.4 : 0.1;
  }

  const haystack = tokenize(
    `${record.title} ${record.content} ${record.layer} ${record.kind ?? ""} ${record.scope ?? ""} ${(record.tags ?? []).join(" ")}`,
  );
  const overlap = terms.filter((term) => haystack.includes(term)).length;
  const relationBoost = Math.min(
    relations.filter((relation) => relation.fromRecordId === record.id || relation.toRecordId === record.id).length * 0.04,
    0.16,
  );
  const trustBoost = record.trustLevel === "trusted" ? 0.18 : record.trustLevel === "limited" ? 0.08 : 0;
  const pinBoost = record.pinned ? 0.2 : record.activationState === "active" ? 0.14 : 0;
  return Math.min(overlap / Math.max(terms.length, 1) + relationBoost + trustBoost + pinBoost, 0.99);
}

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
