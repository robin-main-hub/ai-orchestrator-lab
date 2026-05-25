import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  ChevronRight,
  Database,
  GitBranch,
  MessageSquare,
  Send,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  createCodingPacketDraft,
  createDebateRounds,
  defaultAgentProfiles,
  parseDelegateTags,
  type DelegateTag,
  type DebateContext,
} from "@ai-orchestrator/agents";
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
import type { Stage6MemoryInspector } from "./runtime/stage6Memory";
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
import { probeDgxOrchestratorServer } from "./runtime/stage13DgxServer";
import { DEFAULT_DGX_SERVER_BASE_URL } from "./runtime/stage30DgxEndpoints";
import { probeDgxProviderRoutes, type Stage32DgxRouteDiagnosticSnapshot } from "./runtime/stage32DgxRouteDiagnostics";
import {
  buildDelegatedAgentPrompt,
  buildDelegationFollowupPrompt,
  delegationAuthorityLevel,
  resolveDelegationTargetAgent,
  serializeDelegationOutcome,
  type DesktopDelegationOutcome,
  type WorkbenchCompletionPurpose,
  type WorkbenchCompletionResult,
} from "./runtime/stage35DelegationRuntime";
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
  AssistantDraft,
  ApprovalState,
  BackupProjection,
  CodingPacket,
  ConversationMessage,
  ContextPackTier,
  DeviceRebootRequest,
  DeviceRebootWatchdog,
  EventEnvelope,
  EventSource,
  ExternalApprovalItem,
  ModelDiscoverySnapshot,
  ProviderProfile,
  ReviewMode,
  RuntimeSnapshot,
  SourceTrust,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import type {
  AgentActivityStatus,
  AgentConfigTab,
  AgentPersonaSettings,
  AgentVisualSettings,
  CenterMode,
  DraftAttachment,
  ModelCatalog,
  NavItemId,
  PendingProviderRetry,
  Stage3DebateUtteranceView,
  WorkbenchAgent,
} from "./types";
import {
  agentVisualStorageKey,
  defaultObsidianVaultRoot,
  maxDraftAttachments,
  modelWindowSize,
  now,
} from "./lib/appConstants";
import {
  agentRoleLabel,
  classifyDraftAttachment,
  createDefaultPersonaSettings,
  createDraftAttachment,
  createInitialAgentVisualSettings,
  modelSupportsAnyAttachment,
  modelSupportsAttachmentKind,
} from "./lib/helpers";
import { statusTone } from "./lib/uiLabels";
import { seededProviderProfiles } from "./seeds/providers";
import {
  initialDgxBridge,
  initialIngressSnapshot,
  runtimeSnapshot,
} from "./seeds/runtime";
import { seededAgentProfiles } from "./seeds/agents";
import {
  backupProjections,
  codingPacket,
  debateRounds,
  initialAgentRun,
  initialConversationMessages,
  initialEventLog,
  navItems,
  terminalSlots,
} from "./seeds/conversation";
import { ControlQueueDrawer } from "./components/ControlQueueDrawer";
import { AgentConfigDrawer } from "./components/AgentConfigDrawer";
import { AgentSettingsPanel } from "./components/AgentSettingsPanel";
import { AgentsSidebar } from "./components/AgentsSidebar";
import { BackupPanel } from "./components/BackupPanel";
import { BackupRailMenu } from "./components/BackupRailMenu";
import { ChannelRailPanel } from "./components/ChannelRailPanel";
import { CodingPacketPanel } from "./components/CodingPacketPanel";
import { ConfigLibraryPanel } from "./components/ConfigLibraryPanel";
import { ConversationWorkbench } from "./components/ConversationWorkbench";
import { IngressGuardPanel } from "./components/IngressGuardPanel";
import { MementoInspectorPanel } from "./components/MementoInspectorPanel";
import { OperationsRailPanel } from "./components/OperationsRailPanel";
import { ProjectRailPanel } from "./components/ProjectRailPanel";
import { ProviderProfilesManagerPanel } from "./components/ProviderProfilesManagerPanel";
import { ProviderRegistrationMenu } from "./components/ProviderRegistrationMenu";
import { RuntimeRailPanel } from "./components/RuntimeRailPanel";
import { RuntimeStatusBar } from "./components/RuntimeStatusBar";
import { SessionIndexRailPanel } from "./components/SessionIndexRailPanel";
import { Stage3DebateTable } from "./components/Stage3DebateTable";
import { TerminalDock } from "./components/TerminalDock";
import { TmuxSwarmBoard } from "./components/TmuxSwarmBoard";
import { useAgentConfigFilesController } from "./hooks/useAgentConfigFilesController";
import { useApprovalQueueController } from "./hooks/useApprovalQueueController";
import { useBranchExperimentsController } from "./hooks/useBranchExperimentsController";
import { useDgxEventSyncController } from "./hooks/useDgxEventSyncController";
import { useMemoryController } from "./hooks/useMemoryController";
import { createAuthBinding, useProviderRegistryController } from "./hooks/useProviderRegistryController";
import { useWorkItemsController } from "./hooks/useWorkItemsController";
import { createInsightFindings, createMetaOnboardingSignals } from "./lib/workbenchDerived";
import { WorkItemHandoffPanel } from "./components/WorkItemHandoffPanel";

