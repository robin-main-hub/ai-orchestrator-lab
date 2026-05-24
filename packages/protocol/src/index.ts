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

export const modelInputModalitySchema = z.enum(["text", "image", "document"]);
export type ModelInputModality = z.infer<typeof modelInputModalitySchema>;

export const modelDescriptorSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerProfileId: z.string(),
  contextWindow: z.number().int().positive().optional(),
  supportsStreaming: z.boolean(),
  supportsTools: z.boolean(),
  inputModalities: z.array(modelInputModalitySchema).optional(),
  tags: z.array(z.string()),
});
export type ModelDescriptor = z.infer<typeof modelDescriptorSchema>;

export type ProviderCredentialInputFormat =
  | "plain_api_key"
  | "openai_env"
  | "anthropic_env"
  | "powershell_env"
  | "claude_code_settings_json"
  | "custom_base_url"
  | "unknown";

export type ProviderCredentialParseResult = {
  id: string;
  format: ProviderCredentialInputFormat;
  providerKind: ProviderKind;
  profileName: string;
  baseUrl?: string;
  authHeader?: string;
  secretRef?: SecretRef;
  defaultModel?: string;
  tags: string[];
  trustLevel: ProviderTrustLevel;
  warnings: string[];
  createdAt: string;
};

export type ModelDiscoveryStatus = "idle" | "loading" | "succeeded" | "failed" | "blocked";

export type ModelDiscoverySnapshot = {
  id: string;
  providerProfileId: string;
  status: ModelDiscoveryStatus;
  source: "mock" | "local" | "remote_stub" | "remote_probe";
  models: ModelDescriptor[];
  selectedModelId?: string;
  redactionApplied: boolean;
  warnings: string[];
  createdAt: string;
};

export type SecretStorageKind = "session_memory" | "macos_keychain" | "dgx_vault" | "oauth_session";

export type SecretAvailability = "available" | "missing" | "expired" | "revoked";

export type SecretVaultEntry = {
  id: string;
  providerProfileId: string;
  secretRefId?: string;
  storage: SecretStorageKind;
  availability: SecretAvailability;
  redactedPreview?: string;
  transient: boolean;
  createdAt: string;
  expiresAt?: string;
};

export type SecretVaultSnapshot = {
  id: string;
  entries: SecretVaultEntry[];
  summary: {
    available: number;
    missing: number;
    transient: number;
    keychainReady: number;
    dgxVaultReady: number;
  };
  rawSecretPersisted: false;
  createdAt: string;
};

export type ProviderExecutionMode = "mock" | "local" | "remote";

export type ProviderReadinessStatus = "ready" | "credential_required" | "needs_approval" | "blocked";

export type ProviderRuntimeReadiness = {
  id: string;
  providerProfileId: string;
  status: ProviderReadinessStatus;
  executionMode: ProviderExecutionMode;
  modelCount: number;
  selectedModelId?: string;
  secretAvailability: SecretAvailability;
  canRunCompletion: boolean;
  canUseAutomaticMemory: boolean;
  reason: string;
  warnings: string[];
  createdAt: string;
};

export const agentKindSchema = z.enum(["real", "virtual"]);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const soulInjectionModeSchema = z.enum(["full", "summary", "retrieved", "off"]);
export type SoulInjectionMode = z.infer<typeof soulInjectionModeSchema>;

export const agentConfigSourceSchema = z.enum(["internal", "markdown", "off"]);
export type AgentConfigSource = z.infer<typeof agentConfigSourceSchema>;

export const agentAuthBindingSchema = z.object({
  mode: z.enum(["provider_profile", "oauth", "local"]),
  label: z.string(),
  providerProfileId: z.string().optional(),
  oauthRef: z.string().optional(),
  secretRefId: z.string().optional(),
});
export type AgentAuthBinding = z.infer<typeof agentAuthBindingSchema>;

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
  configSource: agentConfigSourceSchema,
  authBinding: agentAuthBindingSchema.optional(),
  enabled: z.boolean(),
  permissionLevel: z.string().optional(),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const backupStatusSchema = z.enum(["pending", "synced", "failed"]);
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const conversationAttachmentKindSchema = z.enum(["image", "document"]);
export type ConversationAttachmentKind = z.infer<typeof conversationAttachmentKindSchema>;

