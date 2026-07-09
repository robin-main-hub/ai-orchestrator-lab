import { z } from "zod";

export * from "./productKernel.js";
export * from "./appWorkspace.js";
export * from "./designBlueprint.js";
export * from "./designMission.js";
export * from "./conversationBlueprint.js";
export * from "./debateBridge.js";
export * from "./visualQa.js";
export * from "./githubConnector.js";
export * from "./scaffold.js";
export * from "./controlStrip.js";
export * from "./missionBoard.js";
export * from "./missionRuntimeBus.js";
export * from "./missionCheckpoint.js";
export * from "./sandboxErrorCard.js";
export * from "./selfCorrection.js";
export * from "./confidenceSignal.js";
export * from "./skillArchive.js";
export * from "./workflowTemplate.js";
export * from "./learningLoop.js";
export * from "./memoryEval.js";
export * from "./learningLoopWiring.js";
export * from "./learningRuntimeManifest.js";
export * from "./rmasRun.js";

export const runtimeStatusSchema = z.enum(["online", "degraded", "offline", "syncing"]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;

export const workModeSchema = z.enum(["conversation", "debate", "tmux"]);
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
  source: "mock" | "local" | "remote_stub" | "remote_probe" | "static_fallback";
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

export type ProviderRegistryAuthMode =
  | "none"
  | "dgx_secret_ref"
  | "oauth_session"
  | "local_cli"
  | "api_key_required";

export type ProviderRegistryEntry = {
  providerProfileId: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  trustLevel: ProviderTrustLevel;
  tags: string[];
  defaultModelIds: string[];
  selectedModelId?: string;
  supportsModelList: boolean;
  apiStyle?: "openai_chat" | "anthropic_messages";
  authMode: ProviderRegistryAuthMode;
  secretAvailability: SecretAvailability;
  secretRefPreview?: string;
  secretSourceRefs?: string[];
  modelDiscoveryEndpoint?: string;
  updatedAt: string;
};

export type ProviderRegistrySnapshot = {
  id: string;
  authorityNodeId: "dgx-02";
  entries: ProviderRegistryEntry[];
  summary: {
    total: number;
    ready: number;
    missingSecrets: number;
    dgxVaultBacked: number;
    oauthSessions: number;
    noAuth: number;
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
  // R3.2 expansion — gap analysis flagged these as needed for generic
  // intelligence / domain-context workflows. All additive: each
  // existing profile keeps its current role; new roles unlock new
  // defaultAgentProfile entries.
  "researcher",       // active external info gathering, trust-classified output
  "negotiator",       // sales/협상 advisor, applies user's 협상 3원칙
  "risk_officer",     // worst-case quantification, Regret Minimization
  "mediator",         // synthesizes conflicting agent opinions into one draft
  "watchdog",         // long-term drift / anomaly detection over session history
  "domain_expert",    // load-time domain knowledge injection (HTV/B2B/etc.)
  // Polymath / 만능 비서. Eligible for every debate round (no narrow
  // specialization). Designed for character-driven profiles that act as
  // the user's primary day-to-day assistant rather than a single-role
  // specialist. Typically paired with a personaName override (e.g.
  // kurumi) and configSource: "markdown" so the full character files
  // load. Permission level usually starts at "write_files" so the
  // companion can self-edit its own SOUL/AGENTS/IDENTITY/USER files
  // (the actual write still goes through the permission gate + user
  // confirm — granting the level just means "this role is allowed to
  // request such writes," not "writes execute silently").
  "companion",
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
  /**
   * Optional override for the persona directory name used by the
   * markdown persona loader (`packages/agents`'s loadPersona). When
   * omitted, the loader uses `role` as the directory name (1:1
   * convention from R2). Set this when multiple profiles share the
   * same role but need different character files — e.g. two skeptics
   * with `role: "skeptic"`: one with `personaName: undefined` (loads
   * `agents/skeptic/`, Asuka), another with `personaName: "yohane"`
   * (loads `agents/yohane/`, Yohane Idea Bank).
   */
  personaName: z.string().optional(),
  isCanonical: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().optional(),
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
  /**
   * Extracted text body for document attachments (storage: local_cache).
   * Capped so a pasted log cannot blow the event log; `truncated` marks
   * whether the original was longer. Absent for metadata_only attachments.
   */
  textContent: z.string().max(200_000).optional(),
  /**
   * base64 data URL for image attachments (storage: local_cache) so vision
   * models can receive the actual pixels through the provider request.
   */
  dataUrl: z.string().max(8_000_000).optional(),
  truncated: z.boolean().optional(),
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
  channel: z.enum(["desktop", "external_legacy", "mobile", "api"]),
  primaryAgentId: z.string(),
  providerProfileId: z.string().optional(),
  modelId: z.string().optional(),
  messages: z.array(conversationMessageSchema),
  linkedRuns: z.array(z.string()),
  linkedDebates: z.array(z.string()),
  memoryTraceIds: z.array(z.string()),
  backupStatus: backupStatusSchema,
  activePersonaOverrides: z.record(z.string()).optional(),
  rolePersonaPriorities: z.record(z.array(z.string())).optional(),
  allowMultiPersonaRoles: z.array(agentRoleSchema).optional(),
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
  parentUtteranceId: z.string().optional(),
  content: z.string(),
  tags: z.array(debateTagSchema),
  acceptedBy: z.array(z.string()).optional(),
  rejectedBy: z.array(z.string()).optional(),
  decisionId: z.string().optional(),
  evidenceRefIds: z.array(z.string()).optional(),
  codingImpactRefs: z.array(z.string()).optional(),
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

export const eventSourceSchema = z.enum(["desktop", "server", "external_legacy", "mobile", "agent", "api"]);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const workSourceSchema = z.enum(["desktop_manual", "mobile_manual", "external_legacy"]);
export type WorkSource = z.infer<typeof workSourceSchema>;

export const workSourceRefSchema = z.object({
  source: workSourceSchema,
  externalId: z.string().optional(),
  url: z.string().url().optional(),
  title: z.string().optional(),
  observedAt: z.string(),
  contentHash: z.string().optional(),
  revision: z.string().optional(),
});
export type WorkSourceRef = z.infer<typeof workSourceRefSchema>;

export const workLaneSchema = z.enum([
  "auto",
  "check",
  "ask",
  "approve",
  "blocked",
]);
export type WorkLane = z.infer<typeof workLaneSchema>;

export const workItemKindSchema = z.enum([
  "external_inquiry",
  "quote_request",
  "price_nego",
  "lead_time",
  "sample_request",
  "claim",
  "order",
  "spec_doc",
  "internal_coord",
  "report",
  "general",
]);
export type WorkItemKind = z.infer<typeof workItemKindSchema>;

export const workItemStatusSchema = z.enum([
  "inbox",
  "captured",
  "triaged",
  "waiting_input",
  "drafted",
  "running",
  "waiting_approval",
  "planned",
  "in_progress",
  "blocked",
  "ready_for_review",
  "done",
  "archived",
]);
export type WorkItemStatus = z.infer<typeof workItemStatusSchema>;

export const evidenceKindSchema = z.enum([
  "event",
  "memory",
  "ssot_reference",
  "file_reference",
  "url_reference",
  "message",
  "artifact",
  "routine_reference",
]);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;

export const evidenceRefSchema = z
  .object({
    id: z.string(),
    kind: evidenceKindSchema,
    reference: z.string(),
    title: z.string().optional(),
    summary: z.string(),
    contentHash: z.string().optional(),
    revision: z.string().optional(),
    observedAt: z.string().optional(),
  })
  .strict();
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const missingInfoSlotSchema = z.object({
  id: z.string(),
  label: z.string(),
  reason: z.string(),
  required: z.boolean(),
  status: z.enum(["missing", "provided", "waived"]),
  resolvedByRef: z.string().optional(),
});
export type MissingInfoSlot = z.infer<typeof missingInfoSlotSchema>;

export const workSurfaceSchema = z.enum([
  "conversation",
  "debate",
  "coding_packet",
  "execution_slot",
  "tmux",
  "obsidian",
  "notion",
  "mobile",
]);
export type WorkSurface = z.infer<typeof workSurfaceSchema>;

export const handoffTargetSurfaceSchema = workSurfaceSchema;
export type HandoffTargetSurface = z.infer<typeof handoffTargetSurfaceSchema>;

export const workItemSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  title: z.string(),
  kind: workItemKindSchema,
  lane: workLaneSchema,
  surface: workSurfaceSchema.optional(),
  status: workItemStatusSchema,
  summary: z.string(),
  sourceRefs: z.array(workSourceRefSchema),
  evidenceRefs: z.array(evidenceRefSchema),
  missingInfo: z.array(missingInfoSlotSchema),
  ownerAgentId: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type WorkItem = z.infer<typeof workItemSchema>;

export const assistantDraftSchema = z.object({
  id: z.string(),
  workItemId: z.string(),
  sessionId: z.string(),
  title: z.string(),
  body: z.string(),
  targetSurface: handoffTargetSurfaceSchema,
  status: z.enum(["draft", "ready_for_review", "approved", "rejected", "sent"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidenceRefs: z.array(evidenceRefSchema),
  missingInfo: z.array(missingInfoSlotSchema),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type AssistantDraft = z.infer<typeof assistantDraftSchema>;

export const workItemHandoffSchema = z.object({
  id: z.string(),
  workItemId: z.string(),
  targetSurface: handoffTargetSurfaceSchema,
  summary: z.string(),
  payloadRef: z.string().optional(),
  evidenceRefs: z.array(evidenceRefSchema),
  missingInfo: z.array(missingInfoSlotSchema),
  approvalState: z.enum(["not_required", "required", "approved", "rejected", "expired"]),
  createdAt: z.string(),
});
export type WorkItemHandoff = z.infer<typeof workItemHandoffSchema>;

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

export const providerCompletionRouteSchema = z.enum(["server_proxy", "direct_provider", "local_fallback"]);
export type ProviderCompletionRoute = z.infer<typeof providerCompletionRouteSchema>;

export type ProviderCompletionStatus = "succeeded" | "failed" | "fallback_required";

export const providerCompletionRouteTypeSchema = z.enum([
  "personal",
  "trusted_remote_device",
  "shared",
  "slack_bot",
  "company_webapp",
  "multi_user_openclaw",
  "public_api",
  "scheduled_batch",
]);
export type ProviderCompletionRouteType = z.infer<typeof providerCompletionRouteTypeSchema>;

export const providerCompletionRequestContextSchema = z.object({
  userId: z.string().min(1).max(256),
  routeType: providerCompletionRouteTypeSchema.default("personal"),
  trustedDeviceId: z.string().min(1).max(256).optional(),
  humanInitiated: z.boolean().optional(),
});
export type ProviderCompletionRequestContext = z.infer<typeof providerCompletionRequestContextSchema>;

export const providerCompletionMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().max(200_000),
});
export type ProviderCompletionMessage = z.infer<typeof providerCompletionMessageSchema>;

/**
 * Multimodal payload rider for a completion request. Adapters that support
 * vision (Anthropic messages, OpenAI-compatible chat) attach these to the
 * LAST user turn; text-only adapters ignore them. Kept separate from the
 * message array so the wire format of `messages` stays plain strings.
 */
export const providerCompletionAttachmentSchema = z.object({
  name: z.string().min(1).max(512),
  kind: conversationAttachmentKindSchema,
  mimeType: z.string().min(1).max(256),
  /** base64 data URL (image kinds) */
  dataUrl: z.string().max(8_000_000).optional(),
  /** extracted text body (document kinds) */
  textContent: z.string().max(200_000).optional(),
});
export type ProviderCompletionAttachment = z.infer<typeof providerCompletionAttachmentSchema>;

export const providerCompletionRequestSchema = z.object({
  id: z.string().min(1).max(256),
  sessionId: z.string().min(1).max(256),
  providerProfileId: z.string().min(1).max(256),
  modelId: z.string().min(1).max(256),
  messages: z.array(providerCompletionMessageSchema).min(1).max(200),
  attachments: z.array(providerCompletionAttachmentSchema).max(6).optional(),
  /** 응답 생성 토큰 상한 — 어댑터 기본값(512 등)을 호출자가 올릴 수 있다 (대화 턴 잘림 방지) */
  maxOutputTokens: z.number().int().positive().max(32_000).optional(),
  source: eventSourceSchema,
  routePreference: providerCompletionRouteSchema,
  requestContext: providerCompletionRequestContextSchema.optional(),
  approvalState: z.enum(["not_required", "required", "approved", "rejected", "expired"]).optional(),
  permissionDecision: z.enum(["allow", "approval_required", "deny"]).optional(),
  createdAt: z.string().min(1).max(64),
});
export type ProviderCompletionRequest = z.infer<typeof providerCompletionRequestSchema>;

export const providerCompletionUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  /**
   * Anthropic-only: tokens consumed to populate the prompt cache on this
   * call. Optional everywhere else; adapters that do not surface cache
   * accounting simply omit it.
   */
  cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  /**
   * Anthropic-only: tokens read back from the prompt cache on this call.
   * Same optionality rules as above.
   */
  cacheReadInputTokens: z.number().int().nonnegative().optional(),
});
export type ProviderCompletionUsage = z.infer<typeof providerCompletionUsageSchema>;

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
  runtimeHints?: {
    estimatedTokens?: number;
    budgetApprovalThresholdTokens?: number;
    budgetHardLimitTokens?: number;
    retryable?: boolean;
    retryReason?: string;
  };
  error?: string;
  createdAt: string;
};

export const adapterErrorCategorySchema = z.enum([
  "network",
  "auth",
  "credential_expired",
  "refresh_required",
  "rate_limit",
  "bad_request",
  "provider",
  "blocked",
  "unknown",
]);
export type AdapterErrorCategory = z.infer<typeof adapterErrorCategorySchema>;

export const providerCompletionChunkEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("delta"),
    requestId: z.string(),
    sequence: z.number().int().nonnegative(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("usage"),
    requestId: z.string(),
    usage: providerCompletionUsageSchema,
  }),
  z.object({
    type: z.literal("done"),
    requestId: z.string(),
    finalContent: z.string(),
    stopReason: z.enum(["end_turn", "max_tokens", "stop_sequence", "tool_use", "cancelled"]).optional(),
    usage: providerCompletionUsageSchema.optional(),
    endpoint: z.string(),
    createdAt: z.string(),
    completedAt: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    requestId: z.string(),
    error: z.object({
      category: adapterErrorCategorySchema,
      message: z.string(),
      status: z.number().int().optional(),
      retryAfterSec: z.number().int().optional(),
      providerRawSnippet: z.string().optional(),
    }),
  }),
]);
export type ProviderCompletionChunkEvent = z.infer<typeof providerCompletionChunkEventSchema>;