export function App() {
  const [mode, setMode] = useState<CenterMode>("conversation");
  const [runtimeSnapshotState, setRuntimeSnapshotState] = useState<RuntimeSnapshot>(runtimeSnapshot);
  const [dgxRouteDiagnostics, setDgxRouteDiagnostics] = useState<Stage32DgxRouteDiagnosticSnapshot>();
  const [activeNavItem, setActiveNavItem] = useState<NavItemId>("sessions");
  const [approvalDrawerOpen, setApprovalDrawerOpen] = useState(false);
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
  const [sessionIndexState, setSessionIndexState] = useState<Stage20SessionIndexState>(() =>
    createInitialSessionIndexState(),
  );
  const {
    eventOutbox,
    eventSyncState,
    syncedEventIds,
    localClientEventCache,
    setEventSyncState,
    setSyncedEventIds,
    bootstrapLocalEventStorage,
    queueEventForSync,
    handleSyncEventStorage,
  } = useDgxEventSyncController({
    activeSessionId,
    eventLog,
    seedEvents: initialEventLog,
    setEventLog,
    setRuntimeSnapshotState,
    refreshSessionIndex: handleRefreshSessionIndex,
  });
  const [ingressSnapshot, setIngressSnapshot] = useState<Stage8IngressSnapshot>(initialIngressSnapshot);
  const [rebootApprovals, setRebootApprovals] = useState<ExternalApprovalItem[]>([]);
  const [rebootWatchdogs, setRebootWatchdogs] = useState<DeviceRebootWatchdog[]>([]);
  const [approvalStateByItemId, setApprovalStateByItemId] = useState<Record<string, ApprovalState>>({});
  const {
    approvalServerSnapshot,
    approvalServerStatus,
    approvalServerError,
    approvalServerBusyId,
    pendingTmuxApprovalKeys,
    tmuxRedispatchOutcomes,
    handleRefreshApprovalQueue,
    handleTmuxApprovalQueued,
    handleResolveServerApproval,
  } = useApprovalQueueController({ appendEvent });
  const [codingPacketState, setCodingPacketState] = useState<CodingPacket>(codingPacket);
  const [contextPackTier, setContextPackTier] = useState<ContextPackTier>("standard");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("quick");
  const {
    assistantDrafts,
    handleArchiveWorkItem,
    handleRouteWorkItem,
    prependAssistantDraft,
    prependWorkItem,
    prependWorkItemHandoff,
    updateWorkItem,
    workItemHandoffs,
    workItems,
  } = useWorkItemsController({ appendEvent });
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
  const [pendingProviderRetry, setPendingProviderRetry] = useState<PendingProviderRetry | undefined>();
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId],
  );
  const settingsAgent = useMemo(
    () => agents.find((agent) => agent.id === agentSettingsAgentId),
    [agentSettingsAgentId, agents],
  );
  const selectedAgentPersona = selectedAgent ? agentPersonaById[selectedAgent.id] : undefined;
  const {
    adoptedBranchSummaries,
    branchExperiments,
    handleAdoptBranchExperiment,
    handleCreateBranchExperiment,
  } = useBranchExperimentsController({
    activeSessionId,
    appendConversationMessage: (message) => setConversationMessages((messages) => [...messages, message]),
    appendEvent,
    contextPackTier,
    selectedAgentName: selectedAgent?.name,
  });
  const {
    agentConfigFiles,
    agentProfilePacks,
    handleCreateConfigFile,
    handleDuplicateConfigFile,
    handleImportConfigFile,
    handleSaveConfigFile,
    handleUpdateConfigFile,
    selectedConfigFileId,
    setSelectedConfigFileId,
  } = useAgentConfigFilesController({
    appendEvent,
    selectedAgent,
  });
  const configLibraryActive = activeNavItem === "config_files";
  const {
    activeProvider,
    handleAddProvider,
    handleCheckProviderVault,
    handleDiscoverProviderModels,
    handleRegisterProvider,
    handleRemoveProvider,
    handleRenameProvider,
    getProviderModelDiscoveryFallback,
    mergeProviderModelDiscovery,
    modelCatalog,
    modelDiscoveryByProviderId,
    providerProfiles,
    providerReadiness,
    providerRegistrationOpen,
    refreshDgxProviderRegistry,
    secretVaultSnapshot,
    selectedModel,
    selectedProvider,
    setProviderRegistrationOpen,
    usedProviderIds,
  } = useProviderRegistryController({
    activeProviderProfileId: runtimeSnapshotState.activeProviderProfileId,
    agents,
    appendEvent,
    runtimeUpdatedAt: runtimeSnapshotState.updatedAt,
    selectedAgent,
  });
  const {
    handleActivateMemory,
    handleForgetMemory,
    handlePinMemory,
    handleRememberCurrentContext,
    memoryInspector,
    memoryRecords,
    prependMemoryRecord,
  } = useMemoryController({
    appendEvent,
    events: eventLog,
    markMemorySyncing,
    messages: conversationMessages,
    packet: codingPacketState,
    provider: selectedProvider,
    runtimeUpdatedAt: runtimeSnapshotState.updatedAt,
  });
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
    setDraftAttachments((current) =>
      current.filter((attachment) => modelSupportsAttachmentKind(selectedModel, attachment.kind)),
    );
  }, [selectedModel?.id, selectedModel?.providerProfileId]);

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
    queueEventForSync(event, { skipRemoteSync: options?.skipRemoteSync });
    return event;
  }

  function markMemorySyncing(createdAt: string) {
    setRuntimeSnapshotState((snapshot) => ({
      ...snapshot,
      memorySyncStatus: snapshot.dgxStatus === "online" ? "syncing" : "degraded",
      updatedAt: createdAt,
    }));
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
      agent.role === "companion" || agent.role === "orchestrator"
        ? [
            "Delegation: You may command registered sub-agents with <delegate to=\"role_or_persona\">task</delegate>.",
            "Treat companion delegation as orchestrator-level authority for LLM sub-agent calls.",
            "Do not claim terminal execution, file changes, or external sending happened unless a permission/event record exists.",
          ].join("\n")
        : "Delegation: respond directly unless the orchestrator/companion explicitly delegated this task to you.",
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

  async function completeWorkbenchAgent({
    agent,
    approvalState,
    createdAt,
    modelId,
    permissionDecision,
    persona,
    provider,
    purpose,
    userMessage,
  }: {
    agent: WorkbenchAgent;
    approvalState?: ApprovalState;
    createdAt: string;
    modelId: string;
    permissionDecision?: "allow";
    persona?: AgentPersonaSettings;
    provider: ProviderProfile;
    purpose: WorkbenchCompletionPurpose;
    userMessage: ConversationMessage;
  }): Promise<WorkbenchCompletionResult> {
    if (!isDgxRoutedProvider(provider)) {
      return {
        content: buildMockAssistantReply({
          content: userMessage.content,
          agent,
          provider,
        }),
        metadata: {
          realProviderCall: false,
          route: "mock",
          purpose,
        },
      };
    }

    const pipelineMessages = createConversationPipelineMessages({
      agent,
      memory: memoryInspector,
      modelId,
      persona,
      provider,
      userMessage,
    });
    appendEvent("prompt.pipeline.assembled", {
      agentId: agent.id,
      providerProfileId: provider.id,
      modelId,
      messageCount: pipelineMessages.length,
      memoryTraceId: memoryInspector.trace.id,
      usedMemoryCount: memoryInspector.trace.results.filter((result) => result.usedInDecision).length,
      soulMode: agent.soulMode,
      purpose,
      redaction: "applied",
    });
    const result = await requestDgxProviderCompletion({
      provider,
      modelId,
      messages: pipelineMessages,
      approvalState,
      permissionDecision,
    });
    appendEvent("provider.completion.dgx.succeeded", {
      agentId: agent.id,
      providerProfileId: provider.id,
      modelId,
      endpoint: result.endpoint,
      route: result.route,
      fallbackReason: result.fallbackReason,
      usage: result.usage,
      purpose,
    });
    return {
      content: result.content,
      metadata: {
        endpoint: result.endpoint,
        route: result.route,
        fallbackReason: result.fallbackReason,
        usage: result.usage,
        realProviderCall: true,
        purpose,
      },
    };
  }

  async function executeDelegationRound({
    createdAt,
    initialReply,
    modelId,
    providerApprovalState,
    selectedAgent,
    selectedAgentPersona,
    selectedProvider,
    userMessage,
  }: {
    createdAt: string;
    initialReply: string;
    modelId: string;
    providerApprovalState?: ApprovalState;
    selectedAgent: WorkbenchAgent;
    selectedAgentPersona?: AgentPersonaSettings;
    selectedProvider: ProviderProfile;
    userMessage: ConversationMessage;
  }): Promise<
    | {
        finalReply: string;
        followupMetadata: Record<string, unknown>;
        initialReply: string;
        outcomes: DesktopDelegationOutcome[];
        tags: DelegateTag[];
      }
    | undefined
  > {
    const tags = parseDelegateTags(initialReply);
    if (tags.length === 0) {
      return undefined;
    }

    const outcomes: DesktopDelegationOutcome[] = [];
    const maxDelegatesPerTurn = 4;
    appendEvent("agent.delegation.detected", {
      sourceAgentId: selectedAgent.id,
      sourceAgentName: selectedAgent.name,
      sourceRole: selectedAgent.role,
      sourcePersonaName: selectedAgent.personaName,
      authorityLevel: delegationAuthorityLevel(selectedAgent),
      targets: tags.map((tag) => tag.target),
      count: tags.length,
      depthLimit: 1,
    });

    for (let index = 0; index < tags.length; index += 1) {
      const tag = tags[index]!;
      if (index >= maxDelegatesPerTurn) {
        outcomes.push({ kind: "blocked", tag, reason: "max_delegates_exceeded" });
        appendEvent("agent.delegation.blocked", {
          sourceAgentId: selectedAgent.id,
          target: tag.target,
          reason: "max_delegates_exceeded",
          depthLimit: 1,
        });
        continue;
      }

      const targetAgent = resolveDelegationTargetAgent(tag.target, selectedAgent, agents);
      if (!targetAgent) {
        outcomes.push({ kind: "unknown_target", tag });
        appendEvent("agent.delegation.unknown_target", {
          sourceAgentId: selectedAgent.id,
          target: tag.target,
          promptLength: tag.prompt.length,
        });
        continue;
      }

      if (targetAgent.id === selectedAgent.id) {
        outcomes.push({ kind: "self_delegation", tag });
        appendEvent("agent.delegation.self_blocked", {
          sourceAgentId: selectedAgent.id,
          target: tag.target,
        });
        continue;
      }

      const targetProvider =
        providerProfiles.find((provider) => provider.id === targetAgent.providerProfileId) ?? selectedProvider;
      const targetModelId = targetAgent.modelId ?? targetProvider.defaultModel ?? modelId;
      const targetApprovalState = approvalStateByItemId[`permission_provider_${targetProvider.id}`];
      const targetPermissionDecision = targetApprovalState === "approved" ? "allow" : undefined;
      const targetPersona = agentPersonaById[targetAgent.id] ?? createDefaultPersonaSettings(targetAgent);
      const delegatedPrompt = buildDelegatedAgentPrompt({
        caller: selectedAgent,
        originalUserMessage: userMessage.content,
        tag,
      });
      const delegationMessage: ConversationMessage = {
        id: `message_delegation_${crypto.randomUUID()}`,
        sessionId: activeSessionId,
        role: "user",
        content: delegatedPrompt,
        createdAt,
        metadata: {
          delegatedByAgentId: selectedAgent.id,
          delegatedByAgentName: selectedAgent.name,
          targetAgentId: targetAgent.id,
          targetRole: targetAgent.role,
          depthLimit: 1,
        },
      };

      appendEvent("agent.delegation.dispatched", {
        sourceAgentId: selectedAgent.id,
        sourceAgentName: selectedAgent.name,
        targetAgentId: targetAgent.id,
        targetAgentName: targetAgent.name,
        targetRole: targetAgent.role,
        targetPersonaName: targetAgent.personaName,
        providerProfileId: targetProvider.id,
        modelId: targetModelId,
        promptLength: tag.prompt.length,
        authorityLevel: delegationAuthorityLevel(selectedAgent),
        depthLimit: 1,
      });

      try {
        setAgentActivity(targetAgent.id, "preparing");
        const targetResult = await completeWorkbenchAgent({
          agent: targetAgent,
          approvalState: targetApprovalState,
          createdAt,
          modelId: targetModelId,
          permissionDecision: targetPermissionDecision,
          persona: targetPersona,
          provider: targetProvider,
          purpose: "delegation_subagent",
          userMessage: delegationMessage,
        });
        setAgentActivity(targetAgent.id, "responding");
        const outcome: DesktopDelegationOutcome = {
          kind: "succeeded",
          tag,
          targetAgentId: targetAgent.id,
          targetAgentName: targetAgent.name,
          targetRole: targetAgent.role,
          providerProfileId: targetProvider.id,
          modelId: targetModelId,
          response: targetResult.content,
        };
        outcomes.push(outcome);
        appendEvent("agent.delegation.succeeded", {
          sourceAgentId: selectedAgent.id,
          targetAgentId: targetAgent.id,
          targetAgentName: targetAgent.name,
          targetRole: targetAgent.role,
          providerProfileId: targetProvider.id,
          modelId: targetModelId,
          responseLength: targetResult.content.length,
          route: targetResult.metadata.route,
          realProviderCall: targetResult.metadata.realProviderCall,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        outcomes.push({
          kind: "failed",
          tag,
          targetAgentId: targetAgent.id,
          targetAgentName: targetAgent.name,
          reason,
        });
        appendEvent("agent.delegation.failed", {
          sourceAgentId: selectedAgent.id,
          targetAgentId: targetAgent.id,
          targetAgentName: targetAgent.name,
          targetRole: targetAgent.role,
          providerProfileId: targetProvider.id,
          modelId: targetModelId,
          error: reason,
        });
      } finally {
        window.setTimeout(() => {
          setAgentActivity(targetAgent.id, "idle");
        }, 450);
      }
    }

    const followupPrompt = buildDelegationFollowupPrompt({
      caller: selectedAgent,
      initialReply,
      originalUserMessage: userMessage.content,
      outcomes,
    });
    const followupMessage: ConversationMessage = {
      id: `message_delegation_followup_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "user",
      content: followupPrompt,
      createdAt: new Date().toISOString(),
      metadata: {
        delegationOutcomeCount: outcomes.length,
        sourceAgentId: selectedAgent.id,
        depthLimit: 1,
      },
    };

    try {
      const followup = await completeWorkbenchAgent({
        agent: selectedAgent,
        approvalState: providerApprovalState,
        createdAt,
        modelId,
        permissionDecision: providerApprovalState === "approved" ? "allow" : undefined,
        persona: selectedAgentPersona,
        provider: selectedProvider,
        purpose: "delegation_followup",
        userMessage: followupMessage,
      });
      appendEvent("agent.delegation.followup.completed", {
        sourceAgentId: selectedAgent.id,
        sourceAgentName: selectedAgent.name,
        outcomeCount: outcomes.length,
        succeededCount: outcomes.filter((outcome) => outcome.kind === "succeeded").length,
        blockedCount: outcomes.filter((outcome) => outcome.kind !== "succeeded").length,
        responseLength: followup.content.length,
      });
      return {
        finalReply: followup.content,
        followupMetadata: followup.metadata,
        initialReply,
        outcomes,
        tags,
      };
    } catch (error) {
      appendEvent("agent.delegation.followup.failed", {
        sourceAgentId: selectedAgent.id,
        sourceAgentName: selectedAgent.name,
        outcomeCount: outcomes.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        finalReply: initialReply,
        followupMetadata: {
          delegationFollowupError: error instanceof Error ? error.message : String(error),
        },
        initialReply,
        outcomes,
        tags,
      };
    }

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
      if (providerNeedsApproval) {
        setPendingProviderRetry({
          permissionItemId: providerPermissionId,
          providerProfileId: selectedProvider.id,
          agentId: selectedAgent.id,
          modelId,
          content: messageContent,
          attachments: attachmentMetadata,
          createdAt,
        });
      }
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
        retryStored: providerNeedsApproval,
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
    prependWorkItem(workItem);
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
      const result = await completeWorkbenchAgent({
        agent: selectedAgent,
        approvalState: providerApprovalState,
        createdAt,
        modelId,
        permissionDecision: providerApprovalState === "approved" ? "allow" : undefined,
        persona: selectedAgentPersona,
        provider: selectedProvider,
        purpose: "primary",
        userMessage,
      });
      reply = result.content;
      completionMetadata = result.metadata;
      const delegationRound = await executeDelegationRound({
        createdAt,
        initialReply: reply,
        modelId,
        providerApprovalState,
        selectedAgent,
        selectedAgentPersona,
        selectedProvider,
        userMessage,
      });
      if (delegationRound) {
        reply = delegationRound.finalReply;
        completionMetadata = {
          ...completionMetadata,
          ...delegationRound.followupMetadata,
          delegationExecuted: true,
          delegationInitialContent: delegationRound.initialReply,
          delegations: delegationRound.outcomes.map(serializeDelegationOutcome),
          delegationTags: delegationRound.tags.map((tag) => ({
            target: tag.target,
            prompt: tag.prompt,
            status: "executed",
          })),
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
    prependAssistantDraft(assistantDraft);
    updateWorkItem(workItem.id, {
      lane: completionMetadata.realProviderCall ? "check" : "ask",
      status: completionMetadata.realProviderCall ? "drafted" : "waiting_input",
      updatedAt: assistantMessage.createdAt,
    });
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
    prependWorkItem(workItem);
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
    prependWorkItemHandoff(handoff);
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
    prependWorkItem(workItem);
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
    prependMemoryRecord({
      id: `memory_ingress_${normalizedEvent.id}`,
      layer: "fragment",
      title: "Telegram ingress candidate",
      content: normalizedEvent.normalizedText,
      sourceChannel: "legacy_telegram",
      trustLevel: "untrusted",
      createdAt: receivedAt,
      pinned: false,
    });
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

  function handleResolvePermissionItem(sourceItemId: string, state: Extract<ApprovalState, "approved" | "rejected">) {
    const pendingItem =
      permissionSnapshot.queue.find((item) => item.sourceItemId === sourceItemId && item.state === "required") ??
      nextRequiredPermission(permissionSnapshot);
    if (!pendingItem) {
      return;
    }

    handleResolvePermission(pendingItem.sourceItemId, state);
  }

  function handleResolvePermission(sourceItemId: string, state: Extract<ApprovalState, "approved" | "rejected">) {
    const pendingItem = permissionSnapshot.queue.find((item) => item.sourceItemId === sourceItemId);
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

    if (pendingProviderRetry?.permissionItemId === pendingItem.sourceItemId) {
      if (state === "approved") {
        setDraftMessage(pendingProviderRetry.content);
        setDraftAttachments(pendingProviderRetry.attachments);
        appendEvent("provider.completion.retry.restored", {
          permissionItemId: pendingItem.sourceItemId,
          providerProfileId: pendingProviderRetry.providerProfileId,
          agentId: pendingProviderRetry.agentId,
          modelId: pendingProviderRetry.modelId,
          contentLength: pendingProviderRetry.content.length,
          attachmentCount: pendingProviderRetry.attachments.length,
          redaction: "applied",
        });
      } else {
        appendEvent("provider.completion.retry.discarded", {
          permissionItemId: pendingItem.sourceItemId,
          providerProfileId: pendingProviderRetry.providerProfileId,
          reason: "operator rejected provider completion approval",
          redaction: "applied",
        });
      }
      setPendingProviderRetry(undefined);
    }
  }

  function handleResolveNextPermission(state: Extract<ApprovalState, "approved" | "rejected">) {
    const pendingItem = nextRequiredPermission(permissionSnapshot);
    if (!pendingItem) {
      return;
    }
    handleResolvePermissionItem(pendingItem.sourceItemId, state);
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

    const routeDiagnostics = await probeDgxProviderRoutes({ checkedAt });
    setDgxRouteDiagnostics(routeDiagnostics);
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
    const dgxDiscovery = probe.modelDiscovery ?? getProviderModelDiscoveryFallback("provider_dgx02_vllm", checkedAt);

    setRuntimeSnapshotState(mergedRuntime);
    setDgxBridgeState(bridge);
    if (probe.status === "online" && dgxDiscovery) {
      mergeProviderModelDiscovery(dgxDiscovery);
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
    appendEvent("dgx.provider_routes.diagnosed", {
      checkedAt: routeDiagnostics.checkedAt,
      summary: routeDiagnostics.summary,
      routes: routeDiagnostics.routes.map((route) => ({
        baseUrl: route.baseUrl,
        health: {
          status: route.health.status,
          httpStatus: route.health.httpStatus,
          error: route.health.error,
          latencyMs: route.health.latencyMs,
        },
        providerPreflight: {
          status: route.providerPreflight.status,
          httpStatus: route.providerPreflight.httpStatus,
          error: route.providerPreflight.error,
          latencyMs: route.providerPreflight.latencyMs,
        },
      })),
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
                dgxRouteDiagnostics={dgxRouteDiagnostics}
                onProbeDgx={handleProbeDgx}
                onRequestReboot={handleRequestDeviceReboot}
                rebootWatchdogs={rebootWatchdogs}
                snapshot={runtimeSnapshotState}
              />
              <OperationsRailPanel
                approvalBusyId={approvalServerBusyId}
                approvalError={approvalServerError}
                approvalServerSnapshot={approvalServerSnapshot}
                approvalServerStatus={approvalServerStatus}
                backupSnapshot={backupSnapshot}
                ingressSnapshot={ingressSnapshot}
                onCheckProviderVault={handleCheckProviderVault}
                onExportBackup={handleExportBackupProjections}
                onImportTelegram={handleImportTelegramIngress}
                onRefreshApprovals={handleRefreshApprovalQueue}
                onResolveServerApproval={handleResolveServerApproval}
                pendingTmuxApprovalKeys={pendingTmuxApprovalKeys}
                permissionSnapshot={permissionSnapshot}
                providerReadiness={providerReadiness}
                secretVaultSnapshot={secretVaultSnapshot}
                tmuxRedispatchOutcomes={tmuxRedispatchOutcomes}
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

        <section
          className={`center-board ${mode === "tmux" ? "tmux-center-board" : ""} ${
            configLibraryActive ? "config-center-board" : ""
          }`}
        >
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
              <button
                className={`ghost-button approval-toolbar-button ${
                  permissionSnapshot.summary.pending > 0 ? "needs-attention" : ""
                }`}
                onClick={() => setApprovalDrawerOpen((open) => !open)}
                title="Control Queue (⌘⇧A)"
                type="button"
              >
                <ShieldCheck size={16} />
                Queue {permissionSnapshot.summary.pending}
              </button>
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

          {configLibraryActive ? (
            <ConfigLibraryPanel
              configFiles={agentConfigFiles}
              onCreateConfigFile={handleCreateConfigFile}
              onDuplicateConfigFile={handleDuplicateConfigFile}
              onImportConfigFile={handleImportConfigFile}
              onSaveConfigFile={handleSaveConfigFile}
              onSelectConfigFile={setSelectedConfigFileId}
              onUpdateConfigFile={handleUpdateConfigFile}
              profilePacks={agentProfilePacks}
              selectedConfigFileId={selectedConfigFileId}
              variant="workbench"
            />
          ) : mode === "conversation" ? (
            <ConversationWorkbench
              activeSessionId={activeSessionId}
              agentConfigPanel={agentConfigPanel}
              configFiles={agentConfigFiles}
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
              onApprovePermission={(sourceItemId) => handleResolvePermission(sourceItemId, "approved")}
              onBackupProjection={handleExportBackupProjections}
              onContextPackTierChange={handleContextPackTierChange}
              onCreateBranch={handleCreateBranchExperiment}
              onCreateAgentRun={handleCreateAgentRun}
              onCreateCodingPacket={handleCreateCodingPacket}
              onDraftMessageChange={setDraftMessage}
              onImportTelegram={handleImportTelegramIngress}
              onPromoteToDebate={handlePromoteToDebate}
              onRejectPermission={(sourceItemId) => handleResolvePermission(sourceItemId, "rejected")}
              onRemoveDraftAttachment={handleRemoveDraftAttachment}
              onSelectAgent={setSelectedAgentId}
              onSendMessage={handleSendMessageStage2}
              onCloseAgentConfig={() => setAgentConfigPanel((panel) => ({ ...panel, open: false }))}
              onOpenAgentConfig={openAgentConfigPanel}
              onUpdateAgentConfig={updateSelectedAgentConfig}
              onUpdateAgentPersona={updateSelectedAgentPersona}
              pendingProviderRetry={pendingProviderRetry}
              permissionSnapshot={permissionSnapshot}
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
              onApprovalQueued={handleTmuxApprovalQueued}
              packet={codingPacketState}
            />
          )}

          {mode === "tmux" || configLibraryActive ? null : (
            <WorkItemHandoffPanel
              drafts={assistantDrafts}
              handoffs={workItemHandoffs}
              items={workItems}
              onArchiveItem={handleArchiveWorkItem}
              onRouteItem={handleRouteWorkItem}
            />
          )}

          {mode === "tmux" || configLibraryActive ? null : (
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
            <AgentsSidebar
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
      <ControlQueueDrawer
        onApprove={(sourceItemId) => handleResolvePermissionItem(sourceItemId, "approved")}
        onClose={() => setApprovalDrawerOpen(false)}
        onReject={(sourceItemId) => handleResolvePermissionItem(sourceItemId, "rejected")}
        open={approvalDrawerOpen}
        snapshot={permissionSnapshot}
      />
    </div>
  );
}