export const conversationAttachmentStorageSchema = z.enum(["metadata_only", "local_cache", "dgx_object_storage"]);
export type ConversationAttachmentStorage = z.infer<typeof conversationAttachmentStorageSchema>;

export const conversationAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: conversationAttachmentKindSchema,
  mimeType: z.string(),
  size: z.number().nonnegative(),
  storage: conversationAttachmentStorageSchema,
});
export type ConversationAttachment = z.infer<typeof conversationAttachmentSchema>;

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

export const contextPackTierSchema = z.enum(["lite", "standard", "full"]);
export type ContextPackTier = z.infer<typeof contextPackTierSchema>;

export const reviewModeSchema = z.enum(["quick", "deep"]);
export type ReviewMode = z.infer<typeof reviewModeSchema>;

export const branchExperimentStatusSchema = z.enum(["drafting", "ready", "adopted"]);
export type BranchExperimentStatus = z.infer<typeof branchExperimentStatusSchema>;

export const branchExperimentSchema = z.object({
  id: z.string(),
  sourceSessionId: z.string(),
  title: z.string(),
  agentName: z.string(),
  status: branchExperimentStatusSchema,
  summary: z.string(),
  createdAt: z.string(),
});
export type BranchExperiment = z.infer<typeof branchExperimentSchema>;

export const insightCategorySchema = z.enum([
  "stability",
  "testing",
  "architecture",
  "performance",
  "security",
  "tech_debt",
]);
export type InsightCategory = z.infer<typeof insightCategorySchema>;

export const insightFindingStatusSchema = z.enum(["ok", "watch", "quick_win"]);
export type InsightFindingStatus = z.infer<typeof insightFindingStatusSchema>;

export const insightFindingSchema = z.object({
  id: z.string(),
  category: insightCategorySchema,
  status: insightFindingStatusSchema,
  label: z.string(),
  summary: z.string(),
});
export type InsightFinding = z.infer<typeof insightFindingSchema>;

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

export type ProviderCompletionRoute = "server_proxy" | "direct_provider" | "local_fallback";

export type ProviderCompletionStatus = "succeeded" | "failed" | "fallback_required";

export type ProviderCompletionMessage = {
  role: ConversationMessage["role"];
  content: string;
};

export type ProviderCompletionRequest = {
  id: string;
  sessionId: string;
  providerProfileId: string;
  modelId: string;
  messages: ProviderCompletionMessage[];
  source: EventSource;
  routePreference: ProviderCompletionRoute;
  createdAt: string;
};

