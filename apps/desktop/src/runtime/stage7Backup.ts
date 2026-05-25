import type {
  BackupProjection,
  BackupProjectionArtifact,
  BackupProjectionTarget,
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MobileActionPolicy,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import type { Stage4AgentRun } from "./stage4Runtime";
import type { Stage6MemoryInspector } from "./stage6Memory";
import { redactForEventStore } from "./stage2Runtime";

export type Stage7BackupSnapshot = {
  id: string;
  sessionId: string;
  artifacts: BackupProjectionArtifact[];
  artifactContents: Record<string, string>;
  mobilePolicy: MobileActionPolicy;
  queue: Stage7BackupQueueItem[];
  summary: {
    ready: number;
    queued: number;
    blocked: number;
    redacted: number;
  };
  createdAt: string;
};

export type Stage7BackupQueueItem = {
  id: string;
  target: BackupProjectionTarget;
  status: "ready" | "queued" | "blocked";
  reason: string;
};

export type Stage7DelegationRecord = {
  id: string;
  type: string;
  createdAt: string;
  sourceAgentId?: string;
  sourceRole?: string;
  target?: string;
  targetAgentId?: string;
  targetRole?: string;
  status: "detected" | "dispatched" | "succeeded" | "failed" | "blocked" | "unknown_target" | "self_blocked" | "followup_completed" | "followup_failed";
  authorityLevel?: string;
  route?: string;
  reason?: string;
  responsePreview?: string;
  promptPreview?: string;
};

export type Stage7BackupInput = {
  sessionId?: string;
  messages: ConversationMessage[];
  packet: CodingPacket;
  events: EventEnvelope[];
  projections: BackupProjection[];
  runtime: RuntimeSnapshot;
  agentRun?: Stage4AgentRun;
  memoryInspector: Stage6MemoryInspector;
  obsidianVaultRoot?: string;
  createdAt?: string;
};

const defaultSessionId = "session_desktop_001";
export const defaultObsidianVaultRoot = "F:/obsidian/ai-headquarter";

function createObsidianDestination(sessionId: string, vaultRoot = defaultObsidianVaultRoot) {
  const normalizedRoot = vaultRoot.replace(/[\\/]$/, "");
  return `${normalizedRoot}/AI-Orchestrator/projects/ai-orchestrator-lab/sessions/${sessionId}.md`;
}

export function createStage7BackupSnapshot({
  sessionId = defaultSessionId,
  messages,
  packet,
  events,
  projections,
  runtime,
  agentRun,
  memoryInspector,
  obsidianVaultRoot = defaultObsidianVaultRoot,
  createdAt = new Date().toISOString(),
}: Stage7BackupInput): Stage7BackupSnapshot {
  const mobilePolicy = createMobilePolicy();
  const obsidianContent = renderStage7ObsidianMarkdown({
    messages,
    packet,
    events,
    agentRun,
    memoryInspector,
    sessionId,
    createdAt,
  });
  const notionContent = renderStage7NotionSummary({
    packet,
    events,
    agentRun,
    memoryInspector,
    createdAt,
  });
  const mobileContent = renderStage7MobileDashboard({
    packet,
    events,
    runtime,
    memoryInspector,
    mobilePolicy,
    createdAt,
  });
  const artifacts: BackupProjectionArtifact[] = [
    createArtifact({
      target: "obsidian",
      kind: "session_log",
      format: "markdown",
      title: "Obsidian Session Markdown",
      destination: createObsidianDestination(sessionId, obsidianVaultRoot),
      content: obsidianContent,
      status: "ready",
      sessionId,
      createdAt,
    }),
    createArtifact({
      target: "notion",
      kind: "decision_record",
      format: "notion_summary",
      title: "Notion Decision Summary",
      destination: "Notion: AI Orchestrator / Sessions",
      content: notionContent,
      status: runtime.dgxStatus === "online" ? "ready" : "queued",
      sessionId,
      createdAt,
    }),
    createArtifact({
      target: "mobile",
      kind: "run_artifact",
      format: "mobile_dashboard",
      title: "Mobile Approval Dashboard",
      destination: "Mobile PWA: read/approve/stop/retry",
      content: mobileContent,
      status: runtime.dgxStatus === "online" ? "ready" : "queued",
      sessionId,
      createdAt,
    }),
  ];
  const queue = artifacts.map((artifact) => createQueueItem(artifact, projections, runtime));
  const artifactContents = Object.fromEntries(
    artifacts.map((artifact) => [
      artifact.id,
      artifact.target === "obsidian"
        ? obsidianContent
        : artifact.target === "notion"
          ? notionContent
          : mobileContent,
    ]),
  );

  return {
    id: `backup_snapshot_${stableId(`${packet.goal}:${createdAt}`)}`,
    sessionId,
    artifacts,
    artifactContents,
    mobilePolicy,
    queue,
    summary: {
      ready: artifacts.filter((artifact) => artifact.status === "ready").length,
      queued: artifacts.filter((artifact) => artifact.status === "queued").length,
      blocked: artifacts.filter((artifact) => artifact.status === "blocked").length,
      redacted: artifacts.filter((artifact) => artifact.redactionApplied).length,
    },
    createdAt,
  };
}

export function applyStage7ProjectionStatuses(
  projections: BackupProjection[],
  snapshot: Stage7BackupSnapshot,
): BackupProjection[] {
  return projections.map((projection) => {
    const artifact = snapshot.artifacts.find((candidate) => candidate.target === projection.target);
    if (!artifact) {
      return projection;
    }

    return {
      ...projection,
      sessionId: snapshot.sessionId,
      status: artifact.status === "ready" ? "synced" : artifact.status === "queued" ? "pending" : "failed",
      lastSyncedAt: artifact.status === "ready" ? artifact.createdAt : projection.lastSyncedAt,
      redactionApplied: artifact.redactionApplied,
    };
  });
}

export function getObsidianArtifact(snapshot: Stage7BackupSnapshot) {
  return snapshot.artifacts.find((artifact) => artifact.target === "obsidian");
}

export function getArtifactContent(snapshot: Stage7BackupSnapshot, artifactId?: string) {
  return artifactId ? (snapshot.artifactContents[artifactId] ?? "") : "";
}

function renderStage7ObsidianMarkdown({
  messages,
  packet,
  events,
  agentRun,
  memoryInspector,
  sessionId,
  createdAt,
}: Omit<Stage7BackupInput, "projections" | "runtime"> & { sessionId: string; createdAt: string }): string {
  const safeMessages = redactForEventStore(messages) as ConversationMessage[];
  const safePacket = redactForEventStore(packet) as CodingPacket;
  const safeEvents = redactForEventStore(events.slice(0, 10)) as EventEnvelope[];
  const safeDelegations = collectDelegationRecords(events);

  return [
    "---",
    "type: ai-orchestrator-session",
    `session: ${sessionId}`,
    `created: ${createdAt}`,
    "source: event-store-projection",
    "redaction: applied",
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
    "## Coding Packet",
    `- context: ${safePacket.context.length}`,
    `- constraints: ${safePacket.constraints.length}`,
    `- verification: ${safePacket.verificationPlan.join(", ")}`,
    "",
    "## Agent Run",
    agentRun ? `- ${agentRun.id}: ${agentRun.status} / verifier ${agentRun.verifier.status}` : "- not created",
    "",
    "## Recall Trace",
    ...formatRecallTrace(memoryInspector),
    "",
    "## EvolveMemento Index",
    ...formatEvolveMementoIndex(memoryInspector),
    "",
    "## Memory Context",
    `- summary: ${memoryInspector.contextPacket.summary}`,
    `- active: ${memoryInspector.contextPacket.activeRecordIds.length}`,
    `- blocked: ${memoryInspector.contextPacket.blockedRecordIds.length}`,
    `- related links: ${memoryInspector.contextPacket.relationIds.length}`,
    "",
    "## Memory Stats",
    `- health: ${memoryInspector.stats.health}`,
    `- records: ${memoryInspector.stats.totalRecords}`,
    `- active: ${memoryInspector.stats.activeRecords}`,
    `- quarantined: ${memoryInspector.stats.quarantinedRecords}`,
    `- relations: ${memoryInspector.stats.relationCount}`,
    "",
    "## Memory Relations",
    ...formatMemoryRelations(memoryInspector).slice(0, 8),
    "",
    "## Memory Reflection Issues",
    ...formatMemoryIssues(memoryInspector).slice(0, 8),
    "",
    "## Delegation Timeline",
    ...formatDelegationRecords(safeDelegations).slice(0, 12),
    "",
    "## Conversation",
    ...safeMessages.map((message) => `- **${message.role}**: ${message.content}`),
    "",
    "## Recent Events",
    ...safeEvents.map((event) => `- ${event.createdAt} :: ${event.type}`),
    "",
  ].join("\n");
}

function renderStage7NotionSummary({
  packet,
  events,
  agentRun,
  memoryInspector,
  createdAt,
}: Pick<Stage7BackupInput, "packet" | "events" | "agentRun" | "memoryInspector"> & { createdAt: string }) {
  const safePacket = redactForEventStore(packet) as CodingPacket;
  const delegationRecords = collectDelegationRecords(events);
  return JSON.stringify(
    {
      title: safePacket.goal,
      createdAt,
      status: agentRun?.status ?? "conversation",
      decisions: safePacket.decisions.slice(0, 5),
      constraints: safePacket.constraints.slice(0, 5),
      verification: safePacket.verificationPlan.slice(0, 5),
      eventCount: events.length,
      delegation: {
        total: delegationRecords.length,
        byStatus: countDelegationsByStatus(delegationRecords),
        recent: delegationRecords.slice(-8),
      },
      memoryTrace: {
        id: memoryInspector.trace.id,
        used: memoryInspector.trace.results.filter((result) => result.usedInDecision).length,
        blocked: memoryInspector.blockedCount,
        fusion: formatRecallFusionProjection(memoryInspector),
      },
      evolveMemento: createEvolveMementoProjection(memoryInspector),
      memoryContext: {
        id: memoryInspector.contextPacket.id,
        summary: memoryInspector.contextPacket.summary,
        active: memoryInspector.contextPacket.activeRecordIds.length,
        blocked: memoryInspector.contextPacket.blockedRecordIds.length,
        relationLinks: memoryInspector.contextPacket.relationIds.length,
      },
      memoryStats: memoryInspector.stats,
      memoryRelations: memoryInspector.relations.slice(0, 8).map((relation) => ({
        kind: relation.kind,
        confidence: relation.confidence,
        from: relation.fromRecordId,
        to: relation.toRecordId,
      })),
      memoryIssues: memoryInspector.issues.slice(0, 8).map((issue) => ({
        kind: issue.kind,
        severity: issue.severity,
        records: issue.recordIds,
        recommendation: issue.recommendation,
      })),
    },
    null,
    2,
  );
}

function renderStage7MobileDashboard({
  packet,
  events,
  runtime,
  memoryInspector,
  mobilePolicy,
  createdAt,
}: {
  packet: CodingPacket;
  events: EventEnvelope[];
  runtime: RuntimeSnapshot;
  memoryInspector: Stage6MemoryInspector;
  mobilePolicy: MobileActionPolicy;
  createdAt: string;
}) {
  const delegationRecords = collectDelegationRecords(events);
  return JSON.stringify(
    {
      title: packet.goal,
      createdAt,
      runtime: {
        dgx: runtime.dgxStatus,
        memory: runtime.memorySyncStatus,
        authority: runtime.syncTopology.authorityLabel,
      },
      allowedActions: mobilePolicy,
      delegation: {
        total: delegationRecords.length,
        pending: delegationRecords.filter((record) => record.status === "detected" || record.status === "dispatched").length,
        recent: delegationRecords.slice(-5),
      },
      memory: {
        records: memoryInspector.records.length,
        blocked: memoryInspector.blockedCount,
        active: memoryInspector.contextPacket.activeRecordIds.length,
        relationLinks: memoryInspector.contextPacket.relationIds.length,
        health: memoryInspector.stats.health,
        issues: memoryInspector.issues.length,
        fusion: formatRecallFusionProjection(memoryInspector).slice(0, 5),
        evolveMemento: createEvolveMementoProjection(memoryInspector),
      },
    },
    null,
    2,
  );
}

function collectDelegationRecords(events: EventEnvelope[]): Stage7DelegationRecord[] {
  const safeEvents = redactForEventStore(events) as EventEnvelope[];
  return safeEvents
    .filter((event) => event.type.startsWith("agent.delegation."))
    .map((event) => {
      const payload = asRecord(event.payload);
      return {
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
        sourceAgentId: getString(payload, "sourceAgentId"),
        sourceRole: getString(payload, "sourceRole"),
        target: getString(payload, "target"),
        targetAgentId: getString(payload, "targetAgentId"),
        targetRole: getString(payload, "targetRole"),
        status: delegationStatusFromEventType(event.type),
        authorityLevel: getString(payload, "authorityLevel"),
        route: getString(payload, "route"),
        reason: getString(payload, "reason") ?? getString(payload, "error"),
        responsePreview: truncate(getString(payload, "responsePreview") ?? getString(payload, "finalContent") ?? "", 240),
        promptPreview: truncate(getString(payload, "prompt") ?? "", 180),
      };
    });
}

function formatDelegationRecords(records: Stage7DelegationRecord[]) {
  if (records.length === 0) {
    return ["- none"];
  }

  return records.map((record) => {
    const target = record.targetAgentId ?? record.target ?? "unknown";
    const route = record.route ? ` / ${record.route}` : "";
    const authority = record.authorityLevel ? ` / ${record.authorityLevel}` : "";
    const reason = record.reason ? ` :: ${record.reason}` : "";
    const prompt = record.promptPreview ? ` / task: ${record.promptPreview}` : "";
    const response = record.responsePreview ? ` / result: ${record.responsePreview}` : "";
    return `- ${record.createdAt} :: ${record.status} :: ${record.sourceAgentId ?? "unknown"} -> ${target}${authority}${route}${reason}${prompt}${response}`;
  });
}

function countDelegationsByStatus(records: Stage7DelegationRecord[]) {
  return records.reduce<Record<Stage7DelegationRecord["status"], number>>(
    (acc, record) => {
      acc[record.status] += 1;
      return acc;
    },
    {
      detected: 0,
      dispatched: 0,
      succeeded: 0,
      failed: 0,
      blocked: 0,
      unknown_target: 0,
      self_blocked: 0,
      followup_completed: 0,
      followup_failed: 0,
    },
  );
}

function formatRecallTrace(memoryInspector: Stage6MemoryInspector) {
  if (memoryInspector.trace.results.length === 0) {
    return ["- none"];
  }

  return memoryInspector.trace.results.map((result) => {
    const fusion = result.fusionDetail?.views.length
      ? ` / fusion: ${result.fusionDetail.views
          .map((view) => `${view.view}#${view.rank}:${Number(view.rawScore.toFixed(3))}`)
          .join(", ")}`
      : " / fusion: pinned-or-active";
    return `- ${result.usedInDecision ? "used" : "blocked"} :: ${result.record.title} (${result.record.layer}, score ${Number(result.score.toFixed(3))}, ${result.reason}${fusion})`;
  });
}

function formatRecallFusionProjection(memoryInspector: Stage6MemoryInspector) {
  return memoryInspector.trace.results.map((result) => ({
    recordId: result.record.id,
    title: result.record.title,
    usedInDecision: result.usedInDecision,
    score: Number(result.score.toFixed(4)),
    mode: result.fusionDetail?.fusionMode ?? "none",
    views: (result.fusionDetail?.views ?? []).map((view) => ({
      view: view.view,
      rank: view.rank,
      rawScore: Number(view.rawScore.toFixed(4)),
    })),
  }));
}

function createEvolveMementoProjection(memoryInspector: Stage6MemoryInspector) {
  const fusion = formatRecallFusionProjection(memoryInspector);
  const viewCounts = fusion.reduce<Record<string, number>>((acc, result) => {
    for (const view of result.views) {
      acc[view.view] = (acc[view.view] ?? 0) + 1;
    }
    return acc;
  }, {});
  const enrichedRecords = memoryInspector.records.filter(
    (record) =>
      Boolean(record.losslessRestatement) ||
      Boolean(record.keywords?.length) ||
      Boolean(record.entities?.length) ||
      Boolean(record.persons?.length) ||
      typeof record.importance === "number" ||
      typeof record.entityReinforcement === "number",
  );

  return {
    engine: "EvolveMemento",
    placement: "Question first; dynamic recall context below question",
    enrichedRecords: enrichedRecords.length,
    fusionResults: fusion.filter((result) => result.mode !== "none").length,
    viewCounts,
    importanceAverage: averageNumber(enrichedRecords.map((record) => record.importance)),
    reinforcementTotal: Number(
      enrichedRecords.reduce((sum, record) => sum + (record.entityReinforcement ?? 0), 0).toFixed(2),
    ),
  };
}

function formatEvolveMementoIndex(memoryInspector: Stage6MemoryInspector) {
  const projection = createEvolveMementoProjection(memoryInspector);
  return [
    `- engine: ${projection.engine}`,
    `- placement: ${projection.placement}`,
    `- enriched records: ${projection.enrichedRecords}`,
    `- fusion results: ${projection.fusionResults}`,
    `- view counts: lexical ${projection.viewCounts.lexical ?? 0}, semantic ${projection.viewCounts.semantic ?? 0}, metadata ${projection.viewCounts.metadata ?? 0}`,
    `- average importance: ${projection.importanceAverage ?? "n/a"}`,
    `- reinforcement total: ${projection.reinforcementTotal}`,
  ];
}

function averageNumber(values: Array<number | undefined>) {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) {
    return undefined;
  }
  return Number((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(3));
}

function delegationStatusFromEventType(type: string): Stage7DelegationRecord["status"] {
  switch (type) {
    case "agent.delegation.detected":
      return "detected";
    case "agent.delegation.dispatched":
      return "dispatched";
    case "agent.delegation.succeeded":
      return "succeeded";
    case "agent.delegation.failed":
      return "failed";
    case "agent.delegation.blocked":
      return "blocked";
    case "agent.delegation.unknown_target":
      return "unknown_target";
    case "agent.delegation.self_blocked":
      return "self_blocked";
    case "agent.delegation.followup.completed":
      return "followup_completed";
    case "agent.delegation.followup.failed":
      return "followup_failed";
    default:
      return "failed";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getString(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function formatMemoryRelations(memoryInspector: Stage6MemoryInspector) {
  if (memoryInspector.relations.length === 0) {
    return ["- none"];
  }

  return memoryInspector.relations.map(
    (relation) =>
      `- ${relation.kind} (${Math.round(relation.confidence * 100)}%) :: ${relation.fromRecordId} -> ${relation.toRecordId}`,
  );
}

function formatMemoryIssues(memoryInspector: Stage6MemoryInspector) {
  if (memoryInspector.issues.length === 0) {
    return ["- none"];
  }

  return memoryInspector.issues.map(
    (issue) => `- ${issue.severity} / ${issue.kind} :: ${issue.recordIds.join(", ")} :: ${issue.recommendation}`,
  );
}

function createArtifact(params: {
  sessionId: string;
  target: BackupProjectionTarget;
  kind: BackupProjectionArtifact["kind"];
  format: BackupProjectionArtifact["format"];
  title: string;
  destination: string;
  content: string;
  status: BackupProjectionArtifact["status"];
  createdAt: string;
}): BackupProjectionArtifact {
  const safeContent = redactForEventStore(params.content) as string;
  return {
    id: `backup_artifact_${params.target}_${stableId(`${params.title}:${params.createdAt}`)}`,
    sessionId: params.sessionId,
    target: params.target,
    kind: params.kind,
    format: params.format,
    title: params.title,
    destination: params.destination,
    redactionApplied: safeContent === params.content ? true : true,
    status: params.status,
    byteLength: new TextEncoder().encode(safeContent).length,
    createdAt: params.createdAt,
    contentPreview: safeContent.slice(0, 320),
  };
}

function createQueueItem(
  artifact: BackupProjectionArtifact,
  projections: BackupProjection[],
  runtime: RuntimeSnapshot,
): Stage7BackupQueueItem {
  const previous = projections.find((projection) => projection.target === artifact.target);
  const reason =
    artifact.status === "ready"
      ? artifact.target === "obsidian"
        ? "local markdown export can run offline"
        : "remote projection is ready"
      : runtime.dgxStatus === "online"
        ? "waiting for external service adapter"
        : "queued until dgx-02 or network projection adapter is reachable";

  return {
    id: `backup_queue_${artifact.target}_${stableId(`${artifact.id}:${previous?.status ?? "new"}`)}`,
    target: artifact.target,
    status: artifact.status,
    reason,
  };
}

function createMobilePolicy(): MobileActionPolicy {
  return {
    canRead: true,
    canApprove: true,
    canStop: true,
    canRetry: true,
    canTypeTerminal: false,
    canViewSecrets: false,
    canMergeOrPush: false,
  };
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function stableId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
