import { z } from "zod";

export const runtimeStatusSchema = z.enum(["online", "degraded", "offline", "syncing"]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;

export const workModeSchema = z.enum([
  "conversation",
  "debate",
  "coding",
  "review",
  "research",
  "planning",
  "verification",
]);
export type WorkMode = z.infer<typeof workModeSchema>;

export const providerKindSchema = z.enum([
  "openai",
  "anthropic",
  "openrouter",
  "ollama",
  "lmstudio",
  "custom",
]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const providerTrustLevelSchema = z.enum(["trusted", "limited", "untrusted"]);
export type ProviderTrustLevel = z.infer<typeof providerTrustLevelSchema>;

export const secretRefSchema = z.object({
  id: z.string(),
  label: z.string(),
  scope: z.enum(["session", "profile", "workspace"]),
  redactedPreview: z.string(),
  transient: z.boolean(),
  createdAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type SecretRef = z.infer<typeof secretRefSchema>;

export const providerProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: providerKindSchema,
  baseUrl: z.string().url().optional(),
  secretRef: secretRefSchema.optional(),
  apiKeyRef: z.string().optional(),
  authHeader: z.string().optional(),
  modelDiscoveryEndpoint: z.string().optional(),
  defaultModel: z.string().optional(),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  trustLevel: providerTrustLevelSchema.default("limited"),
});
export type ProviderProfile = z.infer<typeof providerProfileSchema>;

export const modelDescriptorSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerProfileId: z.string(),
  contextWindow: z.number().int().positive().optional(),
  supportsStreaming: z.boolean(),
  supportsTools: z.boolean(),
  tags: z.array(z.string()),
});
export type ModelDescriptor = z.infer<typeof modelDescriptorSchema>;

export const agentKindSchema = z.enum(["real", "virtual"]);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const soulInjectionModeSchema = z.enum(["full", "summary", "retrieved", "off"]);
export type SoulInjectionMode = z.infer<typeof soulInjectionModeSchema>;

export const agentRoleSchema = z.enum([
  "orchestrator",
  "architect",
  "builder",
  "reviewer",
  "skeptic",
  "verifier",
  "memory_curator",
  "executor",
  "external",
  "auditor",
]);
export type AgentRole = z.infer<typeof agentRoleSchema>;

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: agentKindSchema,
  role: agentRoleSchema,
  providerProfileId: z.string().optional(),
  modelId: z.string().optional(),
  soulMode: soulInjectionModeSchema,
  enabled: z.boolean(),
  permissionLevel: z.string().optional(),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const backupStatusSchema = z.enum(["pending", "synced", "failed"]);
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const conversationMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  createdAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationSessionSchema = z.object({
  id: z.string(),
  mode: z.literal("conversation"),
  channel: z.enum(["desktop", "telegram", "mobile", "api"]),
  primaryAgentId: z.string(),
  providerProfileId: z.string().optional(),
  modelId: z.string().optional(),
  messages: z.array(conversationMessageSchema),
  linkedRuns: z.array(z.string()),
  linkedDebates: z.array(z.string()),
  memoryTraceIds: z.array(z.string()),
  backupStatus: backupStatusSchema,
});
export type ConversationSession = z.infer<typeof conversationSessionSchema>;

export const debateTagSchema = z.enum([
  "agreement",
  "objection",
  "evidence",
  "risk",
  "coding_impact",
]);
export type DebateTag = z.infer<typeof debateTagSchema>;

export const debateRoundKindSchema = z.enum([
  "problem_definition",
  "initial_proposals",
  "cross_critique",
  "orchestrator_summary",
  "refinement",
  "final_decision",
  "coding_packet",
]);
export type DebateRoundKind = z.infer<typeof debateRoundKindSchema>;

export const debateUtteranceSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  roundId: z.string(),
  content: z.string(),
  tags: z.array(debateTagSchema),
  createdAt: z.string(),
});
export type DebateUtterance = z.infer<typeof debateUtteranceSchema>;

export const debateRoundSchema = z.object({
  id: z.string(),
  debateId: z.string(),
  kind: debateRoundKindSchema,
  title: z.string(),
  status: z.enum(["pending", "running", "completed", "blocked"]),
  utterances: z.array(debateUtteranceSchema),
});
export type DebateRound = z.infer<typeof debateRoundSchema>;

export const codingPacketSchema = z.object({
  goal: z.string(),
  context: z.array(z.string()),
  decisions: z.array(z.string()),
  rejectedOptions: z.array(z.string()),
  constraints: z.array(z.string()),
  filesToInspect: z.array(z.string()),
  implementationPlan: z.array(z.string()),
  verificationPlan: z.array(z.string()),
  reviewerNotes: z.array(z.string()),
});
export type CodingPacket = z.infer<typeof codingPacketSchema>;

export const sourceTrustSchema = z.enum(["trusted", "limited", "untrusted"]);
export type SourceTrust = z.infer<typeof sourceTrustSchema>;