export const agentDelegationEventTypeSchema = z.enum([
  "agent.delegation.detected",
  "agent.delegation.blocked",
  "agent.delegation.unknown_target",
  "agent.delegation.self_blocked",
  "agent.delegation.dispatched",
  "agent.delegation.succeeded",
  "agent.delegation.failed",
  "agent.delegation.followup.completed",
  "agent.delegation.followup.failed",
]);
export type AgentDelegationEventType = z.infer<typeof agentDelegationEventTypeSchema>;

export const agentDelegationAuthorityLevelSchema = z.enum(["agent", "orchestrator", "orchestrator_plus"]);
export type AgentDelegationAuthorityLevel = z.infer<typeof agentDelegationAuthorityLevelSchema>;

export const agentDelegationCompletionRouteSchema = z.enum(["server_proxy", "direct_provider", "local_fallback", "mock"]);
export type AgentDelegationCompletionRoute = z.infer<typeof agentDelegationCompletionRouteSchema>;

export const agentDelegationBasePayloadSchema = z
  .object({
    sourceAgentId: z.string().min(1),
    sourceAgentName: z.string().optional(),
    sourceRole: agentRoleSchema.optional(),
    sourcePersonaName: z.string().optional(),
    authorityLevel: agentDelegationAuthorityLevelSchema.optional(),
    depthLimit: z.number().int().nonnegative().optional(),
  })
  .strict();