export type ProviderCompletionUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ProviderCompletionResponse = {
  id: string;
  requestId: string;
  providerProfileId: string;
  modelId: string;
  route: ProviderCompletionRoute;
  status: ProviderCompletionStatus;
  content?: string;
  endpoint?: string;
  usage?: ProviderCompletionUsage;
  error?: string;
  createdAt: string;
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

export type ExternalChannel = "telegram" | "openclaw" | "mobile" | "api" | "webhook";

export type IngressAuthorType = "user" | "bot" | "manager" | "system";

export type IngressGuardName =
  | "shape_unification"
  | "noise_filter"
  | "self_response_prevention"
  | "debounce"
  | "pii_secret_block"
  | "guard_logging"
  | "checklist_injection";

export type IngressGuardStatus = "passed" | "blocked" | "queued" | "skipped";

export type IngressConfidence = "high" | "medium" | "low";

export type IngressEvent = {
  id: string;
  channel: ExternalChannel;
  source: EventSource;
  sourceTrust: SourceTrust;
  authorType: IngressAuthorType;
  rawText: string;
  normalizedText: string;
  eventType: "message" | "system_event" | "bot_reply" | "unknown";
  requestedPermissions: PermissionLevel[];
  confidence: IngressConfidence;
  requiresApproval: boolean;
  redacted: boolean;
  createdAt: string;
};

export type IngressGuardStep = {
  name: IngressGuardName;
  status: IngressGuardStatus;
  reason: string;
};

export type IngressGuardResult = {
  id: string;
  inputId: string;
  accepted: boolean;
  earlyReturn: boolean;
  confidence: IngressConfidence;
  normalizedEvent?: IngressEvent;
  guardSteps: IngressGuardStep[];
  approvalState: ApprovalState;
  reason: string;
  createdAt: string;
};

export type ExternalApprovalItem = {
  id: string;
  ingressEventId: string;
  channel: ExternalChannel;
  summary: string;
  permissions: PermissionLevel[];
  state: ApprovalState;
  createdAt: string;
};

export type PermissionAction =
  | "conversation_reply"
  | "memory_write"
  | "backup_export"
  | "terminal_run"
  | "file_write"
  | "remote_workspace"
  | "secret_view"
  | "mobile_approval";

export const permissionActorSchema = z.enum(["user", "agent", "external_channel", "mobile", "server"]);
export type PermissionActor = z.infer<typeof permissionActorSchema>;

export type PermissionDecision = "allow" | "approval_required" | "deny";

export type PermissionMatrixItem = {
  id: string;
  sessionId: string;
  subjectId: string;
  actor: PermissionActor;
  channel: EventSource;
  sourceTrust: SourceTrust;
  action: PermissionAction;
  requestedLevels: PermissionLevel[];
  state: ApprovalState;
  decision: PermissionDecision;
  reason: string;
  createdAt: string;
};

export type ApprovalQueueItem = {
  id: string;
  sourceItemId: string;
  summary: string;
  requestedBy: PermissionActor;
  permissions: PermissionLevel[];
  state: ApprovalState;
  createdAt: string;
  expiresAt?: string;
};

export type PermissionMatrixSnapshot = {
  id: string;
  sessionId: string;
  items: PermissionMatrixItem[];
  queue: ApprovalQueueItem[];
  summary: {
    allowed: number;
    pending: number;
    approved: number;
    denied: number;
  };
  createdAt: string;
};

export const executionRuntimeBackendSchema = z.enum(["ui_stub", "tmux", "local_cli", "dgx_remote"]);
export type ExecutionRuntimeBackend = z.infer<typeof executionRuntimeBackendSchema>;

export const executionSlotStatusSchema = z.enum([
  "placeholder",
  "idle",
  "pending_approval",
  "running",
  "completed",
  "failed",
  "blocked",
]);
export type ExecutionSlotStatus = z.infer<typeof executionSlotStatusSchema>;

export const tmuxPaneRoleSchema = z.enum([
  "discussion",
  "orchestrator",
  "status",
  "code",
  "architect",
  "frontend",
  "backend",
  "qa",
  "research",
  "memory",
]);
export type TmuxPaneRole = z.infer<typeof tmuxPaneRoleSchema>;

export const agentSessionStatusSchema = z.enum(["planned", "spawned", "running", "yielded", "completed", "failed"]);
export type AgentSessionStatus = z.infer<typeof agentSessionStatusSchema>;

export const agentSessionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  agentId: z.string().optional(),
  role: tmuxPaneRoleSchema,
  backend: executionRuntimeBackendSchema,
  paneId: z.string().optional(),
  status: agentSessionStatusSchema,
  createdAt: z.string(),
  lastEventAt: z.string().optional(),
});
export type AgentSession = z.infer<typeof agentSessionSchema>;

export const executionSlotSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  label: z.string(),
  role: tmuxPaneRoleSchema,
  backend: executionRuntimeBackendSchema,
  status: executionSlotStatusSchema,
  approvalState: approvalStateSchema,
  requestedPermissions: z.array(permissionLevelSchema),
  commandPreview: z.string().optional(),
  decisionRequired: z.boolean(),
  blockedReason: z.string().optional(),
  createdAt: z.string(),
});
export type ExecutionSlot = z.infer<typeof executionSlotSchema>;

