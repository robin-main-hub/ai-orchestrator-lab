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
  agentId?: string;
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
      title: "이벤트 저장소 우선",
      content:
        "세션 로그, 토론, 코딩 패킷, 실행 산출물, 백업 투영, 기억 추적은 내보내기 전에 반드시 Event Storage에 먼저 기록합니다.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["event-storage", "source-of-truth", "backup"],
      activationState: "active",
      createdAt,
      lastAccessedAt: createdAt,
      losslessRestatement:
        "AI Orchestrator Lab은 세션 로그, 토론, 코딩 패킷, 실행 산출물, 백업 투영, 기억 추적을 내보내기 전에 Event Storage에 먼저 기록합니다.",
      keywords: ["event", "storage", "session", "debate", "coding", "backup", "memory"],
      entities: ["AI Orchestrator Lab", "Event Storage", "Coding Packet"],
      persons: [],
      topic: "Event Storage 우선 기록 경로",
      importance: 0.7,
      entityReinforcement: 0,
      pinned: true,
    },
    {
      id: "memory_seed_macbook_authority",
      layer: "project_memory",
      scope: "project",
      kind: "architecture",
      title: "MacBook 작업 권한 원본",
      content:
        "MacBook은 현재 작업 상태, 로컬 결정, 오프라인 연속성 outbox의 권한 원본입니다. DGX-02는 연속성 미러와 동기화 서버로 동작하며 온라인 상태에서 MacBook outbox 이벤트를 받아 Event Store, MemoryRecord, WorkItem, 승인, 초안 연속성을 미러링하고 파생 조회 인덱스를 호스팅합니다.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["macbook", "operator-authority", "dgx-02", "continuity-mirror", "sync"],
      activationState: "active",
      createdAt,
      lastAccessedAt: createdAt,
      losslessRestatement:
        "MacBook은 현재 작업 상태와 오프라인 연속성 outbox의 권한 원본이며, DGX-02는 연속성 미러, 동기화 서버, 조회 인덱스 호스트로 동작합니다.",
      keywords: ["macbook", "operator", "authority", "dgx-02", "mirror", "sync", "outbox", "continuity"],
      entities: ["DGX-02", "MacBook", "Event Store", "MemoryRecord", "WorkItem"],
      persons: [],
      topic: "MacBook 권한 원본과 DGX 연속성 미러",
      importance: 0.7,
      entityReinforcement: 0,
      pinned: true,
    },
    {
      id: "memory_seed_untrusted_provider_guard",
      layer: "reflection",
      scope: "project",
      kind: "decision",
      title: "미신뢰 공급자 기억 보호",
      content:
        "리셀러 또는 사용자 지정 base URL 공급자에는 프로젝트/사용자 기억을 자동 전달하지 않습니다. 명시적으로 활성화한 기억만 보낼 수 있습니다.",
      sourceChannel: "agent",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["provider", "redaction", "trust-policy"],
      activationState: "suggested",
      createdAt,
      losslessRestatement:
        "AI Orchestrator Lab은 명시적으로 활성화하지 않은 프로젝트/사용자 기억이 리셀러 또는 사용자 지정 base URL 공급자에게 자동 전달되지 않도록 차단합니다.",
      keywords: ["provider", "reseller", "redaction", "trust", "memory", "activation"],
      entities: ["AI Orchestrator Lab", "Provider Profile", "MemoryRecord"],
      persons: [],
      topic: "미신뢰 공급자 기억 보호",
      importance: 0.5,
      entityReinforcement: 0,
      pinned: false,
    },
    {
      id: "memory_seed_external_ingress_quarantine",
      layer: "fragment",
      scope: "session",
      kind: "workflow",
      title: "외부 인입 격리",
      content:
        "외부 인입 채널에서 들어온 명령은 기본적으로 미신뢰 입력으로 취급합니다. 파일 쓰기, 터미널 실행, 원격 명령, 비밀값 접근은 실행 또는 기억 승격 전에 승인이 필요합니다.",
      sourceChannel: "external_legacy",
      trustLevel: "untrusted",
      sessionId: defaultSessionId,
      tags: ["external-ingress", "approval", "ingress"],
      activationState: "quarantined",
      createdAt,
      losslessRestatement:
        "외부 인입 명령은 AI Orchestrator Lab에 미신뢰 입력으로 들어오며, 파일 쓰기, 터미널 실행, 원격 명령, 비밀값 접근, 기억 승격 전에 승인을 요구합니다.",
      keywords: ["external-ingress", "approval", "ingress", "quarantine", "terminal", "secret"],
      entities: ["External Ingress", "AI Orchestrator Lab", "Permission Matrix"],
      persons: [],
      topic: "외부 인입 격리",
      importance: 0.5,
      entityReinforcement: 0,
      pinned: false,
    },
    {
      id: "memory_seed_memento_shape",
      layer: "project_memory",
      scope: "project",
      kind: "pattern",
      title: "Memento MCP 구조",
      content:
        "Memento는 remember, recall, memory_context, reflect, stats, relation creation, activation 흐름을 명시적으로 다룹니다. 각 기록에는 scope, kind, source trust, trace metadata가 함께 있어야 합니다.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      projectId: defaultProjectId,
      tags: ["memento", "memory-context", "relations", "activation"],
      activationState: "suggested",
      createdAt,
      losslessRestatement:
        "EvolveMemento는 remember, recall, memory_context, reflect, stats, relation creation, activation을 명시적인 기억 작업으로 유지하고, 각 작업에 scope, kind, source trust, trace metadata를 붙입니다.",
      keywords: ["evolvememento", "memento", "recall", "memory_context", "relations", "activation"],
      entities: ["EvolveMemento", "MemoryAPI", "MemoryContextPacket"],
      persons: [],
      topic: "EvolveMemento API 구조",
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
  agentId,
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
  const scopeTags = createRememberScopeTags({
    agentId,
    providerProfileId: provider?.id,
    sessionId,
  });

  return [
    {
      id: `memory_episode_${seed}`,
      layer: "episode",
      scope: "session",
      kind: "workflow",
      title: "대화 작업 세션",
      content: lastUserMessage?.content ?? packet.goal,
      sourceChannel: "desktop",
      trustLevel,
      projectId,
      sessionId,
      tags: ["conversation", "workbench", ...scopeTags],
      activationState: "suggested",
      createdAt,
      losslessRestatement: `사용자는 ${createdAt} 대화 세션에서 ${lastUserMessage?.content ?? packet.goal} 주제로 작업했습니다.`,
      keywords: extractKeywords(`${lastUserMessage?.content ?? ""} ${packet.goal} conversation workbench`),
      entities: extractInlineEntities(`${lastUserMessage?.content ?? ""} ${packet.goal}`),
      persons: extractInlinePersons(`${lastUserMessage?.content ?? ""} ${packet.goal}`),
      topic: "대화 작업 세션",
      importance: defaultImportance,
      entityReinforcement: 0,
      pinned: false,
    },
    {
      id: `memory_reflection_${seed}`,
      layer: "reflection",
      scope: "project",
      kind: "decision",
      title: "코딩 인계 회고",
      content: `${packet.decisions[0] ?? packet.goal} / 검증: ${packet.verificationPlan[0] ?? "대기"}`,
      sourceChannel: "agent",
      trustLevel: trustLevel === "untrusted" ? "limited" : trustLevel,
      projectId,
      sessionId,
      tags: ["coding-packet", "reflection", ...scopeTags],
      activationState: "suggested",
      createdAt,
      losslessRestatement: `${createdAt} 코딩 인계는 ${packet.decisions[0] ?? packet.goal} 결정을 기록했고 검증 항목은 ${packet.verificationPlan[0] ?? "대기"}입니다.`,
      keywords: extractKeywords(`${packet.goal} ${packet.decisions.join(" ")} ${packet.verificationPlan.join(" ")}`),
      entities: extractInlineEntities(`${packet.goal} ${packet.decisions.join(" ")}`),
      persons: extractInlinePersons(`${packet.goal} ${packet.decisions.join(" ")}`),
      topic: "코딩 인계 회고",
      importance: defaultImportance,
      entityReinforcement: 0,
      pinned: false,
    },
  ];
}