export const eventSourceSchema = z.enum(["desktop", "server", "telegram", "mobile", "agent", "api"]);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const eventEnvelopeSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
  source: eventSourceSchema,
  sourceTrust: sourceTrustSchema,
  redacted: z.boolean().default(false),
  correlationId: z.string().optional(),
});
export type EventEnvelope<T = unknown> = Omit<z.infer<typeof eventEnvelopeSchema>, "payload"> & {
  payload: T;
};

export const permissionLevelSchema = z.enum([
  "read_only",
  "write_files",
  "run_safe_commands",
  "run_dangerous_commands",
  "network_access",
  "remote_workspace",
  "secret_access",
]);
export type PermissionLevel = z.infer<typeof permissionLevelSchema>;

export const approvalStateSchema = z.enum([
  "not_required",
  "required",
  "approved",
  "rejected",
  "expired",
]);
export type ApprovalState = z.infer<typeof approvalStateSchema>;

export const permissionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  requestedBy: z.string(),
  level: permissionLevelSchema,
  reason: z.string(),
  state: approvalStateSchema,
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});
export type PermissionRequest = z.infer<typeof permissionRequestSchema>;

export const memoryLayerSchema = z.enum([
  "fragment",
  "episode",
  "reflection",
  "project_memory",
  "user_memory",
]);
export type MemoryLayer = z.infer<typeof memoryLayerSchema>;

export const memoryRecordSchema = z.object({
  id: z.string(),
  layer: memoryLayerSchema,
  title: z.string(),
  content: z.string(),
  sourceChannel: z.enum(["desktop", "telegram", "mobile", "api", "agent"]),
  trustLevel: sourceTrustSchema,
  createdAt: z.string(),
  pinned: z.boolean(),
  tombstonedAt: z.string().optional(),
});
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export type RecallQuery = {
  sessionId?: string;
  query: string;
  layers?: MemoryLayer[];
  includeUntrusted?: boolean;
  limit?: number;
};

export type RecallResult = {
  record: MemoryRecord;
  score: number;
  usedInDecision: boolean;
  reason: string;
};

export type MemoryInput = {
  layer: MemoryLayer;
  title: string;
  content: string;
  sourceChannel: MemoryRecord["sourceChannel"];
  trustLevel: SourceTrust;
};

export type Reflection = {
  sessionId: string;
  summary: string;
  decisions: string[];
  risks: string[];
  createdAt: string;
};

export type MemoryAPI = {
  recall(query: RecallQuery): Promise<RecallResult[]>;
  remember(input: MemoryInput): Promise<MemoryRecord>;
  reflect(sessionId: string): Promise<Reflection>;
  pin(recordId: string): Promise<void>;
  forget(recordId: string): Promise<void>;
};

export type EventStoreAppendOptions = {
  redactBeforePersist?: boolean;
  idempotencyKey?: string;
};

export type EventStore = {
  append<T>(event: EventEnvelope<T>, options?: EventStoreAppendOptions): Promise<EventEnvelope<T>>;
  listBySession(sessionId: string): Promise<EventEnvelope[]>;
  getEvent(eventId: string): Promise<EventEnvelope | undefined>;
  markRedacted(eventId: string, reason: string): Promise<void>;
};

export type RuntimeNodeRole = "main_server" | "compute" | "local";

export type RuntimeNode = {
  id: string;
  label: string;
  role: RuntimeNodeRole;
  status: RuntimeStatus;
  isPrimary: boolean;
  endpoint?: string;
  models: string[];
};

export type LocalModelRuntime = {
  id: string;
  name: string;
  runner: "ollama" | "lmstudio" | "vllm" | "llamacpp" | "mock" | "custom";
  status: RuntimeStatus;
  contextWindow?: number;
};

export type ClientDeviceKind = "macbook" | "desktop_pc" | "mobile" | "server";

export type SyncRole = "authority" | "client_replica";

export type ClientDevice = {
  id: string;
  label: string;
  kind: ClientDeviceKind;
  status: RuntimeStatus;
  syncRole: SyncRole;
  localStore: "sqlite" | "none";
  outboxCount: number;
  lastSeenAt?: string;
};

export type SyncTopology = {
  authorityNodeId: string;
  authorityLabel: string;
  eventStoreMode: "server_authoritative_with_local_outbox";
  offlineWritePolicy: "append_local_outbox" | "read_only";
  conflictPolicy: "server_revision_lww_with_conflict_events" | "manual_review";
  clients: ClientDevice[];
};

export type RuntimeSnapshot = {
  status: RuntimeStatus;
  dgxStatus: RuntimeStatus;
  localModelStatus: RuntimeStatus;
  memorySyncStatus: RuntimeStatus;
  runtimeNodes: RuntimeNode[];
  localModels: LocalModelRuntime[];
  syncTopology: SyncTopology;
  activeProviderProfileId?: string;
  recentError?: string;
  updatedAt: string;
};

export type TerminalSlot = {
  id: string;
  label: string;
  status: "idle" | "pending_approval" | "running" | "completed" | "failed";
  permissionState: ApprovalState;
  lastCommandPreview?: string;
};

export type BackupProjectionTarget = "obsidian" | "notion" | "mobile";

export type BackupProjection = {
  id: string;
  sessionId: string;
  target: BackupProjectionTarget;
  status: BackupStatus;
  lastSyncedAt?: string;
  redactionApplied: boolean;
};