export type AgentDelegationBasePayload = z.infer<typeof agentDelegationBasePayloadSchema>;

export const agentDelegationDetectedPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    sourceAgentName: z.string().min(1),
    sourceRole: agentRoleSchema,
    authorityLevel: agentDelegationAuthorityLevelSchema,
    targets: z.array(z.string().min(1)).max(32),
    count: z.number().int().nonnegative(),
    depthLimit: z.number().int().nonnegative(),
  })
  .strict();
export type AgentDelegationDetectedPayload = z.infer<typeof agentDelegationDetectedPayloadSchema>;

export const agentDelegationBlockedPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    target: z.string().min(1),
    reason: z.string().min(1).max(4_000),
  })
  .strict();
export type AgentDelegationBlockedPayload = z.infer<typeof agentDelegationBlockedPayloadSchema>;

export const agentDelegationUnknownTargetPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    target: z.string().min(1),
    promptLength: z.number().int().nonnegative().optional(),
  })
  .strict();
export type AgentDelegationUnknownTargetPayload = z.infer<typeof agentDelegationUnknownTargetPayloadSchema>;

export const agentDelegationSelfBlockedPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    target: z.string().min(1),
  })
  .strict();
export type AgentDelegationSelfBlockedPayload = z.infer<typeof agentDelegationSelfBlockedPayloadSchema>;

export const agentDelegationDispatchedPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    sourceAgentName: z.string().min(1),
    targetAgentId: z.string().min(1),
    targetAgentName: z.string().min(1),
    targetRole: agentRoleSchema,
    targetPersonaName: z.string().optional(),
    providerProfileId: z.string().min(1),
    modelId: z.string().min(1),
    promptLength: z.number().int().nonnegative(),
    authorityLevel: agentDelegationAuthorityLevelSchema,
    depthLimit: z.number().int().nonnegative(),
  })
  .strict();
export type AgentDelegationDispatchedPayload = z.infer<typeof agentDelegationDispatchedPayloadSchema>;

export const agentDelegationSucceededPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    targetAgentId: z.string().min(1),
    targetAgentName: z.string().min(1),
    targetRole: agentRoleSchema,
    providerProfileId: z.string().min(1),
    modelId: z.string().min(1),
    responseLength: z.number().int().nonnegative(),
    route: agentDelegationCompletionRouteSchema.optional(),
    realProviderCall: z.boolean().optional(),
  })
  .strict();
export type AgentDelegationSucceededPayload = z.infer<typeof agentDelegationSucceededPayloadSchema>;

export const agentDelegationFailedPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    targetAgentId: z.string().min(1),
    targetAgentName: z.string().min(1),
    targetRole: agentRoleSchema,
    providerProfileId: z.string().min(1),
    modelId: z.string().min(1),
    error: z.string().min(1).max(20_000),
  })
  .strict();
export type AgentDelegationFailedPayload = z.infer<typeof agentDelegationFailedPayloadSchema>;

export const agentDelegationFollowupCompletedPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    sourceAgentName: z.string().min(1),
    outcomeCount: z.number().int().nonnegative(),
    succeededCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    responseLength: z.number().int().nonnegative(),
  })
  .strict();