function createRememberScopeTags({
  agentId,
  providerProfileId,
  sessionId,
}: {
  agentId?: string;
  providerProfileId?: string;
  sessionId?: string;
}) {
  return [
    agentId ? `agent:${sanitizeMemoryTagPart(agentId)}` : undefined,
    providerProfileId ? `provider:${sanitizeMemoryTagPart(providerProfileId)}` : undefined,
    sessionId ? `session:${sanitizeMemoryTagPart(sessionId)}` : undefined,
  ].filter((tag): tag is string => Boolean(tag));
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
      reason: "미신뢰 공급자는 프로젝트/사용자 기억을 명시 선택했을 때만 조회합니다.",
    };
  }

  return {
    providerProfileId: provider?.id,
    providerTrustLevel: provider?.trustLevel ?? "limited",
    autoRecallAllowed: true,
    blockedLayers: [],
    reason: provider ? "공급자 신뢰 정책상 자동 기억 조회가 허용됩니다." : "공급자가 지정되지 않아 제한된 기억 미리보기만 사용합니다.",
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
          ? "질의와 겹치며 신뢰 정책을 통과했습니다."
          : blockedByLayer
            ? "공급자 신뢰 정책으로 차단되었습니다."
            : blockedByTrust
              ? "미신뢰 기억은 고정되기 전까지 격리됩니다."
              : "질의와의 관련도가 낮습니다.",
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
    summary: `활성 기억 ${activeRecordIds.length}개, 보류 기억 ${blockedRecordIds.length}개, 관련 연결 ${relationIds.length}개.`,
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
        reason:
          kind === "contradicts"
            ? "같은 주제에서 서로 반대되는 실행 표현이 겹칩니다."
            : "태그, 용어, 범위 또는 기억 종류가 서로 겹칩니다.",
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
      recommendation: "중복 조각을 병합하거나 더 최신 항목을 기준 기억으로 유지하세요.",
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
        recommendation: "자동 기억 조회가 두 항목을 함께 쓰기 전에 어떤 기억을 우선할지 검토하세요.",
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
        recommendation: "강한 모델이나 원격 모델에 보내기 전에 이 기억을 낮추거나 마스킹하거나 다시 검증하세요.",
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
        recommendation: "오래된 기억을 새로 확인하거나 큐레이터가 보관하도록 두세요.",
      });
    });

  if (records.filter((record) => record.pinned).length > 1 && relations.length === 0) {
    issues.push({
      id: `memory_issue_missing_relation_${stableId(records.map((record) => record.id).join(","), createdAt)}`,
      kind: "missing_relation",
      recordIds: records.filter((record) => record.pinned).map((record) => record.id),
      severity: "low",
      recommendation: "고정된 기억끼리 연결해 컨텍스트 패킷이 프로젝트 지도를 복구할 수 있게 하세요.",
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
  const entities = value.match(/\b(?:DGX-02|DGX-01|MacBook|Event Store|Event Storage|MemoryRecord|WorkItem|Coding Packet|EvolveMemento|Memento|SimpleMem|OpenClaw)\b/gi) ?? [];
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

function sanitizeMemoryTagPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function stableId(value: string, salt: string) {
  let hash = 0;
  for (const char of `${value}:${salt}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

export type Stage6MemoryReflectionWorkerInput = {
  records: MemoryRecord[];
  sessionId?: string;
  projectId?: string;
  now?: string;
};

export async function runMemoryReflectionWorker({
  records,
  sessionId = defaultSessionId,
  projectId = defaultProjectId,
  now = new Date().toISOString(),
}: Stage6MemoryReflectionWorkerInput): Promise<{
  resolvedRecords: MemoryRecord[];
  fixedCount: number;
  newIssues: MemoryReflectionIssue[];
}> {
  let resolvedRecords = [...records];
  const relations = createMemoryRelations(resolvedRecords, now);
  const issues = createReflectionIssues(resolvedRecords, relations, now);
  let fixedCount = 0;

  for (const issue of issues) {
    if (issue.kind === "duplicate") {
      const [id1, id2] = issue.recordIds;
      const rec1 = resolvedRecords.find((r) => r.id === id1);
      const rec2 = resolvedRecords.find((r) => r.id === id2);
      if (rec1 && rec2) {
        const t1 = Date.parse(rec1.createdAt);
        const t2 = Date.parse(rec2.createdAt);
        const newer = t1 >= t2 ? rec1 : rec2;
        const older = t1 >= t2 ? rec2 : rec1;

        resolvedRecords = resolvedRecords.map((r) => {
          if (r.id === older.id) {
            return { ...r, activationState: "inactive", tombstonedAt: now };
          }
          if (r.id === newer.id) {
            return { ...r, activationState: "active", updatedAt: now };
          }
          return r;
        });
        fixedCount++;
      }
    } else if (issue.kind === "contradiction") {
      const [id1, id2] = issue.recordIds;
      const rec1 = resolvedRecords.find((r) => r.id === id1);
      const rec2 = resolvedRecords.find((r) => r.id === id2);
      if (rec1 && rec2) {
        const imp1 = rec1.importance ?? 0.5;
        const imp2 = rec2.importance ?? 0.5;
        const winner = imp1 >= imp2 ? rec1 : rec2;
        const loser = imp1 >= imp2 ? rec2 : rec1;

        resolvedRecords = resolvedRecords.map((r) => {
          if (r.id === loser.id) {
            return { ...r, activationState: "quarantined", updatedAt: now };
          }
          if (r.id === winner.id) {
            return { ...r, activationState: "active", updatedAt: now };
          }
          return r;
        });
        fixedCount++;
      }
    }
  }

  const nextRelations = createMemoryRelations(resolvedRecords.filter(r => !r.tombstonedAt), now);
  const newIssues = createReflectionIssues(resolvedRecords.filter(r => !r.tombstonedAt), nextRelations, now);

  return {
    resolvedRecords,
    fixedCount,
    newIssues,
  };
}