export const terminalHostKindSchema = z.enum(["local_mac", "home_pc", "dgx_02", "dgx_01_locked"]);
export type TerminalHostKind = z.infer<typeof terminalHostKindSchema>;

export const terminalSessionStatusSchema = z.enum(["planned", "starting", "attached", "detached", "unreachable", "closed"]);
export type TerminalSessionStatus = z.infer<typeof terminalSessionStatusSchema>;

export const terminalPaneStatusSchema = z.enum(["planned", "idle", "running", "blocked", "capturing", "stale", "closed"]);
export type TerminalPaneStatus = z.infer<typeof terminalPaneStatusSchema>;

export const terminalCommandDispatchStateSchema = z.enum(["recorded", "pending_approval", "blocked", "sent", "failed"]);
export type TerminalCommandDispatchState = z.infer<typeof terminalCommandDispatchStateSchema>;

export const tmuxSessionRefSchema = z.object({
  id: z.string(),
  sessionName: z.string(),
  host: terminalHostKindSchema,
  backend: z.literal("tmux"),
  socketName: z.string().optional(),
  attachCommand: z.string(),
  controlMode: z.boolean(),
  paneCount: z.number().int().min(0),
  createdAt: z.string(),
  lastSeenAt: z.string().optional(),
  status: terminalSessionStatusSchema,
});
export type TmuxSessionRef = z.infer<typeof tmuxSessionRefSchema>;

export const terminalPaneSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  terminalSessionId: z.string(),
  role: tmuxPaneRoleSchema,
  host: terminalHostKindSchema,
  paneId: z.string(),
  windowId: z.string().optional(),
  title: z.string(),
  agentId: z.string().optional(),
  cwd: z.string().optional(),
  status: terminalPaneStatusSchema,
  lastOutputAt: z.string().optional(),
  createdAt: z.string(),
});
export type TerminalPane = z.infer<typeof terminalPaneSchema>;

export const terminalCommandIntentSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  terminalSessionId: z.string(),
  paneId: z.string(),
  requestedBy: permissionActorSchema,
  commandPreview: z.string(),
  redactedCommandPreview: z.string(),
  requestedPermissions: z.array(permissionLevelSchema),
  approvalState: approvalStateSchema,
  dispatchState: terminalCommandDispatchStateSchema,
  blockedReason: z.string().optional(),
  createdAt: z.string(),
});
export type TerminalCommandIntent = z.infer<typeof terminalCommandIntentSchema>;

export type TerminalSessionAttachedEventPayload = {
  terminalSession: TmuxSessionRef;
  panes: TerminalPane[];
};

export type TerminalPaneOutputCapturedEventPayload = {
  terminalSessionId: string;
  paneId: string;
  role: TmuxPaneRole;
  outputPreview: string;
  lineCount: number;
  redactionApplied: boolean;
  capturedAt: string;
};

export type TerminalCommandIntentEventPayload = {
  intent: TerminalCommandIntent;
};

export type RunRequestedEventPayload = {
  runId: string;
  sessionId: string;
  executionSlotId: string;
  requestedBy: PermissionActor;
  backend: ExecutionRuntimeBackend;
  commandPreview: string;
  requestedPermissions: PermissionLevel[];
  approvalState: ApprovalState;
  redactionApplied: boolean;
};

export type RunCompletedEventPayload = {
  runId: string;
  executionSlotId: string;
  status: "completed" | "failed" | "blocked";
  exitCode?: number;
  outputPreview?: string;
  redactionApplied: boolean;
};

export const memoryLayerSchema = z.enum([
  "fragment",
  "episode",
  "reflection",
  "project_memory",
  "user_memory",
]);
export type MemoryLayer = z.infer<typeof memoryLayerSchema>;