export type AgentDelegationFollowupCompletedPayload = z.infer<typeof agentDelegationFollowupCompletedPayloadSchema>;

export const agentDelegationFollowupFailedPayloadSchema = agentDelegationBasePayloadSchema
  .extend({
    sourceAgentName: z.string().min(1),
    outcomeCount: z.number().int().nonnegative(),
    error: z.string().min(1).max(20_000),
  })
  .strict();
export type AgentDelegationFollowupFailedPayload = z.infer<typeof agentDelegationFollowupFailedPayloadSchema>;

export const agentDelegationEventPayloadSchemaByType = {
  "agent.delegation.blocked": agentDelegationBlockedPayloadSchema,
  "agent.delegation.detected": agentDelegationDetectedPayloadSchema,
  "agent.delegation.dispatched": agentDelegationDispatchedPayloadSchema,
  "agent.delegation.failed": agentDelegationFailedPayloadSchema,
  "agent.delegation.followup.completed": agentDelegationFollowupCompletedPayloadSchema,
  "agent.delegation.followup.failed": agentDelegationFollowupFailedPayloadSchema,
  "agent.delegation.self_blocked": agentDelegationSelfBlockedPayloadSchema,
  "agent.delegation.succeeded": agentDelegationSucceededPayloadSchema,
  "agent.delegation.unknown_target": agentDelegationUnknownTargetPayloadSchema,
} satisfies Record<AgentDelegationEventType, z.ZodTypeAny>;

export type AgentDelegationEventPayload =
  | AgentDelegationBlockedPayload
  | AgentDelegationDetectedPayload
  | AgentDelegationDispatchedPayload
  | AgentDelegationFailedPayload
  | AgentDelegationFollowupCompletedPayload
  | AgentDelegationFollowupFailedPayload
  | AgentDelegationSelfBlockedPayload
  | AgentDelegationSucceededPayload
  | AgentDelegationUnknownTargetPayload;

export function parseAgentDelegationEventPayload(type: AgentDelegationEventType, payload: unknown) {
  return agentDelegationEventPayloadSchemaByType[type].parse(payload) as AgentDelegationEventPayload;
}

export const agentDelegationTimelineStatusSchema = z.enum([
  "pending",
  "in_flight",
  "succeeded",
  "failed",
  "blocked",
  "unknown_target",
  "self_blocked",
]);
export type AgentDelegationTimelineStatus = z.infer<typeof agentDelegationTimelineStatusSchema>;

export const agentDelegationFollowupStatusSchema = z.enum(["completed", "failed"]);
export type AgentDelegationFollowupStatus = z.infer<typeof agentDelegationFollowupStatusSchema>;

export type AgentDelegationTimelineFollowup = {
  eventId: string;
  status: AgentDelegationFollowupStatus;
  createdAt: string;
  outcomeCount: number;
  succeededCount?: number;
  blockedCount?: number;
  responseLength?: number;
  error?: string;
};

export type AgentDelegationTimelineItem = {
  id: string;
  sessionId: string;
  sourceAgentId: string;
  sourceAgentName?: string;
  sourceRole?: AgentRole;
  sourcePersonaName?: string;
  authorityLevel?: AgentDelegationAuthorityLevel;
  target: string;
  targetAgentId?: string;
  targetAgentName?: string;
  targetRole?: AgentRole;
  targetPersonaName?: string;
  providerProfileId?: string;
  modelId?: string;
  status: AgentDelegationTimelineStatus;
  promptLength?: number;
  responseLength?: number;
  route?: AgentDelegationCompletionRoute;
  realProviderCall?: boolean;
  reason?: string;
  error?: string;
  depthLimit?: number;
  detectedAt?: string;
  dispatchedAt?: string;
  completedAt?: string;
  eventIds: string[];
};

export type AgentDelegationTimelineProjection = {
  items: AgentDelegationTimelineItem[];
  followups: AgentDelegationTimelineFollowup[];
  summary: {
    total: number;
    pending: number;
    inFlight: number;
    succeeded: number;
    failed: number;
    blocked: number;
  };
};

export function projectAgentDelegationTimeline(events: EventEnvelope[]): AgentDelegationTimelineProjection {
  const sortedEvents = [...events]
    .filter((event) => agentDelegationEventTypeSchema.safeParse(event.type).success)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const items: AgentDelegationTimelineItem[] = [];
  const followups: AgentDelegationTimelineFollowup[] = [];

  for (const event of sortedEvents) {
    const type = agentDelegationEventTypeSchema.parse(event.type);
    const payload = parseAgentDelegationEventPayload(type, event.payload);

    if (type === "agent.delegation.detected") {
      const detected = payload as AgentDelegationDetectedPayload;
      detected.targets.forEach((target, index) => {
        items.push({
          id: `${event.id}:target:${index}`,
          sessionId: event.sessionId,
          sourceAgentId: detected.sourceAgentId,
          sourceAgentName: detected.sourceAgentName,
          sourceRole: detected.sourceRole,
          sourcePersonaName: detected.sourcePersonaName,
          authorityLevel: detected.authorityLevel,
          target,
          status: "pending",
          depthLimit: detected.depthLimit,
          detectedAt: event.createdAt,
          eventIds: [event.id],
        });
      });
      continue;
    }

    if (type === "agent.delegation.followup.completed") {
      const completed = payload as AgentDelegationFollowupCompletedPayload;
      followups.push({
        eventId: event.id,
        status: "completed",
        createdAt: event.createdAt,
        outcomeCount: completed.outcomeCount,
        succeededCount: completed.succeededCount,
        blockedCount: completed.blockedCount,
        responseLength: completed.responseLength,
      });
      continue;
    }

    if (type === "agent.delegation.followup.failed") {
      const failed = payload as AgentDelegationFollowupFailedPayload;
      followups.push({
        eventId: event.id,
        status: "failed",
        createdAt: event.createdAt,
        outcomeCount: failed.outcomeCount,
        error: failed.error,
      });
      continue;
    }

    applyDelegationEvent(items, event, type, payload);
  }

  const summary = {
    total: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    inFlight: items.filter((item) => item.status === "in_flight").length,
    succeeded: items.filter((item) => item.status === "succeeded").length,
    failed: items.filter((item) => item.status === "failed").length,
    blocked: items.filter((item) => ["blocked", "unknown_target", "self_blocked"].includes(item.status)).length,
  };

  return { followups, items, summary };
}

