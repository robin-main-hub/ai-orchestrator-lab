import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  Bot,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  GitBranch,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  Play,
  Plus,
  Pencil,
  Power,
  RadioTower,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createCodingPacketDraft,
  createDebateRounds,
  defaultAgentProfiles,
  type DebateContext,
} from "@ai-orchestrator/agents";
import {
  createProviderProfile,
  createProviderProfileFromCredentialInput,
  createProviderRuntimeReadiness,
  createSecretVaultSnapshot,
  discoverModelsForProfile,
} from "@ai-orchestrator/providers";
import {
  appendEventToLog,
  buildMockAssistantReply,
  createCodingPacketFromConversation,
  createStage2Event,
  DEFAULT_SESSION_ID,
  renderObsidianMarkdown,
} from "./runtime/stage2Runtime";
import {
  createStage3DebateSession,
  type Stage3DebateSession,
} from "./runtime/stage3Runtime";
import {
  createStage4AgentRun,
  type Stage4AgentRun,
} from "./runtime/stage4Runtime";
import {
  createStage5DgxBridge,
  type Stage5DgxBridge,
} from "./runtime/stage5Runtime";
import {
  activateMemoryRecord,
  createSeedMemoryRecords,
  createStage6MemoryInspector,
  forgetMemoryRecord,
  pinMemoryRecord,
  rememberStage6Context,
  type Stage6MemoryInspector,
} from "./runtime/stage6Memory";
import {
  applyStage7ProjectionStatuses,
  createStage7BackupSnapshot,
  getArtifactContent,
  getObsidianArtifact,
  type Stage7BackupSnapshot,
} from "./runtime/stage7Backup";
import {
  createStage8IngressSnapshot,
  createTelegramDemoInput,
  type Stage8IngressSnapshot,
} from "./runtime/stage8Ingress";
import {
  createStage9PermissionSnapshot,
  nextRequiredPermission,
} from "./runtime/stage9Permission";
import {
  isDgxRoutedProvider,
  requestDgxProviderCompletion,
} from "./runtime/stage12DgxProvider";
import { fetchDgxProviderModelDiscovery, fetchDgxProviderRegistry, probeDgxOrchestratorServer } from "./runtime/stage13DgxServer";
import { DEFAULT_DGX_SERVER_BASE_URL } from "./runtime/stage30DgxEndpoints";
import {
  createInitialEventSyncState,
  pushEventsToDgxEventStorage,
  reduceEventSyncState,
  type Stage14EventSyncState,
} from "./runtime/stage14EventSync";
import {
  createLocalClientEventCache,
  mergeClientEventOutboxEvents,
} from "./runtime/stage29LocalEventStore";
import {
  mergeConversationMessages,
  mergeEventReplayLogs,
  pullAndReplayDgxEventStorage,
  rebuildConversationMessagesFromEvents,
} from "./runtime/stage18EventReplay";
import { extractLatestCodingPacketFromEvents } from "./runtime/stage19CodingPacketReplay";
import {
  createInitialSessionIndexState,
  fetchDgxSessionIndex,
  type Stage20SessionIndexState,
} from "./runtime/stage20SessionIndex";
import { createObsidianExportPlan } from "./runtime/stage26ObsidianExport";
import type {
  AgentProfile,
  AssistantDraft,
  ApprovalState,
  BackupProjection,
  BranchExperiment,
  CodingPacket,
  ConversationAttachment,
  ConversationMessage,
  ContextPackTier,
  DebateTag,
  DebateUtterance,
  DeviceRebootRequest,
  DeviceRebootWatchdog,
  EventEnvelope,
  EventSource,
  ExternalApprovalItem,
  InsightCategory,
  InsightFinding,
  MemoryRecord,
  ModelDescriptor,
  ModelDiscoverySnapshot,
  PermissionMatrixSnapshot,
  ProviderProfile,
  ProviderRuntimeReadiness,
  ReviewMode,
  RuntimeSnapshot,
  SecretRef,
  SecretVaultSnapshot,
  SourceTrust,
  TerminalSlot,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import type {
  AgentActivityStatus,
  AgentConfigTab,
  AgentCreativityLevel,
  AgentPersonaSettings,
  AgentVisualSettings,
  AgentVoicePreset,
  CenterMode,
  DraftAttachment,
  MetaOnboardingSignal,
  ModelCatalog,
  NavItem,
  NavItemId,
  ProviderRegistrationMode,
  Stage3DebateUtteranceView,
  WindowAuditItem,
  WindowAuditStatus,
  WorkbenchAgent,
} from "./types";
import {
  agentRoleOptions,
  agentVisualStorageKey,
  defaultObsidianVaultRoot,
  maxDraftAttachments,
  modelWindowSize,
  now,
  providerProfilesSeedVersion,
  providerProfilesSeedVersionKey,
  providerProfilesStorageKey,
} from "./lib/appConstants";
import {
  agentRoleLabel,
  attachmentAcceptForModel,
  attachmentCapabilityLabel,
  classifyDraftAttachment,
  createDefaultPersonaSettings,
  createDraftAttachment,
  createInitialAgentVisualSettings,
  formatAttachmentSize,
  getAgentInitials,
  getMessageAttachments,
  modelSupportsAnyAttachment,
  modelSupportsAttachmentKind,
  slugifyProviderName,
} from "./lib/helpers";
import {
  createInitialProviderProfiles,
  createModelDiscoveryFromRegistryEntry,
  mergeProviderProfilesFromRegistry,
  seededModelCatalog,
  seededProviderProfiles,
} from "./seeds/providers";
import { runtimeSnapshot } from "./seeds/runtime";
import { seededAgentProfiles } from "./seeds/agents";



const debateContext: DebateContext = {
  sessionId: DEFAULT_SESSION_ID,
  problem: "AI Orchestrator Lab 초기 모노레포 골격을 구현한다.",
  conversationSummary: "문서화된 제품 방향을 유지하면서 protocol-first 구조와 데스크톱 작업판을 먼저 만든다.",
  constraints: ["실제 모델 호출 제외", "터미널 실행 제외", "API 키 원문 저장 금지"],
  openQuestions: ["Tauri 전환 시점", "DGX sync protocol 세부안"],
  userPreferences: ["한국어 UI", "작업실 같은 어두운 패널", "토론 결과는 Coding Packet으로 연결"],
  memoryTraceIds: ["trace_memory_001", "trace_review_003"],
};

const codingPacket: CodingPacket = createCodingPacketDraft(debateContext);
const debateRounds = createDebateRounds("debate_initial_skeleton");

const terminalSlots: TerminalSlot[] = [
  {
    id: "slot_local_cli",
    label: "Local CLI",
    status: "idle",
    permissionState: "not_required",
    lastCommandPreview: "대기",
  },
  {
    id: "slot_dgx_remote",
    label: "DGX Remote",
    status: "pending_approval",
    permissionState: "required",
    lastCommandPreview: "remote workspace 연결 요청",
  },
];

const backupProjections: BackupProjection[] = [
  {
    id: "backup_obsidian",
    sessionId: DEFAULT_SESSION_ID,
    target: "obsidian",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_notion",
    sessionId: DEFAULT_SESSION_ID,
    target: "notion",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_mobile",
    sessionId: DEFAULT_SESSION_ID,
    target: "mobile",
    status: "failed",
    redactionApplied: true,
  },
];

const navItems: NavItem[] = [
  { id: "sessions", label: "세션", icon: MessageSquare },
  { id: "projects", label: "프로젝트", icon: LayoutDashboard },
  { id: "providers", label: "프로바이더", icon: KeyRound },
  { id: "channels", label: "채널", icon: RadioTower },
  { id: "backup", label: "백업", icon: Archive },
];



const initialConversationMessages: ConversationMessage[] = [
  {
    id: "message_seed_user",
    sessionId: DEFAULT_SESSION_ID,
    role: "user",
    content: "문서에 맞춰 첫 구현 골격을 만들자. 토론으로 확대할 수 있게 경계도 살려줘.",
    createdAt: now,
  },
  {
    id: "message_seed_orchestrator",
    sessionId: DEFAULT_SESSION_ID,
    role: "assistant",
    content: "protocol, provider stub, agent runtime stub, desktop board를 먼저 연결하고 실제 모델 호출은 막아둔다.",
    createdAt: now,
    metadata: {
      agentName: "Orchestrator",
      providerProfileId: "provider_mock_local",
    },
  },
];

const initialBranchExperiments: BranchExperiment[] = [
  {
    id: "branch_shadow_architect",
    sourceSessionId: DEFAULT_SESSION_ID,
    title: "shadow: protocol-first 구조 검토",
    agentName: "Architect",
    status: "ready",
    summary: "메인 대화는 깨끗하게 유지하고, protocol/Event Storage 경계만 요약해서 채택 후보로 둔다.",
    createdAt: now,
  },
  {
    id: "branch_shadow_reviewer",
    sourceSessionId: DEFAULT_SESSION_ID,
    title: "shadow: 보안/권한 반대 검토",
    agentName: "Reviewer",
    status: "drafting",
    summary: "권한, redaction, provider trust가 흔들리는 지점을 별도 branch에서 검토한다.",
    createdAt: now,
  },
];

function createDesktopEvent<T>(type: string, payload: T, createdAt = new Date().toISOString()): EventEnvelope<T> {
  return createStage2Event({ type, payload, createdAt });
}

const initialEventLog: EventEnvelope[] = initialConversationMessages.map((message) =>
  createDesktopEvent(
    "conversation.message.created",
    {
      messageId: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      redaction: "applied",
    },
    message.createdAt,
  ),
);

const initialAgentRun = createStage4AgentRun({
  packet: codingPacket,
  primaryAgent: seededAgentProfiles[0],
  agents: seededAgentProfiles,
  messages: initialConversationMessages,
  events: initialEventLog,
  createdAt: now,
});

const initialDgxBridge = createStage5DgxBridge({
  run: initialAgentRun,
  runtime: runtimeSnapshot,
  createdAt: now,
});

const initialMemoryRecords = createSeedMemoryRecords(now);
const initialIngressSnapshot = createStage8IngressSnapshot(
  createTelegramDemoInput(new Date("2026-05-24T00:23:00.000+09:00").toISOString()),
);

const initialWorkItems: WorkItem[] = [
  {
    id: "work_item_bootstrap_event_storage",
    sessionId: DEFAULT_SESSION_ID,
    title: "DGX-02 Event Storage authority",
    kind: "review",
    lane: "check",
    status: "running",
    summary: "DGX-02 is authoritative; MacBook and Home PC keep client cache/outbox records.",
    sourceRefs: [{ source: "desktop_manual", observedAt: now, title: "PR0 authority cleanup" }],
    evidenceRefs: [
      {
        id: "evidence_authority_type",
        kind: "file_reference",
        reference: "packages/protocol/src/index.ts",
        summary: "SyncTopology uses dgx02_authoritative_with_client_cache.",
        observedAt: now,
      },
    ],
    missingInfo: [],
    priority: "high",
    createdAt: now,
  },
];

const initialAssistantDrafts: AssistantDraft[] = [
  {
    id: "draft_bootstrap_handoff",
    workItemId: "work_item_bootstrap_event_storage",
    sessionId: DEFAULT_SESSION_ID,
    title: "Authority summary draft",
    body: "DGX-02 owns shared events; MacBook keeps a client cache/outbox and flushes after redaction.",
    targetSurface: "conversation",
    status: "ready_for_review",
    confidence: "high",
    evidenceRefs: initialWorkItems[0]?.evidenceRefs ?? [],
    missingInfo: [],
    createdAt: now,
  },
];

const initialWorkItemHandoffs: WorkItemHandoff[] = [
  {
    id: "handoff_bootstrap_packet",
    workItemId: "work_item_bootstrap_event_storage",
    targetSurface: "coding_packet",
    summary: "Use authority model as a coding packet constraint.",
    payloadRef: "coding_packet://initial",
    evidenceRefs: initialWorkItems[0]?.evidenceRefs ?? [],
    missingInfo: [],
    approvalState: "not_required",
    createdAt: now,
  },
];

export function App() {
  const [mode, setMode] = useState<CenterMode>("conversation");
  const [runtimeSnapshotState, setRuntimeSnapshotState] = useState<RuntimeSnapshot>(runtimeSnapshot);
  const localClientEventCache = useMemo(
    () => createLocalClientEventCache(typeof window === "undefined" ? undefined : window.localStorage),
    [],
  );
  const [eventOutbox, setEventOutbox] = useState<EventEnvelope[]>([]);
  const [activeNavItem, setActiveNavItem] = useState<NavItemId>("sessions");
  const [providerRegistrationOpen, setProviderRegistrationOpen] = useState(false);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>(createInitialProviderProfiles);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>(seededModelCatalog);
  const [modelDiscoveryByProviderId, setModelDiscoveryByProviderId] = useState<Record<string, ModelDiscoverySnapshot>>({});
  const [agents, setAgents] = useState<WorkbenchAgent[]>(seededAgentProfiles);
  const [agentActivityById, setAgentActivityById] = useState<Record<string, AgentActivityStatus>>({});
  const [agentVisualsById, setAgentVisualsById] = useState<Record<string, AgentVisualSettings>>(() =>
    createInitialAgentVisualSettings(seededAgentProfiles),
  );
  const [modelWindowStartByAgentId, setModelWindowStartByAgentId] = useState<Record<string, number>>({});
  const [selectedAgentId, setSelectedAgentId] = useState(seededAgentProfiles[0]?.id ?? "");
  const [agentSettingsAgentId, setAgentSettingsAgentId] = useState<string | undefined>();
  const [agentConfigPanel, setAgentConfigPanel] = useState<{ open: boolean; tab: AgentConfigTab }>({
    open: false,
    tab: "profile",
  });
  const [agentPersonaById, setAgentPersonaById] = useState<Record<string, AgentPersonaSettings>>(() =>
    Object.fromEntries(seededAgentProfiles.map((agent) => [agent.id, createDefaultPersonaSettings(agent)])),
  );
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>(initialConversationMessages);
  const [eventLog, setEventLog] = useState<EventEnvelope[]>(initialEventLog);
  const [activeSessionId, setActiveSessionId] = useState(DEFAULT_SESSION_ID);
  const [eventSyncState, setEventSyncState] = useState<Stage14EventSyncState>(() =>
    createInitialEventSyncState(0),
  );
  const [sessionIndexState, setSessionIndexState] = useState<Stage20SessionIndexState>(() =>
    createInitialSessionIndexState(),
  );
  const [syncedEventIds, setSyncedEventIds] = useState<Record<string, true>>({});
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>(initialMemoryRecords);
  const [ingressSnapshot, setIngressSnapshot] = useState<Stage8IngressSnapshot>(initialIngressSnapshot);
  const [rebootApprovals, setRebootApprovals] = useState<ExternalApprovalItem[]>([]);
  const [rebootWatchdogs, setRebootWatchdogs] = useState<DeviceRebootWatchdog[]>([]);
  const [approvalStateByItemId, setApprovalStateByItemId] = useState<Record<string, ApprovalState>>({});
  const [codingPacketState, setCodingPacketState] = useState<CodingPacket>(codingPacket);
  const [contextPackTier, setContextPackTier] = useState<ContextPackTier>("standard");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("quick");
  const [branchExperiments, setBranchExperiments] = useState<BranchExperiment[]>(initialBranchExperiments);
  const [workItems, setWorkItems] = useState<WorkItem[]>(initialWorkItems);
  const [assistantDrafts, setAssistantDrafts] = useState<AssistantDraft[]>(initialAssistantDrafts);
  const [workItemHandoffs, setWorkItemHandoffs] = useState<WorkItemHandoff[]>(initialWorkItemHandoffs);
  const [debateSession, setDebateSession] = useState<Stage3DebateSession>(() =>
    createStage3DebateSession({
      messages: initialConversationMessages,
      agents: seededAgentProfiles,
      providers: seededProviderProfiles,
      events: initialEventLog,
      runtime: runtimeSnapshot,
      createdAt: now,
    }),
  );
  const [agentRunState, setAgentRunState] = useState<Stage4AgentRun>(initialAgentRun);
  const [dgxBridgeState, setDgxBridgeState] = useState<Stage5DgxBridge>(initialDgxBridge);
  const [backupProjectionsState, setBackupProjectionsState] = useState<BackupProjection[]>(backupProjections);
  const [obsidianMarkdownPreview, setObsidianMarkdownPreview] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const activeProvider = useMemo(
    () => providerProfiles.find((profile) => profile.id === runtimeSnapshotState.activeProviderProfileId),
    [providerProfiles, runtimeSnapshotState.activeProviderProfileId],
  );
  const usedProviderIds = useMemo(
    () =>
      new Set(
        agents
          .map((agent) => agent.providerProfileId)
          .filter((providerId): providerId is string => Boolean(providerId)),
      ),
    [agents],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId],
  );
  const settingsAgent = useMemo(
    () => agents.find((agent) => agent.id === agentSettingsAgentId),
    [agentSettingsAgentId, agents],
  );
  const selectedAgentPersona = selectedAgent ? agentPersonaById[selectedAgent.id] : undefined;
  const selectedProvider = useMemo(
    () =>
      providerProfiles.find((profile) => profile.id === selectedAgent?.providerProfileId) ??
      activeProvider ??
      providerProfiles[0],
    [activeProvider, providerProfiles, selectedAgent],
  );
  const selectedModel = useMemo(() => {
    const providerModels = selectedProvider ? (modelCatalog[selectedProvider.id] ?? []) : [];
    return (
      providerModels.find((model) => model.id === selectedAgent?.modelId) ??
      providerModels.find((model) => model.id === selectedProvider?.defaultModel) ??
      providerModels[0]
    );
  }, [modelCatalog, selectedAgent, selectedProvider]);
  const secretVaultSnapshot = useMemo(
    () => createSecretVaultSnapshot(providerProfiles, runtimeSnapshotState.updatedAt),
    [providerProfiles, runtimeSnapshotState.updatedAt],
  );
  const providerReadiness = useMemo(
    () =>
      createProviderRuntimeReadiness({
        profile: selectedProvider,
        models: selectedProvider ? (modelCatalog[selectedProvider.id] ?? []) : [],
        vault: secretVaultSnapshot,
        selectedModelId: selectedAgent?.modelId ?? selectedProvider?.defaultModel,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [modelCatalog, runtimeSnapshotState.updatedAt, secretVaultSnapshot, selectedAgent, selectedProvider],
  );
  const memoryInspector = useMemo(
    () =>
      createStage6MemoryInspector({
        records: memoryRecords,
        messages: conversationMessages,
        packet: codingPacketState,
        events: eventLog,
        provider: selectedProvider,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [codingPacketState, conversationMessages, eventLog, memoryRecords, runtimeSnapshotState.updatedAt, selectedProvider],
  );
  const backupSnapshot = useMemo(
    () =>
      createStage7BackupSnapshot({
        sessionId: activeSessionId,
        messages: conversationMessages,
        packet: codingPacketState,
        events: eventLog,
        projections: backupProjectionsState,
        runtime: runtimeSnapshotState,
        agentRun: agentRunState,
        memoryInspector,
        obsidianVaultRoot: defaultObsidianVaultRoot,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [
      agentRunState,
      activeSessionId,
      backupProjectionsState,
      codingPacketState,
      conversationMessages,
      eventLog,
      memoryInspector,
      runtimeSnapshotState,
    ],
  );
  const permissionSnapshot = useMemo(
    () =>
      createStage9PermissionSnapshot({
        sessionId: activeSessionId,
        externalApprovals: [...rebootApprovals, ...ingressSnapshot.approvals],
        terminalSlots,
        agentRun: agentRunState,
        runtime: runtimeSnapshotState,
        mobilePolicy: backupSnapshot.mobilePolicy,
        providerReadiness,
        decisions: approvalStateByItemId,
        createdAt: runtimeSnapshotState.updatedAt,
      }),
    [
      activeSessionId,
      agentRunState,
      approvalStateByItemId,
      backupSnapshot.mobilePolicy,
      ingressSnapshot.approvals,
      providerReadiness,
      rebootApprovals,
      runtimeSnapshotState,
    ],
  );
  const insightFindings = useMemo(
    () =>
      createInsightFindings({
        packet: codingPacketState,
        eventCount: eventLog.length,
        permissionSnapshot,
        providerReadiness,
        memoryInspector,
      }),
    [codingPacketState, eventLog.length, memoryInspector, permissionSnapshot, providerReadiness],
  );
  const metaOnboardingSignals = useMemo(
    () =>
      createMetaOnboardingSignals({
        agents,
        providers: providerProfiles,
        models: modelCatalog,
        runtime: runtimeSnapshotState,
      }),
    [agents, modelCatalog, providerProfiles, runtimeSnapshotState],
  );

  useEffect(() => {
    void bootstrapLocalEventStorage();
  }, []);

  async function bootstrapLocalEventStorage() {
    for (const event of initialEventLog) {
      await localClientEventCache.append(event);
    }

    const localEvents = await localClientEventCache.listBySession(activeSessionId);
    const localUnsyncedEvents = await localClientEventCache.listUnsynced();
    const queuedEvents = mergeClientEventOutboxEvents([], localUnsyncedEvents);
    setEventLog((events) => mergeEventReplayLogs(events, localEvents));
    setEventOutbox(queuedEvents);

    if (queuedEvents.length > 0) {
      void syncEventsToDgx(queuedEvents);
    } else {
      void syncEventsToDgx(initialEventLog);
    }
    void handleRefreshSessionIndex();
  }

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(agentVisualStorageKey, JSON.stringify(agentVisualsById));
      }
    } catch {
      // Avatar persistence is convenience-only; Event Storage remains the source of truth.
    }
  }, [agentVisualsById]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(providerProfilesStorageKey, JSON.stringify(providerProfiles));
      }
    } catch {
      // Provider entries are also represented as Event Storage records; localStorage is only a client cache.
    }
  }, [providerProfiles]);

  useEffect(() => {
    setDraftAttachments((current) =>
      current.filter((attachment) => modelSupportsAttachmentKind(selectedModel, attachment.kind)),
    );
  }, [selectedModel?.id, selectedModel?.providerProfileId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let lastProviderRegistryRefreshAt = 0;
    const refreshWithThrottle = (trigger: string) => {
      const now = Date.now();
      if (now - lastProviderRegistryRefreshAt < 10_000) {
        return;
      }

      lastProviderRegistryRefreshAt = now;
      void refreshDgxProviderRegistry(trigger, { quiet: true });
    };
    const handleWindowFocus = () => refreshWithThrottle("window_focus");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshWithThrottle("visibility_visible");
      }
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        refreshWithThrottle("interval");
      }
    }, 120_000);

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function appendEvent<T>(
    type: string,
    payload: T,
    options?: {
      sessionId?: string;
      source?: EventSource;
      sourceTrust?: SourceTrust;
      correlationId?: string;
      skipRemoteSync?: boolean;
    },
  ) {
    const event = createStage2Event({
      sessionId: options?.sessionId ?? activeSessionId,
      type,
      payload,
      source: options?.source,
      sourceTrust: options?.sourceTrust,
      correlationId: options?.correlationId,
    });
    setEventLog((events) => appendEventToLog(events, event));
    void localClientEventCache.append(event);
    if (!options?.skipRemoteSync) {
      void syncEventsToDgx([event]);
    }
    return event;
  }

  async function syncEventsToDgx(eventsToSync: EventEnvelope[]) {
    if (eventsToSync.length === 0) {
      return;
    }

    for (const event of eventsToSync) {
      await localClientEventCache.append(event);
    }

    setEventSyncState((state) => ({
      ...state,
      status: "syncing",
      outboxCount: Math.max(state.outboxCount, eventsToSync.length),
    }));

    const result = await pushEventsToDgxEventStorage({
      events: eventsToSync,
    });
    if (result.syncedEventIds.length > 0) {
      await localClientEventCache.markProjected(result.syncedEventIds, "dgx-02");
    }

    const localUnsyncedEvents = await localClientEventCache.listUnsynced();
    const nextOutbox = mergeClientEventOutboxEvents(localUnsyncedEvents, result.queuedEvents);
    setEventOutbox(nextOutbox);

    setEventSyncState((state) => {
      const nextState = reduceEventSyncState(state, result);
      return {
        ...nextState,
        status: nextOutbox.length > 0 && nextState.status === "synced" ? "queued" : nextState.status,
        outboxCount: nextOutbox.length,
      };
    });
    if (result.syncedEventIds.length > 0) {
      setSyncedEventIds((current) => ({
        ...current,
        ...Object.fromEntries(result.syncedEventIds.map((eventId) => [eventId, true])),
      }));
    }
    const dgxReachable = Boolean(result.response);
    setRuntimeSnapshotState((snapshot) => ({
      ...snapshot,
      status: dgxReachable && nextOutbox.length === 0 ? "online" : "degraded",
      dgxStatus: dgxReachable ? "online" : "offline",
      memorySyncStatus: result.status === "synced" && nextOutbox.length === 0 ? "online" : "degraded",
      runtimeNodes: snapshot.runtimeNodes.map((node) =>
        node.id === "dgx-02"
          ? {
              ...node,
              status: dgxReachable ? "online" : "offline",
            }
          : node,
      ),
      syncTopology: {
        ...snapshot.syncTopology,
        clients: snapshot.syncTopology.clients.map((client) =>
          client.id === "client_macbook"
            ? {
                ...client,
                status: nextOutbox.length === 0 ? "online" : "degraded",
                outboxCount: nextOutbox.length,
                lastSeenAt: result.response?.createdAt ?? client.lastSeenAt,
              }
            : client.id === "client_home_pc"
              ? {
                  ...client,
                  status: dgxReachable ? "online" : "degraded",
                  outboxCount: 0,
                  lastSeenAt: result.response?.createdAt ?? client.lastSeenAt,
                }
            : client,
        ),
      },
      recentError:
        result.status === "queued"
          ? `DGX-02 Event Storage unavailable; MacBook local outbox active, Home PC waits for DGX recovery. ${result.error ?? ""}`
          : result.status === "failed"
            ? `Event Storage sync needs review. ${result.error ?? ""}`
            : undefined,
      updatedAt: result.response?.createdAt ?? new Date().toISOString(),
    }));

    if (dgxReachable) {
      void handleRefreshSessionIndex();
    }
  }

  async function handleSyncEventStorage() {
    const unsyncedEvents = eventLog.filter((event) => !syncedEventIds[event.id]);
    const localUnsyncedEvents = await localClientEventCache.listUnsynced();
    void syncEventsToDgx(
      mergeClientEventOutboxEvents(eventOutbox, mergeClientEventOutboxEvents(localUnsyncedEvents, unsyncedEvents)),
    );
  }

  function handleRouteWorkItem(workItemId: string, lane: WorkItem["lane"]) {
    const updatedAt = new Date().toISOString();
    setWorkItems((items) =>
      items.map((item) =>
        item.id === workItemId
          ? {
              ...item,
              lane,
              status: statusForWorkLane(lane),
              updatedAt,
            }
          : item,
      ),
    );
    appendEvent("work_item.routed", {
      workItemId,
      lane,
      status: statusForWorkLane(lane),
    });
  }

  function handleArchiveWorkItem(workItemId: string) {
    const updatedAt = new Date().toISOString();
    setWorkItems((items) =>
      items.map((item) =>
        item.id === workItemId
          ? {
              ...item,
              status: "archived",
              updatedAt,
            }
          : item,
      ),
    );
    appendEvent("work_item.archived", {
      workItemId,
    });
  }

  async function handleRefreshSessionIndex() {
    const result = await fetchDgxSessionIndex();
    setSessionIndexState(result);
    if (result.status === "loaded") {
      setEventSyncState((state) => ({
        ...state,
        serverRevision: result.serverRevision ?? state.serverRevision,
        lastSyncedAt: result.lastLoadedAt ?? state.lastSyncedAt,
      }));
    }
  }

  function handleCreateSession() {
    const createdAt = new Date().toISOString();
    const title = window.prompt("새 세션 이름", "새 작업 세션")?.trim() || "새 작업 세션";
    const nextSessionId = `session_${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
    setActiveSessionId(nextSessionId);
    setConversationMessages([]);
    setEventLog([]);
    setDraftMessage("");
    setDraftAttachments([]);

    appendEvent(
      "session.created",
      {
        sessionId: nextSessionId,
        title,
        sourceClient: "client_macbook",
      },
      {
        sessionId: nextSessionId,
      },
    );
  }

  function handleRenameActiveSession() {
    const currentTitle =
      sessionIndexState.sessions.find((session) => session.sessionId === activeSessionId)?.title ?? activeSessionId;
    const nextTitle = window.prompt("세션 이름 바꾸기", currentTitle)?.trim();
    if (!nextTitle || nextTitle === currentTitle) {
      return;
    }

    appendEvent("session.renamed", {
      sessionId: activeSessionId,
      title: nextTitle,
      previousTitle: currentTitle,
      sourceClient: "client_macbook",
    });
  }

  async function handleReplayEventStorage(sessionId = activeSessionId) {
    setEventSyncState((state) => ({
      ...state,
      status: "syncing",
    }));

    const localEvents = await localClientEventCache.listBySession(sessionId);
    const result = await pullAndReplayDgxEventStorage({
      sessionId,
    });

    if (result.status === "failed") {
      if (localEvents.length > 0) {
        const localMessages = rebuildConversationMessagesFromEvents(localEvents);
        const switchingSessions = sessionId !== activeSessionId;
        setEventLog((events) => mergeEventReplayLogs(switchingSessions ? [] : events, localEvents));
        setActiveSessionId(sessionId);
        setConversationMessages((messages) => (switchingSessions ? localMessages : mergeConversationMessages(messages, localMessages)));
        setEventSyncState((state) => ({
          ...state,
          status: "queued",
          lastError: `DGX-02 replay failed; restored from MacBook client cache. ${result.error ?? ""}`,
        }));
        return;
      }
      setEventSyncState((state) => ({
        ...state,
        status: "failed",
        lastError: result.error,
      }));
      setRuntimeSnapshotState((snapshot) => ({
        ...snapshot,
        status: "degraded",
        dgxStatus: "offline",
        recentError: `DGX-02 Event Storage replay failed. ${result.error ?? ""}`,
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    for (const event of result.events) {
      await localClientEventCache.append(event);
    }
    if (result.events.length > 0) {
      await localClientEventCache.markProjected(
        result.events.map((event) => event.id),
        "dgx-02",
      );
    }
    const mergedCachedEvents = mergeEventReplayLogs(localEvents, result.events, 512);
    const cachedMessages = mergeConversationMessages(
      rebuildConversationMessagesFromEvents(localEvents),
      result.messages,
    );
    const switchingSessions = sessionId !== activeSessionId;
    setEventLog((events) => mergeEventReplayLogs(switchingSessions ? [] : events, mergedCachedEvents));
    setActiveSessionId(sessionId);
    setConversationMessages((messages) =>
      switchingSessions ? cachedMessages : mergeConversationMessages(messages, cachedMessages),
    );
    const packetReplay = extractLatestCodingPacketFromEvents(result.events);
    if (packetReplay.status === "restored" && packetReplay.packet) {
      setCodingPacketState(packetReplay.packet);
    }
    setSyncedEventIds((current) => ({
      ...current,
      ...Object.fromEntries(result.events.map((event) => [event.id, true])),
    }));
    setEventSyncState((state) => ({
      ...state,
      status: eventOutbox.length > 0 ? "queued" : "synced",
      serverRevision: result.serverRevision ?? state.serverRevision,
      lastSyncedAt: result.createdAt ?? state.lastSyncedAt,
      lastError: result.status === "empty" ? "DGX-02 Event Storage has no replayable events for this session" : undefined,
    }));
    setRuntimeSnapshotState((snapshot) => ({
      ...snapshot,
      status: eventOutbox.length > 0 ? "degraded" : "online",
      dgxStatus: "online",
      memorySyncStatus: eventOutbox.length > 0 ? "degraded" : "online",
      updatedAt: result.createdAt ?? new Date().toISOString(),
    }));
  }

  function handleAddDraftAttachments(fileList: FileList | null) {
    if (!fileList || !selectedModel || !modelSupportsAnyAttachment(selectedModel)) {
      appendEvent("conversation.attachment.blocked", {
        selectedModelId: selectedModel?.id ?? "model pending",
        reason: "selected model does not advertise image/document input",
        attachmentStorage: "metadata_only",
      });
      return;
    }

    const incomingFiles = Array.from(fileList);
    const supportedFiles = incomingFiles.filter((file) =>
      modelSupportsAttachmentKind(selectedModel, classifyDraftAttachment(file)),
    );
    const remainingSlots = Math.max(0, maxDraftAttachments - draftAttachments.length);
    const nextAttachments = supportedFiles.slice(0, remainingSlots).map(createDraftAttachment);

    if (nextAttachments.length === 0) {
      appendEvent("conversation.attachment.blocked", {
        selectedModelId: selectedModel.id,
        reason: remainingSlots === 0 ? "attachment limit reached" : "file kind is not supported by selected model",
        attemptedCount: incomingFiles.length,
        attachmentStorage: "metadata_only",
      });
      return;
    }

    setDraftAttachments((current) => [...current, ...nextAttachments].slice(0, maxDraftAttachments));
    appendEvent("conversation.attachment.queued", {
      selectedModelId: selectedModel.id,
      attachmentCount: nextAttachments.length,
      maxAttachmentCount: maxDraftAttachments,
      attachments: nextAttachments,
      attachmentStorage: "metadata_only",
      blockedCount: incomingFiles.length - nextAttachments.length,
      redaction: "metadata_only",
    });
  }

  function handleRemoveDraftAttachment(attachmentId: string) {
    setDraftAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function createConversationPipelineMessages({
    agent,
    memory,
    modelId,
    persona,
    provider,
    userMessage,
  }: {
    agent: WorkbenchAgent;
    memory: Stage6MemoryInspector;
    modelId: string;
    persona?: AgentPersonaSettings;
    provider: ProviderProfile;
    userMessage: ConversationMessage;
  }) {
    const recalledMemories = memory.trace.results
      .filter((result) => result.usedInDecision)
      .slice(0, 5)
      .map((result, index) => `${index + 1}. ${result.record.title}: ${result.record.content} (score ${result.score.toFixed(2)})`);
    const systemContent = [
      "AI Orchestrator Lab conversation pipeline.",
      "Reply in Korean unless the user explicitly asks for another language.",
      `Agent: ${agent.name} / role: ${agent.role}`,
      `Provider: ${provider.name} / model: ${modelId}`,
      persona
        ? `SOUL.md: ${persona.soulSummary}\nAGENTS.md: ${persona.agentsInstruction}\nCreativity: ${persona.creativityLevel}`
        : "SOUL.md: default role profile",
      recalledMemories.length > 0
        ? `Memento recall:\n${recalledMemories.join("\n")}`
        : "Memento recall: no selected records",
      "Do not claim terminal/file execution happened unless an execution event exists.",
      "If the next step needs code work, mention the Coding Packet boundary explicitly.",
    ].join("\n\n");

    const systemMessage: ConversationMessage = {
      id: `message_system_pipeline_${crypto.randomUUID()}`,
      sessionId: userMessage.sessionId,
      role: "system",
      content: systemContent,
      createdAt: userMessage.createdAt,
      metadata: {
        agentId: agent.id,
        providerProfileId: provider.id,
        modelId,
        memoryTraceId: memory.trace.id,
        recalledMemoryCount: recalledMemories.length,
      },
    };

    return [systemMessage, ...conversationMessages.slice(-8), userMessage];
  }

  async function handleSendMessageStage2() {
    const content = draftMessage.trim();
    const attachments = draftAttachments;
    if ((!content && attachments.length === 0) || !selectedAgent || !selectedProvider) {
      return;
    }

    const createdAt = new Date().toISOString();
    const authLabel = selectedAgent.authBinding?.label ?? "credential pending";
    const authMode = selectedAgent.authBinding?.mode ?? "provider_profile";
    const modelId = selectedModel?.id ?? selectedAgent.modelId ?? selectedProvider.defaultModel ?? "model pending";
    const messageContent = content || `첨부 ${attachments.length}개`;
    const attachmentMetadata = attachments.map((attachment) => ({ ...attachment }));
    const userMessage: ConversationMessage = {
      id: `message_user_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "user",
      content: messageContent,
      createdAt,
      metadata: attachmentMetadata.length > 0 ? { attachments: attachmentMetadata } : undefined,
    };
    const providerPermissionId = `permission_provider_${selectedProvider.id}`;
    const providerApprovalState = approvalStateByItemId[providerPermissionId];
    const providerNeedsApproval = providerReadiness.status === "needs_approval" && providerApprovalState !== "approved";
    const providerBlocked =
      providerReadiness.status === "blocked" ||
      providerReadiness.status === "credential_required" ||
      providerNeedsApproval;

    if (providerBlocked) {
      const blockedMessage: ConversationMessage = {
        id: `message_provider_blocked_${crypto.randomUUID()}`,
        sessionId: activeSessionId,
        role: "assistant",
        content: providerNeedsApproval
          ? `${selectedProvider.name}는 승인 후 사용할 수 있어. 하단 Permission 대기열에서 provider_completion을 승인하면 바로 이어서 보낼 수 있어.`
          : `${selectedProvider.name}는 아직 실행 준비가 안 됐어: ${providerReadiness.reason}`,
        createdAt,
        metadata: {
          providerProfileId: selectedProvider.id,
          readinessStatus: providerReadiness.status,
          permissionItemId: providerPermissionId,
        },
      };

      setConversationMessages((messages) => [...messages, userMessage, blockedMessage]);
      setDraftMessage("");
      setDraftAttachments([]);
      appendEvent("conversation.message.created", {
        messageId: userMessage.id,
        role: "user",
        content: messageContent,
        metadata: userMessage.metadata,
        contentLength: messageContent.length,
        attachmentCount: attachmentMetadata.length,
        attachments: attachmentMetadata,
        attachmentStorage: "metadata_only",
        redaction: "applied",
      });
      appendEvent("provider.completion.blocked", {
        agentId: selectedAgent.id,
        providerProfileId: selectedProvider.id,
        modelId,
        readinessStatus: providerReadiness.status,
        permissionItemId: providerPermissionId,
        reason: providerReadiness.reason,
        requestedMessageLength: messageContent.length,
        attachmentCount: attachmentMetadata.length,
        redaction: "applied",
      });
      appendEvent("conversation.message.created", {
        messageId: blockedMessage.id,
        role: "assistant",
        content: blockedMessage.content,
        metadata: blockedMessage.metadata,
        providerProfileId: selectedProvider.id,
        redaction: "applied",
      });
      return;
    }

    setAgentActivity(selectedAgent.id, "preparing");
    setConversationMessages((messages) => [...messages, userMessage]);
    setDraftMessage("");
    setDraftAttachments([]);
    appendEvent("conversation.message.created", {
      messageId: userMessage.id,
      role: "user",
      content: messageContent,
      metadata: userMessage.metadata,
      contentLength: messageContent.length,
      attachmentCount: attachmentMetadata.length,
      attachments: attachmentMetadata,
      attachmentStorage: "metadata_only",
      redaction: "applied",
    });
    const workItem: WorkItem = {
      id: `work_item_message_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      title: messageContent.slice(0, 64) || "Attachment request",
      kind: "conversation",
      lane: "check",
      status: "triaged",
      summary: messageContent.slice(0, 220) || `${attachmentMetadata.length} attachment(s) queued`,
      sourceRefs: [
        {
          source: "desktop_manual",
          externalId: userMessage.id,
          observedAt: createdAt,
          title: "Conversation Workbench message",
        },
      ],
      evidenceRefs: [
        {
          id: `evidence_message_${userMessage.id}`,
          kind: "message",
          reference: `message://${userMessage.id}`,
          summary: `User message captured with ${attachmentMetadata.length} attachment(s).`,
          observedAt: createdAt,
        },
      ],
      missingInfo: [],
      ownerAgentId: selectedAgent.id,
      priority: attachmentMetadata.length > 0 ? "high" : "normal",
      createdAt,
    };
    setWorkItems((items) => [workItem, ...items].slice(0, 12));
    appendEvent(isDgxRoutedProvider(selectedProvider) ? "provider.completion.dgx.requested" : "provider.completion.mocked", {
      agentId: selectedAgent.id,
      providerProfileId: selectedProvider.id,
      modelId,
      authMode,
      authLabel,
      routePreference: isDgxRoutedProvider(selectedProvider) ? "server_proxy" : "mock",
    });

    let reply = "";
    let completionMetadata: Record<string, unknown> = {};
    try {
      if (isDgxRoutedProvider(selectedProvider)) {
        const pipelineMessages = createConversationPipelineMessages({
          agent: selectedAgent,
          memory: memoryInspector,
          modelId,
          persona: selectedAgentPersona,
          provider: selectedProvider,
          userMessage,
        });
        appendEvent("prompt.pipeline.assembled", {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          modelId,
          messageCount: pipelineMessages.length,
          memoryTraceId: memoryInspector.trace.id,
          usedMemoryCount: memoryInspector.trace.results.filter((result) => result.usedInDecision).length,
          soulMode: selectedAgent.soulMode,
          redaction: "applied",
        });
        const result = await requestDgxProviderCompletion({
          provider: selectedProvider,
          modelId,
          messages: pipelineMessages,
        });
        reply = result.content;
        completionMetadata = {
          endpoint: result.endpoint,
          route: result.route,
          fallbackReason: result.fallbackReason,
          usage: result.usage,
          realProviderCall: true,
        };
        appendEvent("provider.completion.dgx.succeeded", {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          modelId,
          endpoint: result.endpoint,
          route: result.route,
          fallbackReason: result.fallbackReason,
          usage: result.usage,
        });
      } else {
        reply = buildMockAssistantReply({
          content: messageContent,
          agent: selectedAgent,
          provider: selectedProvider,
        });
        completionMetadata = {
          realProviderCall: false,
        };
      }
    } catch (error) {
      reply = `${selectedProvider.name} 호출에 실패했어. ${error instanceof Error ? error.message : String(error)}`;
      completionMetadata = {
        error: error instanceof Error ? error.message : String(error),
        realProviderCall: false,
      };
      appendEvent("provider.completion.dgx.failed", {
        agentId: selectedAgent.id,
        providerProfileId: selectedProvider.id,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const assistantMessage: ConversationMessage = {
      id: `message_agent_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "assistant",
      content: reply,
      createdAt: new Date().toISOString(),
      metadata: {
        agentName: selectedAgent.name,
        providerProfileId: selectedProvider.id,
        authMode,
        ...completionMetadata,
      },
    };

    setAgentActivity(selectedAgent.id, "responding");
    setConversationMessages((messages) => [...messages, assistantMessage]);
    const assistantDraft: AssistantDraft = {
      id: `draft_reply_${crypto.randomUUID()}`,
      workItemId: workItem.id,
      sessionId: activeSessionId,
      title: `${selectedAgent.name} reply`,
      body: reply.slice(0, 1200),
      targetSurface: "conversation",
      status: "sent",
      confidence: completionMetadata.realProviderCall ? "medium" : "low",
      evidenceRefs: workItem.evidenceRefs,
      missingInfo: [],
      createdAt: assistantMessage.createdAt,
    };
    setAssistantDrafts((drafts) => [assistantDraft, ...drafts].slice(0, 12));
    setWorkItems((items) =>
      items.map((item) =>
        item.id === workItem.id
          ? {
              ...item,
              lane: completionMetadata.realProviderCall ? "check" : "ask",
              status: completionMetadata.realProviderCall ? "drafted" : "waiting_input",
              updatedAt: assistantMessage.createdAt,
            }
          : item,
      ),
    );
    appendEvent("conversation.message.created", {
      messageId: assistantMessage.id,
      role: "assistant",
      content: reply,
      metadata: assistantMessage.metadata,
      agentName: selectedAgent.name,
      providerProfileId: selectedProvider.id,
      contentLength: reply.length,
      redaction: "applied",
    });
    window.setTimeout(() => {
      setAgentActivity(selectedAgent.id, "idle");
    }, 450);
  }

  function handleCreateCodingPacket() {
    const basePacket = createCodingPacketFromConversation({
      messages: conversationMessages,
      agent: selectedAgent,
      provider: selectedProvider,
    });
    const adoptedBranchSummaries = branchExperiments
      .filter((branch) => branch.status === "adopted")
      .map((branch) => `Adopted branch ${branch.title}: ${branch.summary}`)
      .slice(0, 3);
    const debateDecisions = debateSession.rounds
      .flatMap((round) => round.utterances)
      .filter((utterance) => utterance.tags.some((tag) => tag === "agreement" || tag === "coding_impact"))
      .map((utterance) => utterance.content)
      .slice(0, 5);
    const packet =
      mode === "debate"
        ? {
            ...basePacket,
            context: [
              `ContextPack tier: ${contextPackTier}`,
              ...adoptedBranchSummaries,
              ...basePacket.context,
              `Stage3 Debate: ${debateSession.summary}`,
              ...debateSession.contextPreview,
            ],
            decisions: [...debateDecisions, ...basePacket.decisions],
            reviewerNotes: [
              ...basePacket.reviewerNotes,
              `Debate ${debateSession.id}에서 ${debateSession.rounds.length}개 라운드를 반영함`,
            ],
          }
        : basePacket;

    const nextPacket =
      mode === "debate"
        ? packet
        : {
            ...packet,
            context: [`ContextPack tier: ${contextPackTier}`, ...adoptedBranchSummaries, ...packet.context],
          };

    setCodingPacketState(nextPacket);
    const createdAt = new Date().toISOString();
    const workItem: WorkItem = {
      id: `work_item_packet_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      title: nextPacket.goal.slice(0, 72),
      kind: "coding_packet",
      lane: "approve",
      status: "waiting_approval",
      summary: `${nextPacket.decisions.length} decisions / ${nextPacket.implementationPlan.length} implementation steps`,
      sourceRefs: [{ source: "desktop_manual", observedAt: createdAt, title: "Coding Packet" }],
      evidenceRefs: [
        {
          id: `evidence_packet_${crypto.randomUUID()}`,
          kind: "artifact",
          reference: `coding_packet://${activeSessionId}`,
          summary: "Structured CodingPacket created from conversation/debate.",
          observedAt: createdAt,
        },
      ],
      missingInfo: nextPacket.filesToInspect.length === 0
        ? [
            {
              id: `missing_files_${crypto.randomUUID()}`,
              label: "Files to inspect",
              reason: "Coding handoff is safer with explicit file targets.",
              required: false,
              status: "missing",
            },
          ]
        : [],
      ownerAgentId: selectedAgent?.id,
      priority: mode === "debate" ? "high" : "normal",
      createdAt,
    };
    setWorkItems((items) => [workItem, ...items].slice(0, 12));
    const handoff: WorkItemHandoff = {
      id: `handoff_packet_${crypto.randomUUID()}`,
      workItemId: workItem.id,
      targetSurface: "execution_slot",
      summary: "Coding Packet is ready to route into execution slots after approval.",
      payloadRef: `coding_packet://${activeSessionId}`,
      evidenceRefs: workItem.evidenceRefs,
      missingInfo: workItem.missingInfo,
      approvalState: "required",
      createdAt,
    };
    setWorkItemHandoffs((handoffs) => [handoff, ...handoffs].slice(0, 12));
    appendEvent("coding_packet.created", {
      packet: nextPacket,
      goal: nextPacket.goal,
      contextPackTier,
      adoptedBranchCount: adoptedBranchSummaries.length,
      contextCount: nextPacket.context.length,
      decisionCount: nextPacket.decisions.length,
      filesToInspect: nextPacket.filesToInspect,
    });
  }

  function handleContextPackTierChange(tier: ContextPackTier) {
    setContextPackTier(tier);
    appendEvent("context_pack.tier.changed", {
      tier,
      assembly: ["identity", "recent_context", "long_term_memory", "skills", "tool_results"],
      redundancyPolicy: "avoid duplicate session-buffer context",
    });
  }

  function handleReviewModeChange(mode: ReviewMode) {
    setReviewMode(mode);
    appendEvent("review.mode.changed", {
      mode,
      reviewerPolicy: mode === "deep" ? "cross_vendor_roundtable" : "single_reviewer_fast_path",
      rubric: ["plan_coverage", "code_quality", "test_coverage", "convention"],
      invariantChecks: true,
    });
  }

  function handleCreateBranchExperiment() {
    const createdAt = new Date().toISOString();
    const nextBranch: BranchExperiment = {
      id: `branch_${crypto.randomUUID()}`,
      sourceSessionId: activeSessionId,
      title: `shadow: ${selectedAgent?.name ?? "Agent"} ${branchExperiments.length + 1}`,
      agentName: selectedAgent?.name ?? "Agent",
      status: "ready",
      summary: `${selectedAgent?.name ?? "Agent"}가 ${contextPackTier} ContextPack으로 현재 요구사항을 별도 shadow conversation에서 검토한다.`,
      createdAt,
    };

    setBranchExperiments((branches) => [nextBranch, ...branches].slice(0, 8));
    appendEvent("conversation.branch.created", {
      branch: nextBranch,
      contextPackTier,
      adoptPolicy: "summary_only",
    });
  }

  function handleAdoptBranchExperiment() {
    const branch = branchExperiments.find((candidate) => candidate.status !== "adopted");
    if (!branch) {
      return;
    }

    const createdAt = new Date().toISOString();
    const adoptionMessage: ConversationMessage = {
      id: `message_branch_adopted_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "assistant",
      content: `Branch 채택: ${branch.title} - ${branch.summary}`,
      createdAt,
      metadata: {
        branchId: branch.id,
        branchAdopted: true,
        contextPolicy: "summary_only",
      },
    };

    setBranchExperiments((branches) =>
      branches.map((candidate) => (candidate.id === branch.id ? { ...candidate, status: "adopted" } : candidate)),
    );
    setConversationMessages((messages) => [...messages, adoptionMessage]);
    appendEvent("conversation.branch.adopted", {
      branchId: branch.id,
      title: branch.title,
      summary: branch.summary,
      contextPolicy: "summary_only",
    });
    appendEvent("conversation.message.created", {
      messageId: adoptionMessage.id,
      role: adoptionMessage.role,
      content: adoptionMessage.content,
      metadata: adoptionMessage.metadata,
      redaction: "applied",
    });
  }

  function handlePromoteToDebate() {
    const session = createStage3DebateSession({
      messages: conversationMessages,
      agents,
      providers: providerProfiles,
      events: eventLog,
      runtime: runtimeSnapshotState,
    });

    setDebateSession(session);
    setMode("debate");
    appendEvent("debate.context.promoted", {
      debateId: session.id,
      participantCount: session.participants.length,
      roundCount: session.rounds.length,
      problemLength: session.problem.length,
    });
    appendEvent("debate.round.started", {
      debateId: session.id,
      roundId: session.rounds[0]?.id,
      kind: session.rounds[0]?.kind,
    });
  }

  function handleSelectDebateUtterance(utterance: Stage3DebateUtteranceView) {
    const agent = agents.find((candidate) => candidate.id === utterance.agentId);
    const createdAt = new Date().toISOString();
    const prompt = [
      "방금 토론 발언을 이어서 너와 직접 얘기하고 싶어.",
      "",
      `[${utterance.agentName} / ${utterance.roundTitle}]`,
      utterance.content,
      "",
      "이 발언의 근거, 리스크, 코딩 영향을 더 구체적으로 설명해줘.",
    ].join("\n");
    const workItem: WorkItem = {
      id: `work_item_debate_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      title: `${utterance.agentName} 발언 후속 대화`,
      kind: "decision",
      lane: "check",
      status: "triaged",
      summary: utterance.content.slice(0, 220),
      sourceRefs: [
        {
          source: "desktop_manual",
          externalId: utterance.id,
          observedAt: createdAt,
          title: "Debate utterance selected",
        },
      ],
      evidenceRefs: [
        {
          id: `evidence_debate_${utterance.id}`,
          kind: "event",
          reference: `debate_utterance://${utterance.id}`,
          summary: `${utterance.agentName} / ${utterance.roundTitle} 발언을 후속 대화로 선택함.`,
          observedAt: createdAt,
        },
      ],
      missingInfo: [],
      ownerAgentId: agent?.id,
      priority: utterance.tags.includes("risk") ? "high" : "normal",
      createdAt,
    };

    if (agent) {
      setSelectedAgentId(agent.id);
    }
    setDraftMessage(prompt);
    setMode("conversation");
    setWorkItems((items) => [workItem, ...items].slice(0, 12));
    appendEvent("debate.utterance.selected", {
      debateId: debateSession.id,
      utteranceId: utterance.id,
      agentId: utterance.agentId,
      roundTitle: utterance.roundTitle,
      tags: utterance.tags,
      handoff: "conversation_draft",
    });
  }

  function handleExportBackupProjections() {
    const snapshot = createStage7BackupSnapshot({
      sessionId: activeSessionId,
      messages: conversationMessages,
      packet: codingPacketState,
      events: eventLog,
      projections: backupProjectionsState,
      runtime: runtimeSnapshotState,
      agentRun: agentRunState,
      memoryInspector,
      obsidianVaultRoot: defaultObsidianVaultRoot,
    });
    const obsidianArtifact = getObsidianArtifact(snapshot);
    const markdown =
      getArtifactContent(snapshot, obsidianArtifact?.id) ||
      renderObsidianMarkdown({
        sessionId: activeSessionId,
        messages: conversationMessages,
        packet: codingPacketState,
        events: eventLog,
      });

    setObsidianMarkdownPreview(markdown);
    const obsidianExportPlan = obsidianArtifact
      ? createObsidianExportPlan({
          vaultRoot: defaultObsidianVaultRoot,
          artifact: obsidianArtifact,
          content: markdown,
        })
      : undefined;
    setBackupProjectionsState((projections) => applyStage7ProjectionStatuses(projections, snapshot));
    appendEvent("backup.projection.generated", {
      snapshotId: snapshot.id,
      artifactCount: snapshot.artifacts.length,
      ready: snapshot.summary.ready,
      queued: snapshot.summary.queued,
      blocked: snapshot.summary.blocked,
      redacted: snapshot.summary.redacted,
      obsidianExportPlan,
    });
    appendEvent("backup.queue.updated", {
      snapshotId: snapshot.id,
      queue: snapshot.queue.map((item) => ({
        target: item.target,
        status: item.status,
        reason: item.reason,
      })),
    });
    appendEvent("mobile.projection.policy.updated", {
      snapshotId: snapshot.id,
      policy: snapshot.mobilePolicy,
    });
  }

  function handleImportTelegramIngress() {
    const receivedAt = new Date().toISOString();
    const snapshot = createStage8IngressSnapshot(createTelegramDemoInput(receivedAt));
    const normalizedEvent = snapshot.result.normalizedEvent;

    setIngressSnapshot(snapshot);
    appendEvent(
      "ingress.guard.evaluated",
      {
        snapshotId: snapshot.id,
        channel: snapshot.channel,
        accepted: snapshot.result.accepted,
        confidence: snapshot.result.confidence,
        approvalState: snapshot.result.approvalState,
        guardSteps: snapshot.result.guardSteps.map((step) => ({
          name: step.name,
          status: step.status,
        })),
      },
      {
        source: "legacy_telegram",
        sourceTrust: "untrusted",
        correlationId: snapshot.id,
      },
    );

    if (!normalizedEvent) {
      appendEvent(
        "ingress.guard.blocked",
        {
          snapshotId: snapshot.id,
          reason: snapshot.result.reason,
        },
        {
          source: "legacy_telegram",
          sourceTrust: "untrusted",
          correlationId: snapshot.id,
        },
      );
      return;
    }

    const telegramMessage: ConversationMessage = {
      id: `message_telegram_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "user",
      content: normalizedEvent.normalizedText,
      createdAt: receivedAt,
      metadata: {
        channel: normalizedEvent.channel,
        ingressEventId: normalizedEvent.id,
        approvalState: snapshot.result.approvalState,
        sourceTrust: normalizedEvent.sourceTrust,
      },
    };

    setConversationMessages((messages) => [...messages, telegramMessage]);
    setMemoryRecords((records) => [
      {
        id: `memory_ingress_${normalizedEvent.id}`,
        layer: "fragment",
        title: "Telegram ingress candidate",
        content: normalizedEvent.normalizedText,
        sourceChannel: "legacy_telegram",
        trustLevel: "untrusted",
        createdAt: receivedAt,
        pinned: false,
      },
      ...records,
    ]);
    appendEvent(
      "conversation.message.created",
      {
        messageId: telegramMessage.id,
        role: "user",
        content: normalizedEvent.normalizedText,
        metadata: telegramMessage.metadata,
        channel: normalizedEvent.channel,
        ingressEventId: normalizedEvent.id,
        sourceTrust: normalizedEvent.sourceTrust,
        redaction: normalizedEvent.redacted ? "applied" : "none",
      },
      {
        source: "legacy_telegram",
        sourceTrust: "untrusted",
        correlationId: snapshot.id,
      },
    );
    appendEvent(
      "memory.candidate.created",
      {
        recordId: `memory_ingress_${normalizedEvent.id}`,
        sourceChannel: "legacy_telegram",
        trustLevel: "untrusted",
        autoRecall: false,
      },
      {
        source: "legacy_telegram",
        sourceTrust: "untrusted",
        correlationId: snapshot.id,
      },
    );

    if (snapshot.approvals.length > 0) {
      appendEvent(
        "permission.requested",
        {
          approvalIds: snapshot.approvals.map((approval) => approval.id),
          permissions: snapshot.approvals.flatMap((approval) => approval.permissions),
          channel: snapshot.channel,
        },
        {
          source: "legacy_telegram",
          sourceTrust: "untrusted",
          correlationId: snapshot.id,
        },
      );
    }
  }

  function createDeviceRebootRequest(targetNodeId: DeviceRebootRequest["targetNodeId"], createdAt: string): DeviceRebootRequest {
    return {
      id: `reboot_request_${targetNodeId}_${crypto.randomUUID()}`,
      targetNodeId,
      requestedBy: "desktop",
      approvalState: "required",
      reason:
        targetNodeId === "dgx-02"
          ? "DGX-02 main server reboot with Event Storage/watchdog preflight"
          : targetNodeId === "dgx-01"
            ? "DGX-01 guarded reboot request; operator approval and watchdog required"
            : "Client reboot request with local outbox preservation",
      preflightChecks: [
        "record reboot intent in Event Storage",
        "flush or preserve local outbox",
        "arm reconnect watchdog",
        "block direct execution until approval",
      ],
      createdAt,
    };
  }

  function createDeviceRebootWatchdog(
    targetNodeId: DeviceRebootWatchdog["targetNodeId"],
    createdAt: string,
  ): DeviceRebootWatchdog {
    const requiredServices =
      targetNodeId === "dgx-02"
        ? ["ai-orchestrator-server", "event-storage-api", "vllm-qwen36"]
        : targetNodeId === "dgx-01"
          ? ["ssh-heartbeat", "operator-confirmation"]
          : ["desktop-app", "event-outbox-cache"];

    return {
      id: `watchdog_${targetNodeId}_${crypto.randomUUID()}`,
      targetNodeId,
      requiredServices,
      reconnectTimeoutSeconds: targetNodeId === "dgx-02" ? 300 : 180,
      status: "armed",
      createdAt,
    };
  }

  function handleRequestDeviceReboot(targetNodeId: DeviceRebootRequest["targetNodeId"]) {
    const createdAt = new Date().toISOString();
    const request = createDeviceRebootRequest(targetNodeId, createdAt);
    const watchdog = createDeviceRebootWatchdog(targetNodeId, createdAt);
    const approval: ExternalApprovalItem = {
      id: `external_${request.id}`,
      ingressEventId: request.id,
      channel: "api",
      summary: `${targetNodeId} reboot requested with watchdog`,
      permissions: ["run_dangerous_commands", "remote_workspace"],
      state: "required",
      createdAt,
    };

    setRebootApprovals((items) => [approval, ...items].slice(0, 8));
    setRebootWatchdogs((items) => [watchdog, ...items].slice(0, 8));
    appendEvent("device.reboot.requested", {
      request,
      watchdogId: watchdog.id,
      approvalId: approval.id,
      redaction: "applied",
    });
    appendEvent("device.watchdog.armed", {
      watchdog,
      redaction: "applied",
    });
  }

  function handleResolveNextPermission(state: Extract<ApprovalState, "approved" | "rejected">) {
    const pendingItem = nextRequiredPermission(permissionSnapshot);
    if (!pendingItem) {
      return;
    }

    const decidedAt = new Date().toISOString();
    setApprovalStateByItemId((decisions) => ({
      ...decisions,
      [pendingItem.sourceItemId]: state,
    }));
    appendEvent(`permission.${state}`, {
      queueItemId: pendingItem.id,
      sourceItemId: pendingItem.sourceItemId,
      permissions: pendingItem.permissions,
      requestedBy: pendingItem.requestedBy,
    });
    appendEvent("permission.queue.updated", {
      snapshotId: permissionSnapshot.id,
      sourceItemId: pendingItem.sourceItemId,
      state,
      decidedAt,
    });

    if (pendingItem.sourceItemId.includes("reboot_request_")) {
      const matchedWatchdog = rebootWatchdogs.find((watchdog) =>
        pendingItem.sourceItemId.includes(watchdog.targetNodeId),
      );
      const nextWatchdogStatus: DeviceRebootWatchdog["status"] = state === "approved" ? "waiting_reconnect" : "cancelled";
      setRebootWatchdogs((watchdogs) =>
        watchdogs.map((watchdog) =>
          matchedWatchdog && watchdog.id === matchedWatchdog.id
            ? { ...watchdog, status: nextWatchdogStatus, lastHeartbeatAt: decidedAt }
            : watchdog,
        ),
      );
      appendEvent(`device.reboot.${state}`, {
        sourceItemId: pendingItem.sourceItemId,
        watchdogId: matchedWatchdog?.id,
        watchdogStatus: nextWatchdogStatus,
        redaction: "applied",
      });
    }

    if (
      state === "approved" &&
      pendingItem.permissions.includes("remote_workspace") &&
      !pendingItem.sourceItemId.includes("reboot_request_")
    ) {
      const bridge = createStage5DgxBridge({
        run: agentRunState,
        runtime: runtimeSnapshotState,
        approvalOverride: "approved",
        createdAt: decidedAt,
      });
      setDgxBridgeState(bridge);
      appendEvent("dgx.remote_run.approval_applied", {
        bridgeId: bridge.id,
        responseStatus: bridge.response.status,
        fallbackMode: bridge.response.fallbackMode,
      });
    }
  }

  function handleRememberCurrentContext() {
    const createdAt = new Date().toISOString();
    const candidates = rememberStage6Context({
      messages: conversationMessages,
      packet: codingPacketState,
      provider: selectedProvider,
      createdAt,
    });

    setMemoryRecords((records) => {
      const existingIds = new Set(records.map((record) => record.id));
      return [...candidates.filter((record) => !existingIds.has(record.id)), ...records];
    });
    setRuntimeSnapshotState((snapshot) => ({
      ...snapshot,
      memorySyncStatus: snapshot.dgxStatus === "online" ? "syncing" : "degraded",
      updatedAt: createdAt,
    }));
    appendEvent("memory.candidate.created", {
      recordIds: candidates.map((record) => record.id),
      count: candidates.length,
      sourceChannel: "desktop",
      trustLevel: selectedProvider?.trustLevel ?? "limited",
      providerProfileId: selectedProvider?.id,
    });
    appendEvent("memory.recall.trace.updated", {
      traceId: memoryInspector.trace.id,
      resultCount: memoryInspector.trace.results.length,
      usedCount: memoryInspector.trace.results.filter((result) => result.usedInDecision).length,
      blockedCount: memoryInspector.blockedCount,
    });
  }

  function handlePinMemory(recordId: string) {
    setMemoryRecords((records) => pinMemoryRecord(records, recordId));
    appendEvent("memory.pin.updated", {
      recordId,
      pinned: true,
    });
  }

  function handleActivateMemory(recordId: string) {
    setMemoryRecords((records) => activateMemoryRecord(records, recordId));
    appendEvent("memory.activation.updated", {
      recordId,
      activationState: "active",
    });
  }

  function handleForgetMemory(recordId: string) {
    setMemoryRecords((records) => forgetMemoryRecord(records, recordId));
    appendEvent("memory.forget.requested", {
      recordId,
      policy: "tombstone_projection",
    });
  }

  function handleCreateAgentRun() {
    const run = createStage4AgentRun({
      packet: codingPacketState,
      primaryAgent: selectedAgent,
      agents,
      messages: conversationMessages,
      events: eventLog,
    });

    setAgentRunState(run);
    const bridge = createStage5DgxBridge({
      run,
      runtime: runtimeSnapshotState,
    });
    setDgxBridgeState(bridge);
    if (selectedAgent) {
      setAgentActivity(selectedAgent.id, "preparing");
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "responding");
      }, 220);
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "idle");
      }, 900);
    }
    appendEvent("agent.run.planned", {
      runId: run.id,
      primaryAgentId: run.primaryAgentId,
      status: run.status,
      stepCount: run.steps.length,
      verifierStatus: run.verifier.status,
    });
    appendEvent("soul.summary.injected", {
      runId: run.id,
      primaryAgentId: run.primaryAgentId,
      mode: selectedAgent?.soulMode ?? "off",
    });
    appendEvent("memory.recall.used", {
      runId: run.id,
      traceCount: run.recallTrace.length,
      usedCount: run.recallTrace.filter((trace) => trace.usedInDecision).length,
      stage6TraceId: memoryInspector.trace.id,
      policy: memoryInspector.trace.policy.reason,
      blockedCount: memoryInspector.blockedCount,
    });
    appendEvent("run.replay.prepared", {
      runId: run.id,
      replayId: run.replay.id,
      eventCount: run.replay.eventIds.length,
    });
    appendEvent("dgx.remote_run.planned", {
      bridgeId: bridge.id,
      runId: run.id,
      targetNodeId: bridge.request.targetNodeId,
      responseStatus: bridge.response.status,
      fallbackMode: bridge.response.fallbackMode,
    });
    if (bridge.localFallbackEnabled) {
      appendEvent("runtime.local_fallback.ready", {
        bridgeId: bridge.id,
        reason: bridge.response.message,
        fallbackMode: bridge.response.fallbackMode,
      });
    }
  }

  async function handleProbeDgx() {
    const checkedAt = new Date().toISOString();
    const authorityNodeId = runtimeSnapshotState.syncTopology.authorityNodeId;

    appendEvent("dgx.server_probe.started", {
      authorityNodeId,
      endpoint: DEFAULT_DGX_SERVER_BASE_URL,
    });

    const probe = await probeDgxOrchestratorServer({
      localRuntime: runtimeSnapshotState,
      checkedAt,
    });
    const mergedRuntime = probe.runtime;
    const bridge = createStage5DgxBridge({
      run: agentRunState,
      runtime: mergedRuntime,
      createdAt: checkedAt,
    });
    const dgxProvider = providerProfiles.find((profile) => profile.id === "provider_dgx02_vllm");
    const dgxDiscovery = probe.modelDiscovery ?? (dgxProvider ? discoverModelsForProfile(dgxProvider, checkedAt) : undefined);

    setRuntimeSnapshotState(mergedRuntime);
    setDgxBridgeState(bridge);
    if (probe.status === "online" && dgxDiscovery) {
      setModelCatalog((catalog) => ({
        ...catalog,
        [dgxDiscovery.providerProfileId]: dgxDiscovery.models,
      }));
      setModelDiscoveryByProviderId((discoveries) => ({
        ...discoveries,
        [dgxDiscovery.providerProfileId]: dgxDiscovery,
      }));
    }
    if (probe.eventStorage) {
      setEventSyncState((state) => ({
        ...state,
        serverRevision: probe.eventStorage?.revision ?? state.serverRevision,
        lastSyncedAt: probe.eventStorage?.lastStoredAt ?? state.lastSyncedAt,
      }));
    }
    appendEvent("dgx.heartbeat.checked", {
      nodeId: probe.heartbeat.nodeId,
      status: probe.heartbeat.status,
      latencyMs: probe.heartbeat.latencyMs ?? probe.latencyMs,
      serverStatus: probe.status,
      error: probe.error,
      eventStorageRevision: probe.eventStorage?.revision,
      eventStorageMode: probe.eventStorage?.mode,
    });
    appendEvent("runtime.snapshot.merged", {
      authorityNodeId,
      dgxStatus: mergedRuntime.dgxStatus,
      eventStoreMode: mergedRuntime.syncTopology.eventStoreMode,
      source: probe.status === "online" ? "dgx_server" : "local_fallback",
    });
    if (probe.status === "online" && dgxDiscovery) {
      appendEvent("provider.models.remote_probe.merged", {
        providerProfileId: dgxDiscovery.providerProfileId,
        source: dgxDiscovery.source,
        modelCount: dgxDiscovery.models.length,
        selectedModelId: dgxDiscovery.selectedModelId,
      });
    }
    if (probe.status === "online") {
      void refreshDgxProviderRegistry("probe_dgx", { quiet: true });
    }
  }

  function setAgentActivity(agentId: string, status: AgentActivityStatus) {
    setAgentActivityById((currentStatus) => ({
      ...currentStatus,
      [agentId]: status,
    }));
  }

  function openAgentConfigPanel(tab: AgentConfigTab) {
    setAgentConfigPanel({ open: true, tab });
  }

  function updateSelectedAgentConfig(patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) {
    if (!selectedAgent) {
      return;
    }

    const nextPatch = patch.configSource === "off" ? { ...patch, soulMode: "off" as const } : patch;
    setAgents((currentAgents) =>
      currentAgents.map((agent) => (agent.id === selectedAgent.id ? { ...agent, ...nextPatch } : agent)),
    );
    appendEvent("agent.config.updated", {
      agentId: selectedAgent.id,
      configSource: nextPatch.configSource ?? selectedAgent.configSource,
      soulMode: nextPatch.soulMode ?? selectedAgent.soulMode,
      singleSourcePolicy: true,
    });
  }

  function updateSelectedAgentPersona(patch: Partial<AgentPersonaSettings>) {
    if (!selectedAgent) {
      return;
    }

    setAgentPersonaById((currentSettings) => ({
      ...currentSettings,
      [selectedAgent.id]: {
        ...(currentSettings[selectedAgent.id] ?? createDefaultPersonaSettings(selectedAgent)),
        ...patch,
      },
    }));
  }

  function handleAddAgent() {
    const nextIndex = agents.length + 1;
    const occupiedProviderIds = new Set(
      agents
        .map((agent) => agent.providerProfileId)
        .filter((providerId): providerId is string => Boolean(providerId)),
    );
    const provider = providerProfiles.find((profile) => !occupiedProviderIds.has(profile.id));
    const nextAgent: WorkbenchAgent = {
      id: `agent_custom_${crypto.randomUUID()}`,
      name: `Custom Agent ${nextIndex}`,
      kind: "virtual",
      role: "builder",
      providerProfileId: provider?.id,
      modelId: provider?.defaultModel,
      soulMode: "off",
      configSource: "off",
      authBinding: createAuthBinding(provider),
      enabled: true,
      permissionLevel: "read_only",
    };

    setAgents((currentAgents) => [...currentAgents, nextAgent]);
    setAgentPersonaById((currentSettings) => ({
      ...currentSettings,
      [nextAgent.id]: createDefaultPersonaSettings(nextAgent),
    }));
    setAgentVisualsById((currentSettings) => ({
      ...currentSettings,
      [nextAgent.id]: {},
    }));
    setSelectedAgentId(nextAgent.id);
    setAgentSettingsAgentId(nextAgent.id);
  }

  function handleRemoveAgent(agentId: string) {
    setAgents((currentAgents) => {
      if (currentAgents.length <= 1) {
        return currentAgents;
      }

      const nextAgents = currentAgents.filter((agent) => agent.id !== agentId);
      if (selectedAgentId === agentId) {
        setSelectedAgentId(nextAgents[0]?.id ?? "");
      }
      setAgentActivityById((currentStatus) => {
        const { [agentId]: _removedStatus, ...remainingStatus } = currentStatus;
        return remainingStatus;
      });
      setAgentPersonaById((currentSettings) => {
        const { [agentId]: _removedPersona, ...remainingSettings } = currentSettings;
        return remainingSettings;
      });
      setAgentVisualsById((currentSettings) => {
        const { [agentId]: _removedVisual, ...remainingSettings } = currentSettings;
        return remainingSettings;
      });
      if (agentSettingsAgentId === agentId) {
        setAgentSettingsAgentId(undefined);
      }
      return nextAgents;
    });
  }

  function createAuthBinding(provider?: ProviderProfile): WorkbenchAgent["authBinding"] {
    if (!provider) {
      return {
        mode: "provider_profile",
        label: "credential pending",
      };
    }

    if (provider.id === "provider_mock_local") {
      return {
        mode: "local",
        label: "local runtime",
        providerProfileId: provider.id,
      };
    }

    return {
      mode: provider.tags.includes("oauth") ? "oauth" : "provider_profile",
      label: provider.tags.includes("oauth") ? "OAuth/API profile" : "API secretRef",
      providerProfileId: provider.id,
      secretRefId: provider.secretRef?.id,
      oauthRef: provider.tags.includes("oauth") ? "oauth_pending" : undefined,
    };
  }

  function handleRunMetaOnboarding() {
    const preferredRoles: WorkbenchAgent["role"][] = ["verifier", "memory_curator", "skeptic"];
    const missingRole = preferredRoles.find((role) => !agents.some((agent) => agent.role === role));
    appendEvent("meta_agent.onboarding.scanned", {
      agentCount: agents.length,
      providerCount: providerProfiles.length,
      missingRole: missingRole ?? "none",
      signals: metaOnboardingSignals,
    });

    if (!missingRole) {
      return;
    }

    const provider = selectedProvider ?? providerProfiles[0];
    const modelId = provider ? (modelCatalog[provider.id]?.[0]?.id ?? provider.defaultModel) : undefined;
    const roleName = agentRoleLabel(missingRole);
    const nextAgent: WorkbenchAgent = {
      id: `agent_meta_${missingRole}_${crypto.randomUUID().slice(0, 8)}`,
      name: roleName,
      kind: "virtual",
      role: missingRole,
      providerProfileId: provider?.id,
      modelId,
      soulMode: missingRole === "memory_curator" ? "retrieved" : "summary",
      configSource: "internal",
      enabled: true,
      authBinding: createAuthBinding(provider),
    };

    setAgents((currentAgents) => [...currentAgents, nextAgent]);
    setAgentPersonaById((settings) => ({
      ...settings,
      [nextAgent.id]: createDefaultPersonaSettings(nextAgent),
    }));
    appendEvent("meta_agent.onboarding.applied", {
      agentId: nextAgent.id,
      role: nextAgent.role,
      providerProfileId: nextAgent.providerProfileId,
      modelId: nextAgent.modelId,
      reason: "missing tunaFlow-style orchestration role",
    });
  }

  function registerProviderProfile(nextProvider: ProviderProfile, registrationMode: ProviderRegistrationMode) {
    const discovery = discoverModelsForProfile(nextProvider);
    setProviderProfiles((profiles) => [...profiles, nextProvider]);
    setModelCatalog((catalog) => ({
      ...catalog,
      [nextProvider.id]: discovery.models,
    }));
    setModelDiscoveryByProviderId((current) => ({
      ...current,
      [nextProvider.id]: discovery,
    }));
    appendEvent("provider.profile.imported", {
      providerProfileId: nextProvider.id,
      kind: nextProvider.kind,
      trustLevel: nextProvider.trustLevel,
      secretRef: nextProvider.secretRef?.redactedPreview ?? "pending",
      registrationMode,
      modelCount: discovery.models.length,
    });
    appendEvent("provider.models.discovered", {
      providerProfileId: nextProvider.id,
      status: discovery.status,
      modelCount: discovery.models.length,
      source: discovery.source,
      redactionApplied: discovery.redactionApplied,
    });
    setProviderRegistrationOpen(false);
  }

  function handleRegisterProvider(mode: ProviderRegistrationMode) {
    const nextIndex = providerProfiles.length + 1;

    if (mode === "api_key") {
      const rawInput = window.prompt(
        "API key / env / Claude Code JSON 붙여넣기",
        'export ANTHROPIC_BASE_URL="https://api.apikey.fun"\nexport ANTHROPIC_AUTH_TOKEN=""',
      );

      if (rawInput === null) {
        return;
      }

      const nextProvider =
        rawInput.trim().length > 0
          ? createProviderProfileFromCredentialInput({
              id: `provider_custom_${crypto.randomUUID()}`,
              rawInput,
            }).profile
          : createProviderProfile({
              id: `provider_custom_${crypto.randomUUID()}`,
              name: `Custom Provider ${nextIndex}`,
              kind: "custom",
              baseUrl: "https://api.example.local/v1",
              defaultModel: `custom-model-${nextIndex}`,
              tags: ["custom"],
              trustLevel: "limited",
            });
      registerProviderProfile(nextProvider, "api_key");
      return;
    }

    if (mode === "cli") {
      const rawName = window.prompt("CLI 이름 또는 세션 이름", `Codex CLI ${nextIndex}`);

      if (rawName === null) {
        return;
      }

      const name = rawName.trim() || `Codex CLI ${nextIndex}`;
      const slug = slugifyProviderName(name, `cli-${nextIndex}`);
      registerProviderProfile(
        createProviderProfile({
          id: `provider_cli_${crypto.randomUUID()}`,
          name,
          kind: "custom",
          defaultModel: `${slug}-session`,
          tags: ["cli", "local"],
          trustLevel: "trusted",
        }),
        "cli",
      );
      return;
    }

    const rawName = window.prompt("OAuth 세션 이름", `Codex OAuth ${nextIndex}`);

    if (rawName === null) {
      return;
    }

    const name = rawName.trim() || `Codex OAuth ${nextIndex}`;
    const slug = slugifyProviderName(name, `oauth-${nextIndex}`);
    registerProviderProfile(
      createProviderProfile({
        id: `provider_oauth_${crypto.randomUUID()}`,
        name,
        kind: "custom",
        defaultModel: `${slug}-session`,
        tags: ["oauth", "session"],
        trustLevel: "trusted",
      }),
      "oauth",
    );
  }

  function handleAddProvider() {
    handleRegisterProvider("api_key");
  }

  async function handleDiscoverProviderModels(providerId: string) {
    const provider = providerProfiles.find((profile) => profile.id === providerId);
    if (!provider) {
      return;
    }

    const localDiscovery = discoverModelsForProfile(provider);
    let discovery = localDiscovery;
    let route: "dgx_provider_proxy" | "local_adapter" = "local_adapter";
    if (isDgxRoutedProvider(provider)) {
      try {
        discovery = await fetchDgxProviderModelDiscovery({ provider });
        route = "dgx_provider_proxy";
      } catch (error) {
        discovery = {
          ...localDiscovery,
          warnings: [
            ...localDiscovery.warnings,
            `DGX-02 provider model discovery failed; using local adapter metadata: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ],
        };
        appendEvent("provider.models.discovery_failed", {
          providerProfileId: provider.id,
          route: "dgx_provider_proxy",
          error: error instanceof Error ? error.message : String(error),
          fallback: "local_adapter",
        });
      }
    }
    setModelCatalog((catalog) => ({
      ...catalog,
      [provider.id]: discovery.models,
    }));
    setModelDiscoveryByProviderId((current) => ({
      ...current,
      [provider.id]: discovery,
    }));
    setProviderProfiles((profiles) =>
      profiles.map((profile) =>
        profile.id === provider.id
          ? {
              ...profile,
              defaultModel: discovery.selectedModelId ?? profile.defaultModel,
              modelDiscoveryEndpoint: profile.modelDiscoveryEndpoint ?? provider.modelDiscoveryEndpoint,
            }
          : profile,
      ),
    );
    appendEvent("provider.models.discovered", {
      providerProfileId: provider.id,
      status: discovery.status,
      modelCount: discovery.models.length,
      source: discovery.source,
      route,
      redactionApplied: discovery.redactionApplied,
      warnings: discovery.warnings,
    });
  }

  async function refreshDgxProviderRegistry(trigger: string, options: { quiet?: boolean } = {}) {
    try {
      const registry = await fetchDgxProviderRegistry();
      setProviderProfiles((profiles) => mergeProviderProfilesFromRegistry(profiles, registry));
      setModelCatalog((catalog) => ({
        ...catalog,
        ...Object.fromEntries(
          registry.entries.map((entry) => [
            entry.providerProfileId,
            createModelDiscoveryFromRegistryEntry(entry).models,
          ]),
        ),
      }));
      setModelDiscoveryByProviderId((discoveries) => ({
        ...discoveries,
        ...Object.fromEntries(
          registry.entries.map((entry) => [
            entry.providerProfileId,
            createModelDiscoveryFromRegistryEntry(entry),
          ]),
        ),
      }));
      appendEvent(options.quiet ? "provider.registry.refreshed" : "provider.registry.loaded", {
        registryId: registry.id,
        authorityNodeId: registry.authorityNodeId,
        trigger,
        summary: registry.summary,
        entries: registry.entries.map((entry) => ({
          providerProfileId: entry.providerProfileId,
          name: entry.name,
          authMode: entry.authMode,
          secretAvailability: entry.secretAvailability,
          secretRefPreview: entry.secretRefPreview,
          defaultModelIds: entry.defaultModelIds,
          rawSecretPersisted: false,
        })),
      });
      return registry;
    } catch (error) {
      appendEvent("provider.registry.failed", {
        authorityNodeId: "dgx-02",
        trigger,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  async function handleCheckProviderVault() {
    appendEvent("secret.vault.checked", {
      snapshotId: secretVaultSnapshot.id,
      available: secretVaultSnapshot.summary.available,
      missing: secretVaultSnapshot.summary.missing,
      transient: secretVaultSnapshot.summary.transient,
      rawSecretPersisted: secretVaultSnapshot.rawSecretPersisted,
    });
    appendEvent("provider.runtime.readiness.checked", {
      readinessId: providerReadiness.id,
      providerProfileId: providerReadiness.providerProfileId,
      status: providerReadiness.status,
      executionMode: providerReadiness.executionMode,
      canRunCompletion: providerReadiness.canRunCompletion,
      canUseAutomaticMemory: providerReadiness.canUseAutomaticMemory,
      reason: providerReadiness.reason,
    });

    await refreshDgxProviderRegistry("manual_provider_vault");
  }

  function handleRemoveProvider(providerId: string) {
    const isInUse = agents.some((agent) => agent.providerProfileId === providerId);
    if (providerProfiles.length <= 1 || isInUse) {
      return;
    }

    setProviderProfiles((profiles) => profiles.filter((profile) => profile.id !== providerId));
    setModelCatalog((catalog) => {
      const { [providerId]: _removedModels, ...remainingCatalog } = catalog;
      return remainingCatalog;
    });
    setModelDiscoveryByProviderId((discoveries) => {
      const { [providerId]: _removedDiscovery, ...remainingDiscoveries } = discoveries;
      return remainingDiscoveries;
    });
    appendEvent("provider.profile.removed", {
      providerProfileId: providerId,
      inUse: false,
      rawSecretPersisted: false,
    });
  }

  function handleRenameProvider(providerId: string) {
    const provider = providerProfiles.find((profile) => profile.id === providerId);
    const nextName = window.prompt("Provider 이름", provider?.name ?? "");
    if (!nextName?.trim()) {
      return;
    }

    setProviderProfiles((profiles) =>
      profiles.map((profile) => (profile.id === providerId ? { ...profile, name: nextName.trim() } : profile)),
    );
    appendEvent("provider.profile.renamed", {
      providerProfileId: providerId,
      previousName: provider?.name,
      nextName: nextName.trim(),
      rawSecretPersisted: false,
    });
  }

  function handleOpenAgentSettings(agentId: string) {
    setSelectedAgentId(agentId);
    setAgentSettingsAgentId(agentId);
  }

  function handleUpdateAgentProfile(agentId: string, patch: Partial<Pick<WorkbenchAgent, "name" | "role">>) {
    setAgents((currentAgents) =>
      currentAgents.map((agentProfile) => (agentProfile.id === agentId ? { ...agentProfile, ...patch } : agentProfile)),
    );
    appendEvent(
      "agent.profile.updated",
      {
        agentId,
        name: patch.name,
        role: patch.role,
        avatarStorage: "unchanged",
      },
      { skipRemoteSync: false },
    );
  }

  function handleUploadAgentAvatar(agentId: string, file: File) {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const avatarDataUrl = typeof reader.result === "string" ? reader.result : undefined;
      if (!avatarDataUrl) {
        return;
      }

      const avatarUpdatedAt = new Date().toISOString();
      setAgentVisualsById((currentSettings) => ({
        ...currentSettings,
        [agentId]: {
          avatarDataUrl,
          avatarUpdatedAt,
        },
      }));
      appendEvent("agent.avatar.updated", {
        agentId,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        storage: "embedded_data_url",
        avatarDataUrl,
      });
    };
    reader.readAsDataURL(file);
  }

  function handleClearAgentAvatar(agentId: string) {
    setAgentVisualsById((currentSettings) => ({
      ...currentSettings,
      [agentId]: {},
    }));
    appendEvent("agent.avatar.cleared", {
      agentId,
      storage: "embedded_data_url",
    });
  }

  function handleAssignProvider(agentId: string, providerId: string) {
    const provider = providerProfiles.find((profile) => profile.id === providerId);
    const isOccupied = agents.some((agent) => agent.id !== agentId && agent.providerProfileId === providerId);
    if (!provider || isOccupied) {
      return;
    }

    setAgents((currentAgents) =>
      currentAgents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              providerProfileId: provider.id,
              modelId: modelCatalog[provider.id]?.[0]?.id ?? provider.defaultModel,
              authBinding: createAuthBinding(provider),
            }
          : agent,
      ),
    );
    setModelWindowStartByAgentId((windowStart) => ({
      ...windowStart,
      [agentId]: 0,
    }));
  }

  function handleAssignModel(agentId: string, modelId: string) {
    setAgents((currentAgents) =>
      currentAgents.map((agent) => (agent.id === agentId ? { ...agent, modelId } : agent)),
    );
  }

  function handleShiftModelWindow(agentId: string, direction: -1 | 1) {
    const agent = agents.find((candidate) => candidate.id === agentId);
    const providerId = agent?.providerProfileId;
    const models = providerId ? (modelCatalog[providerId] ?? []) : [];
    const maxStart = Math.max(models.length - modelWindowSize, 0);

    setModelWindowStartByAgentId((windowStart) => {
      const currentStart = windowStart[agentId] ?? 0;
      const nextStart = Math.min(Math.max(currentStart + direction * modelWindowSize, 0), maxStart);
      return {
        ...windowStart,
        [agentId]: nextStart,
      };
    });
  }

  return (
    <div className={`app-shell ${mode === "tmux" ? "tmux-focus-shell" : ""}`}>
      <RuntimeStatusBar
        onProbeDgx={handleProbeDgx}
        providerName={activeProvider?.name ?? "미선택"}
        snapshot={runtimeSnapshotState}
      />
      <main className="workspace-grid">
        <aside
          className={`left-rail ${providerRegistrationOpen ? "provider-mode" : ""}`}
          aria-label="오케스트레이터 네비게이션"
        >
          <div className="brand-block">
            <div className="brand-mark">
              <Brain size={22} />
            </div>
            <div>
              <strong>AI Orchestrator Lab</strong>
              <span>desktop command room</span>
            </div>
          </div>

          <nav className="nav-stack">
            {navItems.map((item) => {
              const isActive = activeNavItem === item.id;
              return (
                <button
                  aria-expanded={isActive}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    setActiveNavItem(item.id);
                    setProviderRegistrationOpen(item.id === "providers");
                  }}
                  title={`${item.label} 메뉴`}
                  type="button"
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {isActive ? <ChevronRight size={16} /> : null}
                </button>
              );
            })}
          </nav>
          {providerRegistrationOpen ? (
            <ProviderRegistrationMenu
              modelCatalog={modelCatalog}
              modelDiscoveryByProviderId={modelDiscoveryByProviderId}
              onClose={() => {
                setProviderRegistrationOpen(false);
                setActiveNavItem("sessions");
              }}
              onDiscoverModels={handleDiscoverProviderModels}
              onRemoveProvider={handleRemoveProvider}
              onRenameProvider={handleRenameProvider}
              onRegister={handleRegisterProvider}
              profiles={providerProfiles}
              usedProviderIds={usedProviderIds}
            />
          ) : null}

          {activeNavItem === "sessions" ? (
            <>
              <SessionIndexRailPanel
                activeSessionId={activeSessionId}
                index={sessionIndexState}
                onCreateSession={handleCreateSession}
                onRefresh={handleRefreshSessionIndex}
                onRenameActiveSession={handleRenameActiveSession}
                onReplaySession={handleReplayEventStorage}
              />
              <RuntimeRailPanel
                onProbeDgx={handleProbeDgx}
                onRequestReboot={handleRequestDeviceReboot}
                rebootWatchdogs={rebootWatchdogs}
                snapshot={runtimeSnapshotState}
              />
              <OperationsRailPanel
                backupSnapshot={backupSnapshot}
                ingressSnapshot={ingressSnapshot}
                onCheckProviderVault={handleCheckProviderVault}
                onExportBackup={handleExportBackupProjections}
                onImportTelegram={handleImportTelegramIngress}
                permissionSnapshot={permissionSnapshot}
                providerReadiness={providerReadiness}
                secretVaultSnapshot={secretVaultSnapshot}
              />
            </>
          ) : null}

          {activeNavItem === "projects" ? (
            <ProjectRailPanel
              agentRun={agentRunState}
              branchExperiments={branchExperiments}
              eventCount={eventLog.length}
              insightFindings={insightFindings}
              metaOnboardingSignals={metaOnboardingSignals}
              memoryInspector={memoryInspector}
              onCreateAgentRun={handleCreateAgentRun}
              onCreateCodingPacket={handleCreateCodingPacket}
              onRunMetaOnboarding={handleRunMetaOnboarding}
              packet={codingPacketState}
              reviewMode={reviewMode}
              sessionId={activeSessionId}
            />
          ) : null}

          {activeNavItem === "channels" ? (
            <ChannelRailPanel
              ingressSnapshot={ingressSnapshot}
              onImportTelegram={handleImportTelegramIngress}
              permissionSnapshot={permissionSnapshot}
              runtime={runtimeSnapshotState}
            />
          ) : null}

          {activeNavItem === "backup" ? (
            <BackupRailMenu
              onExportBackup={handleExportBackupProjections}
              projections={backupProjectionsState}
              snapshot={backupSnapshot}
            />
          ) : null}

          <section className="mini-panel legacy-runtime-panel">
            <header>
              <Server size={16} />
              <span>Runtime</span>
            </header>
            <div className="runtime-node-list">
              {runtimeSnapshotState.runtimeNodes.map((node) => (
                <div className="runtime-node" key={node.id}>
                  <div>
                    <strong>{node.label}</strong>
                    {node.isPrimary ? <span>main server</span> : <span>{node.role}</span>}
                  </div>
                  <em className={statusTone(node.status)}>{node.status}</em>
                </div>
              ))}
            </div>
            <div className="local-model-list">
              <span>Local Models</span>
              {runtimeSnapshotState.localModels.map((model) => (
                <div className="local-model" key={model.id}>
                  <strong>{model.name}</strong>
                  <em className={statusTone(model.status)}>{model.runner}</em>
                </div>
              ))}
            </div>
            <div className="memory-sync-note">
              <strong>Memory Sync</strong>
              <span>Memento/장기기억과 로컬 캐시 동기화 상태</span>
              <em className={statusTone(runtimeSnapshotState.memorySyncStatus)}>{runtimeSnapshotState.memorySyncStatus}</em>
            </div>
            <div className="sync-authority-note">
              <strong>Event Storage Authority</strong>
              <span>{runtimeSnapshotState.syncTopology.authorityLabel}</span>
              <em>source</em>
            </div>
            <div className="client-sync-list">
              <span>Projection / Clients</span>
              {runtimeSnapshotState.syncTopology.clients
                .filter((client) => client.id !== runtimeSnapshotState.syncTopology.authorityNodeId)
                .map((client) => (
                  <div className="client-sync-row" key={client.id}>
                    <strong>{client.label}</strong>
                    <span>{client.localStore} / outbox {client.outboxCount}</span>
                    <em className={statusTone(client.status)}>{client.status}</em>
                  </div>
                ))}
            </div>
          </section>
        </aside>

        <section className={`center-board ${mode === "tmux" ? "tmux-center-board" : ""}`}>
          <div className="board-toolbar">
            <div className="mode-area" role="tablist" aria-label="작업 모드">
              <div className="mode-switch">
                <button
                  aria-selected={mode === "conversation"}
                  className={mode === "conversation" ? "active" : ""}
                  onClick={() => setMode("conversation")}
                  role="tab"
                  type="button"
                >
                  <MessageSquare size={16} />
                  Conversation
                </button>
                <button
                  aria-selected={mode === "debate"}
                  className={mode === "debate" ? "active" : ""}
                  onClick={() => setMode("debate")}
                  role="tab"
                  type="button"
                >
                  <GitBranch size={16} />
                  Debate
                </button>
              </div>
              <button
                aria-selected={mode === "tmux"}
                className={`tmux-mode-button ${mode === "tmux" ? "active" : ""}`}
                onClick={() => setMode("tmux")}
                role="tab"
                type="button"
              >
                <Terminal size={16} />
                Tmux
              </button>
            </div>
            <div className="toolbar-actions">
              <button className="ghost-button" onClick={handleRememberCurrentContext} type="button">
                <Database size={16} />
                Memory
              </button>
              <button className="primary-button" onClick={handleCreateCodingPacket} type="button">
                <Send size={16} />
                Coding Packet
              </button>
            </div>
          </div>

          {mode === "conversation" ? (
            <ConversationWorkbench
              activeSessionId={activeSessionId}
              agentConfigPanel={agentConfigPanel}
              agentPersona={selectedAgentPersona}
              agents={agents}
              branchExperiments={branchExperiments}
              contextPackTier={contextPackTier}
              draftAttachments={draftAttachments}
              draftMessage={draftMessage}
              maxDraftAttachments={maxDraftAttachments}
              messages={conversationMessages}
              onAddDraftAttachments={handleAddDraftAttachments}
              onAdoptBranch={handleAdoptBranchExperiment}
              onBackupProjection={handleExportBackupProjections}
              onContextPackTierChange={handleContextPackTierChange}
              onCreateBranch={handleCreateBranchExperiment}
              onCreateAgentRun={handleCreateAgentRun}
              onCreateCodingPacket={handleCreateCodingPacket}
              onDraftMessageChange={setDraftMessage}
              onImportTelegram={handleImportTelegramIngress}
              onPromoteToDebate={handlePromoteToDebate}
              onRemoveDraftAttachment={handleRemoveDraftAttachment}
              onSelectAgent={setSelectedAgentId}
              onSendMessage={handleSendMessageStage2}
              onCloseAgentConfig={() => setAgentConfigPanel((panel) => ({ ...panel, open: false }))}
              onOpenAgentConfig={openAgentConfigPanel}
              onUpdateAgentConfig={updateSelectedAgentConfig}
              onUpdateAgentPersona={updateSelectedAgentPersona}
              selectedAgent={selectedAgent}
              selectedAgentId={selectedAgent?.id}
              selectedModel={selectedModel}
              selectedProvider={selectedProvider}
            />
          ) : mode === "debate" ? (
            <Stage3DebateTable
              onCreateCodingPacket={handleCreateCodingPacket}
              onSelectUtterance={handleSelectDebateUtterance}
              session={debateSession}
            />
          ) : (
            <TmuxSwarmBoard
              activeSessionId={activeSessionId}
              agentActivityById={agentActivityById}
              agentVisualsById={agentVisualsById}
              agents={agents}
              messages={conversationMessages}
              packet={codingPacketState}
            />
          )}

          {mode === "tmux" ? null : (
            <WorkItemHandoffPanel
              drafts={assistantDrafts}
              handoffs={workItemHandoffs}
              items={workItems}
              onArchiveItem={handleArchiveWorkItem}
              onRouteItem={handleRouteWorkItem}
            />
          )}

          {mode === "tmux" ? null : (
            <CodingPacketPanel
              insightFindings={insightFindings}
              onReviewModeChange={handleReviewModeChange}
              packet={codingPacketState}
              reviewMode={reviewMode}
            />
          )}
        </section>

        {mode === "tmux" ? null : (
          <aside className="right-rail" aria-label="모델과 에이전트 상태">
            <AgentStatePanel
              agents={agents}
              agentActivityById={agentActivityById}
              agentVisualsById={agentVisualsById}
              modelCatalog={modelCatalog}
              modelWindowStartByAgentId={modelWindowStartByAgentId}
              onAddAgent={handleAddAgent}
              onAssignModel={handleAssignModel}
              onAssignProvider={handleAssignProvider}
              onOpenAgentSettings={handleOpenAgentSettings}
              onRemoveAgent={handleRemoveAgent}
              onSelectAgent={setSelectedAgentId}
              onShiftModelWindow={handleShiftModelWindow}
              profiles={providerProfiles}
              selectedAgentId={selectedAgent?.id}
            />
            <MementoInspectorPanel
              inspector={memoryInspector}
              onActivate={handleActivateMemory}
              onForget={handleForgetMemory}
              onPin={handlePinMemory}
              onRemember={handleRememberCurrentContext}
            />
          </aside>
        )}
      </main>
      <TerminalDock
        agentRun={agentRunState}
        dgxBridge={dgxBridgeState}
        eventSyncState={eventSyncState}
        events={eventLog}
        onApproveNext={() => handleResolveNextPermission("approved")}
        onCheckProviderVault={handleCheckProviderVault}
        onRejectNext={() => handleResolveNextPermission("rejected")}
        onReplayEvents={handleReplayEventStorage}
        onSyncEvents={handleSyncEventStorage}
        permissionSnapshot={permissionSnapshot}
        providerReadiness={providerReadiness}
        secretVaultSnapshot={secretVaultSnapshot}
        slots={terminalSlots}
      />
      {settingsAgent ? (
        <AgentSettingsPanel
          agent={settingsAgent}
          onClearAvatar={handleClearAgentAvatar}
          onClose={() => setAgentSettingsAgentId(undefined)}
          onUpdateAgent={handleUpdateAgentProfile}
          onUploadAvatar={handleUploadAgentAvatar}
          visual={agentVisualsById[settingsAgent.id] ?? {}}
        />
      ) : null}
    </div>
  );
}