export const memoryScopeSchema = z.enum(["global", "project", "session"]);
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const memoryKindSchema = z.enum([
  "preference",
  "architecture",
  "pattern",
  "decision",
  "context",
  "workflow",
  "relationship",
  "learning",
]);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const memoryRelationKindSchema = z.enum(["related", "supports", "contradicts", "supersedes", "depends_on"]);
export type MemoryRelationKind = z.infer<typeof memoryRelationKindSchema>;

export const memoryActivationStateSchema = z.enum(["inactive", "suggested", "active", "quarantined"]);
export type MemoryActivationState = z.infer<typeof memoryActivationStateSchema>;

export const memoryRecordSchema = z.object({
  id: z.string(),
  layer: memoryLayerSchema,
  scope: memoryScopeSchema.optional(),
  kind: memoryKindSchema.optional(),
  title: z.string(),
  content: z.string(),
  sourceChannel: z.enum(["desktop", "telegram", "mobile", "api", "agent"]),
  trustLevel: sourceTrustSchema,
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  activationState: memoryActivationStateSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  lastAccessedAt: z.string().optional(),
  pinned: z.boolean(),
  tombstonedAt: z.string().optional(),
});
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export type RecallQuery = {
  sessionId?: string;
  projectId?: string;
  query: string;
  layers?: MemoryLayer[];
  scopes?: MemoryScope[];
  kinds?: MemoryKind[];
  includeUntrusted?: boolean;
  limit?: number;
};

export type RecallResult = {
  record: MemoryRecord;
  score: number;
  usedInDecision: boolean;
  activationState?: MemoryActivationState;
  reason: string;
};

export type MemoryRecallPolicy = {
  providerProfileId?: string;
  providerTrustLevel: ProviderTrustLevel;
  autoRecallAllowed: boolean;
  blockedLayers: MemoryLayer[];
  reason: string;
};

export type MemoryTrace = {
  id: string;
  sessionId: string;
  query: string;
  results: RecallResult[];
  policy: MemoryRecallPolicy;
  createdAt: string;
};

export type MemoryRelation = {
  id: string;
  fromRecordId: string;
  toRecordId: string;
  kind: MemoryRelationKind;
  confidence: number;
  reason: string;
  createdAt: string;
};

export type MemoryContextPacket = {
  id: string;
  sessionId: string;
  query: string;
  activeRecordIds: string[];
  blockedRecordIds: string[];
  relationIds: string[];
  summary: string;
  createdAt: string;
};

export type MemoryReflectionIssue = {
  id: string;
  kind: "duplicate" | "contradiction" | "stale" | "untrusted_active" | "missing_relation";
  recordIds: string[];
  severity: "low" | "medium" | "high";
  recommendation: string;
};

export type MemoryStats = {
  totalRecords: number;
  activeRecords: number;
  pinnedRecords: number;
  quarantinedRecords: number;
  relationCount: number;
  duplicateCandidates: number;
  contradictionCandidates: number;
  staleCandidates: number;
  health: "good" | "watch" | "needs_review";
};

export type MemoryInput = {
  layer: MemoryLayer;
  scope?: MemoryScope;
  kind?: MemoryKind;
  title: string;
  content: string;
  sourceChannel: MemoryRecord["sourceChannel"];
  trustLevel: SourceTrust;
  projectId?: string;
  sessionId?: string;
  tags?: string[];
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
  memoryContext(query: RecallQuery): Promise<MemoryContextPacket>;
  stats(): Promise<MemoryStats>;
  createRelations(recordIds: string[]): Promise<MemoryRelation[]>;
  activateMemories(recordIds: string[]): Promise<void>;
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

export const eventSyncStatusSchema = z.enum(["accepted", "duplicate", "conflict", "failed"]);
export type EventSyncStatus = z.infer<typeof eventSyncStatusSchema>;

export const eventSyncItemResultSchema = z.object({
  eventId: z.string(),
  status: eventSyncStatusSchema,
  serverRevision: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});
export type EventSyncItemResult = z.infer<typeof eventSyncItemResultSchema>;

export const eventSyncPushRequestSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  sessionId: z.string(),
  events: z.array(eventEnvelopeSchema),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});