function applyDelegationEvent(
  items: AgentDelegationTimelineItem[],
  event: EventEnvelope,
  type: AgentDelegationEventType,
  payload: AgentDelegationEventPayload,
) {
  if (type === "agent.delegation.dispatched") {
    const dispatched = payload as AgentDelegationDispatchedPayload;
    const item = findPendingDelegationItem(items, event.sessionId, dispatched) ?? createDelegationTimelineItem(event, {
      sourceAgentId: dispatched.sourceAgentId,
      sourceAgentName: dispatched.sourceAgentName,
      target: dispatched.targetRole,
    });
    Object.assign(item, {
      authorityLevel: dispatched.authorityLevel,
      depthLimit: dispatched.depthLimit,
      dispatchedAt: event.createdAt,
      modelId: dispatched.modelId,
      promptLength: dispatched.promptLength,
      providerProfileId: dispatched.providerProfileId,
      sourceAgentName: dispatched.sourceAgentName,
      target: dispatched.targetRole,
      targetAgentId: dispatched.targetAgentId,
      targetAgentName: dispatched.targetAgentName,
      targetPersonaName: dispatched.targetPersonaName,
      targetRole: dispatched.targetRole,
      status: "in_flight" satisfies AgentDelegationTimelineStatus,
    });
    appendEventId(item, event.id);
    return;
  }

  if (type === "agent.delegation.succeeded") {
    const succeeded = payload as AgentDelegationSucceededPayload;
    const item = findDelegationItemByTargetAgent(items, event.sessionId, succeeded.sourceAgentId, succeeded.targetAgentId) ??
      createDelegationTimelineItem(event, {
        sourceAgentId: succeeded.sourceAgentId,
        target: succeeded.targetRole,
      });
    Object.assign(item, {
      completedAt: event.createdAt,
      modelId: succeeded.modelId,
      providerProfileId: succeeded.providerProfileId,
      realProviderCall: succeeded.realProviderCall,
      responseLength: succeeded.responseLength,
      route: succeeded.route,
      targetAgentId: succeeded.targetAgentId,
      targetAgentName: succeeded.targetAgentName,
      targetRole: succeeded.targetRole,
      status: "succeeded" satisfies AgentDelegationTimelineStatus,
    });
    appendEventId(item, event.id);
    return;
  }

  if (type === "agent.delegation.failed") {
    const failed = payload as AgentDelegationFailedPayload;
    const item = findDelegationItemByTargetAgent(items, event.sessionId, failed.sourceAgentId, failed.targetAgentId) ??
      createDelegationTimelineItem(event, {
        sourceAgentId: failed.sourceAgentId,
        target: failed.targetRole,
      });
    Object.assign(item, {
      completedAt: event.createdAt,
      error: failed.error,
      modelId: failed.modelId,
      providerProfileId: failed.providerProfileId,
      targetAgentId: failed.targetAgentId,
      targetAgentName: failed.targetAgentName,
      targetRole: failed.targetRole,
      status: "failed" satisfies AgentDelegationTimelineStatus,
    });
    appendEventId(item, event.id);
    return;
  }

  if (type === "agent.delegation.blocked") {
    const blocked = payload as AgentDelegationBlockedPayload;
    updateStringTargetItem(items, event, blocked, "blocked", blocked.reason);
    return;
  }

  if (type === "agent.delegation.unknown_target") {
    const unknown = payload as AgentDelegationUnknownTargetPayload;
    updateStringTargetItem(items, event, unknown, "unknown_target", "unknown delegation target");
    return;
  }

  if (type === "agent.delegation.self_blocked") {
    const selfBlocked = payload as AgentDelegationSelfBlockedPayload;
    updateStringTargetItem(items, event, selfBlocked, "self_blocked", "self delegation blocked");
  }
}

function updateStringTargetItem(
  items: AgentDelegationTimelineItem[],
  event: EventEnvelope,
  payload: AgentDelegationBlockedPayload | AgentDelegationUnknownTargetPayload | AgentDelegationSelfBlockedPayload,
  status: AgentDelegationTimelineStatus,
  reason: string,
) {
  const item = findPendingStringTargetItem(items, event.sessionId, payload.sourceAgentId, payload.target) ??
    createDelegationTimelineItem(event, {
      sourceAgentId: payload.sourceAgentId,
      target: payload.target,
    });
  Object.assign(item, {
    completedAt: event.createdAt,
    promptLength: "promptLength" in payload ? payload.promptLength : item.promptLength,
    reason,
    status,
    target: payload.target,
  });
  appendEventId(item, event.id);
}

function createDelegationTimelineItem(
  event: EventEnvelope,
  input: { sourceAgentId: string; sourceAgentName?: string; target: string },
): AgentDelegationTimelineItem {
  return {
    eventIds: [event.id],
    id: `${event.id}:timeline`,
    sessionId: event.sessionId,
    sourceAgentId: input.sourceAgentId,
    sourceAgentName: input.sourceAgentName,
    status: "pending",
    target: input.target,
  };
}

function findPendingDelegationItem(
  items: AgentDelegationTimelineItem[],
  sessionId: string,
  payload: AgentDelegationDispatchedPayload,
) {
  const candidateKeys = [
    payload.targetAgentId,
    payload.targetAgentName,
    payload.targetRole,
    payload.targetPersonaName,
  ].filter((value): value is string => Boolean(value)).map(normalizeDelegationTimelineKey);
  return items.find((item) =>
    item.sessionId === sessionId &&
    item.sourceAgentId === payload.sourceAgentId &&
    item.status === "pending" &&
    candidateKeys.includes(normalizeDelegationTimelineKey(item.target)),
  );
}

function findDelegationItemByTargetAgent(
  items: AgentDelegationTimelineItem[],
  sessionId: string,
  sourceAgentId: string,
  targetAgentId: string,
) {
  return [...items].reverse().find((item) =>
    item.sessionId === sessionId &&
    item.sourceAgentId === sourceAgentId &&
    item.targetAgentId === targetAgentId &&
    (item.status === "in_flight" || item.status === "pending"),
  );
}

function findPendingStringTargetItem(items: AgentDelegationTimelineItem[], sessionId: string, sourceAgentId: string, target: string) {
  const normalizedTarget = normalizeDelegationTimelineKey(target);
  return items.find((item) =>
    item.sessionId === sessionId &&
    item.sourceAgentId === sourceAgentId &&
    item.status === "pending" &&
    normalizeDelegationTimelineKey(item.target) === normalizedTarget,
  );
}