function SessionIndexRailPanel({
  activeSessionId,
  index,
  onCreateSession,
  onRefresh,
  onRenameActiveSession,
  onReplaySession,
}: {
  activeSessionId: string;
  index: Stage20SessionIndexState;
  onCreateSession: () => void;
  onRefresh: () => void;
  onRenameActiveSession: () => void;
  onReplaySession: (sessionId: string) => void;
}) {
  const visibleSessions = index.sessions.slice(0, 3);
  const auditItems: WindowAuditItem[] = [
    {
      id: "session-select",
      label: "세션 선택",
      status: index.sessions.length > 0 ? "ready" : "partial",
      detail: index.sessions.length > 0 ? "DGX-02 인덱스에서 세션을 고르고 즉시 replay합니다." : "DGX-02 세션 인덱스가 아직 비어 있습니다.",
    },
    {
      id: "session-create",
      label: "새 작업 세션",
      status: "ready",
      detail: "맥북 outbox에 먼저 남기고 온라인이면 DGX-02로 동기화합니다.",
    },
    {
      id: "session-rename",
      label: "이름 변경",
      status: activeSessionId ? "ready" : "partial",
      detail: "현재 세션명을 이벤트로 남겨 다른 클라이언트에서도 같은 이름을 봅니다.",
    },
    {
      id: "session-delete",
      label: "삭제/보존",
      status: "blocked",
      detail: "Event Storage 원본 삭제는 아직 막고, forget/tombstone 정책 확정 후 엽니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel session-index-panel">
      <header>
        <Database size={16} />
        <span>Sessions</span>
        <button className="rail-icon-button" onClick={onCreateSession} title="Create a new session" type="button">
          <Plus size={13} />
        </button>
        <button className="rail-icon-button" onClick={onRenameActiveSession} title="Rename active session" type="button">
          <Pencil size={13} />
        </button>
        <button className="rail-icon-button" onClick={onRefresh} title="Refresh sessions from DGX-02" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="session-index-summary">
        <strong>{index.status}</strong>
        <span>DGX-02 rev {index.serverRevision ?? "-"}</span>
      </div>
      <div className="session-index-list">
        {visibleSessions.length === 0 ? (
          <p>DGX-02 session index pending</p>
        ) : (
          visibleSessions.map((session) => (
            <button
              className={session.sessionId === activeSessionId ? "active" : ""}
              key={session.sessionId}
              onClick={() => onReplaySession(session.sessionId)}
              type="button"
            >
              <strong>{session.title ?? session.sessionId}</strong>
              <span>{session.sessionId} / {session.eventCount} events / {session.lastEventType ?? "event"}</span>
            </button>
          ))
        )}
      </div>
      <WindowChecklist items={auditItems} title="세션 창 점검" />
    </section>
  );
}

function RuntimeRailPanel({
  onProbeDgx,
  onRequestReboot,
  rebootWatchdogs,
  snapshot,
}: {
  onProbeDgx: () => void;
  onRequestReboot: (targetNodeId: DeviceRebootRequest["targetNodeId"]) => void;
  rebootWatchdogs: DeviceRebootWatchdog[];
  snapshot: RuntimeSnapshot;
}) {
  const macbookClient = snapshot.syncTopology.clients.find((client) => client.id === "client_macbook");
  const homePcClient = snapshot.syncTopology.clients.find((client) => client.id === "client_home_pc");
  const macbookOutbox = macbookClient?.outboxCount ?? 0;
  const dgx02 = snapshot.runtimeNodes.find((node) => node.id === "dgx-02");
  const activeWatchdog = rebootWatchdogs[0];
  const auditItems: WindowAuditItem[] = [
    {
      id: "dgx01-locked",
      label: "DGX-01 보호",
      status: "ready",
      detail: "DGX-01은 locked로만 표시하고 작업 대상으로 잡지 않습니다.",
    },
    {
      id: "dgx02-authority",
      label: "DGX-02 원본",
      status: dgx02?.isPrimary ? "ready" : "blocked",
      detail: "세션/이벤트/공유 데이터의 authoritative server입니다.",
    },
    {
      id: "local-fallback",
      label: "로컬 폴백",
      status: snapshot.localModelStatus === "online" ? "ready" : "partial",
      detail: "DGX-02가 내려가면 로컬 모델, 로컬 로그, outbox만 살아납니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel">
      <header>
        <Server size={16} />
        <span>Systems</span>
        <button className="rail-icon-button" onClick={onProbeDgx} title="Probe DGX-02" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="rail-node-grid">
        {snapshot.runtimeNodes.map((node) => (
          <article className={node.id === "dgx-01" ? "locked" : ""} key={node.id}>
            <div className="rail-node-head">
              <span>{node.label}</span>
              <button
                className="rail-icon-button"
                onClick={() => onRequestReboot(node.id as DeviceRebootRequest["targetNodeId"])}
                title={`${node.label} reboot approval`}
                type="button"
              >
                <Power size={12} />
              </button>
            </div>
            <strong>{node.id === "dgx-01" ? "guarded" : node.isPrimary ? "main" : node.role}</strong>
            <em className={statusTone(node.status)}>{node.status}</em>
          </article>
        ))}
      </div>
      <div className="rail-stat-list">
        <div>
          <span>authority</span>
          <strong>{snapshot.syncTopology.authorityLabel}</strong>
        </div>
        <div>
          <span>local models</span>
          <strong>{snapshot.localModels.length}</strong>
        </div>
        <div>
          <span>memento</span>
          <strong className={statusTone(snapshot.memorySyncStatus)}>{snapshot.memorySyncStatus}</strong>
        </div>
        <div>
          <span>mac outbox</span>
          <strong>{macbookOutbox}</strong>
        </div>
        <div>
          <span>home pc</span>
          <strong className={statusTone(homePcClient?.status ?? "degraded")}>
            {homePcClient?.status === "online" ? "online-only" : "needs DGX"}
          </strong>
        </div>
        <div>
          <span>heartbeat</span>
          <strong>{snapshot.recentError ?? "connected"}</strong>
        </div>
        <div>
          <span>watchdog</span>
          <strong>{activeWatchdog ? `${activeWatchdog.targetNodeId} ${activeWatchdog.status}` : "ready"}</strong>
        </div>
      </div>
      <WindowChecklist items={auditItems} title="시스템 창 점검" />
    </section>
  );
}

function OperationsRailPanel({
  backupSnapshot,
  ingressSnapshot,
  onCheckProviderVault,
  onExportBackup,
  onImportTelegram,
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
}: {
  backupSnapshot: Stage7BackupSnapshot;
  ingressSnapshot: Stage8IngressSnapshot;
  onCheckProviderVault: () => void;
  onExportBackup: () => void;
  onImportTelegram: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  secretVaultSnapshot: SecretVaultSnapshot;
}) {
  const auditItems: WindowAuditItem[] = [
    {
      id: "permission",
      label: "승인 대기열",
      status: permissionSnapshot.summary.pending > 0 ? "partial" : "ready",
      detail:
        permissionSnapshot.summary.pending > 0
          ? `${permissionSnapshot.summary.pending}개 작업이 승인 전 대기 중입니다.`
          : "위험 실행은 모두 권한 정책을 통과했거나 대기열이 비어 있습니다.",
    },
    {
      id: "ingress",
      label: "외부 입력",
      status: ingressSnapshot.result.approvalState === "required" ? "partial" : "ready",
      detail: "Telegram/Mobile/API 입력은 ingress guard와 승인 상태를 먼저 거칩니다.",
    },
    {
      id: "secret",
      label: "비밀값",
      status: secretVaultSnapshot.summary.missing > 0 ? "partial" : "ready",
      detail: "키 원문은 UI와 로그에 남기지 않고 vault ref 상태만 표시합니다.",
    },
    {
      id: "gemini",
      label: "Gemini CLI",
      status: "blocked",
      detail: "사용자 지시대로 agy -p 설정 전까지 연결하지 않습니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel ops-rail-panel">
      <header>
        <ShieldCheck size={16} />
        <span>Ops</span>
        <div className="rail-action-row">
          <button className="rail-icon-button" onClick={onImportTelegram} title="Import Telegram" type="button">
            <Smartphone size={13} />
          </button>
          <button className="rail-icon-button" onClick={onExportBackup} title="Export Backup" type="button">
            <Archive size={13} />
          </button>
          <button className="rail-icon-button" onClick={onCheckProviderVault} title="Check Provider Vault" type="button">
            <KeyRound size={13} />
          </button>
        </div>
      </header>
      <div className="rail-stat-list">
        <div>
          <span>permission</span>
          <strong>{permissionSnapshot.summary.pending} pending</strong>
        </div>
        <div>
          <span>ingress</span>
          <strong>{ingressSnapshot.result.confidence} / {ingressSnapshot.result.approvalState}</strong>
        </div>
        <div>
          <span>backup</span>
          <strong>{backupSnapshot.summary.ready} ready / {backupSnapshot.summary.queued} queued</strong>
        </div>
        <div>
          <span>provider</span>
          <strong>{providerReadiness.status}</strong>
        </div>
        <div>
          <span>vault</span>
          <strong>{secretVaultSnapshot.summary.available}/{secretVaultSnapshot.entries.length} available</strong>
        </div>
      </div>
      <WindowChecklist items={auditItems} title="Ops 창 점검" />
    </section>
  );
}

function ProjectRailPanel({
  agentRun,
  branchExperiments,
  eventCount,
  insightFindings,
  metaOnboardingSignals,
  memoryInspector,
  onCreateAgentRun,
  onCreateCodingPacket,
  onRunMetaOnboarding,
  packet,
  reviewMode,
  sessionId,
}: {
  agentRun: Stage4AgentRun;
  branchExperiments: BranchExperiment[];
  eventCount: number;
  insightFindings: InsightFinding[];
  metaOnboardingSignals: MetaOnboardingSignal[];
  memoryInspector: Stage6MemoryInspector;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onRunMetaOnboarding: () => void;
  packet: CodingPacket;
  reviewMode: ReviewMode;
  sessionId: string;
}) {
  const visibleSteps = agentRun.steps.slice(0, 4);
  const visibleFiles = packet.filesToInspect.slice(0, 3);
  const visibleChecks = packet.verificationPlan.slice(0, 3);
  const visibleBranches = branchExperiments.slice(0, 3);
  const visibleInsights = insightFindings.slice(0, 4);
  const visibleMetaSignals = metaOnboardingSignals.slice(0, 3);
  const auditItems: WindowAuditItem[] = [
    {
      id: "packet",
      label: "Coding Packet",
      status: packet.goal ? "ready" : "partial",
      detail: "대화/토론 결과를 goal, decisions, constraints, verification으로 구조화합니다.",
    },
    {
      id: "files",
      label: "파일 후보",
      status: packet.filesToInspect.length > 0 ? "ready" : "partial",
      detail: packet.filesToInspect.length > 0 ? `${packet.filesToInspect.length}개 inspect 후보가 있습니다.` : "아직 inspect 후보가 없습니다.",
    },
    {
      id: "run",
      label: "실행 기록",
      status: agentRun.steps.some((step) => step.status === "blocked") ? "blocked" : "ready",
      detail: "실행은 바로 터미널로 보내지 않고 run intent와 권한 상태를 먼저 남깁니다.",
    },
    {
      id: "verify",
      label: "검증 계획",
      status: reviewMode === "deep" ? "ready" : "partial",
      detail: `${reviewModeLabel(reviewMode)} 리뷰와 4D rubric/invariant checks를 함께 표시합니다.`,
    },
    {
      id: "branch-adopt",
      label: "Branch/Adopt",
      status: branchExperiments.some((branch) => branch.status === "adopted") ? "ready" : "partial",
      detail: "shadow conversation은 요약만 메인 세션에 채택하도록 분리합니다.",
    },
    {
      id: "meta-onboarding",
      label: "Meta Onboarding",
      status: metaOnboardingSignals.every((signal) => signal.status === "ready") ? "ready" : "partial",
      detail: "프로젝트 스택과 현재 provider/agent를 보고 빠진 역할을 추천합니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel project-rail-panel">
      <header>
        <LayoutDashboard size={16} />
        <span>Project</span>
        <div className="rail-action-row">
          <button className="rail-icon-button" onClick={onCreateCodingPacket} title="Coding Packet 생성" type="button">
            <Send size={13} />
          </button>
          <button className="rail-icon-button" onClick={onCreateAgentRun} title="Agent Run 준비" type="button">
            <Play size={13} />
          </button>
        </div>
      </header>
      <div className="rail-hero-card">
        <span>active session</span>
        <strong>{sessionId}</strong>
        <p>{packet.goal}</p>
      </div>
      <div className="rail-stat-list">
        <div>
          <span>events</span>
          <strong>{eventCount}</strong>
        </div>
        <div>
          <span>decisions</span>
          <strong>{packet.decisions.length}</strong>
        </div>
        <div>
          <span>memory recall</span>
          <strong>{memoryInspector.trace.results.length}</strong>
        </div>
        <div>
          <span>run status</span>
          <strong>{agentRun.status}</strong>
        </div>
      </div>
      <div className="rail-card-list">
        {visibleSteps.map((step) => (
          <article key={step.id}>
            <strong>{step.title}</strong>
            <span>{step.status} / {step.permissionState}</span>
            <p>{step.summary}</p>
          </article>
        ))}
      </div>
      <div className="rail-card-list compact">
        {visibleBranches.map((branch) => (
          <article key={branch.id}>
            <strong>{branch.title}</strong>
            <span>{branchStatusLabel(branch.status)} / {branch.agentName}</span>
          </article>
        ))}
      </div>
      <div className="rail-split-list">
        <section>
          <strong>inspect</strong>
          {visibleFiles.length > 0 ? visibleFiles.map((file) => <span key={file}>{file}</span>) : <span>대상 없음</span>}
        </section>
        <section>
          <strong>verify</strong>
          {visibleChecks.length > 0 ? visibleChecks.map((check) => <span key={check}>{check}</span>) : <span>대상 없음</span>}
        </section>
      </div>
      <div className="rail-insight-list">
        {visibleInsights.map((finding) => (
          <article className={finding.status} key={finding.id}>
            <strong>{insightCategoryLabel(finding.category)}</strong>
            <span>{finding.label}</span>
          </article>
        ))}
      </div>
      <div className="meta-onboarding-box">
        <button className="rail-icon-button" onClick={onRunMetaOnboarding} title="Meta Agent Onboarding" type="button">
          <Bot size={13} />
        </button>
        <div>
          <strong>Meta Agent Onboarding</strong>
          {visibleMetaSignals.map((signal) => (
            <span className={signal.status} key={signal.id}>
              {signal.label}: {signal.suggestion}
            </span>
          ))}
        </div>
      </div>
      <WindowChecklist items={auditItems} title="프로젝트 창 점검" />
    </section>
  );
}

function ChannelRailPanel({
  ingressSnapshot,
  onImportTelegram,
  permissionSnapshot,
  runtime,
}: {
  ingressSnapshot: Stage8IngressSnapshot;
  onImportTelegram: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  runtime: RuntimeSnapshot;
}) {
  const visibleSteps = ingressSnapshot.result.guardSteps.slice(0, 7);
  const channels = [
    { label: "Telegram", status: ingressSnapshot.channel === "legacy_telegram" ? "linked" : "ready" },
    { label: "OpenClaw Bridge", status: "pending adapter" },
    { label: "Mobile", status: runtime.dgxStatus === "online" ? "approval ready" : "read-only pending" },
    { label: "API", status: "guarded ingress" },
  ];
  const auditItems: WindowAuditItem[] = [
    {
      id: "telegram",
      label: "Telegram 이어받기",
      status: "ready",
      detail: "대화 세션으로 가져오되 위험 작업은 permission queue로 보냅니다.",
    },
    {
      id: "mobile",
      label: "모바일 권한",
      status: runtime.dgxStatus === "online" ? "ready" : "partial",
      detail: "폰은 읽기, 승인, 중단, 재시도 중심이고 터미널 직접 입력은 막습니다.",
    },
    {
      id: "ingress-guard",
      label: "7중 가드",
      status: visibleSteps.every((step) => step.status === "passed") ? "ready" : "partial",
      detail: "noise/self-response/debounce/PII/checklist를 통과한 입력만 agent로 보냅니다.",
    },
    {
      id: "zero-token",
      label: "0-token 안전망",
      status: ingressSnapshot.zeroTokenSafety.enabled ? "ready" : "partial",
      detail: "LLM 없이 누락 문의와 미승인 항목을 감시하는 비상 루틴입니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel channel-rail-panel">
      <header>
        <RadioTower size={16} />
        <span>Channels</span>
        <button className="rail-icon-button" onClick={onImportTelegram} title="Telegram에서 이어받기" type="button">
          <Smartphone size={13} />
        </button>
      </header>
      <div className="rail-card-list compact">
        {channels.map((channel) => (
          <article key={channel.label}>
            <strong>{channel.label}</strong>
            <span>{channel.status}</span>
          </article>
        ))}
      </div>
      <div className="rail-hero-card">
        <span>ingress confidence</span>
        <strong>{ingressSnapshot.result.confidence} / {ingressSnapshot.result.approvalState}</strong>
        <p>{ingressSnapshot.result.reason}</p>
      </div>
      <div className="rail-card-list">
        {visibleSteps.map((step) => (
          <article className={step.status} key={step.name}>
            <strong>{guardStepLabel(step.name)}</strong>
            <span>{step.status}</span>
            <p>{step.reason}</p>
          </article>
        ))}
      </div>
      <div className="rail-stat-list">
        <div>
          <span>permission queue</span>
          <strong>{permissionSnapshot.summary.pending}</strong>
        </div>
        <div>
          <span>0-token safety</span>
          <strong>{ingressSnapshot.zeroTokenSafety.enabled ? ingressSnapshot.zeroTokenSafety.cadence : "off"}</strong>
        </div>
      </div>
      <WindowChecklist items={auditItems} title="채널 창 점검" />
    </section>
  );
}

function BackupRailMenu({
  onExportBackup,
  projections,
  snapshot,
}: {
  onExportBackup: () => void;
  projections: BackupProjection[];
  snapshot: Stage7BackupSnapshot;
}) {
  const redactionReady = projections.every((projection) => projection.redactionApplied);
  const auditItems: WindowAuditItem[] = [
    {
      id: "source",
      label: "원본 위치",
      status: "ready",
      detail: "Obsidian/Notion/Mobile은 projection이고 원본은 Event Storage입니다.",
    },
    {
      id: "redaction",
      label: "Redaction",
      status: redactionReady ? "ready" : "blocked",
      detail: "API key, bearer token, terminal secret은 export 전에 제거합니다.",
    },
    {
      id: "obsidian",
      label: "Obsidian",
      status: projections.some((projection) => projection.target === "obsidian") ? "ready" : "partial",
      detail: "맥북 vault에는 markdown artifact로 남길 수 있게 유지합니다.",
    },
    {
      id: "mobile",
      label: "Mobile",
      status: projections.some((projection) => projection.target === "mobile") ? "partial" : "blocked",
      detail: "폰은 읽기/승인/중단/재시도만 허용하고 파일/터미널 직접 조작은 막습니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel backup-rail-panel">
      <header>
        <Archive size={16} />
        <span>Backup</span>
        <button className="rail-icon-button" onClick={onExportBackup} title="Projection 생성" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="rail-stat-list">
        <div>
          <span>ready</span>
          <strong>{snapshot.summary.ready}</strong>
        </div>
        <div>
          <span>queued</span>
          <strong>{snapshot.summary.queued}</strong>
        </div>
        <div>
          <span>redacted</span>
          <strong>{snapshot.summary.redacted}</strong>
        </div>
      </div>
      <div className="rail-card-list compact">
        {projections.map((projection) => (
          <article key={projection.id}>
            <strong>{projection.target}</strong>
            <span>{projection.status} / redaction {projection.redactionApplied ? "on" : "off"}</span>
          </article>
        ))}
      </div>
      <div className="rail-card-list">
        {snapshot.artifacts.map((artifact) => (
          <article className={artifact.status} key={artifact.id}>
            <strong>{artifact.title}</strong>
            <span>{artifact.target} / {artifact.format}</span>
            <p>{artifact.destination}</p>
          </article>
        ))}
      </div>
      <WindowChecklist items={auditItems} title="백업 창 점검" />
    </section>
  );
}

function RuntimeStatusBar({
  onProbeDgx,
  providerName,
  snapshot,
}: {
  onProbeDgx: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
}) {
  const primaryNode = snapshot.runtimeNodes.find((node) => node.isPrimary);

  return (
    <header className="status-bar">
      <div className="status-meta">
        <span>Active: {providerName}</span>
        <span>{primaryNode?.label ?? snapshot.syncTopology.authorityLabel}: {snapshot.dgxStatus}</span>
        <span>Local: {snapshot.localModelStatus}</span>
        <span>{snapshot.recentError ?? "ready"}</span>
      </div>
      <button className="status-action" onClick={onProbeDgx} type="button">
        Probe DGX
      </button>
    </header>
  );
}

function StatusPill({ label, status }: { label: string; status: RuntimeSnapshot["status"] }) {
  return (
    <span className={`status-pill ${status}`}>
      <span className="dot" />
      {label}: {status}
    </span>
  );
}

function statusTone(status: RuntimeSnapshot["status"]) {
  if (status === "online") {
    return "ok";
  }
  if (status === "offline") {
    return "danger";
  }
  return "warn";
}

function soulModeLabel(mode: WorkbenchAgent["soulMode"]) {
  const labels: Record<WorkbenchAgent["soulMode"], string> = {
    full: "full",
    summary: "summary",
    retrieved: "retrieved",
    off: "off",
  };

  return labels[mode];
}

function configSourceLabel(source: WorkbenchAgent["configSource"]) {
  const labels: Record<WorkbenchAgent["configSource"], string> = {
    internal: "앱 내부 설정",
    markdown: "AGENTS.md / SOUL.md",
    off: "주입 안 함",
  };

  return labels[source];
}

function voicePresetLabel(preset: AgentVoicePreset) {
  const labels: Record<AgentVoicePreset, string> = {
    architect: "설계자형",
    calm: "차분함",
    direct: "직설적",
    executor: "실행자형",
    reviewer: "검토자형",
  };

  return labels[preset];
}

function creativityLevelLabel(level: AgentCreativityLevel) {
  const labels: Record<AgentCreativityLevel, string> = {
    strict: "보수적",
    focused: "신중",
    balanced: "균형",
    creative: "창의적",
    experimental: "실험적",
  };

  return labels[level];
}

function creativityTemperature(level: AgentCreativityLevel) {
  const temperatures: Record<AgentCreativityLevel, number> = {
    strict: 0.2,
    focused: 0.4,
    balanced: 0.7,
    creative: 1,
    experimental: 1.2,
  };

  return temperatures[level];
}

function agentConfigPanelTitle(tab: AgentConfigTab) {
  const labels: Record<AgentConfigTab, string> = {
    agents_md: "AGENTS.md 설정",
    creativity: "창의성 설정",
    edit: "설정 소스",
    injection: "주입 방식",
    preview: "프롬프트 미리보기",
    profile: "프로필",
    soul: "SOUL.md 설정",
  };

  return labels[tab];
}

function memoryLayerLabel(layer: MemoryRecord["layer"]) {
  const labels: Record<MemoryRecord["layer"], string> = {
    episode: "작업 에피소드",
    fragment: "짧은 기억",
    project_memory: "프로젝트 기억",
    reflection: "회고",
    user_memory: "사용자 기억",
  };

  return labels[layer];
}

function trustLevelLabel(trustLevel: MemoryRecord["trustLevel"]) {
  const labels: Record<MemoryRecord["trustLevel"], string> = {
    limited: "제한됨",
    trusted: "신뢰됨",
    untrusted: "격리됨",
  };

  return labels[trustLevel];
}

function recallReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    "blocked by provider trust policy": "프로바이더 신뢰 정책으로 보류됨",
    "low query overlap": "현재 작업과 관련도가 낮음",
    "provider pending: limited recall preview": "프로바이더가 정해지기 전이라 제한된 기억만 미리 봄",
    "provider trust allows automatic recall trace": "신뢰된 프로바이더라 관련 기억을 자동으로 불러옴",
    "query overlap and trust policy passed": "현재 작업과 관련 있고 신뢰 정책을 통과함",
    "untrusted provider: project/user memory requires explicit selection": "신뢰되지 않은 프로바이더는 프로젝트/사용자 기억을 자동으로 받지 않음",
    "untrusted memory is quarantined until pinned": "신뢰되지 않은 기억은 고정 전까지 격리됨",
  };

  return labels[reason] ?? reason;
}

function contextPackTierLabel(tier: ContextPackTier) {
  const labels: Record<ContextPackTier, string> = {
    full: "Full",
    lite: "Lite",
    standard: "Standard",
  };

  return labels[tier];
}

function reviewModeLabel(mode: ReviewMode) {
  const labels: Record<ReviewMode, string> = {
    deep: "Deep",
    quick: "Quick",
  };

  return labels[mode];
}

function branchStatusLabel(status: BranchExperiment["status"]) {
  const labels: Record<BranchExperiment["status"], string> = {
    adopted: "채택됨",
    drafting: "작성중",
    ready: "채택 후보",
  };

  return labels[status];
}

function statusForWorkLane(lane: WorkItem["lane"]): WorkItem["status"] {
  const statuses: Partial<Record<WorkItem["lane"], WorkItem["status"]>> = {
    auto: "running",
    check: "drafted",
    ask: "waiting_input",
    approve: "waiting_approval",
    blocked: "blocked",
    inbox: "inbox",
  };

  return statuses[lane] ?? "triaged";
}

function workLaneLabel(lane: WorkItem["lane"]) {
  const labels: Partial<Record<WorkItem["lane"], string>> = {
    auto: "자동",
    check: "검토",
    ask: "질문",
    approve: "승인",
    blocked: "차단",
    inbox: "수신",
    conversation: "대화",
    debate: "토론",
    coding: "코딩",
    review: "리뷰",
    execution: "실행",
    memory: "기억",
    backup: "백업",
  };

  return labels[lane] ?? lane;
}

function getInboxLane(item: WorkItem): "auto" | "check" | "ask" | "approve" | "blocked" {
  if (item.status === "blocked" || item.lane === "blocked") {
    return "blocked";
  }

  if (item.missingInfo.some((slot) => slot.required && slot.status === "missing") || item.lane === "ask") {
    return "ask";
  }

  if (item.status === "waiting_approval" || item.kind === "approval" || item.lane === "approve") {
    return "approve";
  }

  if (item.lane === "auto") {
    return "auto";
  }

  return "check";
}

function insightCategoryLabel(category: InsightCategory) {
  const labels: Record<InsightCategory, string> = {
    architecture: "Architecture",
    performance: "Performance",
    security: "Security",
    stability: "Stability",
    tech_debt: "Tech Debt",
    testing: "Testing",
  };

  return labels[category];
}

function createInsightFindings({
  eventCount,
  memoryInspector,
  packet,
  permissionSnapshot,
  providerReadiness,
}: {
  eventCount: number;
  memoryInspector: Stage6MemoryInspector;
  packet: CodingPacket;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
}): InsightFinding[] {
  return [
    {
      id: "insight_stability",
      category: "stability",
      status: eventCount > 0 ? "ok" : "watch",
      label: `${eventCount} events`,
      summary: "Event Storage에 세션 흐름이 남는지 확인한다.",
    },
    {
      id: "insight_testing",
      category: "testing",
      status: packet.verificationPlan.length > 1 ? "ok" : "quick_win",
      label: `${packet.verificationPlan.length} checks`,
      summary: "검증 계획이 부족하면 Quick Wins로 typecheck/test를 먼저 주입한다.",
    },
    {
      id: "insight_architecture",
      category: "architecture",
      status: packet.context.some((item) => item.toLowerCase().includes("protocol")) ? "ok" : "watch",
      label: "protocol boundary",
      summary: "공통 타입과 이벤트 경계가 패킷에 들어갔는지 본다.",
    },
    {
      id: "insight_performance",
      category: "performance",
      status: memoryInspector.trace.results.length > 5 ? "watch" : "ok",
      label: `${memoryInspector.trace.results.length} recalls`,
      summary: "중복 recall이 많아지면 ContextPack tier를 낮춘다.",
    },
    {
      id: "insight_security",
      category: "security",
      status: permissionSnapshot.summary.pending > 0 || providerReadiness.status === "blocked" ? "watch" : "ok",
      label: `${permissionSnapshot.summary.pending} pending`,
      summary: "승인 대기, secret, provider trust를 배포 전에 확인한다.",
    },
    {
      id: "insight_tech_debt",
      category: "tech_debt",
      status: packet.rejectedOptions.length > 0 ? "ok" : "quick_win",
      label: `${packet.rejectedOptions.length} rejected`,
      summary: "버린 선택지를 남기면 이후 재논의를 줄일 수 있다.",
    },
  ];
}

function createMetaOnboardingSignals({
  agents,
  models,
  providers,
  runtime,
}: {
  agents: WorkbenchAgent[];
  models: ModelCatalog;
  providers: ProviderProfile[];
  runtime: RuntimeSnapshot;
}): MetaOnboardingSignal[] {
  const roles = new Set(agents.map((agent) => agent.role));
  const modelCount = Object.values(models).reduce((total, providerModels) => total + providerModels.length, 0);
  return [
    {
      id: "meta_roles",
      label: "역할 구성",
      status: roles.has("verifier") && roles.has("memory_curator") ? "ready" : "partial",
      suggestion: roles.has("verifier") ? "검증 역할 있음" : "Verifier 추가 추천",
    },
    {
      id: "meta_engines",
      label: "엔진 감지",
      status: providers.length >= 3 && modelCount > 4 ? "ready" : "partial",
      suggestion: `${providers.length} providers / ${modelCount} models`,
    },
    {
      id: "meta_runtime",
      label: "실행 환경",
      status: runtime.dgxStatus === "online" || runtime.localModelStatus === "online" ? "ready" : "blocked",
      suggestion: runtime.dgxStatus === "online" ? "DGX-02 사용 가능" : "로컬 폴백 중심",
    },
  ];
}

function auditStatusLabel(status: WindowAuditStatus) {
  const labels: Record<WindowAuditStatus, string> = {
    blocked: "잠금",
    partial: "보강",
    ready: "준비",
  };

  return labels[status];
}

function WindowChecklist({ items, title }: { items: WindowAuditItem[]; title: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const readyCount = items.filter((item) => item.status === "ready").length;
  const hasAttention = items.some((item) => item.status !== "ready");

  return (
    <section
      className={`window-checklist ${collapsed ? "collapsed" : ""} ${hasAttention ? "needs-attention" : ""}`}
      aria-label={`${title} completeness checklist`}
    >
      <button
        aria-expanded={!collapsed}
        className="window-checklist-head"
        onClick={() => setCollapsed((current) => !current)}
        type="button"
      >
        <strong>{title}</strong>
        <span>
          {readyCount}/{items.length}
        </span>
        <ChevronRight className="window-checklist-toggle" size={13} />
      </button>
      {!collapsed ? (
        <div className="window-checklist-list">
          {items.map((item) => (
            <article className={item.status} key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
              <em>{auditStatusLabel(item.status)}</em>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ConversationWorkbench({
  activeSessionId,
  agentConfigPanel,
  agentPersona,
  agents,
  branchExperiments,
  contextPackTier,
  draftAttachments,
  draftMessage,
  maxDraftAttachments,
  messages,
  onAddDraftAttachments,
  onAdoptBranch,
  onBackupProjection,
  onContextPackTierChange,
  onCreateBranch,
  onCreateAgentRun,
  onCreateCodingPacket,
  onDraftMessageChange,
  onImportTelegram,
  onPromoteToDebate,
  onRemoveDraftAttachment,
  onSelectAgent,
  onSendMessage,
  onCloseAgentConfig,
  onOpenAgentConfig,
  onUpdateAgentConfig,
  onUpdateAgentPersona,
  selectedAgent,
  selectedAgentId,
  selectedModel,
  selectedProvider,
}: {
  activeSessionId: string;
  agentConfigPanel: { open: boolean; tab: AgentConfigTab };
  agentPersona?: AgentPersonaSettings;
  agents: WorkbenchAgent[];
  branchExperiments: BranchExperiment[];
  contextPackTier: ContextPackTier;
  draftAttachments: DraftAttachment[];
  draftMessage: string;
  maxDraftAttachments: number;
  messages: ConversationMessage[];
  onAddDraftAttachments: (files: FileList | null) => void;
  onAdoptBranch: () => void;
  onBackupProjection: () => void;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onCreateBranch: () => void;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onDraftMessageChange: (value: string) => void;
  onImportTelegram: () => void;
  onPromoteToDebate: () => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSendMessage: () => void;
  onCloseAgentConfig: () => void;
  onOpenAgentConfig: (tab: AgentConfigTab) => void;
  onUpdateAgentConfig: (patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) => void;
  onUpdateAgentPersona: (patch: Partial<AgentPersonaSettings>) => void;
  selectedAgent?: WorkbenchAgent;
  selectedAgentId?: string;
  selectedModel?: ModelDescriptor;
  selectedProvider?: ProviderProfile;
}) {
  const authMode = selectedAgent?.authBinding?.mode ?? "provider_profile";
  const authLabel = selectedAgent?.authBinding?.label ?? "credential pending";
  const persona = agentPersona ?? (selectedAgent ? createDefaultPersonaSettings(selectedAgent) : undefined);
  const memoryMode = selectedProvider?.trustLevel === "trusted" ? "auto" : "manual";
  const attachmentEnabled = Boolean(selectedAgent && modelSupportsAnyAttachment(selectedModel));
  const attachmentAccept = attachmentAcceptForModel(selectedModel);
  const attachmentLimitReached = draftAttachments.length >= maxDraftAttachments;
  const adoptedBranchCount = branchExperiments.filter((branch) => branch.status === "adopted").length;
  const latestBranch = branchExperiments[0];
  const auditItems: WindowAuditItem[] = [
    {
      id: "chat",
      label: "대화",
      status: selectedAgent ? "ready" : "partial",
      detail: "선택한 agent/provider/model 조합으로 같은 세션 안에서 이어서 대화합니다.",
    },
    {
      id: "attachments",
      label: "첨부",
      status: attachmentEnabled ? "ready" : "blocked",
      detail: attachmentEnabled
        ? `현재 모델은 ${attachmentCapabilityLabel(selectedModel)}이고 최대 ${maxDraftAttachments}개까지 붙입니다.`
        : "선택 모델이 멀티모달을 지원하지 않아 첨부를 막았습니다.",
    },
    {
      id: "handoff",
      label: "토론/패킷",
      status: "ready",
      detail: "현재 대화를 Debate Context와 Coding Packet으로 승격할 수 있습니다.",
    },
    {
      id: "backup",
      label: "백업/채널",
      status: "ready",
      detail: "Obsidian/Notion projection과 Telegram 이어받기 버튼이 같은 흐름에 묶여 있습니다.",
    },
  ];

  return (
    <section className="workbench-panel">
      <header className="conversation-agent-bar">
        <div>
          <span>현재 대화 상대</span>
          <strong>{selectedAgent?.name ?? "봇 선택 필요"}</strong>
          <em>
            {activeSessionId} / {selectedAgent?.role ?? "agent"} / {selectedProvider?.name ?? "provider pending"} /{" "}
            {selectedModel?.id ?? selectedAgent?.modelId ?? selectedProvider?.defaultModel ?? "model pending"}
          </em>
        </div>
        <select
          aria-label="현재 대화 봇 선택"
          className="conversation-agent-select"
          onChange={(event) => onSelectAgent(event.target.value)}
          value={selectedAgentId ?? ""}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} / {agent.id === selectedAgentId ? (selectedModel?.id ?? agent.modelId ?? "model pending") : (agent.modelId ?? "model pending")}
            </option>
          ))}
        </select>
        <div className="credential-binding">
          <Link2 size={15} />
          <span>{authMode}</span>
          <strong>{authLabel}</strong>
        </div>
        <AgentProfileStrip
          contextPackTier={contextPackTier}
          memoryMode={memoryMode}
          onContextPackTierChange={onContextPackTierChange}
          onOpen={onOpenAgentConfig}
          persona={persona}
          selectedAgent={selectedAgent}
        />
      </header>
      {agentConfigPanel.open && selectedAgent && persona ? (
        <AgentConfigDrawer
          activeTab={agentConfigPanel.tab}
          agent={selectedAgent}
          memoryMode={memoryMode}
          onClose={onCloseAgentConfig}
          onUpdateAgentConfig={onUpdateAgentConfig}
          onUpdatePersona={onUpdateAgentPersona}
          persona={persona}
          provider={selectedProvider}
        />
      ) : null}
      <WindowChecklist items={auditItems} title="대화 창 점검" />
      <div className="conversation-stream" aria-label="대화 기록" tabIndex={0}>
        {messages.map((message) => {
          const attachments = getMessageAttachments(message);
          return (
            <article className={`message ${message.role === "user" ? "user" : "assistant"}`} key={message.id}>
              <span>{messageLabel(message, selectedAgent)}</span>
              <p>{message.content}</p>
              {attachments.length > 0 ? <AttachmentChips attachments={attachments} /> : null}
            </article>
          );
        })}
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSendMessage();
        }}
      >
        <div className="composer-main">
          <div className="attachment-composer-row">
            <input
              accept={attachmentAccept}
              className="attachment-input"
              disabled={!attachmentEnabled || attachmentLimitReached}
              id="conversation-attachment-input"
              multiple
              onChange={(event) => {
                onAddDraftAttachments(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              type="file"
            />
            <label
              aria-disabled={!attachmentEnabled || attachmentLimitReached}
              className={`attachment-button ${!attachmentEnabled || attachmentLimitReached ? "disabled" : ""}`}
              htmlFor="conversation-attachment-input"
              title={attachmentCapabilityLabel(selectedModel)}
            >
              <Paperclip size={13} />
              첨부 {draftAttachments.length}/{maxDraftAttachments}
            </label>
            <span className={`attachment-capability ${attachmentEnabled ? "enabled" : "disabled"}`}>
              {attachmentCapabilityLabel(selectedModel)}
            </span>
            {draftAttachments.length > 0 ? (
              <div className="draft-attachment-list">
                {draftAttachments.map((attachment) => (
                  <span className="draft-attachment-chip" key={attachment.id}>
                    {attachment.kind === "image" ? <ImageIcon size={13} /> : <FileText size={13} />}
                    <span>
                      <strong>{attachment.name}</strong>
                      <em>{formatAttachmentSize(attachment.size)}</em>
                    </span>
                    <button
                      aria-label={`${attachment.name} 첨부 제거`}
                      onClick={() => onRemoveDraftAttachment(attachment.id)}
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <textarea
            aria-label="오케스트레이터에게 메시지 보내기"
            onChange={(event) => onDraftMessageChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }

              event.preventDefault();
              if ((draftMessage.trim() || draftAttachments.length > 0) && selectedAgent) {
                onSendMessage();
              }
            }}
            placeholder={`${selectedAgent?.name ?? "봇"}에게 말 걸기`}
            value={draftMessage}
          />
        </div>
        <button
          className="primary-button"
          disabled={(!draftMessage.trim() && draftAttachments.length === 0) || !selectedAgent}
          type="submit"
        >
          <Send size={16} />
          보내기
        </button>
      </form>
      <div className="action-strip">
        <button onClick={onPromoteToDebate} type="button">
          <GitBranch size={16} />
          토론 전환
        </button>
        <button onClick={onCreateCodingPacket} type="button">
          <Send size={16} />
          패킷 생성
        </button>
        <button onClick={onCreateAgentRun} type="button">
          <Play size={16} />
          실행 슬롯
        </button>
        <button onClick={onBackupProjection} type="button">
          <Archive size={16} />
          백업 상태
        </button>
        <button onClick={onImportTelegram} type="button">
          <Smartphone size={16} />
          Telegram
        </button>
        <div className="branch-action-group" aria-label="Branch and summary adoption controls">
          <span>
            Branch {branchExperiments.length} / 채택 {adoptedBranchCount}
            {latestBranch ? <em title={latestBranch.summary}>{branchStatusLabel(latestBranch.status)}</em> : null}
          </span>
          <button onClick={onCreateBranch} type="button">
            분기
          </button>
          <button disabled={!branchExperiments.some((branch) => branch.status !== "adopted")} onClick={onAdoptBranch} type="button">
            채택
          </button>
        </div>
      </div>
    </section>
  );
}

function AttachmentChips({ attachments }: { attachments: ConversationAttachment[] }) {
  return (
    <div className="message-attachments" aria-label="첨부 파일">
      {attachments.map((attachment) => (
        <span className="message-attachment-chip" key={attachment.id}>
          {attachment.kind === "image" ? <ImageIcon size={12} /> : <FileText size={12} />}
          <strong>{attachment.name}</strong>
          <em>{formatAttachmentSize(attachment.size)}</em>
        </span>
      ))}
    </div>
  );
}

function AgentProfileStrip({
  contextPackTier,
  memoryMode,
  onContextPackTierChange,
  onOpen,
  persona,
  selectedAgent,
}: {
  contextPackTier: ContextPackTier;
  memoryMode: string;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onOpen: (tab: AgentConfigTab) => void;
  persona?: AgentPersonaSettings;
  selectedAgent?: WorkbenchAgent;
}) {
  const cycleContextPackTier = () => {
    const order: ContextPackTier[] = ["lite", "standard", "full"];
    const currentIndex = order.indexOf(contextPackTier);
    const nextTier = order[(currentIndex + 1) % order.length] ?? "standard";
    onContextPackTierChange(nextTier);
  };
  const chips: Array<{ tab: AgentConfigTab; label: string; value: string }> = [
    { tab: "profile", label: "Profile", value: selectedAgent ? agentRoleLabel(selectedAgent.role) : "대기" },
    { tab: "soul", label: "SOUL.md", value: selectedAgent ? soulModeLabel(selectedAgent.soulMode) : "off" },
    {
      tab: "creativity",
      label: "창의성",
      value: persona ? creativityLevelLabel(persona.creativityLevel) : "균형",
    },
    { tab: "injection", label: "Memory", value: memoryMode },
    {
      tab: "agents_md",
      label: "AGENTS.md",
      value: selectedAgent?.configSource === "markdown" ? "active" : "view",
    },
    { tab: "preview", label: "Preview", value: selectedAgent?.configSource ?? "off" },
    { tab: "preview", label: "Context", value: contextPackTierLabel(contextPackTier) },
    { tab: "edit", label: "Edit", value: "settings" },
  ];

  return (
    <div className="agent-profile-strip" aria-label="Agent profile and soul controls">
      {chips.map((chip) => (
        <button
          key={`${chip.label}-${chip.tab}`}
          onClick={() => (chip.label === "Context" ? cycleContextPackTier() : onOpen(chip.tab))}
          title={chip.label === "Context" ? "ContextPack: Lite -> Standard -> Full" : undefined}
          type="button"
        >
          <span>{chip.label}</span>
          <strong>{chip.value}</strong>
        </button>
      ))}
    </div>
  );
}

function AgentConfigDrawer({
  activeTab,
  agent,
  memoryMode,
  onClose,
  onUpdateAgentConfig,
  onUpdatePersona,
  persona,
  provider,
}: {
  activeTab: AgentConfigTab;
  agent: WorkbenchAgent;
  memoryMode: string;
  onClose: () => void;
  onUpdateAgentConfig: (patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) => void;
  onUpdatePersona: (patch: Partial<AgentPersonaSettings>) => void;
  persona: AgentPersonaSettings;
  provider?: ProviderProfile;
}) {
  return (
    <aside className="agent-config-drawer" aria-label="Agent profile settings">
      <header>
        <div>
          <span>{agentConfigPanelTitle(activeTab)}</span>
          <strong>{agent.name}</strong>
        </div>
        <button
          className="agent-config-reset-button"
          onClick={() => onUpdatePersona(createDefaultPersonaSettings(agent))}
          type="button"
        >
          기본값
        </button>
        <button aria-label="Agent 설정 닫기" className="rail-icon-button" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </header>
      <div className="agent-config-body">
        {activeTab === "profile" ? (
          <div className="agent-config-grid">
            <label>
              <span>이름</span>
              <input readOnly value={agent.name} />
            </label>
            <label>
              <span>역할</span>
              <input readOnly value={agentRoleLabel(agent.role)} />
            </label>
            <label>
              <span>Provider</span>
              <input readOnly value={provider?.name ?? "provider pending"} />
            </label>
            <label>
              <span>Model</span>
              <input readOnly value={agent.modelId ?? provider?.defaultModel ?? "model pending"} />
            </label>
          </div>
        ) : null}
        {activeTab === "soul" ? (
          <div className="agent-config-stack soul-config-panel">
            <label>
              <span>SOUL.md 경로</span>
              <input value={persona.soulMdPath} onChange={(event) => onUpdatePersona({ soulMdPath: event.target.value })} />
            </label>
            <label>
              <span>SOUL.md 본문</span>
              <textarea
                value={persona.soulSummary}
                onChange={(event) => onUpdatePersona({ soulSummary: event.target.value })}
              />
            </label>
            <label>
              <span>예시 대화</span>
              <textarea
                value={persona.soulExampleDialogue}
                onChange={(event) => onUpdatePersona({ soulExampleDialogue: event.target.value })}
              />
            </label>
            <label>
              <span>SOUL.md가 없을 때 쓸 제안 소울</span>
              <select
                value={persona.voicePreset}
                onChange={(event) => onUpdatePersona({ voicePreset: event.target.value as AgentVoicePreset })}
              >
                {(["direct", "calm", "architect", "reviewer", "executor"] as AgentVoicePreset[]).map((preset) => (
                  <option key={preset} value={preset}>
                    {voicePresetLabel(preset)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Soul Mode</span>
              <select
                value={agent.soulMode}
                onChange={(event) => onUpdateAgentConfig({ soulMode: event.target.value as WorkbenchAgent["soulMode"] })}
                disabled={agent.configSource === "off"}
              >
                <option value="full">full</option>
                <option value="summary">summary</option>
                <option value="retrieved">retrieved</option>
                <option value="off">off</option>
              </select>
            </label>
            <p className="agent-config-note">
              이 화면은 SOUL.md만 다룹니다. AGENTS.md, 권한, 실행 소스는 중앙 컨트롤 바에서 각각 따로 열어 수정합니다.
            </p>
          </div>
        ) : null}
        {activeTab === "agents_md" ? (
          <div className="agent-config-stack">
            <label>
              <span>AGENTS.md 경로</span>
              <input
                value={persona.agentsMdPath}
                onChange={(event) => onUpdatePersona({ agentsMdPath: event.target.value })}
              />
            </label>
            <label>
              <span>운영 지침</span>
              <textarea
                value={persona.agentsInstruction}
                onChange={(event) => onUpdatePersona({ agentsInstruction: event.target.value })}
              />
            </label>
          </div>
        ) : null}
        {activeTab === "creativity" ? (
          <div className="agent-config-stack">
            <div className="creativity-options" role="radiogroup" aria-label="창의성 단계">
              {(["strict", "focused", "balanced", "creative", "experimental"] as AgentCreativityLevel[]).map((level) => (
                <button
                  aria-checked={persona.creativityLevel === level}
                  className={persona.creativityLevel === level ? "active" : ""}
                  key={level}
                  onClick={() => onUpdatePersona({ creativityLevel: level })}
                  role="radio"
                  type="button"
                >
                  <strong>{creativityLevelLabel(level)}</strong>
                  <span>temp {creativityTemperature(level).toFixed(1)}</span>
                </button>
              ))}
            </div>
            <p className="agent-config-note">
              보수적일수록 검증과 일관성을 우선하고, 창의적일수록 새로운 제안과 대안을 더 적극적으로 냅니다.
            </p>
            <label>
              <span>금기 / 피할 말투</span>
              <textarea
                value={persona.forbiddenStyle}
                onChange={(event) => onUpdatePersona({ forbiddenStyle: event.target.value })}
              />
            </label>
          </div>
        ) : null}
        {activeTab === "injection" ? (
          <div className="agent-config-grid">
            <label>
              <span>Config Source</span>
              <select
                value={agent.configSource}
                onChange={(event) =>
                  onUpdateAgentConfig({ configSource: event.target.value as WorkbenchAgent["configSource"] })
                }
              >
                <option value="internal">internal</option>
                <option value="markdown">markdown</option>
                <option value="off">off</option>
              </select>
            </label>
            <label>
              <span>Soul Mode</span>
              <select
                value={agent.soulMode}
                onChange={(event) => onUpdateAgentConfig({ soulMode: event.target.value as WorkbenchAgent["soulMode"] })}
                disabled={agent.configSource === "off"}
              >
                <option value="full">full</option>
                <option value="summary">summary</option>
                <option value="retrieved">retrieved</option>
                <option value="off">off</option>
              </select>
            </label>
            <p className="agent-config-note">
              현재 실행에는 {configSourceLabel(agent.configSource)} 하나만 주입됩니다. Memory는 {memoryMode}입니다.
            </p>
          </div>
        ) : null}
        {activeTab === "preview" ? (
          <pre className="agent-config-preview">
{`source: ${agent.configSource}
soulMode: ${agent.soulMode}
fallbackSoul: ${voicePresetLabel(persona.voicePreset)}
creativity: ${creativityLevelLabel(persona.creativityLevel)} / temperature ${creativityTemperature(persona.creativityLevel).toFixed(1)}
AGENTS.md: ${agent.configSource === "markdown" ? persona.agentsMdPath : "not injected"}
SOUL.md: ${agent.configSource === "markdown" ? persona.soulMdPath : "not injected"}

${agent.configSource === "internal" ? persona.soulSummary : "markdown source selected; file content will be loaded by path"}
example:
${persona.soulExampleDialogue}

${persona.agentsInstruction}
avoid: ${persona.forbiddenStyle}`}
          </pre>
        ) : null}
        {activeTab === "edit" ? (
          <div className="agent-config-stack">
            <label>
              <span>Config Source</span>
              <select
                value={agent.configSource}
                onChange={(event) =>
                  onUpdateAgentConfig({ configSource: event.target.value as WorkbenchAgent["configSource"] })
                }
              >
                <option value="internal">앱 내부 설정</option>
                <option value="markdown">AGENTS.md / SOUL.md</option>
                <option value="off">사용 안 함</option>
              </select>
            </label>
            <p className="agent-config-note">둘 다 저장할 수는 있지만, 한 턴에 주입되는 설정 소스는 반드시 하나입니다.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function messageLabel(message: ConversationMessage, selectedAgent?: WorkbenchAgent) {
  if (message.role === "user") {
    return "사용자";
  }

  const agentName = message.metadata?.agentName;
  if (typeof agentName === "string") {
    return agentName;
  }

  return selectedAgent?.name ?? "Assistant";
}

function DebateTable() {
  const rows = [
    { agent: "Architect", tag: "근거", text: "패키지 경계가 먼저 잡혀야 DGX와 로컬 폴백이 뒤틀리지 않는다." },
    { agent: "Reviewer", tag: "리스크", text: "API 키 원문 저장과 터미널 실행은 첫 구현에서 명시적으로 막아야 한다." },
    { agent: "Orchestrator", tag: "코딩 영향", text: "결론은 Coding Packet 필드로 바로 내려갈 수 있어야 한다." },
  ];

  return (
    <section className="debate-panel">
      <div className="round-strip">
        {debateRounds.map((round) => (
          <span className={`round-chip ${round.status}`} key={round.id}>
            {round.title}
          </span>
        ))}
      </div>
      <div className="debate-grid">
        {rows.map((row) => (
          <article className="debate-card" key={`${row.agent}-${row.tag}`}>
            <header>
              <Bot size={17} />
              <strong>{row.agent}</strong>
              <span>{row.tag}</span>
            </header>
            <p>{row.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Stage3DebateTable({
  onCreateCodingPacket,
  onSelectUtterance,
  session,
}: {
  onCreateCodingPacket: () => void;
  onSelectUtterance?: (utterance: Stage3DebateUtteranceView) => void;
  session: Stage3DebateSession;
}) {
  const utterances: Stage3DebateUtteranceView[] = session.rounds.flatMap((round) =>
    round.utterances.map((utterance) => ({
      ...utterance,
      roundTitle: round.title,
      agentName: session.participants.find((participant) => participant.agentId === utterance.agentId)?.name ?? utterance.agentId,
    })),
  );
  const auditItems: WindowAuditItem[] = [
    {
      id: "rounds",
      label: "토론 라운드",
      status: session.rounds.length >= 6 ? "ready" : "partial",
      detail: "문제 정의, 제안, 비판, 요약, 보완, 최종 결정 흐름을 유지합니다.",
    },
    {
      id: "tags",
      label: "발언 태그",
      status: utterances.every((utterance) => utterance.tags.length > 0) ? "ready" : "partial",
      detail: "합의/반대/근거/리스크/코딩 영향 태그로 말싸움이 아니라 의사결정을 만듭니다.",
    },
    {
      id: "peek",
      label: "Human Peek",
      status: session.humanPeek.length > 0 ? "ready" : "partial",
      detail: "비공개 에이전트 흐름을 사용자가 감시할 수 있게 남깁니다.",
    },
    {
      id: "coding-packet",
      label: "패킷 반영",
      status: "ready",
      detail: "토론은 요약으로 끝나지 않고 Coding Packet 갱신 버튼으로 이어집니다.",
    },
  ];

  return (
    <section className="debate-panel stage3">
      <header className="debate-context">
        <div>
          <span>Debate Context</span>
          <strong>{session.problem}</strong>
          <p>{session.summary}</p>
        </div>
        <button className="primary-button" onClick={onCreateCodingPacket} type="button">
          <Send size={15} />
          패킷 반영
        </button>
      </header>
      <div className="round-strip">
        {session.rounds.map((round) => (
          <span className={`round-chip ${round.status}`} key={round.id}>
            {round.title}
          </span>
        ))}
      </div>
      <div className="roundtable-mode-strip">
        <span>Roundtable</span>
        <strong>Branch 확장 모델</strong>
        <em>Sequential</em>
        <em>Deliberative</em>
        <small>토론 transcript 전체가 아니라 채택 요약만 main context로 돌아옵니다.</small>
      </div>
      <WindowChecklist items={auditItems} title="토론 창 점검" />
      <div className="debate-workspace">
        <div className="debate-grid">
          {utterances.map((utterance) => (
            <article
              className={`debate-card ${onSelectUtterance ? "selectable" : ""}`}
              key={utterance.id}
              onClick={() => onSelectUtterance?.(utterance)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectUtterance?.(utterance);
                }
              }}
              role={onSelectUtterance ? "button" : undefined}
              tabIndex={onSelectUtterance ? 0 : undefined}
              title="이 발언자와 Conversation에서 이어서 대화"
            >
              <header>
                <Bot size={16} />
                <strong>{utterance.agentName}</strong>
                <span>{utterance.roundTitle}</span>
              </header>
              <div className="debate-tags">
                {utterance.tags.map((tag) => (
                  <em className={`debate-tag ${tag}`} key={tag}>
                    {debateTagLabel(tag)}
                  </em>
                ))}
              </div>
              <p>{utterance.content}</p>
            </article>
          ))}
        </div>
        <aside className="human-peek-panel">
          <section>
            <header>
              <Activity size={15} />
              <strong>Status Hub</strong>
            </header>
            <div className="status-hub-grid">
              {session.statusHub.map((item) => (
                <div className={`status-hub-cell ${item.tone}`} key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
          <section>
            <header>
              <GitBranch size={15} />
              <strong>Human Peek</strong>
            </header>
            <div className="peek-list">
              {session.humanPeek.map((entry) => (
                <article className={`peek-row ${entry.state}`} key={entry.id}>
                  <span>{entry.kind}</span>
                  <strong>
                    {entry.actor} → {entry.target}
                  </strong>
                  <p>{entry.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function debateTagLabel(tag: DebateTag) {
  const labels: Record<DebateTag, string> = {
    agreement: "합의",
    objection: "반대",
    evidence: "근거",
    risk: "리스크",
    coding_impact: "코딩 영향",
  };

  return labels[tag];
}

function WorkItemHandoffPanel({
  drafts,
  handoffs,
  items,
  onArchiveItem,
  onRouteItem,
}: {
  drafts: AssistantDraft[];
  handoffs: WorkItemHandoff[];
  items: WorkItem[];
  onArchiveItem: (workItemId: string) => void;
  onRouteItem: (workItemId: string, lane: WorkItem["lane"]) => void;
}) {
  const activeItems = items.filter((item) => item.status !== "archived").slice(0, 12);
  const lanes = [
    { id: "auto" as const, label: workLaneLabel("auto") },
    { id: "check" as const, label: workLaneLabel("check") },
    { id: "ask" as const, label: workLaneLabel("ask") },
    { id: "approve" as const, label: workLaneLabel("approve") },
    { id: "blocked" as const, label: workLaneLabel("blocked") },
  ];
  const laneItems = Object.fromEntries(
    lanes.map((lane) => [lane.id, activeItems.filter((item) => getInboxLane(item) === lane.id)]),
  ) as Record<(typeof lanes)[number]["id"], WorkItem[]>;
  const visibleDrafts = drafts.slice(0, 2);
  const pendingHandoffs = handoffs.filter((handoff) => handoff.approvalState === "required").length;
  const waitingInput = laneItems.ask.length;

  return (
    <section className="work-handoff-strip inbox-strip" aria-label="Assistant Inbox">
      <header>
        <div>
          <span>Assistant Inbox</span>
          <strong>
            {activeItems.length} tasks / {visibleDrafts.length} drafts / {pendingHandoffs} approvals
          </strong>
        </div>
        <em>{waitingInput > 0 ? `${waitingInput} questions pending` : "WorkItem first"}</em>
      </header>
      <div className="work-handoff-grid">
        {lanes.map((lane) => {
          const firstItem = laneItems[lane.id][0];

          return (
            <article className={`work-handoff-card inbox-lane ${lane.id}`} key={lane.id}>
              <span>
                {lane.label} / {laneItems[lane.id].length}
              </span>
              <strong>{firstItem?.title ?? "No waiting item"}</strong>
              <p>{firstItem?.summary ?? "New WorkItems will be classified here."}</p>
              {firstItem ? (
                <div className="inbox-card-actions">
                  {lane.id !== "check" ? (
                    <button onClick={() => onRouteItem(firstItem.id, "check")} type="button">
                      Check
                    </button>
                  ) : null}
                  {lane.id !== "approve" ? (
                    <button onClick={() => onRouteItem(firstItem.id, "approve")} type="button">
                      Approve
                    </button>
                  ) : null}
                  <button onClick={() => onArchiveItem(firstItem.id)} type="button">
                    Archive
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {visibleDrafts.map((draft) => (
          <article className="work-handoff-card draft" key={draft.id}>
            <span>{draft.targetSurface} / {draft.confidence}</span>
            <strong>{draft.title}</strong>
            <p>{draft.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentAvatar({
  agent,
  size = "medium",
  visual,
}: {
  agent?: WorkbenchAgent;
  size?: "small" | "medium" | "large";
  visual?: AgentVisualSettings;
}) {
  const label = agent ? getAgentInitials(agent.name) : "AI";
  return (
    <span className={`agent-avatar ${size} ${visual?.avatarDataUrl ? "has-image" : ""}`}>
      {visual?.avatarDataUrl ? <img alt={`${agent?.name ?? "Agent"} avatar`} src={visual.avatarDataUrl} /> : label}
    </span>
  );
}

function AgentSettingsPanel({
  agent,
  onClearAvatar,
  onClose,
  onUpdateAgent,
  onUploadAvatar,
  visual,
}: {
  agent: WorkbenchAgent;
  onClearAvatar: (agentId: string) => void;
  onClose: () => void;
  onUpdateAgent: (agentId: string, patch: Partial<Pick<WorkbenchAgent, "name" | "role">>) => void;
  onUploadAvatar: (agentId: string, file: File) => void;
  visual: AgentVisualSettings;
}) {
  const [draftName, setDraftName] = useState(agent.name);

  useEffect(() => {
    setDraftName(agent.name);
  }, [agent.id, agent.name]);

  function commitName() {
    const nextName = draftName.trim();
    if (!nextName) {
      setDraftName(agent.name);
      return;
    }
    if (nextName !== agent.name) {
      onUpdateAgent(agent.id, { name: nextName });
    }
  }
  const auditItems: WindowAuditItem[] = [
    {
      id: "name",
      label: "이름",
      status: draftName.trim() ? "ready" : "partial",
      detail: "에이전트 표시명은 tmux pane, 대화 상대, 기록에 함께 반영됩니다.",
    },
    {
      id: "role",
      label: "역할",
      status: "ready",
      detail: "지휘자/설계자/검토자/실행자 같은 역할을 여기서 바꿉니다.",
    },
    {
      id: "avatar",
      label: "프로필 사진",
      status: visual.avatarDataUrl ? "ready" : "partial",
      detail: "업로드 이미지는 data URL로 저장해 외부 접속에서도 경로가 깨지지 않게 합니다.",
    },
    {
      id: "event-record",
      label: "설정 기록",
      status: "ready",
      detail: "이름, 역할, 이미지 변경은 Event Storage에 남길 준비가 되어 있습니다.",
    },
  ];

  return (
    <section className="agent-settings-modal" aria-label="Agent profile settings">
      <header>
        <div className="agent-settings-title">
          <AgentAvatar agent={agent} size="large" visual={visual} />
          <div>
            <span>Agent Settings</span>
            <strong>{agent.name}</strong>
          </div>
        </div>
        <button aria-label="agent settings close" className="icon-button" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </header>
      <div className="agent-settings-body">
        <label>
          <span>이름</span>
          <input
            onBlur={commitName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            value={draftName}
          />
        </label>
        <label>
          <span>역할</span>
          <select
            onChange={(event) =>
              onUpdateAgent(agent.id, {
                role: event.target.value as WorkbenchAgent["role"],
              })
            }
            value={agent.role}
          >
            {agentRoleOptions.map((role) => (
              <option key={role} value={role}>
                {agentRoleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <div className="agent-avatar-editor">
          <div>
            <span>프로필 사진</span>
            <strong>{visual.avatarDataUrl ? "embedded data URL" : "기본 이니셜"}</strong>
            <p>로컬 파일 경로가 아니라 이미지 데이터를 저장해서 집 밖 접속에서도 깨지지 않게 이어갈 수 있게 한다.</p>
          </div>
          <label className="avatar-upload-button">
            <ImageIcon size={14} />
            업로드
            <input
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUploadAvatar(agent.id, file);
                }
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          <button className="ghost-button" disabled={!visual.avatarDataUrl} onClick={() => onClearAvatar(agent.id)} type="button">
            초기화
          </button>
        </div>
        <div className="agent-settings-note">
          <span>tmux 준비 상태</span>
          <strong>이름 / 역할 / avatar는 Event Storage에 기록되고, 실제 tmux runner 연결 전까지 UI와 handoff 기록에서 먼저 사용한다.</strong>
        </div>
      </div>
      <WindowChecklist items={auditItems} title="에이전트 설정 점검" />
    </section>
  );
}

function TmuxSwarmBoard({
  activeSessionId,
  agentActivityById,
  agentVisualsById,
  agents,
  messages,
  packet,
}: {
  activeSessionId: string;
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  agents: WorkbenchAgent[];
  messages: ConversationMessage[];
  packet: CodingPacket;
}) {
  const recentMessages = messages.slice(-6);
  const roleAgent = (role: WorkbenchAgent["role"]) => agents.find((agent) => agent.role === role);
  const recommendation = createTmuxSwarmRecommendation(packet, messages);
  const panes = [
    {
      id: "pane-0",
      roleKey: "discussion",
      title: "Discussion & Planning",
      role: "요구사항 / 제품 / 아키텍처 논의",
      state: "chat active",
      agent: roleAgent("orchestrator"),
      signal: "사용자와 먼저 논의하고, 바로 실행하지 않는다.",
    },
    {
      id: "pane-1",
      roleKey: "orchestrator",
      title: "Orchestrator Control",
      role: "작업 분해 / 역할 배정 / 지휘",
      state: "dispatch locked",
      agent: roleAgent("orchestrator"),
      signal: "실제 tmux send는 Permission Matrix 안정화 전까지 잠김.",
    },
    {
      id: "pane-2",
      roleKey: "status",
      title: "Status & Monitor",
      role: "진행 로그 / 테스트 / stuck run 감시",
      state: "watch only",
      signal: "Event Storage에 기록 가능한 run intent만 준비.",
    },
    {
      id: "pane-3",
      roleKey: "code",
      title: "Agent - Code Expert",
      role: "핵심 로직 / 리팩터링 / 복잡 구현",
      state: "idle",
      agent: roleAgent("builder"),
      signal: "Coding Packet이 생기면 core logic 작업 후보.",
    },
    {
      id: "pane-4",
      roleKey: "architect",
      title: "Agent - Architect",
      role: "protocol / Event Storage / 타입 경계",
      state: "ready",
      agent: roleAgent("architect"),
      signal: "ExecutionSlot / AgentSession / run event 타입 경계 담당.",
    },
    {
      id: "pane-5",
      roleKey: "frontend",
      title: "Agent - Frontend Dev",
      role: "desktop UI / Workbench / Execution Slot",
      state: "active",
      signal: "현재 tmux workbench preview를 담당.",
    },
    {
      id: "pane-6",
      roleKey: "backend",
      title: "Agent - Backend Dev",
      role: "server / sync / DGX 연결 지점",
      state: "idle",
      signal: "DGX-02만 대상. DGX-01은 잠금.",
    },
    {
      id: "pane-7",
      roleKey: "qa",
      title: "Agent - QA & Security",
      role: "테스트 / 권한 / redaction / 회귀검사",
      state: "guarding",
      agent: roleAgent("reviewer") ?? roleAgent("verifier"),
      signal: "Gemini CLI 연결 금지. Secret/command redaction 우선.",
    },
    {
      id: "pane-8",
      roleKey: "research",
      title: "Agent - Research Scout",
      role: "외부 문서 / repo / 레퍼런스 조사",
      state: recommendation.recommendedRoles.includes("research") ? "recommended" : "standby",
      agent: roleAgent("skeptic"),
      signal: "새 API/라이브러리/외부 설계 검토가 필요할 때만 투입.",
    },
    {
      id: "pane-9",
      roleKey: "memory",
      title: "Agent - Memory Curator",
      role: "Memento recall / 결정 기록 / handoff 정리",
      state: recommendation.recommendedRoles.includes("memory") ? "recommended" : "standby",
      agent: roleAgent("memory_curator"),
      signal: "장기 프로젝트, 백업, handoff가 걸리면 기억 정리 전담.",
    },
  ];
  const visiblePanes = panes.slice(0, recommendation.recommendedCount);
  const auditItems: WindowAuditItem[] = [
    {
      id: "layout",
      label: "tmux 화면",
      status: "ready",
      detail: "tmux 모드에서는 좌우 rail과 하단 dock을 밀고 중앙 workbench를 전체 화면으로 씁니다.",
    },
    {
      id: "pane-count",
      label: "4-10 pane",
      status: "ready",
      detail: `오케스트레이터가 난이도 ${recommendation.difficulty}로 보고 ${recommendation.recommendedCount}개 pane을 추천했습니다.`,
    },
    {
      id: "scripts",
      label: "실제 tmux 스크립트",
      status: "partial",
      detail: "scripts/setup-agent-swarm.sh와 swarm-send.sh는 준비됐고, 실제 dispatch는 permission 안정화 뒤 켭니다.",
    },
    {
      id: "gemini",
      label: "Gemini 연결",
      status: "blocked",
      detail: "Gemini CLI는 agy -p 설정 전까지 의도적으로 연결 금지 상태입니다.",
    },
  ];

  return (
    <section className="tmux-panel" aria-label="Role-Based Tmux Agent Swarm">
      <header className="tmux-header">
        <div>
          <span>Future Runtime Preview</span>
          <strong>ai-swarm</strong>
          <p>왼쪽은 지휘자 대화, 오른쪽은 agent pane별 상태와 중요 메시지를 본다.</p>
        </div>
        <div className="tmux-gate">
          <LockKeyhole size={15} />
          <span>Implementation Gate</span>
          <strong>이벤트 저장소 / Permission / Redaction 먼저</strong>
        </div>
      </header>
      <section className="tmux-recommendation-panel" aria-label="Orchestrator swarm recommendation">
        <div>
          <span>Orchestrator 추천 배치</span>
          <strong>{recommendation.recommendedCount}명 / 최대 10명</strong>
          <p>{recommendation.summary}</p>
        </div>
        <div className="tmux-recommendation-meter">
          <span>난이도</span>
          <strong>{recommendation.difficulty}</strong>
          <em>score {recommendation.score}</em>
        </div>
        <div className="tmux-role-chip-list">
          {recommendation.recommendedRoles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </div>
      </section>
      <WindowChecklist items={auditItems} title="tmux 창 점검" />
      <div className="tmux-workbench">
        <section className="tmux-operator-chat">
          <header>
            <span>Operator Chat</span>
            <strong>{activeSessionId}</strong>
          </header>
          <div className="tmux-chat-stream">
            {recentMessages.map((message) => (
              <article className={message.role === "user" ? "user" : "assistant"} key={message.id}>
                <span>{message.role === "user" ? "사용자" : messageLabel(message)}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
          <div className="tmux-chat-note">
            <span>main chat stays here</span>
            <strong>small text / monitor first</strong>
          </div>
        </section>
        <section className="tmux-agent-board">
          <header>
            <span>Agent Work Status</span>
            <strong>{recommendation.recommendedCount} panes / max 10</strong>
          </header>
          <div className="tmux-agent-grid">
            {visiblePanes.map((pane) => (
              <TmuxPaneCard
                key={pane.id}
                pane={{
                  ...pane,
                  state: pane.agent ? (agentActivityById[pane.agent.id] ?? pane.state) : pane.state,
                }}
                visual={pane.agent ? agentVisualsById[pane.agent.id] : undefined}
              />
            ))}
          </div>
        </section>
      </div>
      <div className="tmux-decision-row">
        <div>
          <span>이벤트 저장소 mapping</span>
          <strong>run intent / pane status 준비</strong>
        </div>
        <div>
          <span>Permission + Redaction</span>
          <strong>실행 전 승인, 기록 전 제거</strong>
        </div>
        <div>
          <span>Gemini CLI</span>
          <strong>연결 금지 - CLI 설정 후 결정</strong>
        </div>
        <div>
          <span>첫 실제 tmux runner</span>
          <strong>미정</strong>
        </div>
        <div>
          <span>Agent profile assets</span>
          <strong>data URL 저장 / 경로 의존 없음</strong>
        </div>
      </div>
      <footer className="tmux-footer">
        <span>tmux session: ai-swarm</span>
        <span>runtime backend: local tmux / 4-10 panes</span>
        <span>real command dispatch: disabled</span>
      </footer>
    </section>
  );
}

type TmuxSwarmDifficulty = "light" | "standard" | "complex" | "critical";

function createTmuxSwarmRecommendation(packet: CodingPacket, messages: ConversationMessage[]) {
  const text = [
    packet.goal,
    ...packet.context,
    ...packet.decisions,
    ...packet.constraints,
    ...packet.implementationPlan,
    ...packet.verificationPlan,
    ...messages.slice(-6).map((message) => message.content),
  ]
    .join(" ")
    .toLowerCase();
  const keywordWeights: Array<[string, number]> = [
    ["tmux", 2],
    ["dgx", 2],
    ["server", 1],
    ["permission", 2],
    ["redaction", 2],
    ["보안", 2],
    ["백업", 1],
    ["provider", 1],
    ["프로바이더", 1],
    ["memory", 1],
    ["memento", 1],
    ["event", 1],
    ["테스트", 1],
    ["끝까지", 2],
    ["전부", 2],
  ];
  const score =
    2 +
    packet.implementationPlan.length +
    packet.verificationPlan.length +
    packet.constraints.length +
    keywordWeights.reduce((total, [keyword, weight]) => total + (text.includes(keyword) ? weight : 0), 0);
  const difficulty: TmuxSwarmDifficulty =
    score >= 15 ? "critical" : score >= 10 ? "complex" : score >= 6 ? "standard" : "light";
  const recommendedCount = difficulty === "critical" ? 10 : difficulty === "complex" ? 8 : difficulty === "standard" ? 6 : 4;
  const baseRoles = ["discussion", "orchestrator", "status", "architect"];
  const byDifficulty: Record<TmuxSwarmDifficulty, string[]> = {
    light: ["frontend"],
    standard: ["frontend", "backend", "qa"],
    complex: ["code", "architect", "frontend", "backend", "qa"],
    critical: ["code", "architect", "frontend", "backend", "qa", "research", "memory"],
  };
  const recommendedRoles = Array.from(new Set([...baseRoles, ...byDifficulty[difficulty]])).slice(0, recommendedCount);

  return {
    difficulty,
    recommendedCount,
    recommendedRoles,
    score,
    summary:
      difficulty === "critical"
        ? "서버/권한/기억/백업/실행이 함께 걸린 작업이라 10인 편성이 안전하다."
        : difficulty === "complex"
          ? "프론트와 백엔드, 검증이 동시에 필요한 복합 작업이라 8인 편성을 추천한다."
          : difficulty === "standard"
            ? "구현과 검증이 함께 필요한 일반 작업이라 6인 편성을 추천한다."
            : "작은 수정이나 검토 중심 작업이라 4인 편성으로 충분하다.",
  };
}

function TmuxPaneCard({
  pane,
  visual,
}: {
  pane: {
    id: string;
    roleKey: string;
    title: string;
    role: string;
    state: string;
    agent?: WorkbenchAgent;
    signal: string;
  };
  visual?: AgentVisualSettings;
}) {
  return (
    <article className="tmux-pane-card">
      <header>
        <AgentAvatar agent={pane.agent} size="small" visual={visual} />
        <div>
          <span>{pane.id}</span>
          <strong>{pane.title}</strong>
        </div>
        <em>{pane.state}</em>
      </header>
      <p>{pane.role}</p>
      <div className="tmux-pane-agent-line">
        <strong>{pane.agent ? pane.agent.name : "담당 agent 미정"}</strong>
        <span>{pane.agent ? agentRoleLabel(pane.agent.role) : "future slot"}</span>
        <small>{pane.agent?.modelId ?? "model pending"}</small>
      </div>
      <code>{pane.signal}</code>
    </article>
  );
}

function ProviderRegistrationMenu({
  modelCatalog,
  modelDiscoveryByProviderId,
  onClose,
  onDiscoverModels,
  onRemoveProvider,
  onRenameProvider,
  onRegister,
  profiles,
  usedProviderIds,
}: {
  modelCatalog: ModelCatalog;
  modelDiscoveryByProviderId: Record<string, ModelDiscoverySnapshot>;
  onClose: () => void;
  onDiscoverModels: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  onRenameProvider: (providerId: string) => void;
  onRegister: (mode: ProviderRegistrationMode) => void;
  profiles: ProviderProfile[];
  usedProviderIds: Set<string>;
}) {
  const options: Array<{
    mode: ProviderRegistrationMode;
    label: string;
    detail: string;
    icon: LucideIcon;
  }> = [
    { mode: "api_key", label: "API Key", detail: "env / JSON / base URL", icon: KeyRound },
    { mode: "cli", label: "CLI", detail: "Codex / Claude Code / OpenClaw", icon: Terminal },
    { mode: "oauth", label: "OAuth", detail: "session / account binding", icon: LockKeyhole },
  ];
  const auditItems: WindowAuditItem[] = [
    {
      id: "api",
      label: "API Key",
      status: "ready",
      detail: "단순 키, env export, Claude Code JSON, custom base URL을 같은 secret ref로 받습니다.",
    },
    {
      id: "cli",
      label: "CLI Provider",
      status: "partial",
      detail: "Codex/Claude/OpenClaw CLI는 등록 준비됨. Gemini agy -p는 설정 전까지 잠금입니다.",
    },
    {
      id: "oauth",
      label: "OAuth",
      status: "ready",
      detail: "계정 세션형 provider를 이름 붙여 저장하고 agent에서 선택할 수 있습니다.",
    },
    {
      id: "models",
      label: "모델 목록",
      status: profiles.length > 0 ? "ready" : "partial",
      detail: "프로바이더별 discovery/cached 모델을 agent 모델 선택창으로 넘깁니다.",
    },
  ];

  return (
    <section className="provider-registration-menu" aria-label="provider registration menu">
      <header>
        <span>Provider 등록</span>
        <button aria-label="provider 등록 메뉴 닫기" className="rail-icon-button" onClick={onClose} type="button">
          <ChevronLeft size={14} />
        </button>
      </header>
      <div className="provider-registration-actions">
        {options.map((option) => (
          <button key={option.mode} onClick={() => onRegister(option.mode)} type="button">
            <option.icon size={15} />
            <span>{option.label}</span>
            <small>{option.detail}</small>
          </button>
        ))}
      </div>
      <div className="provider-registration-list" aria-label="registered providers">
        {profiles.map((profile) => {
          const isInUse = usedProviderIds.has(profile.id);
          const modelCount = modelCatalog[profile.id]?.length ?? 0;
          const discovery = modelDiscoveryByProviderId[profile.id];
          return (
            <article className={isInUse ? "in-use" : ""} key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <span>
                  {profile.trustLevel} / {modelCount} models / {discovery?.status ?? "cached"}
                </span>
              </div>
              <button
                aria-label={`${profile.name} model discovery`}
                className="rail-icon-button"
                onClick={() => onDiscoverModels(profile.id)}
                title="model discovery"
                type="button"
              >
                <RefreshCw size={13} />
              </button>
              <button
                aria-label={`${profile.name} 이름 변경`}
                className="rail-icon-button"
                onClick={() => onRenameProvider(profile.id)}
                title="provider 이름 변경"
                type="button"
              >
                <Pencil size={13} />
              </button>
              <button
                aria-label={`${profile.name} 삭제`}
                className="rail-icon-button"
                disabled={isInUse || profiles.length <= 1}
                onClick={() => onRemoveProvider(profile.id)}
                title={isInUse ? "agent가 사용 중이라 삭제할 수 없음" : "provider 삭제"}
                type="button"
              >
                <Trash2 size={13} />
              </button>
            </article>
          );
        })}
      </div>
      <WindowChecklist items={auditItems} title="프로바이더 창 점검" />
    </section>
  );
}

function ProviderProfilesManagerPanel({
  modelCatalog,
  modelDiscoveryByProviderId,
  onAddProvider,
  onDiscoverModels,
  onRenameProvider,
  onRemoveProvider,
  profiles,
  usedProviderIds,
}: {
  modelCatalog: ModelCatalog;
  modelDiscoveryByProviderId: Record<string, ModelDiscoverySnapshot>;
  onAddProvider: () => void;
  onDiscoverModels: (providerId: string) => void;
  onRenameProvider: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  profiles: ProviderProfile[];
  usedProviderIds: Set<string>;
}) {
  return (
    <section className="side-panel">
      <header className="panel-title">
        <KeyRound size={17} />
        <h2>Provider Profiles</h2>
        <button aria-label="provider 추가" className="icon-button" onClick={onAddProvider} type="button">
          <Plus size={15} />
        </button>
      </header>
      <div className="provider-list">
        {profiles.map((profile) => {
          const isInUse = usedProviderIds.has(profile.id);
          const discovery = modelDiscoveryByProviderId[profile.id];
          const models = modelCatalog[profile.id] ?? [];
          return (
            <article className={`provider-row ${isInUse ? "in-use" : ""}`} key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <small className="provider-model-summary">
                  {models.length} models / {discovery?.status ?? "cached"} / {discovery?.source ?? "seed"}
                </small>
              </div>
              <span className={`trust ${profile.trustLevel}`}>{profile.trustLevel}</span>
              <div className="provider-actions">
                <button
                  aria-label={`${profile.name} model discovery`}
                  className="provider-discovery-button"
                  onClick={() => onDiscoverModels(profile.id)}
                  title="model discovery"
                  type="button"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  aria-label={`${profile.name} 이름 변경`}
                  className="provider-rename-button"
                  onClick={() => onRenameProvider(profile.id)}
                  title="provider 이름 변경"
                  type="button"
                >
                  <Pencil size={13} />
                </button>
                <button
                  aria-label={`${profile.name} 삭제`}
                  className="provider-remove-button"
                  disabled={isInUse || profiles.length <= 1}
                  onClick={() => onRemoveProvider(profile.id)}
                  title={isInUse ? "agent가 사용 중이라 삭제할 수 없음" : "provider 삭제"}
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AgentStatePanel({
  agents,
  agentActivityById,
  agentVisualsById,
  modelCatalog,
  modelWindowStartByAgentId,
  onAddAgent,
  onAssignModel,
  onAssignProvider,
  onOpenAgentSettings,
  onRemoveAgent,
  onSelectAgent,
  onShiftModelWindow,
  profiles,
  selectedAgentId,
}: {
  agents: WorkbenchAgent[];
  agentActivityById: Record<string, AgentActivityStatus>;
  agentVisualsById: Record<string, AgentVisualSettings>;
  modelCatalog: ModelCatalog;
  modelWindowStartByAgentId: Record<string, number>;
  onAddAgent: () => void;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  onOpenAgentSettings: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onShiftModelWindow: (agentId: string, direction: -1 | 1) => void;
  profiles: ProviderProfile[];
  selectedAgentId?: string;
}) {
  const auditItems: WindowAuditItem[] = [
    {
      id: "dynamic-agents",
      label: "추가/삭제",
      status: "ready",
      detail: "에이전트 수는 고정 4명이 아니라 필요할 때 계속 늘리고 줄입니다.",
    },
    {
      id: "provider-lock",
      label: "Provider 점유",
      status: "ready",
      detail: "다른 agent가 쓰는 provider는 선택창에서 비활성화합니다.",
    },
    {
      id: "model-window",
      label: "모델 선택",
      status: "ready",
      detail: "모델이 8개를 넘으면 좌우 이동으로 고를 수 있습니다.",
    },
    {
      id: "agent-profile",
      label: "프로필/Soul",
      status: "ready",
      detail: "연필 메뉴에서 이름, 역할, 프로필 사진을 바꾸고 중앙에서 SOUL.md/AGENTS.md를 다룹니다.",
    },
  ];

  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <Bot size={17} />
        <h2>Agents</h2>
        <button className="icon-button" onClick={onAddAgent} type="button" aria-label="봇 추가">
          <Plus size={15} />
        </button>
      </header>
      <div className="agent-list">
        {agents.map((agent) => {
          const activityStatus = agentActivityById[agent.id] ?? "idle";
          const providerModels = agent.providerProfileId ? (modelCatalog[agent.providerProfileId] ?? []) : [];
          const modelWindowStart = modelWindowStartByAgentId[agent.id] ?? 0;
          const visibleModels = providerModels.slice(modelWindowStart, modelWindowStart + modelWindowSize);
          const hasModelOverflow = providerModels.length > modelWindowSize;
          const canShiftModelsLeft = hasModelOverflow && modelWindowStart > 0;
          const canShiftModelsRight = hasModelOverflow && modelWindowStart + modelWindowSize < providerModels.length;
          const occupiedProviderIds = new Set(
            agents
              .filter((otherAgent) => otherAgent.id !== agent.id)
              .map((otherAgent) => otherAgent.providerProfileId)
              .filter((providerId): providerId is string => Boolean(providerId)),
          );
          const agentSummary = agentRoleLabel(agent.role);
          return (
            <div className={`agent-row ${agent.id === selectedAgentId ? "selected" : ""}`} key={agent.id}>
            <button className="agent-select-button" onClick={() => onSelectAgent(agent.id)} type="button">
              <span className="agent-avatar-status">
                <AgentAvatar agent={agent} size="small" visual={agentVisualsById[agent.id]} />
                <span
                  aria-label={`${agent.name} ${activityStatus}`}
                  className={`agent-dot ${agent.enabled ? "enabled" : ""} ${activityStatus}`}
                  title={activityStatus}
                />
              </span>
              <strong>{agent.name}</strong>
              <span className="agent-summary-line" title={agentSummary}>
                {agentSummary}
              </span>
            </button>
            <button
              aria-label={`${agent.name} 설정`}
              className="agent-rename-button"
              onClick={() => onOpenAgentSettings(agent.id)}
              title="agent 설정"
              type="button"
            >
              <Pencil size={14} />
            </button>
            <button
              aria-label={`${agent.name} 제거`}
              className="agent-remove-button"
              disabled={agents.length <= 1}
              onClick={() => onRemoveAgent(agent.id)}
              type="button"
            >
              <Trash2 size={14} />
            </button>
            <select
              aria-label={`${agent.name} provider 선택`}
              className="agent-provider-select"
              onChange={(event) => onAssignProvider(agent.id, event.target.value)}
              value={agent.providerProfileId ?? ""}
            >
              <option disabled value="">
                provider 선택
              </option>
              {profiles.map((profile) => {
                const isOccupied = occupiedProviderIds.has(profile.id);
                return (
                  <option disabled={isOccupied} key={profile.id} value={profile.id}>
                    {profile.name}{isOccupied ? " (in use)" : ""}
                  </option>
                );
              })}
            </select>
            <div className={`agent-model-row ${hasModelOverflow ? "with-window-controls" : "single-window"}`}>
              {hasModelOverflow ? (
                <button
                  aria-label={`${agent.name} model 이전`}
                  className="model-shift-button"
                  disabled={!canShiftModelsLeft}
                  onClick={() => onShiftModelWindow(agent.id, -1)}
                  type="button"
                >
                  <ChevronLeft size={14} />
                </button>
              ) : null}
              <select
                aria-label={`${agent.name} model 선택`}
                className="agent-model-select"
                disabled={providerModels.length === 0}
                onChange={(event) => onAssignModel(agent.id, event.target.value)}
                value={agent.modelId ?? visibleModels[0]?.id ?? ""}
              >
                {visibleModels.length === 0 ? (
                  <option value="">model pending</option>
                ) : null}
                {visibleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              {hasModelOverflow ? (
                <button
                  aria-label={`${agent.name} model 다음`}
                  className="model-shift-button"
                  disabled={!canShiftModelsRight}
                  onClick={() => onShiftModelWindow(agent.id, 1)}
                  type="button"
                >
                  <ChevronRight size={14} />
                </button>
              ) : null}
            </div>
            </div>
          );
        })}
      </div>
      <WindowChecklist items={auditItems} title="Agents 창 점검" />
    </section>
  );
}

function MementoInspectorPanel({
  inspector,
  onActivate,
  onForget,
  onPin,
  onRemember,
}: {
  inspector: Stage6MemoryInspector;
  onActivate: (recordId: string) => void;
  onForget: (recordId: string) => void;
  onPin: (recordId: string) => void;
  onRemember: () => void;
}) {
  const visibleTrace = inspector.trace.results.slice(0, 6);
  const visibleRecords = inspector.records.slice(0, 8);
  const visibleRelations = inspector.relations.slice(0, 4);
  const visibleIssues = inspector.issues.slice(0, 4);
  const toolRows = [
    { id: "remember", label: "remember", value: "대화 저장" },
    { id: "recall", label: "recall", value: `${inspector.trace.results.length}개 후보` },
    { id: "context", label: "memory_context", value: `${inspector.contextPacket.activeRecordIds.length}개 활성` },
    { id: "reflect", label: "reflect", value: `${inspector.issues.length}개 이슈` },
    { id: "stats", label: "stats", value: mementoHealthLabel(inspector.stats.health) },
    { id: "relations", label: "relations", value: `${inspector.relations.length}개 링크` },
    { id: "activate", label: "activate", value: `${inspector.stats.activeRecords}개 활성` },
  ];
  const auditItems: WindowAuditItem[] = [
    {
      id: "context",
      label: "Memory Context",
      status: inspector.contextPacket.activeRecordIds.length > 0 ? "ready" : "partial",
      detail: "현재 대화에 실제로 주입할 기억 묶음과 보류된 기억을 분리합니다.",
    },
    {
      id: "relations",
      label: "Relation Graph",
      status: inspector.relations.length > 0 ? "ready" : "partial",
      detail: "관련 기억을 링크로 묶어 장기 프로젝트 맥락을 복원합니다.",
    },
    {
      id: "reflect",
      label: "Reflect",
      status: inspector.issues.length > 0 ? "partial" : "ready",
      detail: "중복, 모순, 오래된 기억, 비신뢰 활성 기억을 점검합니다.",
    },
    {
      id: "activation",
      label: "Activation",
      status: inspector.stats.activeRecords > 0 ? "ready" : "partial",
      detail: "필요한 기억만 명시적으로 활성화해서 컨텍스트 폭발을 줄입니다.",
    },
  ];

  return (
    <section className="side-panel memory-panel memento-panel">
      <header className="panel-title">
        <Database size={17} />
        <h2>Memento</h2>
        <button aria-label="현재 맥락 기억" className="icon-button" onClick={onRemember} type="button">
          <Plus size={15} />
        </button>
      </header>

      <div className="memory-policy">
        <strong>{inspector.trace.policy.autoRecallAllowed ? "자동 불러오기" : "수동 불러오기"}</strong>
        <span>{recallReasonLabel(inspector.trace.policy.reason)}</span>
      </div>

      <div className="memento-tool-grid" aria-label="Memento MCP tool coverage">
        {toolRows.map((tool) => (
          <div key={tool.id}>
            <span>{tool.label}</span>
            <strong>{tool.value}</strong>
          </div>
        ))}
      </div>

      <div className="memory-stat-grid memento-stats">
        <div>
          <span>기억</span>
          <strong>{inspector.stats.totalRecords}</strong>
        </div>
        <div>
          <span>활성</span>
          <strong>{inspector.stats.activeRecords}</strong>
        </div>
        <div>
          <span>관계</span>
          <strong>{inspector.stats.relationCount}</strong>
        </div>
        <div>
          <span>격리</span>
          <strong>{inspector.stats.quarantinedRecords}</strong>
        </div>
      </div>

      <div className={`memory-context-card ${inspector.stats.health}`}>
        <span>Memory Context</span>
        <strong>{inspector.contextPacket.summary}</strong>
        <p>
          active {inspector.contextPacket.activeRecordIds.length} / blocked{" "}
          {inspector.contextPacket.blockedRecordIds.length} / links {inspector.contextPacket.relationIds.length}
        </p>
      </div>

      <div className="memento-scroll">
        <section className="memento-section">
          <header>
            <span>Recall Trace</span>
            <strong>{visibleTrace.length}</strong>
          </header>
          <div className="recall-trace-list" aria-label="Recall Trace">
            {visibleTrace.map((result) => (
              <article className={result.usedInDecision ? "used" : "blocked"} key={result.record.id}>
                <div>
                  <strong>{result.record.title}</strong>
                  <span>
                    {mementoKindLabel(result.record.kind)} / {mementoScopeLabel(result.record.scope)} /{" "}
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </div>
                <em>{activationStateLabel(result.activationState)}</em>
                <p>{recallReasonLabel(result.reason)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="memento-section">
          <header>
            <span>Relations</span>
            <strong>{visibleRelations.length}</strong>
          </header>
          <div className="memory-relation-list">
            {visibleRelations.length === 0 ? (
              <article>
                <strong>링크 후보 없음</strong>
                <span>활성 기억이 늘어나면 관계 그래프를 만듭니다.</span>
              </article>
            ) : (
              visibleRelations.map((relation) => (
                <article key={relation.id}>
                  <strong>{memoryRelationLabel(relation.kind)}</strong>
                  <span>
                    {(relation.confidence * 100).toFixed(0)}% / {relation.fromRecordId.replace("memory_seed_", "")}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="memento-section">
          <header>
            <span>Reflect</span>
            <strong>{visibleIssues.length}</strong>
          </header>
          <div className="memory-reflection-list">
            {visibleIssues.length === 0 ? (
              <article className="good">
                <strong>정리 필요 없음</strong>
                <span>중복/모순/오래된 기억 경고가 없습니다.</span>
              </article>
            ) : (
              visibleIssues.map((issue) => (
                <article className={issue.severity} key={issue.id}>
                  <strong>{reflectionIssueLabel(issue.kind)}</strong>
                  <span>{issue.recommendation}</span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="memento-section">
          <header>
            <span>Memory Records</span>
            <strong>{visibleRecords.length}</strong>
          </header>
          <div className="memory-record-list" aria-label="Memory Records">
            {visibleRecords.map((record) => (
              <article key={record.id}>
                <div>
                  <strong>{record.title}</strong>
                  <span>
                    {mementoKindLabel(record.kind)} / {mementoScopeLabel(record.scope)} /{" "}
                    {trustLevelLabel(record.trustLevel)}
                  </span>
                </div>
                <button
                  aria-label={`${record.title} 활성화`}
                  className={`icon-button tiny ${record.activationState === "active" ? "active" : ""}`}
                  disabled={record.activationState === "active"}
                  onClick={() => onActivate(record.id)}
                  type="button"
                >
                  <Link2 size={13} />
                </button>
                <button
                  aria-label={`${record.title} 고정`}
                  className={`icon-button tiny ${record.pinned ? "active" : ""}`}
                  disabled={record.pinned}
                  onClick={() => onPin(record.id)}
                  type="button"
                >
                  <CheckCircle2 size={13} />
                </button>
                <button
                  aria-label={`${record.title} 삭제`}
                  className="icon-button tiny"
                  onClick={() => onForget(record.id)}
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      <WindowChecklist items={auditItems} title="Memento 창 점검" />
    </section>
  );
}

function mementoScopeLabel(scope?: MemoryRecord["scope"]) {
  const labels: Record<NonNullable<MemoryRecord["scope"]>, string> = {
    global: "전역",
    project: "프로젝트",
    session: "세션",
  };

  return scope ? labels[scope] : "자동";
}

function mementoKindLabel(kind?: MemoryRecord["kind"]) {
  const labels: Record<NonNullable<MemoryRecord["kind"]>, string> = {
    architecture: "아키텍처",
    context: "맥락",
    decision: "결정",
    learning: "학습",
    pattern: "패턴",
    preference: "선호",
    relationship: "관계",
    workflow: "작업흐름",
  };

  return kind ? labels[kind] : "미분류";
}

function activationStateLabel(state?: Stage6MemoryInspector["trace"]["results"][number]["activationState"]) {
  const labels: Record<NonNullable<Stage6MemoryInspector["trace"]["results"][number]["activationState"]>, string> = {
    active: "사용됨",
    inactive: "대기",
    quarantined: "격리",
    suggested: "후보",
  };

  return state ? labels[state] : "대기";
}

function memoryRelationLabel(kind: Stage6MemoryInspector["relations"][number]["kind"]) {
  const labels: Record<Stage6MemoryInspector["relations"][number]["kind"], string> = {
    contradicts: "모순",
    depends_on: "의존",
    related: "관련",
    supersedes: "대체",
    supports: "보강",
  };

  return labels[kind];
}

function reflectionIssueLabel(kind: Stage6MemoryInspector["issues"][number]["kind"]) {
  const labels: Record<Stage6MemoryInspector["issues"][number]["kind"], string> = {
    contradiction: "모순 후보",
    duplicate: "중복 후보",
    missing_relation: "관계 부족",
    stale: "오래된 기억",
    untrusted_active: "비신뢰 활성",
  };

  return labels[kind];
}

function mementoHealthLabel(health: Stage6MemoryInspector["stats"]["health"]) {
  const labels: Record<Stage6MemoryInspector["stats"]["health"], string> = {
    good: "정상",
    needs_review: "검토 필요",
    watch: "주의",
  };

  return labels[health];
}

function IngressGuardPanel({
  onImportTelegram,
  snapshot,
}: {
  onImportTelegram: () => void;
  snapshot: Stage8IngressSnapshot;
}) {
  const visibleSteps = snapshot.result.guardSteps.slice(0, 7);

  return (
    <section className="side-panel ingress-panel">
      <header className="panel-title">
        <RadioTower size={17} />
        <h2>Ingress Guard</h2>
        <button aria-label="Telegram 가져오기" className="icon-button" onClick={onImportTelegram} type="button">
          <Smartphone size={15} />
        </button>
      </header>
      <div className="ingress-summary">
        <div>
          <span>channel</span>
          <strong>{snapshot.channel}</strong>
        </div>
        <div>
          <span>confidence</span>
          <strong>{snapshot.result.confidence}</strong>
        </div>
        <div>
          <span>approval</span>
          <strong>{snapshot.result.approvalState}</strong>
        </div>
      </div>
      <div className="guard-step-list" aria-label="Ingress guard steps">
        {visibleSteps.map((step) => (
          <article className={step.status} key={step.name}>
            <strong>{guardStepLabel(step.name)}</strong>
            <em>{step.status}</em>
            <span>{step.reason}</span>
          </article>
        ))}
      </div>
      <div className="approval-queue-list">
        <span>Approval Queue</span>
        {snapshot.approvals.length === 0 ? (
          <strong>empty</strong>
        ) : (
          snapshot.approvals.map((approval) => (
            <article key={approval.id}>
              <strong>{approval.state}</strong>
              <em>{approval.permissions.join(", ")}</em>
            </article>
          ))
        )}
      </div>
      <div className="zero-token-note">
        <span>0-token safety</span>
        <strong>
          {snapshot.zeroTokenSafety.cadence} / pending {snapshot.zeroTokenSafety.pendingCount}
        </strong>
      </div>
    </section>
  );
}

function guardStepLabel(step: Stage8IngressSnapshot["result"]["guardSteps"][number]["name"]) {
  const labels: Record<Stage8IngressSnapshot["result"]["guardSteps"][number]["name"], string> = {
    shape_unification: "Shape",
    noise_filter: "Noise",
    self_response_prevention: "Self-loop",
    debounce: "Debounce",
    pii_secret_block: "PII/Secret",
    guard_logging: "Logging",
    checklist_injection: "Checklist",
  };

  return labels[step];
}

function BackupPanel({
  onExport,
  projectionPreview,
  projections,
  snapshot,
}: {
  onExport: () => void;
  projectionPreview: string;
  projections: BackupProjection[];
  snapshot: Stage7BackupSnapshot;
}) {
  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <ShieldCheck size={17} />
        <h2>Backup</h2>
        <button aria-label="backup projection 생성" className="icon-button" onClick={onExport} type="button">
          <Archive size={15} />
        </button>
      </header>
      <div className="backup-grid">
        {projections.map((projection) => (
          <div className="backup-cell" key={projection.id}>
            <span>{projection.target}</span>
            <strong>{projection.status}</strong>
          </div>
        ))}
      </div>
      <div className="backup-summary">
        <div>
          <span>ready</span>
          <strong>{snapshot.summary.ready}</strong>
        </div>
        <div>
          <span>queued</span>
          <strong>{snapshot.summary.queued}</strong>
        </div>
        <div>
          <span>redacted</span>
          <strong>{snapshot.summary.redacted}</strong>
        </div>
      </div>
      <div className="backup-artifact-list" aria-label="Backup artifacts">
        {snapshot.artifacts.map((artifact) => (
          <article className={artifact.status} key={artifact.id}>
            <div>
              <strong>{artifact.title}</strong>
              <span>{artifact.destination}</span>
            </div>
            <em>{artifact.status}</em>
            <small>{artifact.format} / {artifact.byteLength} bytes</small>
          </article>
        ))}
      </div>
      <div className="mobile-policy-list">
        <span>Mobile</span>
        <strong>read / approve / stop / retry</strong>
        <em>terminal, secrets, merge/push denied</em>
      </div>
      <div className="backup-preview">
        <span>Obsidian projection</span>
        <strong>{projectionPreview ? `${projectionPreview.length} chars ready` : "not rendered"}</strong>
      </div>
    </section>
  );
}

function CodingPacketPanel({
  insightFindings,
  onReviewModeChange,
  packet,
  reviewMode,
}: {
  insightFindings: InsightFinding[];
  onReviewModeChange: (mode: ReviewMode) => void;
  packet: CodingPacket;
  reviewMode: ReviewMode;
}) {
  const columns = [
    ["결정", packet.decisions],
    ["제약", packet.constraints],
    ["구현", packet.implementationPlan],
    ["검증", packet.verificationPlan],
  ] as const;
  const auditItems: WindowAuditItem[] = [
    {
      id: "structure",
      label: "구조",
      status: packet.goal && packet.decisions.length > 0 ? "ready" : "partial",
      detail: "자연어 요약 대신 goal/context/decisions/rejected/constraints/files/verify를 유지합니다.",
    },
    {
      id: "verification",
      label: "검증",
      status: reviewMode === "deep" ? "ready" : "partial",
      detail: `${reviewModeLabel(reviewMode)} 리뷰와 invariant checks로 코딩 전달을 거릅니다.`,
    },
    {
      id: "handoff",
      label: "Codex 전달",
      status: "ready",
      detail: "실행 전 Event Storage에 packet.created/run.requested 이벤트로 남길 수 있습니다.",
    },
  ];

  return (
    <section className="coding-packet">
      <header>
        <div>
          <span>Coding Packet</span>
          <h2>{packet.goal}</h2>
        </div>
        <button className="ghost-button" type="button">
          <CheckCircle2 size={16} />
          구조 검증
        </button>
      </header>
      <WindowChecklist items={auditItems} title="패킷 창 점검" />
      <section className="review-insight-panel" aria-label="Review and insight controls">
        <div className="review-mode-toggle">
          <span>Review</span>
          {(["quick", "deep"] as ReviewMode[]).map((mode) => (
            <button
              className={reviewMode === mode ? "active" : ""}
              key={mode}
              onClick={() => onReviewModeChange(mode)}
              type="button"
            >
              {reviewModeLabel(mode)}
            </button>
          ))}
        </div>
        <div className="rubric-chip-list">
          {["plan_coverage", "code_quality", "test_coverage", "convention", "invariant_checks"].map((rubric) => (
            <span key={rubric}>{rubric}</span>
          ))}
        </div>
        <div className="insight-chip-list">
          {insightFindings.slice(0, 6).map((finding) => (
            <span className={finding.status} key={finding.id}>
              {insightCategoryLabel(finding.category)}
            </span>
          ))}
        </div>
      </section>
      <div className="packet-grid">
        {columns.map(([title, items]) => (
          <div className="packet-column" key={title}>
            <strong>{title}</strong>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TerminalDock({
  agentRun,
  dgxBridge,
  eventSyncState,
  events,
  onApproveNext,
  onCheckProviderVault,
  onRejectNext,
  onReplayEvents,
  onSyncEvents,
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
  slots,
}: {
  agentRun: Stage4AgentRun;
  dgxBridge: Stage5DgxBridge;
  eventSyncState: Stage14EventSyncState;
  events: EventEnvelope[];
  onApproveNext: () => void;
  onCheckProviderVault: () => void;
  onRejectNext: () => void;
  onReplayEvents: () => void;
  onSyncEvents: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  secretVaultSnapshot: SecretVaultSnapshot;
  slots: TerminalSlot[];
}) {
  const visibleEvents = events.slice(0, 4);
  const pendingPermission = permissionSnapshot.queue[0];
  const auditItems: WindowAuditItem[] = [
    {
      id: "execution-disabled",
      label: "실행 잠금",
      status: "ready",
      detail: "실제 명령 실행은 tmux/permission/redaction 안정화 전까지 막습니다.",
    },
    {
      id: "approval",
      label: "승인",
      status: pendingPermission ? "partial" : "ready",
      detail: pendingPermission ? "승인 대기 작업이 있습니다." : "승인 대기열이 비어 있습니다.",
    },
    {
      id: "event-sync",
      label: "동기화",
      status: eventSyncState.status === "synced" ? "ready" : "partial",
      detail: `DGX-02 rev ${eventSyncState.serverRevision ?? "-"} / outbox ${eventSyncState.outboxCount}`,
    },
  ];

  return (
    <footer className="terminal-dock">
      <div className="dock-title">
        <Terminal size={17} />
        <strong>Terminal / Run Log</strong>
        <span>execution disabled</span>
      </div>
      <div className="slot-list">
        <article className="dock-check-card">
          <header>
            <span>
              <CheckCircle2 size={14} />
              창 점검
            </span>
            <em>{auditItems.filter((item) => item.status === "ready").length}/{auditItems.length}</em>
          </header>
          {auditItems.map((item) => (
            <p className={item.status} key={item.id}>
              <span>{item.label}</span>
              <strong>{auditStatusLabel(item.status)}</strong>
              <small>{item.detail}</small>
            </p>
          ))}
        </article>
        {slots.map((slot) => (
          <article className="terminal-slot" key={slot.id}>
            <header>
              <span>{slot.label}</span>
              <em>{slot.status}</em>
            </header>
            <p>{slot.lastCommandPreview}</p>
            <small>approval: {slot.permissionState}</small>
          </article>
        ))}
        <article className="dgx-bridge-card">
          <header>
            <span>DGX Bridge</span>
            <em>{dgxBridge.heartbeat.status}</em>
          </header>
          <div className="bridge-card-grid">
            <p>
              <span>authority</span>
              <strong>{dgxBridge.authorityNodeId}</strong>
            </p>
            <p>
              <span>remote</span>
              <strong>{dgxBridge.response.status}</strong>
            </p>
            <p>
              <span>fallback</span>
              <strong>{dgxBridge.localFallbackEnabled ? dgxBridge.response.fallbackMode : "none"}</strong>
            </p>
            <p>
              <span>sync</span>
              <strong>{dgxBridge.syncMode}</strong>
            </p>
          </div>
        </article>
        <article className="agent-runtime-card">
          <header>
            <span>Agent Runtime</span>
            <em>{agentRun.status}</em>
          </header>
          <div className="runtime-card-grid">
            <p>
              <span>soul</span>
              <strong>{agentRun.soulSummary}</strong>
            </p>
            <p>
              <span>memento</span>
              <strong>{agentRun.recallTrace.length} recall / {agentRun.recallTrace.filter((trace) => trace.usedInDecision).length} used</strong>
            </p>
            <p>
              <span>verifier</span>
              <strong>{agentRun.verifier.status}</strong>
            </p>
            <p>
              <span>replay</span>
              <strong>{agentRun.replay.eventIds.length} events</strong>
            </p>
          </div>
        </article>
        <article className="permission-matrix-card">
          <header>
            <span>
              <LockKeyhole size={14} />
              Permission Matrix
            </span>
            <em>{permissionSnapshot.summary.pending} pending</em>
          </header>
          <div className="permission-summary-grid">
            <p>
              <span>allow</span>
              <strong>{permissionSnapshot.summary.allowed}</strong>
            </p>
            <p>
              <span>approved</span>
              <strong>{permissionSnapshot.summary.approved}</strong>
            </p>
            <p>
              <span>deny</span>
              <strong>{permissionSnapshot.summary.denied}</strong>
            </p>
          </div>
          <div className="permission-queue-preview">
            <span>{pendingPermission ? pendingPermission.summary : "queue empty"}</span>
            <small>{pendingPermission ? pendingPermission.permissions.join(", ") : "execution stays display-only"}</small>
          </div>
          <div className="permission-actions">
            <button disabled={!pendingPermission} onClick={onApproveNext} type="button">
              approve
            </button>
            <button disabled={!pendingPermission} onClick={onRejectNext} type="button">
              reject
            </button>
          </div>
        </article>
        <article className="secret-vault-card">
          <header>
            <span>
              <KeyRound size={14} />
              Provider Vault
            </span>
            <em>{providerReadiness.status}</em>
          </header>
          <div className="vault-summary-grid">
            <p>
              <span>secret</span>
              <strong>{providerReadiness.secretAvailability}</strong>
            </p>
            <p>
              <span>models</span>
              <strong>{providerReadiness.modelCount}</strong>
            </p>
            <p>
              <span>memory</span>
              <strong>{providerReadiness.canUseAutomaticMemory ? "auto" : "manual"}</strong>
            </p>
          </div>
          <div className="vault-preview">
            <span>{providerReadiness.reason}</span>
            <small>
              vault {secretVaultSnapshot.summary.available}/{secretVaultSnapshot.entries.length} available · raw persisted: no
            </small>
          </div>
          <div className="permission-actions">
            <button onClick={onCheckProviderVault} type="button">
              check
            </button>
          </div>
        </article>
        <article className="event-log">
          <header>
            <span>
              <Activity size={15} />
              Event Storage
            </span>
            <em className={eventSyncState.status === "synced" ? "positive" : "warning"}>{eventSyncState.status}</em>
          </header>
          <div className="event-sync-summary">
            <span>DGX-02 rev {eventSyncState.serverRevision ?? "-"}</span>
            <small>outbox {eventSyncState.outboxCount}</small>
            <button onClick={onSyncEvents} type="button">
              sync
            </button>
            <button onClick={onReplayEvents} type="button">
              pull
            </button>
          </div>
          <div className="event-log-list">
            {visibleEvents.map((event) => (
              <p key={event.id}>
                <span>{event.type}</span>
                <small>{new Date(event.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small>
              </p>
            ))}
          </div>
        </article>
      </div>
    </footer>
  );
}