export type EventSyncPushRequest = Omit<z.infer<typeof eventSyncPushRequestSchema>, "events"> & {
  events: EventEnvelope[];
};

export const eventSyncPushResponseSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  sessionId: z.string(),
  serverRevision: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  results: z.array(eventSyncItemResultSchema),
  createdAt: z.string(),
});
export type EventSyncPushResponse = z.infer<typeof eventSyncPushResponseSchema>;

export const eventSyncPullResponseSchema = z.object({
  sessionId: z.string(),
  serverRevision: z.number().int().nonnegative(),
  events: z.array(eventEnvelopeSchema),
  createdAt: z.string(),
});
export type EventSyncPullResponse = Omit<z.infer<typeof eventSyncPullResponseSchema>, "events"> & {
  events: EventEnvelope[];
};

export const eventStorageSessionIndexItemSchema = z.object({
  sessionId: z.string(),
  title: z.string().optional(),
  createdByClient: z.string().optional(),
  eventCount: z.number().int().nonnegative(),
  firstEventAt: z.string().optional(),
  lastEventAt: z.string().optional(),
  lastEventType: z.string().optional(),
  sources: z.array(eventSourceSchema),
  sourceTrust: z.array(sourceTrustSchema),
});
export type EventStorageSessionIndexItem = z.infer<typeof eventStorageSessionIndexItemSchema>;

export const eventStorageSessionIndexResponseSchema = z.object({
  serverRevision: z.number().int().nonnegative(),
  sessions: z.array(eventStorageSessionIndexItemSchema),
  createdAt: z.string(),
});
export type EventStorageSessionIndexResponse = z.infer<typeof eventStorageSessionIndexResponseSchema>;

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

export type ClientOutboxMode = "persistent_local" | "online_only" | "authority";

export type ClientFailurePolicy = "local_queue" | "requires_dgx" | "authority_recovery";

export type ClientDevice = {
  id: string;
  label: string;
  kind: ClientDeviceKind;
  status: RuntimeStatus;
  syncRole: SyncRole;
  localStore: "sqlite" | "none";
  outboxMode?: ClientOutboxMode;
  failurePolicy?: ClientFailurePolicy;
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

export type DgxConnectionStatus = "connected" | "unreachable" | "fallback_local" | "pending";

export type DgxHeartbeat = {
  nodeId: string;
  status: DgxConnectionStatus;
  latencyMs?: number;
  checkedAt: string;
  message: string;
};

export type RemoteExecutionKind = "model_inference" | "workspace_run" | "event_sync";

export type RemoteExecutionRequest = {
  id: string;
  runId: string;
  kind: RemoteExecutionKind;
  targetNodeId: string;
  commandPreview: string;
  approvalState: ApprovalState;
  createdAt: string;
};

export type RemoteExecutionResponse = {
  id: string;
  requestId: string;
  status: "accepted" | "queued" | "blocked" | "fallback_required";
  targetNodeId: string;
  fallbackMode: "none" | "local_model" | "local_cli";
  message: string;
  createdAt: string;
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

export type BackupArtifactKind =
  | "session_log"
  | "decision_record"
  | "coding_packet"
  | "run_artifact"
  | "memory_trace";

export type BackupProjectionFormat = "markdown" | "notion_summary" | "mobile_dashboard";

export type BackupProjectionArtifact = {
  id: string;
  sessionId: string;
  target: BackupProjectionTarget;
  kind: BackupArtifactKind;
  format: BackupProjectionFormat;
  title: string;
  destination: string;
  redactionApplied: boolean;
  status: "ready" | "queued" | "blocked";
  byteLength: number;
  createdAt: string;
  contentPreview: string;
};

export type MobileActionPolicy = {
  canRead: boolean;
  canApprove: boolean;
  canStop: boolean;
  canRetry: boolean;
  canTypeTerminal: boolean;
  canViewSecrets: boolean;
  canMergeOrPush: boolean;
};