function appendEventId(item: AgentDelegationTimelineItem, eventId: string) {
  if (!item.eventIds.includes(eventId)) {
    item.eventIds.push(eventId);
  }
}

function normalizeDelegationTimelineKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

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

export type ExternalChannel = "external_legacy" | "mobile" | "api" | "webhook";

export type IngressAuthorType = "user" | "bot" | "manager" | "system";

export type IngressGuardName =
  | "shape_unification"
  | "noise_filter"
  | "self_response_prevention"
  | "external_agent_isolation"
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

export const permissionActionSchema = z.enum([
  "conversation_reply",
  "memory_write",
  "backup_export",
  "terminal_run",
  "file_write",
  "remote_workspace",
  "provider_completion",
  "device_reboot",
  "secret_view",
  "mobile_approval",
  "email_send",
  "external_reply",
  "external_message_send",
  "document_share",
  "calendar_create",
  "quote_send",
  "invoice_create",
  "payment_action",
  "contract_review",
  "deploy",
  "git_push",
  "unknown_external_effect",
]);
export type PermissionAction = z.infer<typeof permissionActionSchema>;

export const permissionActorSchema = z.enum(["user", "agent", "external_channel", "mobile", "server"]);
export type PermissionActor = z.infer<typeof permissionActorSchema>;

export const permissionDecisionSchema = z.enum(["allow", "approval_required", "deny"]);
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

export const redactionPhaseSchema = z.enum(["pre_send", "post_receive", "pre_store", "pre_backup", "pre_share"]);
export type RedactionPhase = z.infer<typeof redactionPhaseSchema>;

export const redactionRuleScopeSchema = z.enum(["input", "output", "event", "backup", "share"]);
export type RedactionRuleScope = z.infer<typeof redactionRuleScopeSchema>;

export const redactionRuleSchema = z.object({
  id: z.string(),
  phase: redactionPhaseSchema,
  name: z.string(),
  scope: redactionRuleScopeSchema,
  enabled: z.boolean(),
  pattern: z.string(),
  replacement: z.string(),
  reason: z.string(),
});
export type RedactionRule = z.infer<typeof redactionRuleSchema>;

export const approvalReplayKindSchema = z.enum([
  "provider_completion",
  "agent_delegation",
  "remote_run",
  "tmux_dispatch",
]);
export type ApprovalReplayKind = z.infer<typeof approvalReplayKindSchema>;

export const approvalReplayRequestSchema = z
  .object({
    kind: approvalReplayKindSchema,
    endpoint: z.string().min(1).max(512),
    method: z.enum(["POST"]),
    payload: z.unknown(),
  })
  .strict();
export type ApprovalReplayRequest = z.infer<typeof approvalReplayRequestSchema>;

export const approvalRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sourceItemId: z.string().optional(),
  subjectId: z.string(),
  actor: permissionActorSchema,
  channel: eventSourceSchema,
  sourceTrust: sourceTrustSchema,
  action: permissionActionSchema,
  requestedLevels: z.array(permissionLevelSchema),
  decision: permissionDecisionSchema,
  state: approvalStateSchema,
  reason: z.string(),
  costEstimateTokens: z.number().int().nonnegative().optional(),
  replay: approvalReplayRequestSchema.optional(),
  ttlSeconds: z.number().int().positive().optional(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const approvalDecisionRequestSchema = z
  .object({
    approvalId: z.string().optional(),
    sourceItemId: z.string().optional(),
    actor: permissionActorSchema.optional(),
    reason: z.string().max(2_000).optional(),
    decidedAt: z.string().optional(),
  })
  .refine((value) => Boolean(value.approvalId || value.sourceItemId), {
    message: "approvalId or sourceItemId is required",
  });
export type ApprovalDecisionRequest = z.infer<typeof approvalDecisionRequestSchema>;

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
  costEstimateTokens?: number;
  /**
   * Real, redaction-safe shell command this item would run, when one genuinely
   * exists (terminal/tmux dispatch). NEVER synthesized from the human summary —
   * absent for provider/merge/rollback/secret items that have no command.
   */
  commandPreview?: string;
  replayKind?: ApprovalReplayKind;
  replayEndpoint?: string;
  createdAt: string;
};

export type ApprovalQueueItem = {
  id: string;
  sourceItemId: string;
  summary: string;
  requestedBy: PermissionActor;
  action?: PermissionAction;
  reason?: string;
  sourceTrust?: SourceTrust;
  permissions: PermissionLevel[];
  state: ApprovalState;
  costEstimateTokens?: number;
  /** real command preview carried from the matrix item (terminal/tmux only); never fabricated */
  commandPreview?: string;
  createdAt: string;
  expiresAt?: string;
  replayKind?: ApprovalReplayKind;
  replayEndpoint?: string;
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

export const terminalCommandDispatchStateSchema = z.enum([
  "recorded",
  "pending_approval",
  "blocked",
  "dry_run",
  "sent",
  "failed",
]);
export type TerminalCommandDispatchState = z.infer<typeof terminalCommandDispatchStateSchema>;

export const terminalTimelineBlockKindSchema = z.enum([
  "planning",
  "command_intent",
  "approval",
  "dry_run",
  "dispatch",
  "capture",
  "handoff",
  "note",
]);
export type TerminalTimelineBlockKind = z.infer<typeof terminalTimelineBlockKindSchema>;

export const terminalTimelineBlockStatusSchema = z.enum([
  "planned",
  "pending_approval",
  "blocked",
  "dry_run",
  "running",
  "completed",
  "failed",
  "stale",
]);
export type TerminalTimelineBlockStatus = z.infer<typeof terminalTimelineBlockStatusSchema>;

export const terminalTimelineBlockSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    terminalSessionId: z.string(),
    paneId: z.string(),
    role: tmuxPaneRoleSchema,
    host: terminalHostKindSchema,
    kind: terminalTimelineBlockKindSchema,
    status: terminalTimelineBlockStatusSchema,
    title: z.string(),
    summary: z.string(),
    parentBlockId: z.string().optional(),
    commandIntentId: z.string().optional(),
    approvalId: z.string().optional(),
    runId: z.string().optional(),
    relatedEventIds: z.array(z.string()),
    outputPreview: z.string().optional(),
    redactionApplied: z.boolean(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    createdAt: z.string(),
  })
  .strict();
export type TerminalTimelineBlock = z.infer<typeof terminalTimelineBlockSchema>;

export const terminalPaneTimelineSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    terminalSessionId: z.string(),
    paneId: z.string(),
    role: tmuxPaneRoleSchema,
    host: terminalHostKindSchema,
    blocks: z.array(terminalTimelineBlockSchema),
    lastBlockId: z.string().optional(),
    updatedAt: z.string(),
  })
  .strict();
export type TerminalPaneTimeline = z.infer<typeof terminalPaneTimelineSchema>;

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

export const terminalCommandEventTypeSchema = z.enum([
  "terminal.command.intent.created",
  "terminal.command.blocked",
  "terminal.command.dry_run",
  "terminal.command.sent",
  "terminal.command.failed",
]);
export type TerminalCommandEventType = z.infer<typeof terminalCommandEventTypeSchema>;

export const terminalCommandIntentEventPayloadSchema = z
  .object({
    intent: terminalCommandIntentSchema,
    role: tmuxPaneRoleSchema,
    host: terminalHostKindSchema,
    tmuxSessionName: z.string(),
    rawCommandQuarantined: z.boolean(),
  })
  .strict();
export type TerminalCommandIntentEventPayload = z.infer<typeof terminalCommandIntentEventPayloadSchema>;

export const terminalCommandBlockedEventPayloadSchema = z
  .object({
    intentId: z.string(),
    terminalSessionId: z.string(),
    paneId: z.string(),
    role: tmuxPaneRoleSchema,
    host: terminalHostKindSchema,
    reason: z.string(),
    redactedCommandPreview: z.string(),
  })
  .strict();
export type TerminalCommandBlockedEventPayload = z.infer<typeof terminalCommandBlockedEventPayloadSchema>;

export const terminalCommandDryRunEventPayloadSchema = z
  .object({
    intentId: z.string(),
    terminalSessionId: z.string(),
    paneId: z.string(),
    role: tmuxPaneRoleSchema,
    host: terminalHostKindSchema,
    reason: z.string(),
    attempted: z.literal(false),
    redactedCommandPreview: z.string(),
  })
  .strict();
export type TerminalCommandDryRunEventPayload = z.infer<typeof terminalCommandDryRunEventPayloadSchema>;

export const terminalCommandSentEventPayloadSchema = z
  .object({
    intentId: z.string(),
    terminalSessionId: z.string(),
    paneId: z.string(),
    role: tmuxPaneRoleSchema,
    host: terminalHostKindSchema,
    stdoutPreview: z.string().optional(),
    stderrPreview: z.string().optional(),
  })
  .strict();
export type TerminalCommandSentEventPayload = z.infer<typeof terminalCommandSentEventPayloadSchema>;

export const terminalCommandFailedEventPayloadSchema = terminalCommandSentEventPayloadSchema
  .extend({
    reason: z.string(),
  })
  .strict();
export type TerminalCommandFailedEventPayload = z.infer<typeof terminalCommandFailedEventPayloadSchema>;

export type TerminalCommandEventPayload =
  | TerminalCommandIntentEventPayload
  | TerminalCommandBlockedEventPayload
  | TerminalCommandDryRunEventPayload
  | TerminalCommandSentEventPayload
  | TerminalCommandFailedEventPayload;

export function parseTerminalCommandEventPayload(
  type: TerminalCommandEventType,
  payload: unknown,
): TerminalCommandEventPayload {
  if (type === "terminal.command.intent.created") {
    return terminalCommandIntentEventPayloadSchema.parse(payload);
  }
  if (type === "terminal.command.blocked") {
    return terminalCommandBlockedEventPayloadSchema.parse(payload);
  }
  if (type === "terminal.command.dry_run") {
    return terminalCommandDryRunEventPayloadSchema.parse(payload);
  }
  if (type === "terminal.command.sent") {
    return terminalCommandSentEventPayloadSchema.parse(payload);
  }
  return terminalCommandFailedEventPayloadSchema.parse(payload);
}

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
  sourceChannel: z.enum(["desktop", "external_legacy", "mobile", "api", "agent"]),
  trustLevel: sourceTrustSchema,
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  activationState: memoryActivationStateSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  lastAccessedAt: z.string().optional(),
  losslessRestatement: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
  persons: z.array(z.string()).optional(),
  topic: z.string().optional(),
  importance: z.number().min(0).max(1).optional(),
  entityReinforcement: z.number().min(0).optional(),
  pinned: z.boolean(),
  tombstonedAt: z.string().optional(),
});
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export const memoryInputSchema = z.object({
  layer: memoryLayerSchema,
  scope: memoryScopeSchema.optional(),
  kind: memoryKindSchema.optional(),
  title: z.string(),
  content: z.string(),
  sourceChannel: memoryRecordSchema.shape.sourceChannel,
  trustLevel: sourceTrustSchema,
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;

export const memorySyncRequestSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  sessionId: z.string(),
  inputs: z.array(memoryInputSchema),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});
export type MemorySyncRequest = z.infer<typeof memorySyncRequestSchema>;

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
  fusionDetail?: {
    views: Array<{ view: "lexical" | "semantic" | "metadata"; rank: number; rawScore: number }>;
    fusionMode: "rrf" | "sum" | "weighted_sum";
  };
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

export type EventStoreAuthorityMode = "dgx02_authoritative_with_client_cache";

export type SyncRole = "authority" | "cache_client" | "compute_node";

export type ClientOutboxMode = "offline_cache_outbox" | "stateless";

export type ClientFailurePolicy = "continue_locally" | "unavailable_without_dgx" | "compute_degraded";

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
  eventStoreMode: EventStoreAuthorityMode;
  offlineWritePolicy: "append_local_outbox_when_offline" | "read_only";
  conflictPolicy: "dgx02_authority_wins" | "manual_review";
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

export const remoteExecutionKindSchema = z.enum(["model_inference", "workspace_run", "event_sync"]);
export type RemoteExecutionKind = z.infer<typeof remoteExecutionKindSchema>;

export const remoteExecutionRequestSchema = z.object({
  id: z.string().min(1).max(256),
  runId: z.string().min(1).max(256),
  kind: remoteExecutionKindSchema,
  targetNodeId: z.string().min(1).max(128),
  commandPreview: z.string().max(10_000),
  approvalState: approvalStateSchema,
  createdAt: z.string().min(1).max(64),
});
export type RemoteExecutionRequest = z.infer<typeof remoteExecutionRequestSchema>;

export type RemoteExecutionResponse = {
  id: string;
  requestId: string;
  status: "accepted" | "queued" | "blocked" | "fallback_required";
  targetNodeId: string;
  fallbackMode: "none" | "local_model" | "local_cli";
  message: string;
  createdAt: string;
};

export type DeviceRebootTarget = "dgx-01" | "dgx-02" | "client_macbook" | "client_home_pc";

export type DeviceRebootRequest = {
  id: string;
  targetNodeId: DeviceRebootTarget;
  requestedBy: "desktop" | "mobile" | "agent" | "api";
  approvalState: ApprovalState;
  reason: string;
  preflightChecks: string[];
  createdAt: string;
};

export type DeviceRebootWatchdog = {
  id: string;
  targetNodeId: DeviceRebootTarget;
  requiredServices: string[];
  reconnectTimeoutSeconds: number;
  status: "armed" | "waiting_reconnect" | "reconnected" | "failed" | "cancelled";
  createdAt: string;
  lastHeartbeatAt?: string;
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
  | "memory_trace"
  | "work_item"
  | "assistant_draft"
  | "routine"
  | "daily_briefing"
  | "approval_record";

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

export const ssotProviderKindSchema = z.enum(["markdown", "notion", "github"]);
export type SsotProviderKind = z.infer<typeof ssotProviderKindSchema>;

export const ssotSnapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  providerKind: ssotProviderKindSchema,
  sourceUrl: z.string().optional(),
  contentHash: z.string(),
  revision: z.string(),
  observedAt: z.string(),
  itemCount: z.number().int().nonnegative(),
});
export type SsotSnapshot = z.infer<typeof ssotSnapshotSchema>;

// --- Operator Cockpit Read-Only Snapshot (PR 2) ---

export const operatorCockpitWorkerStatusSchema = z.enum(["idle", "working", "blocked", "waiting_approval", "error"]);
export type OperatorCockpitWorkerStatus = z.infer<typeof operatorCockpitWorkerStatusSchema>;

export const operatorCockpitWorkerFleetSchema = z.object({
  workerId: z.string(),
  role: agentRoleSchema,
  status: operatorCockpitWorkerStatusSchema,
  statusRingColor: z.enum(["green", "yellow", "red", "gray"]),
  lane: workLaneSchema.optional(),
  surface: workSurfaceSchema.optional(),
  worktree: z.string().optional(),
  branch: z.string().optional(),
  blockedReason: z.string().optional(),
  securityTier: z.enum(["tmux", "container", "gvisor", "firecracker"]).optional(),
});
export type OperatorCockpitWorkerFleet = z.infer<typeof operatorCockpitWorkerFleetSchema>;

export const operatorCockpitApprovalEvidenceSchema = z.object({
  blockReason: z.string(),
  evidenceRefs: z.array(evidenceRefSchema),
  commandPreview: z.string().optional(),
  payloadBindingStatus: z.enum(["bound", "unbound", "expired"]),
  tamperWarning: z.boolean().optional(),
  securityRisk: z.string().optional(),
});
export type OperatorCockpitApprovalEvidence = z.infer<typeof operatorCockpitApprovalEvidenceSchema>;

export const operatorCockpitHandoffSchema = z.object({
  id: z.string().optional(),
  ownerAgentId: z.string(),
  nextAction: z.string(),
  targetSurface: handoffTargetSurfaceSchema.optional(),
  payloadRef: z.string().optional(),
  approvalState: z.enum(["not_required", "required", "approved", "rejected", "expired"]).optional(),
  missingInfoSlots: z.array(missingInfoSlotSchema),
  evidenceRefs: z.array(evidenceRefSchema).optional(),
});
export type OperatorCockpitHandoff = z.infer<typeof operatorCockpitHandoffSchema>;

export const operatorCockpitMemoryRecallSchema = z.object({
  contextReasons: z.array(z.string()),
  macBookAuthorityEnabled: z.boolean(),
  dgxMirrorHealth: z.enum(["healthy", "degraded", "disconnected"]),
  contradictionWarnings: z.array(z.string()),
});
export type OperatorCockpitMemoryRecall = z.infer<typeof operatorCockpitMemoryRecallSchema>;

export const operatorCockpitProviderRoutingSchema = z.object({
  selectedModelId: z.string(),
  fallbackStatus: z.enum(["active", "available", "none"]),
  costBadge: z.enum(["low", "medium", "high"]),
  speedBadge: z.enum(["fast", "average", "slow"]),
  trustBadge: sourceTrustSchema,
  assignedAgentCount: z.number().int().nonnegative().optional(),
  discoveryLabel: z.string().optional(),
  modelCount: z.number().int().nonnegative().optional(),
  providerLabel: z.string().optional(),
  readinessLabel: z.string().optional(),
  routeLabel: z.string().optional(),
  secretPolicyLabel: z.string().optional(),
});
export type OperatorCockpitProviderRouting = z.infer<typeof operatorCockpitProviderRoutingSchema>;

export const operatorCockpitRecoverySchema = z.object({
  offlineResumeSupported: z.boolean(),
  outboxSyncStatus: z.enum(["synced", "pending", "failed"]),
  healthIndicators: z.array(z.string()),
});
export type OperatorCockpitRecovery = z.infer<typeof operatorCockpitRecoverySchema>;

export const operatorCockpitDispatchHistorySchema = z.object({
  dispatchId: z.string(),
  requesterAgentId: z.string(),
  approvalState: z.enum(["not_required", "required", "approved", "rejected", "expired"]),
  actionSummary: z.string().optional(),
  decisionReason: z.string().optional(),
  ledgerDigest: z.string().optional(),
  policyCode: z.string().optional(),
  replayPayloadDigest: z.string(),
  tamperWarning: z.boolean(),
  tamperReason: z.string().optional(),
  sourceTrust: sourceTrustSchema.optional(),
  evidenceRefs: z.array(evidenceRefSchema).optional(),
  createdAt: z.string(),
});
export type OperatorCockpitDispatchHistory = z.infer<typeof operatorCockpitDispatchHistorySchema>;

export const operatorCockpitSnapshotSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  fleet: z.array(operatorCockpitWorkerFleetSchema),
  approvals: z.array(operatorCockpitApprovalEvidenceSchema),
  handoffs: z.array(operatorCockpitHandoffSchema),
  memory: operatorCockpitMemoryRecallSchema,
  routing: operatorCockpitProviderRoutingSchema,
  recovery: operatorCockpitRecoverySchema,
  dispatchHistory: z.array(operatorCockpitDispatchHistorySchema),
});
export type OperatorCockpitSnapshot = z.infer<typeof operatorCockpitSnapshotSchema>;
