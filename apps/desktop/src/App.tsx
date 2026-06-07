import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  createExternalIngressDemoInput,
  createStage8IngressSnapshot,
  type Stage8IngressSnapshot,
} from "./runtime/stage8Ingress";
import {
  createStage9PermissionSnapshot,
  nextRequiredPermission,
} from "./runtime/stage9Permission";
import {
  ProviderCompletionPermissionRequiredError,
  isDgxRoutedProvider,
  requestDgxProviderCompletion,
} from "./runtime/stage12DgxProvider";
import { fetchDgxOperatorCockpitSnapshot, probeDgxOrchestratorServer } from "./runtime/stage13DgxServer";
import { DEFAULT_DGX_SERVER_BASE_URL, resolveDgxServerBaseUrls } from "./runtime/stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "./runtime/stage31DgxAuth";
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
import { createConversationPipelineMessages } from "./runtime/conversationPipeline";
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
  ApprovalQueueItem,
  ApprovalState,
  BackupProjection,
  CodingPacket,
  ConversationMessage,
  ContextPackTier,
  DeviceRebootRequest,
  DeviceRebootWatchdog,
  EventEnvelope,
  EventSource,
  EvidenceRef,
  ExternalApprovalItem,
  ModelDiscoverySnapshot,
  OperatorCockpitSnapshot,
  OperatorCockpitWorkerStatus,
  ProviderCompletionResponse,
  ProviderProfile,
  ReviewMode,
  RuntimeSnapshot,
  SourceTrust,
  TerminalTimelineBlock,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import type {
  AgentActivityStatus,
  AgentConfigFile,
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
  agentProfilesStorageKey,
  agentVisualStorageKey,
  defaultObsidianVaultRoot,
  maxDraftAttachments,
  modelWindowSize,
  now,
  selectedAgentIdStorageKey,
} from "./lib/appConstants";
import { getConversationRailLayout } from "./lib/conversationRailLayout";
import { getConversationShellVisibility, isFocusedV0Surface } from "./lib/conversationShellVisibility";
import { createCockpitWorkTraceSources } from "./lib/cockpitWorkTraceSources";
import { createWorkTraceSearchIndex } from "./lib/workTraceSearch";
import { deriveDebateDecisionReadiness } from "./lib/debateDecisionReadiness";
import { deriveTmuxRecoveryPlan } from "./lib/tmuxRecoveryPlan";
import { createSettingsDiagnostics } from "./lib/settingsDiagnostics";
import { createProductionSmokePlan } from "./lib/productionSmokePlan";
import { createOrchestrationMaturityReport } from "./lib/orchestrationMaturity";
import { deriveCockpitNextActions } from "./lib/cockpitNextActions";
import {
  createAgentChannelMemoryScope,
  createAgentChannelMemoryInstallAudit,
  createInitialAgentConversationChannels,
  distributeReplayedMessagesIntoChannels,
  getAgentChannelMessages,
  resolveAgentCompletionContext,
  updateAgentChannelMessages,
  type AgentChannelMemoryScope,
  type AgentConversationChannels,
} from "./lib/agentConversationChannels";
import {
  createControlQueueAskItem,
  createControlQueueBlockItem,
  createControlQueueDelegateHandoff,
  createControlQueueEditDraft,
} from "./lib/controlQueueWorkItems";
import {
  createDebateCodingPacketProjection,
  createDebateCodingPacketWorkItems,
} from "./lib/debateCodingPacketWorkItems";
import { createControlQueueContinuitySummary } from "./lib/controlQueueContinuity";
import { controlQueuePermissionLabel, sanitizeControlQueueText } from "./lib/controlQueuePresentation";
import {
  createAgentRoleToolRuntimeAudit,
  createAgentRoleToolRuntimeSummary,
} from "./lib/agentRuntimeConfig";
import { applyAgentIdentityResponseGuard } from "./lib/agentIdentityResponseGuard";
import { createMemoryGovernanceSummary } from "./lib/memoryGovernance";
import { createConversationTurnMemoryCandidate } from "./lib/memoryCuratorRuntime";
import { createProviderRoutingConsoleItems } from "./lib/providerRoutingConsole";
import { createProviderFailureConversationReply } from "./lib/providerFallbackPlan";
import {
  agentRoleLabel,
  createDefaultPersonaSettings,
  createDraftAttachment,
  formatModelDisplayName,
  getModelInputModalities,
  createInitialAgentVisualSettings,
  modelSupportsAnyAttachment,
  modelSupportsAttachmentKind,
} from "./lib/helpers";
import {
  createAttachmentProcessingPlan,
  createAttachmentProcessingPlansForMessage,
  type AttachmentProcessingPlan,
} from "./lib/attachmentProcessing";
import { statusTone } from "./lib/uiLabels";
import {
  createCockpitLocalHealthIndicators,
  createCockpitServerSnapshotIndicator,
  resolveCockpitPayloadBindingStatus,
  sanitizeCockpitProjectionText,
} from "./lib/cockpitProjectionHealth";
import { createPermissionApprovalLedger } from "./lib/permissionApprovalLedger";
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
import { OperatorCockpit } from "./components/operator-cockpit/OperatorCockpit";
import { AgentsSidebar } from "./components/AgentsSidebar";
import { BackupRailMenu } from "./components/BackupRailMenu";
import { ChannelRailPanel } from "./components/ChannelRailPanel";
import { CodingPacketPanel } from "./components/CodingPacketPanel";
import { CheatSheetOverlay } from "./components/CheatSheetOverlay";
import { CommandPalette, type CommandEntry } from "./components/CommandPalette";
import { ConfigLibraryPanel } from "./components/ConfigLibraryPanel";
import { ConversationWorkbench } from "./components/ConversationWorkbench";
import { DebateAnnexPage } from "./components/debate-chamber/DebateAnnexPage";
import { IngressGuardPanel } from "./components/IngressGuardPanel";
import { EvolveMementoPanel } from "./components/EvolveMementoPanel";
import { HumanPeekPanel } from "./components/HumanPeekPanel";
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
import { makeSyntheticBlock } from "./components/TmuxPaneTimeline";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useAgentConfigFilesController } from "./hooks/useAgentConfigFilesController";
import { useApprovalQueueController, type TmuxOutcome } from "./hooks/useApprovalQueueController";
import { useBranchExperimentsController } from "./hooks/useBranchExperimentsController";
import { useDgxEventSyncController } from "./hooks/useDgxEventSyncController";
import { useMemoryController } from "./hooks/useMemoryController";
import { createAuthBinding, useProviderRegistryController } from "./hooks/useProviderRegistryController";
import { useWorkItemsController } from "./hooks/useWorkItemsController";
import { applyAgentProviderAssignment } from "./lib/agentProviderAssignment";
import { parseStoredAgentProfiles, parseStoredSelectedAgentId } from "./lib/agentProfilePersistence";
import { getRestoreFocusSelector, type FocusHistory } from "./lib/focusRestoration";
import { readJsonState, writeJsonState } from "./lib/persistentJsonState";
import { createInsightFindings, createMetaOnboardingSignals } from "./lib/workbenchDerived";
import { WorkItemHandoffPanel } from "./components/WorkItemHandoffPanel";

const CENTER_MODE_STORAGE_KEY = "ai-orchestrator.center-mode.v1";

type RemoteCockpitSnapshotState = {
  status: "idle" | "loading" | "loaded" | "failed";
  snapshot?: OperatorCockpitSnapshot;
  error?: string;
  loadedAt?: string;
};

export function App() {
  const [mode, setMode] = useState<CenterMode>(() =>
    readJsonState(CENTER_MODE_STORAGE_KEY, "cockpit", parseStoredCenterMode),
  );
  const modeRef = useRef<CenterMode>(mode);
  const lastFocusedIdByModeRef = useRef<FocusHistory>({});
  const [runtimeSnapshotState, setRuntimeSnapshotState] = useState<RuntimeSnapshot>(runtimeSnapshot);
  const [dgxRouteDiagnostics, setDgxRouteDiagnostics] = useState<Stage32DgxRouteDiagnosticSnapshot>();
  const [remoteCockpitSnapshotState, setRemoteCockpitSnapshotState] = useState<RemoteCockpitSnapshotState>({
    status: "idle",
  });
  const [adminRailOpen, setAdminRailOpen] = useState(false);
  const [activeNavItem, setActiveNavItem] = useState<NavItemId>("sessions");
  const [approvalDrawerOpen, setApprovalDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [agents, setAgents] = useState<WorkbenchAgent[]>(() =>
    readJsonState(agentProfilesStorageKey, seededAgentProfiles, (value) =>
      parseStoredAgentProfiles(value, seededAgentProfiles),
    ),
  );
  const [agentActivityById, setAgentActivityById] = useState<Record<string, AgentActivityStatus>>({});
  const [agentVisualsById, setAgentVisualsById] = useState<Record<string, AgentVisualSettings>>(() =>
    createInitialAgentVisualSettings(seededAgentProfiles),
  );
  const [modelWindowStartByAgentId, setModelWindowStartByAgentId] = useState<Record<string, number>>({});
  const [selectedAgentId, setSelectedAgentId] = useState(() =>
    readJsonState(selectedAgentIdStorageKey, agents[0]?.id ?? "", (value) => parseStoredSelectedAgentId(value, agents)),
  );
  const [agentSettingsAgentId, setAgentSettingsAgentId] = useState<string | undefined>();
  const [agentConfigPanel, setAgentConfigPanel] = useState<{ open: boolean; tab: AgentConfigTab }>({
    open: false,
    tab: "profile",
  });
  const [returnModeAfterConfigClose, setReturnModeAfterConfigClose] = useState<CenterMode | null>(null);
  const [agentPersonaById, setAgentPersonaById] = useState<Record<string, AgentPersonaSettings>>(() =>
    Object.fromEntries(seededAgentProfiles.map((agent) => [agent.id, createDefaultPersonaSettings(agent)])),
  );
  const [conversationMessagesByAgentId, setConversationMessagesByAgentId] = useState<AgentConversationChannels>(() =>
    createInitialAgentConversationChannels(seededAgentProfiles, initialConversationMessages),
  );
  const [eventLog, setEventLog] = useState<EventEnvelope[]>(initialEventLog);
  const [activeSessionId, setActiveSessionId] = useState(DEFAULT_SESSION_ID);
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);
  useEffect(() => {
    modeRef.current = mode;
    writeJsonState(CENTER_MODE_STORAGE_KEY, mode);
  }, [mode]);
  useEffect(() => {
    writeJsonState(agentProfilesStorageKey, agents);
    if (!agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(agents[0]?.id ?? "");
    }
  }, [agents, selectedAgentId]);
  useEffect(() => {
    writeJsonState(selectedAgentIdStorageKey, selectedAgentId);
  }, [selectedAgentId]);
  const conversationMessages = useMemo(
    () => getAgentChannelMessages(conversationMessagesByAgentId, selectedAgentId),
    [conversationMessagesByAgentId, selectedAgentId],
  );
  const setConversationMessages = useCallback(
    (updater: ConversationMessage[] | ((messages: ConversationMessage[]) => ConversationMessage[])) => {
      const targetAgentId = selectedAgentId || agents[0]?.id || "agent_unassigned";
      setConversationMessagesByAgentId((channels) => updateAgentChannelMessages(channels, targetAgentId, updater));
    },
    [agents, selectedAgentId],
  );
  useEffect(() => {
    function handleFocusIn(event: FocusEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-focus-id]")
        : undefined;
      const focusId = target?.dataset.focusId;
      if (focusId) {
        lastFocusedIdByModeRef.current[modeRef.current] = focusId;
      }
    }

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  useEffect(() => {
    if (mode !== "conversation" || !agentConfigPanel.open) {
      setReturnModeAfterConfigClose(null);
    }
  }, [mode, agentConfigPanel.open]);
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
  const [tmuxCommandDrafts, setTmuxCommandDrafts] = useState<Record<string, string>>({});
  const [tmuxStatuses, setTmuxStatuses] = useState<Record<string, string>>({});
  const [tmuxOutputs, setTmuxOutputs] = useState<Record<string, string>>({});
  const [tmuxTimelineBlocks, setTmuxTimelineBlocks] = useState<Record<string, TerminalTimelineBlock[]>>({});
  const [pendingProviderRetry, setPendingProviderRetry] = useState<PendingProviderRetry | undefined>();

  const handleTmuxOutcome = useCallback((outcome: TmuxOutcome) => {
    const role = outcome.role;
    const action = outcome.action;
    const status = outcome.status;
    const reason = outcome.reason;

    // 승인 결과를 tmux pane 상태에 반영한다.
    let mappedStatus = "idle";
    if (action === "approved" || action === "replayed") {
      mappedStatus = status === "recorded" || status === "sent" ? "active" : "failed";
    } else if (action === "rejected") {
      mappedStatus = "blocked";
    }
    setTmuxStatuses((current) => ({
      ...current,
      [role]: mappedStatus,
    }));

    // 마지막 결과 문구를 pane 출력 요약으로 보존한다.
    setTmuxOutputs((current) => ({
      ...current,
      [role]: reason,
    }));

    // 기존 승인 대기 블록을 완료/차단 상태로 바꾸고 결과 블록을 추가한다.
    setTmuxTimelineBlocks((current) => {
      const existing = current[role] ?? [];

      const updated = existing.map((block) => {
        if (block.kind === "approval" && block.approvalId === outcome.approvalId) {
          return {
            ...block,
            status: action === "approved" || action === "replayed" ? "completed" as const : "blocked" as const,
            summary: `${block.summary} (결과: ${action})`,
          };
        }
        return block;
      });

      const dispatchBlock = makeSyntheticBlock({
        paneId: `role:${role}`,
        role,
        host: "dgx_02",
        sessionId: activeSessionId,
        terminalSessionId: "terminal_session_ai_swarm",
        kind: "dispatch",
        status: status === "recorded" || status === "sent" ? "completed" : status === "blocked" ? "blocked" : "failed",
        title: outcome.commandPreview || `${role} dispatch`,
        summary: reason,
        approvalId: outcome.approvalId,
      });

      return {
        ...current,
        [role]: [...updated, dispatchBlock],
      };
    });
  }, [activeSessionId]);

  const handleProviderCompletionReplayed = useCallback(({
    approval,
    result,
  }: {
    approval: { id: string; sourceItemId?: string };
    result: ProviderCompletionResponse;
  }) => {
    const pending = pendingProviderRetry;
    if (!pending) {
      return;
    }
    if (pending.permissionItemId !== approval.sourceItemId && pending.permissionItemId !== approval.id) {
      return;
    }

    const createdAt = new Date().toISOString();
    const targetAgent = agents.find((agent) => agent.id === pending.agentId);
    const replayedContent = result.content?.trim();
    if (!replayedContent) {
      return;
    }
    const assistantMessage: ConversationMessage = {
      id: `message_agent_replay_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "assistant",
      content: replayedContent,
      createdAt,
      metadata: {
        agentId: pending.agentId,
        agentName: targetAgent?.name,
        providerProfileId: result.providerProfileId,
        modelId: result.modelId,
        endpoint: result.endpoint,
        route: result.route,
        usage: result.usage,
        realProviderCall: true,
        replayedApprovalId: approval.id,
        replayedSourceItemId: approval.sourceItemId,
        attachmentCount: pending.attachments.length,
        ...(pending.attachmentProcessingPlans.length > 0
          ? { attachmentProcessingPlans: pending.attachmentProcessingPlans }
          : {}),
      },
    };

    setConversationMessages((messages) => [...messages, assistantMessage]);
    setPendingProviderRetry(undefined);
    setDraftMessage("");
    setDraftAttachments([]);
    setDraftRejectedAttachmentPlans([]);
    if (targetAgent) {
      setAgentActivity(targetAgent.id, "responding");
      window.setTimeout(() => {
        setAgentActivity(targetAgent.id, "idle");
      }, 450);
    }
    appendEvent("provider.completion.replay.delivered", {
      approvalId: approval.id,
      sourceItemId: approval.sourceItemId,
      agentId: pending.agentId,
      providerProfileId: result.providerProfileId,
      modelId: result.modelId,
      contentLength: replayedContent.length,
      route: result.route,
      redaction: "applied",
    }, { sessionId: activeSessionId });
  }, [activeSessionId, agents, appendEvent, pendingProviderRetry]);

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
  } = useApprovalQueueController({
    appendEvent,
    onProviderCompletionReplayed: handleProviderCompletionReplayed,
    onTmuxOutcome: handleTmuxOutcome,
  });

  const [codingPacketState, setCodingPacketState] = useState<CodingPacket>(codingPacket);
  const [contextPackTier, setContextPackTier] = useState<ContextPackTier>("standard");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("quick");
  const {
    assistantDrafts,
    handleArchiveWorkItem,
    handleApproveWorkItemHandoff,
    handleMarkAssistantDraftSent,
    handleRouteWorkItem,
    prependAssistantDraft,
    prependWorkItem,
    prependWorkItemHandoff,
    updateWorkItem,
    workItemHandoffs,
    workItems,
  } = useWorkItemsController({ appendEvent });
  const controlQueueContinuity = useMemo(
    () =>
      createControlQueueContinuitySummary({
        assistantDrafts,
        handoffs: workItemHandoffs,
        workItems,
      }),
    [assistantDrafts, workItemHandoffs, workItems],
  );
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
  const [draftRejectedAttachmentPlans, setDraftRejectedAttachmentPlans] = useState<AttachmentProcessingPlan[]>([]);
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
  const providerRoutingConsoleItems = useMemo(
    () =>
      createProviderRoutingConsoleItems({
        agents,
        discoveryByProviderId: modelDiscoveryByProviderId,
        modelCatalog,
        profiles: providerProfiles,
      }),
    [agents, modelCatalog, modelDiscoveryByProviderId, providerProfiles],
  );
  const agentRoleToolRuntimeAudit = useMemo(
    () => createAgentRoleToolRuntimeAudit(agents),
    [agents],
  );
  const selectedAgentMemoryScope = useMemo(
    () =>
      createAgentChannelMemoryScope(
        selectedAgentId || "agent_unassigned",
        activeSessionId,
        selectedProvider?.id ?? selectedAgent?.providerProfileId ?? "provider_unassigned",
      ),
    [activeSessionId, selectedAgent?.providerProfileId, selectedAgentId, selectedProvider?.id],
  );
  const {
    adapterStatus,
    handleActivateMemory,
    handleForgetMemory,
    handlePinMemory,
    handleQueueMemoryCuratorCandidate,
    handleRememberCurrentContext,
    createScopedMemoryInspector,
    memoryInspector,
    memoryRecords,
    prependMemoryRecord,
  } = useMemoryController({
    appendEvent,
    events: eventLog,
    markMemorySyncing,
    memoryScope: selectedAgentMemoryScope,
    messages: conversationMessages,
    packet: codingPacketState,
    provider: selectedProvider,
    runtimeUpdatedAt: runtimeSnapshotState.updatedAt,
  });
  const memoryInstallAudit = useMemo(
    () =>
      createAgentChannelMemoryInstallAudit(
        agents,
        activeSessionId,
        selectedProvider?.id ?? selectedAgent?.providerProfileId ?? "provider_unassigned",
      ),
    [activeSessionId, agents, selectedAgent?.providerProfileId, selectedProvider?.id],
  );
  const memoryGovernanceSummary = useMemo(
    () =>
      createMemoryGovernanceSummary({
        adapterStatus,
        installAudit: memoryInstallAudit,
        records: memoryRecords,
        scope: selectedAgentMemoryScope,
        stats: memoryInspector.stats,
      }),
    [adapterStatus, memoryInstallAudit, memoryInspector.stats, memoryRecords, selectedAgentMemoryScope],
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
    const frame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      const shouldRestoreFocus =
        !activeElement ||
        activeElement === document.body ||
        activeElement === document.documentElement ||
        !document.contains(activeElement);

      if (!shouldRestoreFocus) return;

      const selector = getRestoreFocusSelector(mode, lastFocusedIdByModeRef.current);
      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mode, agentConfigPanel.open, settingsAgent]);

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
    setDraftRejectedAttachmentPlans([]);
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
    const targetSessionId = options?.sessionId ?? activeSessionIdRef.current;
    const event = createStage2Event({
      sessionId: targetSessionId,
      type,
      payload,
      source: options?.source,
      sourceTrust: options?.sourceTrust,
      correlationId: options?.correlationId,
    });
    if (targetSessionId === activeSessionIdRef.current) {
      setEventLog((events) => appendEventToLog(events, event));
    }
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
    activeSessionIdRef.current = nextSessionId;
    setActiveSessionId(nextSessionId);
    setConversationMessagesByAgentId(createInitialAgentConversationChannels(agents, []));
    setEventLog([]);
    setDraftMessage("");
    setDraftAttachments([]);
    setDraftRejectedAttachmentPlans([]);

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
        setConversationMessagesByAgentId((channels) =>
          switchingSessions
            ? createInitialAgentConversationChannels(agents, localMessages)
            : distributeReplayedMessagesIntoChannels(channels, agents, localMessages, mergeConversationMessages),
        );
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
    setConversationMessagesByAgentId((channels) =>
      switchingSessions
        ? createInitialAgentConversationChannels(agents, cachedMessages)
        : distributeReplayedMessagesIntoChannels(channels, agents, cachedMessages, mergeConversationMessages),
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
    const processingPlans = createAttachmentProcessingPlan({
      currentAttachmentCount: draftAttachments.length,
      files: incomingFiles,
      maxAttachmentCount: maxDraftAttachments,
      modelModalities: getModelInputModalities(selectedModel),
    });
    const nextAttachments = incomingFiles.flatMap((file, index) => {
      const plan = processingPlans[index];
      if (!plan || plan.status !== "accepted") return [];
      return [
        {
          ...createDraftAttachment(file),
          processingMode: plan.processingMode,
          processingStatus: plan.status,
          processingReason: plan.reason,
        },
      ];
    });
    const rejectedPlans = processingPlans.filter((plan) => plan.status === "rejected");

    if (rejectedPlans.length > 0) {
      setDraftRejectedAttachmentPlans((current) => [...current, ...rejectedPlans].slice(-maxDraftAttachments));
    }

    if (nextAttachments.length === 0) {
      appendEvent("conversation.attachment.blocked", {
        selectedModelId: selectedModel.id,
        reason: rejectedPlans[0]?.reason ?? "file kind is not supported by selected model",
        attemptedCount: incomingFiles.length,
        processingPlans,
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
      blockedCount: rejectedPlans.length,
      blockedReasons: rejectedPlans.map((plan) => ({
        name: plan.name,
        kind: plan.kind,
        reason: plan.reason,
      })),
      processingPlans,
      redaction: "metadata_only",
    });
  }

  function handleRemoveDraftAttachment(attachmentId: string) {
    setDraftAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
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
    const roleToolConfig = createAgentRoleToolRuntimeSummary(agent);
    const completionContext = resolveAgentCompletionContext({
      agent,
      channels: conversationMessagesByAgentId,
      fallbackProviderProfileId: provider.id ?? agent.providerProfileId ?? "provider_unassigned",
      sessionId: activeSessionId,
    });
    const targetMemoryInspector = await createScopedMemoryInspector(
      completionContext.memoryScope,
      completionContext.previousMessages,
      provider,
    );
    const pipelineMessages = createConversationPipelineMessages({
      agent,
      configFiles: agentConfigFiles,
      memory: targetMemoryInspector,
      memoryScope: completionContext.memoryScope,
      modelId,
      persona,
      previousMessages: completionContext.previousMessages,
      provider,
      userMessage,
    });
    const pipelineMetadata = pipelineMessages[0]?.metadata ?? {};
    if (!isDgxRoutedProvider(provider)) {
      const recalledMemoryCount = targetMemoryInspector.trace.results.filter((result) => result.usedInDecision).length;
      const guardedReply = applyAgentIdentityResponseGuard({
        agent,
        content: buildMockAssistantReply({
          content: userMessage.content,
          agent,
          provider,
        }),
        userContent: userMessage.content,
      });
      return {
        content: guardedReply.content,
        metadata: {
          modelId,
          providerProfileId: provider.id,
          realProviderCall: false,
          route: "mock",
          memoryTraceId: pipelineMetadata.memoryTraceId ?? targetMemoryInspector.trace.id,
          recalledMemoryCount: pipelineMetadata.recalledMemoryCount ?? recalledMemoryCount,
          runtimeConfigFileIds: pipelineMetadata.runtimeConfigFileIds,
          roleToolProfileLabel: pipelineMetadata.roleToolProfileLabel ?? roleToolConfig.label,
          roleToolProfileTools: pipelineMetadata.roleToolProfileTools ?? roleToolConfig.tools,
          personaDisplayName: pipelineMetadata.personaDisplayName,
          personaIdentityKey: pipelineMetadata.personaIdentityKey,
          personaSoulApplied: pipelineMetadata.personaSoulApplied,
          personaAgentsMdApplied: pipelineMetadata.personaAgentsMdApplied,
          personaSafetyApplied: pipelineMetadata.personaSafetyApplied,
          personaFragmentsInjected: pipelineMetadata.personaFragmentsInjected,
          personaSoulMdPath: pipelineMetadata.personaSoulMdPath,
          personaAgentsMdPath: pipelineMetadata.personaAgentsMdPath,
          recallTraceId: pipelineMetadata.recallTraceId,
          identityGuardApplied: guardedReply.guardApplied,
          purpose,
        },
      };
    }

    appendEvent("prompt.pipeline.assembled", {
      agentId: agent.id,
      providerProfileId: provider.id,
      modelId,
      messageCount: pipelineMessages.length,
      memoryTraceId: targetMemoryInspector.trace.id,
      runtimeConfigFileIds: pipelineMessages[0]?.metadata?.runtimeConfigFileIds,
      usedMemoryCount: targetMemoryInspector.trace.results.filter((result) => result.usedInDecision).length,
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
    const guardedReply = applyAgentIdentityResponseGuard({
      agent,
      content: result.content,
      userContent: userMessage.content,
    });
    return {
      content: guardedReply.content,
      metadata: {
        endpoint: result.endpoint,
        modelId,
        providerProfileId: provider.id,
        route: result.route,
        fallbackReason: result.fallbackReason,
        usage: result.usage,
        memoryTraceId: pipelineMetadata.memoryTraceId,
        recalledMemoryCount: pipelineMetadata.recalledMemoryCount,
        runtimeConfigFileIds: pipelineMetadata.runtimeConfigFileIds,
        roleToolProfileLabel: pipelineMetadata.roleToolProfileLabel,
        roleToolProfileTools: pipelineMetadata.roleToolProfileTools,
        realProviderCall: true,
        identityGuardApplied: guardedReply.guardApplied,
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

    const targetSessionId = activeSessionIdRef.current;
    const createdAt = new Date().toISOString();
    const authLabel = selectedAgent.authBinding?.label ?? "인증 정보 대기";
    const authMode = selectedAgent.authBinding?.mode ?? "provider_profile";
    const modelId = selectedModel?.id ?? selectedAgent.modelId ?? selectedProvider.defaultModel ?? "모델 대기";
    const messageContent = content || `첨부 ${attachments.length}개`;
    const attachmentMetadata = attachments.map((attachment) => ({ ...attachment }));
    const attachmentProcessingPlans = createAttachmentProcessingPlansForMessage({
      attachments: attachmentMetadata,
      rejectedPlans: draftRejectedAttachmentPlans,
    });
    const userMessageMetadata = {
      agentId: selectedAgent.id,
      memoryScope: selectedAgentMemoryScope.namespace,
      recallTraceId: selectedAgentMemoryScope.recallTraceId,
      ...(attachmentMetadata.length > 0 ? { attachments: attachmentMetadata } : {}),
      ...(attachmentProcessingPlans.length > 0 ? { attachmentProcessingPlans } : {}),
    };
    const userMessage: ConversationMessage = {
      id: `message_user_${crypto.randomUUID()}`,
      sessionId: targetSessionId,
      role: "user",
      content: messageContent,
      createdAt,
      metadata: userMessageMetadata,
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
          attachmentProcessingPlans,
          createdAt,
        });
      }
      const blockedMessage: ConversationMessage = {
        id: `message_provider_blocked_${crypto.randomUUID()}`,
        sessionId: targetSessionId,
        role: "assistant",
        content: providerNeedsApproval
          ? `${selectedProvider.name}는 승인 후 사용할 수 있어. 하단 Permission 대기열에서 provider_completion을 승인하면 바로 이어서 보낼 수 있어.`
          : `${selectedProvider.name}는 아직 실행 준비가 안 됐어: ${providerReadiness.reason}`,
        createdAt,
        metadata: {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          readinessStatus: providerReadiness.status,
          permissionItemId: providerPermissionId,
          memoryScope: selectedAgentMemoryScope.namespace,
          recallTraceId: selectedAgentMemoryScope.recallTraceId,
          attachmentCount: attachmentMetadata.length,
          ...(attachmentProcessingPlans.length > 0 ? { attachmentProcessingPlans } : {}),
        },
      };

      if (activeSessionIdRef.current === targetSessionId) {
        setConversationMessages((messages) => [...messages, userMessage, blockedMessage]);
      }
      setDraftMessage("");
      setDraftAttachments([]);
      setDraftRejectedAttachmentPlans([]);
      appendEvent("conversation.message.created", {
        messageId: userMessage.id,
        role: "user",
        content: messageContent,
        metadata: userMessage.metadata,
        contentLength: messageContent.length,
        attachmentCount: attachmentMetadata.length,
        attachments: attachmentMetadata,
        attachmentProcessingPlans,
        attachmentStorage: "metadata_only",
        redaction: "applied",
      }, { sessionId: targetSessionId });
      appendEvent("provider.completion.blocked", {
        agentId: selectedAgent.id,
        providerProfileId: selectedProvider.id,
        modelId,
        readinessStatus: providerReadiness.status,
        permissionItemId: providerPermissionId,
        reason: providerReadiness.reason,
        requestedMessageLength: messageContent.length,
        attachmentCount: attachmentMetadata.length,
        attachmentProcessingPlans,
        retryStored: providerNeedsApproval,
        redaction: "applied",
      }, { sessionId: targetSessionId });
      appendEvent("conversation.message.created", {
        messageId: blockedMessage.id,
        role: "assistant",
        content: blockedMessage.content,
        metadata: blockedMessage.metadata,
        providerProfileId: selectedProvider.id,
        redaction: "applied",
      }, { sessionId: targetSessionId });
      return;
    }

    setAgentActivity(selectedAgent.id, "preparing");
    setConversationMessages((messages) => [...messages, userMessage]);
    setDraftMessage("");
    setDraftAttachments([]);
    setDraftRejectedAttachmentPlans([]);
    appendEvent("conversation.message.created", {
      messageId: userMessage.id,
      role: "user",
      content: messageContent,
      metadata: userMessage.metadata,
      contentLength: messageContent.length,
      attachmentCount: attachmentMetadata.length,
      attachments: attachmentMetadata,
      attachmentProcessingPlans,
      attachmentStorage: "metadata_only",
      redaction: "applied",
    }, { sessionId: targetSessionId });
    const workItem: WorkItem = {
      id: `work_item_message_${crypto.randomUUID()}`,
      sessionId: targetSessionId,
      title: messageContent.slice(0, 64) || "Attachment request",
      kind: "general",
      lane: "check",
      surface: "conversation",
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
    }, { sessionId: targetSessionId });

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
      if (error instanceof ProviderCompletionPermissionRequiredError) {
        const permissionItemId = error.sourceItemId ?? error.approvalId ?? providerPermissionId;
        setPendingProviderRetry({
          permissionItemId,
          providerProfileId: selectedProvider.id,
          agentId: selectedAgent.id,
          modelId,
          content: messageContent,
          attachments: attachmentMetadata,
          attachmentProcessingPlans,
          createdAt,
        });
        await handleRefreshApprovalQueue();
        reply = `${selectedProvider.name} 사용 승인이 필요해. Health/Ops 승인 대기열에서 provider_completion을 승인하면 같은 요청을 서버가 재실행하고 답변을 이어 붙일게.`;
        completionMetadata = {
          approvalId: error.approvalId,
          permissionItemId,
          providerProfileId: selectedProvider.id,
          realProviderCall: false,
          requiresServerApproval: true,
          attachmentCount: attachmentMetadata.length,
          ...(attachmentProcessingPlans.length > 0 ? { attachmentProcessingPlans } : {}),
        };
        appendEvent("provider.completion.approval_required", {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          modelId,
          approvalId: error.approvalId,
          permissionItemId,
          retryStored: true,
          redaction: "applied",
        }, { sessionId: targetSessionId });
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reply = createProviderFailureConversationReply({
          errorMessage,
          provider: selectedProvider,
          providers: providerProfiles,
        });
        completionMetadata = {
          error: errorMessage,
          realProviderCall: false,
        };
        appendEvent("provider.completion.dgx.failed", {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          modelId,
          error: errorMessage,
        }, { sessionId: targetSessionId });
      }
    }

    const assistantMessage: ConversationMessage = {
      id: `message_agent_${crypto.randomUUID()}`,
      sessionId: targetSessionId,
      role: "assistant",
      content: reply,
      createdAt: new Date().toISOString(),
      metadata: {
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        providerProfileId: selectedProvider.id,
        authMode,
        memoryScope: selectedAgentMemoryScope.namespace,
        recallTraceId: selectedAgentMemoryScope.recallTraceId,
        ...(attachmentProcessingPlans.length > 0 ? { attachmentProcessingPlans } : {}),
        ...completionMetadata,
      },
    };

    const assistantDraft: AssistantDraft = {
      id: `draft_reply_${crypto.randomUUID()}`,
      workItemId: workItem.id,
      sessionId: targetSessionId,
      title: `${selectedAgent.name} reply`,
      body: reply.slice(0, 1200),
      targetSurface: "conversation",
      status: "sent",
      confidence: completionMetadata.realProviderCall ? "medium" : "low",
      evidenceRefs: workItem.evidenceRefs,
      missingInfo: [],
      createdAt: assistantMessage.createdAt,
    };
    const shouldCreateMemoryCandidate =
      !completionMetadata.error && !completionMetadata.requiresServerApproval && reply.trim().length > 0;
    if (shouldCreateMemoryCandidate) {
      const memoryCandidate = createConversationTurnMemoryCandidate({
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        assistantMessage,
        attachmentProcessingPlans,
        createdAt: assistantMessage.createdAt,
        memoryScopeNamespace: selectedAgentMemoryScope.namespace,
        providerProfileId: selectedProvider.id,
        recallTraceId: selectedAgentMemoryScope.recallTraceId,
        trustLevel: selectedProvider.trustLevel ?? "limited",
        userMessage,
      });
      handleQueueMemoryCuratorCandidate(memoryCandidate);
    }
    if (activeSessionIdRef.current === targetSessionId) {
      setAgentActivity(selectedAgent.id, "responding");
      setConversationMessages((messages) => [...messages, assistantMessage]);
      prependAssistantDraft(assistantDraft);
      updateWorkItem(workItem.id, {
        lane: completionMetadata.realProviderCall ? "check" : "ask",
        status: completionMetadata.realProviderCall ? "drafted" : "waiting_input",
        updatedAt: assistantMessage.createdAt,
      });
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "idle");
      }, 450);
    } else {
      setAgentActivity(selectedAgent.id, "idle");
    }
    appendEvent("conversation.message.created", {
      messageId: assistantMessage.id,
      role: "assistant",
      content: reply,
      metadata: assistantMessage.metadata,
      agentName: selectedAgent.name,
      providerProfileId: selectedProvider.id,
      contentLength: reply.length,
      redaction: "applied",
    }, { sessionId: targetSessionId });
  }

  function handleCreateCodingPacket() {
    const createdAt = new Date().toISOString();

    const {
      packet: nextPacket,
      readinessState,
      handoff,
      workItem,
    } = mode === "debate"
      ? (() => {
          const projection = createDebateCodingPacketProjection({
            contextPackTier,
            session: debateSession,
            sessionId: activeSessionId,
            userPreferences: adoptedBranchSummaries,
          });
          const items = createDebateCodingPacketWorkItems({
            createdAt,
            ownerAgentId: selectedAgent?.id,
            projection,
            sessionId: activeSessionId,
          });
          return {
            handoff: items.handoff,
            packet: projection.packet,
            readinessState: projection.readiness.state,
            workItem: items.workItem,
          };
        })()
      : (() => {
          const packet = createCodingPacketFromConversation({
            messages: conversationMessages,
            agent: selectedAgent,
            provider: selectedProvider,
          });
          const nextConversationPacket = {
            ...packet,
            context: [`ContextPack tier: ${contextPackTier}`, ...adoptedBranchSummaries, ...packet.context],
          };
          const conversationWorkItem: WorkItem = {
            id: `work_item_packet_${crypto.randomUUID()}`,
            sessionId: activeSessionId,
            title: nextConversationPacket.goal.slice(0, 72),
            kind: "spec_doc",
            lane: "approve",
            surface: "coding_packet",
            status: "waiting_approval",
            summary: `${nextConversationPacket.decisions.length} decisions / ${nextConversationPacket.implementationPlan.length} implementation steps`,
            sourceRefs: [{ source: "desktop_manual", observedAt: createdAt, title: "Coding Packet" }],
            evidenceRefs: [
              {
                id: `evidence_packet_${crypto.randomUUID()}`,
                kind: "artifact",
                reference: `coding_packet://${activeSessionId}`,
                summary: "Structured CodingPacket created from conversation.",
                observedAt: createdAt,
              },
            ],
            missingInfo: nextConversationPacket.filesToInspect.length === 0
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
            priority: "normal",
            createdAt,
          };
          const conversationHandoff: WorkItemHandoff = {
            id: `handoff_packet_${crypto.randomUUID()}`,
            workItemId: conversationWorkItem.id,
            targetSurface: "execution_slot",
            summary: "Coding Packet is ready to route into execution slots after approval.",
            payloadRef: `coding_packet://${activeSessionId}`,
            evidenceRefs: conversationWorkItem.evidenceRefs,
            missingInfo: conversationWorkItem.missingInfo,
            approvalState: "required",
            createdAt,
          };
          return {
            handoff: conversationHandoff,
            packet: nextConversationPacket,
            readinessState: "conversation",
            workItem: conversationWorkItem,
          };
        })();

    setCodingPacketState(nextPacket);
    prependWorkItem(workItem);
    prependWorkItemHandoff(handoff);
    appendEvent("coding_packet.created", {
      packet: nextPacket,
      goal: nextPacket.goal,
      contextPackTier,
      adoptedBranchCount: adoptedBranchSummaries.length,
      contextCount: nextPacket.context.length,
      decisionCount: nextPacket.decisions.length,
      filesToInspect: nextPacket.filesToInspect,
      sourceMode: mode === "debate" ? "debate" : "conversation",
      debateReadiness: readinessState,
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
      kind: "internal_coord",
      lane: "check",
      surface: "debate",
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

  async function handleVerifyCodingPacket() {
    const baseUrl = resolveDgxServerBaseUrls(undefined)[0] ?? DEFAULT_DGX_SERVER_BASE_URL;
    const endpoint = `${baseUrl}/verify-packet`;

    try {
      const body = JSON.stringify(codingPacketState);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: await createDgxOrchestratorJsonHeaders("POST", "/verify-packet", endpoint, { body }),
        body,
      });

      if (!response.ok) {
        throw new Error(`Server verify-packet failed: ${response.status}`);
      }

      const result = await response.json();

      setAgentRunState((prev) => ({
        ...prev,
        verifier: {
          id: prev.verifier.id,
          status: result.status,
          checks: result.checks,
          notes: [
            `실제 subprocess 실행 완료: ${result.message}`,
            `exitCode: ${result.exitCode}`,
            `출력 결과: ${result.stdout ? result.stdout.slice(0, 300) : "출력 없음"}`,
            ...(result.stderr ? [`에러 결과: ${result.stderr.slice(0, 300)}`] : []),
          ],
        },
      }));

      appendEvent("coding_packet.verified", {
        status: result.status,
        exitCode: result.exitCode,
        checks: result.checks,
        message: result.message,
        stdout: result.stdout,
        stderr: result.stderr,
      });

    } catch (error: any) {
      console.error("Failed to verify coding packet:", error);

      setAgentRunState((prev) => ({
        ...prev,
        verifier: {
          id: prev.verifier.id,
          status: "blocked",
          checks: prev.verifier.checks.map((c) => ({ ...c, status: "fail" as const })),
          notes: [
            `패킷 검증 네트워크 오류: ${error.message || String(error)}`,
          ],
        },
      }));

      appendEvent("coding_packet.verification.failed", {
        error: error.message || String(error),
      });
    }
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

  function handleImportExternalIngress() {
    const receivedAt = new Date().toISOString();
    const snapshot = createStage8IngressSnapshot(createExternalIngressDemoInput(receivedAt));
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
        source: "api",
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
          source: "api",
          sourceTrust: "untrusted",
          correlationId: snapshot.id,
        },
      );
      return;
    }

    const externalIngressMessage: ConversationMessage = {
      id: `message_external_ingress_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "user",
      content: normalizedEvent.normalizedText,
      createdAt: receivedAt,
      metadata: {
        agentId: selectedAgentId,
        channel: normalizedEvent.channel,
        ingressEventId: normalizedEvent.id,
        approvalState: snapshot.result.approvalState,
        sourceTrust: normalizedEvent.sourceTrust,
      },
    };

    setConversationMessages((messages) => [...messages, externalIngressMessage]);
    prependMemoryRecord({
      id: `memory_ingress_${normalizedEvent.id}`,
      layer: "fragment",
      title: "외부 인입 후보",
      content: normalizedEvent.normalizedText,
      sourceChannel: normalizedEvent.channel === "webhook" ? "api" : normalizedEvent.channel,
      trustLevel: "untrusted",
      createdAt: receivedAt,
      pinned: false,
    });
    appendEvent(
      "conversation.message.created",
      {
        messageId: externalIngressMessage.id,
        role: "user",
        content: normalizedEvent.normalizedText,
        metadata: externalIngressMessage.metadata,
        channel: normalizedEvent.channel,
        ingressEventId: normalizedEvent.id,
        sourceTrust: normalizedEvent.sourceTrust,
        redaction: normalizedEvent.redacted ? "applied" : "none",
      },
      {
        source: "api",
        sourceTrust: "untrusted",
        correlationId: snapshot.id,
      },
    );
    appendEvent(
      "memory.candidate.created",
      {
        recordId: `memory_ingress_${normalizedEvent.id}`,
        sourceChannel: normalizedEvent.channel,
        trustLevel: "untrusted",
        autoRecall: false,
      },
      {
        source: "api",
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
          source: "api",
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
      decidedBy: "desktop_operator",
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
        setDraftRejectedAttachmentPlans(
          pendingProviderRetry.attachmentProcessingPlans.filter((plan) => plan.status === "rejected"),
        );
        appendEvent("provider.completion.retry.restored", {
          permissionItemId: pendingItem.sourceItemId,
          providerProfileId: pendingProviderRetry.providerProfileId,
          agentId: pendingProviderRetry.agentId,
          modelId: pendingProviderRetry.modelId,
          contentLength: pendingProviderRetry.content.length,
          attachmentCount: pendingProviderRetry.attachments.length,
          attachmentProcessingPlans: pendingProviderRetry.attachmentProcessingPlans,
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

  function handleControlQueueAsk(item: ApprovalQueueItem) {
    const createdAt = new Date().toISOString();
    const workItem = createControlQueueAskItem(item, {
      createdAt,
      sessionId: activeSessionId,
    });

    prependWorkItem(workItem);
    setDraftMessage([
      `이 승인 항목에 대해 추가 확인이 필요합니다: ${sanitizeControlQueueText(item.summary)}`,
      item.reason ? `사유: ${sanitizeControlQueueText(item.reason)}` : undefined,
      `권한: ${item.permissions.map(controlQueuePermissionLabel).join(", ")}`,
      "승인/거부 판단에 필요한 정보를 알려주세요.",
    ].filter(Boolean).join("\n"));
    setMode("conversation");
    setApprovalDrawerOpen(false);
    appendEvent("control_queue.ask.created", {
      workItemId: workItem.id,
      sourceItemId: item.sourceItemId,
      queueItemId: item.id,
      redaction: "applied",
    });
  }

  function handleControlQueueEdit(item: ApprovalQueueItem) {
    const createdAt = new Date().toISOString();
    const { draft, workItem } = createControlQueueEditDraft(item, {
      createdAt,
      sessionId: activeSessionId,
    });

    prependWorkItem(workItem);
    prependAssistantDraft(draft);
    setDraftMessage(draft.body);
    setMode("conversation");
    setApprovalDrawerOpen(false);
    appendEvent("control_queue.edit_draft.created", {
      draftId: draft.id,
      workItemId: workItem.id,
      sourceItemId: item.sourceItemId,
      queueItemId: item.id,
      redaction: "applied",
    });
  }

  function handleControlQueueDelegate(item: ApprovalQueueItem) {
    const createdAt = new Date().toISOString();
    const { handoff, workItem } = createControlQueueDelegateHandoff(item, {
      createdAt,
      sessionId: activeSessionId,
    });

    prependWorkItem(workItem);
    prependWorkItemHandoff(handoff);
    setMode("cockpit");
    setApprovalDrawerOpen(false);
    appendEvent("control_queue.delegate.created", {
      handoffId: handoff.id,
      workItemId: workItem.id,
      sourceItemId: item.sourceItemId,
      queueItemId: item.id,
      targetSurface: handoff.targetSurface,
      redaction: "applied",
    });
  }

  function handleControlQueueBlock(item: ApprovalQueueItem) {
    const createdAt = new Date().toISOString();
    const workItem = createControlQueueBlockItem(item, {
      createdAt,
      sessionId: activeSessionId,
    });

    prependWorkItem(workItem);
    handleResolvePermissionItem(item.sourceItemId, "rejected");
    setApprovalDrawerOpen(false);
    appendEvent("control_queue.block.created", {
      workItemId: workItem.id,
      sourceItemId: item.sourceItemId,
      queueItemId: item.id,
      redaction: "applied",
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

  function openManagementRail(item: NavItemId = "sessions") {
    setAdminRailOpen(true);
    setActiveNavItem(item);
    setProviderRegistrationOpen(item === "providers");
  }

  function openProviderRoutingFromCockpit() {
    openManagementRail("providers");
  }

  function openMemoryFromCockpit() {
    setReturnModeAfterConfigClose("cockpit");
    setMode("conversation");
    setAgentConfigPanel({ open: true, tab: "injection" });
  }

  function openRecoveryFromCockpit() {
    setMode("annex");
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
    setConversationMessagesByAgentId((channels) => ({
      ...channels,
      [nextAgent.id]: channels[nextAgent.id] ?? [],
    }));
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
      setConversationMessagesByAgentId((currentChannels) => {
        const { [agentId]: _removedMessages, ...remainingChannels } = currentChannels;
        return remainingChannels;
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

  function handleCloseAgentConfig() {
    setAgentConfigPanel((panel) => ({ ...panel, open: false }));
    if (returnModeAfterConfigClose) {
      setMode(returnModeAfterConfigClose);
      setReturnModeAfterConfigClose(null);
    }
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
    setAgents((currentAgents) =>
      applyAgentProviderAssignment({
        agentId,
        agents: currentAgents,
        createAuthBinding,
        modelCatalog,
        providerId,
        providerProfiles,
      }),
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

  const paletteCommands: CommandEntry[] = [
    {
      id: "switch.conversation",
      verb: "전환",
      label: "대화",
      hint: "본 대화 보드로 전환",
      shortcut: "⌘1",
      run: () => setMode("conversation"),
    },
    {
      id: "switch.debate",
      verb: "전환",
      label: "토론",
      hint: "토론 테이블 모드",
      shortcut: "⌘2",
      run: () => setMode("debate"),
    },
    {
      id: "switch.tmux",
      verb: "전환",
      label: "Tmux",
      hint: "실행 pane grid",
      shortcut: "⌘3",
      run: () => setMode("tmux"),
    },
    {
      id: "switch.cockpit",
      verb: "전환",
      label: "운영 관제판",
      hint: "실시간 명령 보기",
      shortcut: "⌘4",
      run: () => setMode("cockpit"),
    },
    {
      id: "switch.annex",
      verb: "전환",
      label: "토론 부록",
      hint: "토론 보조 정보 전용 페이지",
      run: () => setMode("annex"),
    },
    {
      id: "open.management",
      verb: "열기",
      label: "관리 패널",
      hint: "세션, 프로바이더, 설정파일, 채널, 백업 rail",
      run: () => openManagementRail("sessions"),
    },
    {
      id: "open.providers",
      verb: "열기",
      label: "프로바이더 관리",
      hint: "Provider 등록, 모델 discovery, 라우팅 점검",
      run: () => openManagementRail("providers"),
    },
    {
      id: "open.backup",
      verb: "열기",
      label: "백업과 복구",
      hint: "백업 projection과 내보내기",
      run: () => openManagementRail("backup"),
    },
    {
      id: "open.control-queue",
      verb: "열기",
      label: "제어 대기열",
      hint: "승인 패널 열기/닫기",
      shortcut: "⌘⇧A",
      run: () => setApprovalDrawerOpen((open) => !open),
    },
    {
      id: "memory.remember",
      verb: "기억",
      label: "현재 맥락 기억",
      hint: "EvolveMemento 에 새 항목 추가",
      shortcut: "⌘⇧M",
      run: handleRememberCurrentContext,
    },
    {
      id: "debate.promote",
      verb: "토론",
      label: "현재 대화를 토론으로 승격",
      hint: "대화 메시지를 Debate Chamber로 보냅니다",
      shortcut: "⌘⇧D",
      run: handlePromoteToDebate,
    },
    {
      id: "orchestrator.invoke",
      verb: "초점",
      label: "오케스트레이터 입력으로 이동",
      hint: "Conversation composer를 즉시 사용할 수 있게 전환",
      shortcut: "⌘I",
      run: () => {
        setMode("conversation");
        queueMicrotask(() => {
          document.querySelector<HTMLElement>("[data-focus-id='composer-textarea']")?.focus();
        });
      },
    },
    {
      id: "agent.stop",
      verb: "Stop",
      label: "활성 에이전트 중단",
      hint: "응답/준비 상태를 idle로 되돌립니다",
      shortcut: "⌘.",
      run: () => setAgentActivityById({}),
    },
    {
      id: "approve.next",
      verb: "Approve",
      label: "다음 권한 요청 승인",
      hint: "queue 첫 항목 approve",
      shortcut: "⌘⏎",
      run: () => handleResolveNextPermission("approved"),
    },
    {
      id: "reject.next",
      verb: "Reject",
      label: "다음 권한 요청 거부",
      hint: "queue 첫 항목 reject",
      run: () => handleResolveNextPermission("rejected"),
    },
    {
      id: "help.shortcuts",
      verb: "Help",
      label: "단축키 도움말",
      hint: "design-decisions §6",
      shortcut: "?",
      run: () => setCheatSheetOpen(true),
    },
  ];

  useGlobalShortcuts({
    onCommandPalette: () => setCommandPaletteOpen((open) => !open),
    onSwitchConversation: () => setMode("conversation"),
    onSwitchDebate: () => setMode("debate"),
    onSwitchTmux: () => setMode("tmux"),
    onSwitchCockpit: () => setMode("cockpit"),
    onControlQueue: () => setApprovalDrawerOpen((open) => !open),
    onCreateDebate: handlePromoteToDebate,
    onMementoRemember: handleRememberCurrentContext,
    onInvokeOrchestrator: () => {
      setMode("conversation");
      queueMicrotask(() => {
        document.querySelector<HTMLElement>("[data-focus-id='composer-textarea']")?.focus();
      });
    },
    onStop: () => setAgentActivityById({}),
    onApprove: () => handleResolveNextPermission("approved"),
    onEscape: () => {
      if (cheatSheetOpen) setCheatSheetOpen(false);
      else if (commandPaletteOpen) setCommandPaletteOpen(false);
      else if (approvalDrawerOpen) setApprovalDrawerOpen(false);
    },
    onHelp: () => setCheatSheetOpen((o) => !o),
  });

  useEffect(() => {
    if (mode !== "cockpit") return;

    if (runtimeSnapshotState.dgxStatus === "offline") {
      setRemoteCockpitSnapshotState({
        status: "failed",
        error: "DGX-02 offline; local cockpit snapshot is active",
      });
      return;
    }

    let active = true;
    setRemoteCockpitSnapshotState((current) => ({
      ...current,
      status: current.snapshot ? "loaded" : "loading",
      error: undefined,
    }));

    fetchDgxOperatorCockpitSnapshot({ timeoutMs: 1_500 })
      .then((snapshot) => {
        if (!active) return;
        setRemoteCockpitSnapshotState({
          status: "loaded",
          snapshot,
          loadedAt: new Date().toISOString(),
        });
      })
      .catch((error) => {
        if (!active) return;
        setRemoteCockpitSnapshotState({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      active = false;
    };
  }, [mode, runtimeSnapshotState.dgxStatus, runtimeSnapshotState.updatedAt]);

  const derivedCockpitSnapshot: OperatorCockpitSnapshot = useMemo(() => {
    // Determine memory health
    let dgxMirrorHealth: "healthy" | "degraded" | "disconnected" = "healthy";
    if (runtimeSnapshotState.dgxStatus === "offline") {
      dgxMirrorHealth = "disconnected";
    } else if (
      runtimeSnapshotState.recentError ||
      adapterStatus === "error" ||
      runtimeSnapshotState.memorySyncStatus === "degraded"
    ) {
      dgxMirrorHealth = "degraded";
    }

    // Determine memory context reasons
    const contextReasons = memoryInspector.trace.results
      .filter((res) => res.usedInDecision)
      .map((res) => sanitizeCockpitProjectionText(res.record.title))
      .slice(0, 3);

    // Determine contradiction warnings
    const contradictionWarnings: string[] = [];
    if (runtimeSnapshotState.memorySyncStatus === "degraded") {
      contradictionWarnings.push("기억 동기화 저하: 로컬 변경이 DGX-02에 아직 반영되지 않았습니다");
    }
    const untrustedRecalls = memoryInspector.trace.results.filter(
      (res) => res.usedInDecision && res.record.trustLevel === "untrusted"
    );
    const firstUntrusted = untrustedRecalls[0];
    if (firstUntrusted) {
      contradictionWarnings.push(`비신뢰 기억 근거 호출됨: "${sanitizeCockpitProjectionText(firstUntrusted.record.title)}"`);
    }

    // Determine cost/speed badges
    let costBadge: "low" | "medium" | "high" = "medium";
    let speedBadge: "fast" | "average" | "slow" = "average";
    if (selectedModel) {
      const modelIdLower = selectedModel.id.toLowerCase();
      if (
        modelIdLower.includes("opus") ||
        modelIdLower.includes("pro") ||
        modelIdLower.includes("high") ||
        modelIdLower.includes("-r1") ||
        modelIdLower.includes("reasoning")
      ) {
        costBadge = "high";
        speedBadge = "slow";
      } else if (
        modelIdLower.includes("mini") ||
        modelIdLower.includes("haiku") ||
        modelIdLower.includes("low") ||
        modelIdLower.includes("flash") ||
        modelIdLower.includes("fast")
      ) {
        costBadge = "low";
        speedBadge = "fast";
      }
    }

    // Determine fallback routing status
    const selectedProviderTags = selectedProvider?.tags ?? [];
    const selectedProviderIsFallbackRoute = selectedProviderTags.some(
      (tag) => tag.includes("fallback") || tag.includes("local"),
    );
    const hasAlternativeProvider = providerProfiles.some((p) => p.enabled && p.id !== selectedProvider?.id);
    let fallbackStatus: "active" | "available" | "none" = "none";
    if (selectedProviderIsFallbackRoute) {
      fallbackStatus = "active";
    } else if (hasAlternativeProvider) {
      fallbackStatus = "available";
    }

    // Determine outbox sync status
    let outboxSyncStatus: "synced" | "pending" | "failed" = "synced";
    if (eventSyncState.status === "syncing" || eventSyncState.status === "queued") {
      outboxSyncStatus = "pending";
    } else if (eventSyncState.status === "failed") {
      outboxSyncStatus = "failed";
    }

    const healthIndicators = createCockpitLocalHealthIndicators({
      dgxStatus: runtimeSnapshotState.dgxStatus,
      eventSyncLastError: eventSyncState.lastError,
      eventSyncStatus: eventSyncState.status,
      memorySyncStatus: runtimeSnapshotState.memorySyncStatus,
    });
    const selectedProviderConsoleItem = providerRoutingConsoleItems.find(
      (item) => item.providerId === selectedProvider?.id,
    );

    return {
      id: activeSessionId || "global-cockpit",
      timestamp: new Date().toISOString(),
      fleet: agents.map((agent) => {
        const activity = agentActivityById[agent.id] ?? "idle";
        let status: OperatorCockpitWorkerStatus = "idle";
        let statusRingColor: "green" | "yellow" | "red" | "gray" = "gray";
        if (activity === "idle") {
          status = "idle";
          statusRingColor = "gray";
        } else if (activity === "preparing" || activity === "responding") {
          status = "working";
          statusRingColor = "green";
        } else {
          status = "idle";
          statusRingColor = "gray";
        }

        return {
          workerId: agent.id,
          role: agent.role,
          status,
          statusRingColor,
        };
      }),
      approvals: permissionSnapshot.queue
        .filter((q) => q.state === "required")
        .map((q) => {
          const matrixItem = permissionSnapshot.items.find((item) => item.id === q.sourceItemId);

          let evidenceRefs: EvidenceRef[] = [];
          let commandPreview: string | undefined = undefined;
          let payloadBindingStatus: "bound" | "unbound" | "expired" = resolveCockpitPayloadBindingStatus({
            expiresAt: q.expiresAt,
            hasReplayMetadata: Boolean(q.replayKind && q.replayEndpoint),
            sourceTrust: matrixItem?.sourceTrust,
          });
          let tamperWarning = false;
          let securityRisk: string | undefined = undefined;

          if (matrixItem) {
            // Determine tamper warning and security risk based on sourceTrust
            if (matrixItem.sourceTrust === "untrusted") {
              tamperWarning = true;
              securityRisk = `비신뢰 출처 감지: ${sanitizeCockpitProjectionText(matrixItem.channel)}`;
            }

            // Extract EvidenceRefs and CommandPreview based on category
            if (matrixItem.id.startsWith("permission_external_")) {
              const extId = matrixItem.id.replace("permission_external_", "");
              const extApp = [...rebootApprovals, ...ingressSnapshot.approvals].find((a) => a.id === extId);
              if (extApp) {
                evidenceRefs.push({
                  id: extApp.ingressEventId,
                  kind: "event",
                  reference: extApp.ingressEventId,
                  summary: `인입 이벤트: ${sanitizeCockpitProjectionText(extApp.ingressEventId)}`,
                  observedAt: extApp.createdAt,
                });
              }
            } else if (matrixItem.id.startsWith("permission_terminal_")) {
              const slotId = matrixItem.id.replace("permission_terminal_", "");
              const slot = terminalSlots.find((s) => s.id === slotId);
              if (slot) {
                commandPreview = slot.lastCommandPreview
                  ? sanitizeCockpitProjectionText(slot.lastCommandPreview)
                  : undefined;
                evidenceRefs.push({
                  id: slot.id,
                  kind: "routine_reference",
                  reference: slot.id,
                  summary: `터미널 슬롯: ${sanitizeCockpitProjectionText(slot.label)}`,
                });
              }
            } else if (matrixItem.id.startsWith("permission_run_")) {
              const stepId = matrixItem.id.replace("permission_run_", "");
              const step = agentRunState.steps.find((s) => s.id === stepId);
              if (step) {
                evidenceRefs.push({
                  id: step.id,
                  kind: "artifact",
                  reference: step.id,
                  summary: `실행 단계: ${sanitizeCockpitProjectionText(step.title)}`,
                });
              }
            } else if (matrixItem.id.startsWith("permission_provider_")) {
              const provId = matrixItem.id.replace("permission_provider_", "");
              evidenceRefs.push({
                id: provId,
                kind: "routine_reference",
                reference: provId,
                summary: `프로바이더 프로필: ${sanitizeCockpitProjectionText(provId)}`,
              });
            }
          }

          return {
            blockReason: sanitizeCockpitProjectionText(q.summary),
            evidenceRefs,
            commandPreview,
            payloadBindingStatus,
            tamperWarning,
            securityRisk,
          };
        }),
      handoffs: workItemHandoffs.map((handoff) => {
        const item = workItems.find((w) => w.id === handoff.workItemId);
        return {
          ownerAgentId: item?.ownerAgentId || "agent_unassigned",
          nextAction: sanitizeCockpitProjectionText(handoff.summary),
          missingInfoSlots: handoff.missingInfo.map((slot) => ({
            ...slot,
            label: sanitizeCockpitProjectionText(slot.label),
          })),
          evidenceRefs: handoff.evidenceRefs?.map((ref) => ({
            ...ref,
            reference: sanitizeCockpitProjectionText(ref.reference),
            summary: sanitizeCockpitProjectionText(ref.summary || ref.reference || ref.id),
          })),
        };
      }),
      memory: {
        contextReasons,
        macBookAuthorityEnabled: runtimeSnapshotState.syncTopology.authorityLabel === "MacBook Pro",
        dgxMirrorHealth,
        contradictionWarnings,
      },
      routing: {
        selectedModelId: formatModelDisplayName(selectedModel?.name || selectedModel?.id),
        fallbackStatus,
        costBadge,
        speedBadge,
        trustBadge: selectedProvider?.trustLevel || "limited",
        assignedAgentCount: selectedProviderConsoleItem?.assignedAgentCount,
        discoveryLabel: selectedProviderConsoleItem?.discoveryLabel,
        modelCount: selectedProviderConsoleItem?.modelCount,
        providerLabel: selectedProviderConsoleItem?.displayName,
        readinessLabel: selectedProviderConsoleItem?.readinessLabel,
        routeLabel: selectedProviderConsoleItem?.routeLabel,
        secretPolicyLabel: selectedProviderConsoleItem?.secretPolicyLabel,
      },
      recovery: {
        offlineResumeSupported:
          runtimeSnapshotState.syncTopology.authorityLabel === "MacBook Pro" && eventSyncState.status !== "failed",
        outboxSyncStatus,
        healthIndicators,
      },
      dispatchHistory: createPermissionApprovalLedger({
        decisionEvents: eventLog,
        permissionSnapshot,
        tmuxRedispatchOutcomes,
      }),
    };
  }, [
    activeSessionId,
    agents,
    agentActivityById,
    permissionSnapshot.queue,
    permissionSnapshot.items,
    rebootApprovals,
    ingressSnapshot.approvals,
    terminalSlots,
    agentRunState,
    workItemHandoffs,
    workItems,
    runtimeSnapshotState,
    adapterStatus,
    memoryInspector,
    selectedModel,
    providerProfiles,
    providerRoutingConsoleItems,
    selectedProvider,
    eventSyncState.status,
    eventSyncState.lastError,
    eventLog,
    tmuxRedispatchOutcomes,
  ]);

  const cockpitSnapshot: OperatorCockpitSnapshot = useMemo(() => {
    let providerIndicator: string | undefined;
    let timestamp: string | undefined;
    if (remoteCockpitSnapshotState.status === "loaded" && remoteCockpitSnapshotState.snapshot) {
      const providerReady = remoteCockpitSnapshotState.snapshot.recovery.healthIndicators.find((indicator) =>
        indicator.startsWith("Provider registry:"),
      );
      providerIndicator = providerReady;
      timestamp = remoteCockpitSnapshotState.snapshot.timestamp;
    }
    const serverIndicator = createCockpitServerSnapshotIndicator({
      error: remoteCockpitSnapshotState.status === "failed" ? remoteCockpitSnapshotState.error : undefined,
      providerIndicator,
      status: remoteCockpitSnapshotState.status,
      timestamp,
    });

    return {
      ...derivedCockpitSnapshot,
      recovery: {
        ...derivedCockpitSnapshot.recovery,
        healthIndicators: [
          ...derivedCockpitSnapshot.recovery.healthIndicators,
          serverIndicator,
        ],
      },
    };
  }, [derivedCockpitSnapshot, remoteCockpitSnapshotState]);

  const cockpitReadiness = useMemo(() => {
    const debateReadiness = deriveDebateDecisionReadiness(debateSession);
    const tmuxBlocks = Object.values(tmuxTimelineBlocks).flat();
    const latestTmuxBlock = tmuxBlocks.at(-1);
    const firstPaneStatus = Object.values(tmuxStatuses)[0] ?? "ready";
    const tmuxRecoveryPlan = deriveTmuxRecoveryPlan({
      lastCaptureAt: latestTmuxBlock?.createdAt,
      now: runtimeSnapshotState.updatedAt,
      paneState: firstPaneStatus,
      timelineBlocks: tmuxBlocks,
    });
    const workTraceIndex = createWorkTraceSearchIndex(
      createCockpitWorkTraceSources({
        conversationMessages,
        debateSession,
        tmuxBlocks,
      }),
    );
    const activeProviderCount = providerProfiles.filter((provider) => provider.enabled).length;
    const providerSmokeReadyCount = providerRoutingConsoleItems.filter((item) =>
      item.readinessTone === "success" || item.readinessTone === "warning"
    ).length;
    const runtimeStatus =
      runtimeSnapshotState.dgxStatus === "online" || runtimeSnapshotState.localModelStatus === "online"
        ? "online"
        : eventSyncState.status === "failed"
          ? "offline"
          : "degraded";
    const acceptedAttachmentTypeCount =
      1 + (["image", "document"] as const).filter((kind) => modelSupportsAttachmentKind(selectedModel, kind)).length;
    const onboardingPassedCount = metaOnboardingSignals.filter((signal) => signal.status === "ready").length;
    const onboardingBlockedCount = metaOnboardingSignals.filter((signal) => signal.status === "blocked").length;
    const codingImpactCount = debateSession.rounds.reduce(
      (count, round) => count + round.utterances.filter((utterance) => utterance.tags.includes("coding_impact")).length,
      0,
    );
    const decisionCount = debateSession.rounds.reduce(
      (count, round) => count + round.utterances.filter((utterance) => Boolean(utterance.decisionId)).length,
      0,
    );
    const workItemProjectionCount = workItems.length + assistantDrafts.length + workItemHandoffs.length;
    const diagnostics = createSettingsDiagnostics({
      agentCount: agents.length,
      enabledProviderCount: activeProviderCount,
      memoryAdapterStatus: adapterStatus,
      providerSmokeReadyCount,
      runtimeStatus,
      workerCount: agents.length,
    });
    const smokePlan = createProductionSmokePlan({
      includeLiveProvider: providerReadiness.status === "ready" && activeProviderCount > 0,
      includeVisual: true,
    });
    const maturity = createOrchestrationMaturityReport({
      attachments: {
        acceptedTypeCount: acceptedAttachmentTypeCount,
        hasProcessingPipeline: true,
        pendingCount: draftAttachments.length,
      },
      controlQueue: {
        connectedLaneCount: 6,
        pendingApprovalCount: permissionSnapshot.summary.pending,
        workItemProjectionCount,
      },
      debate: {
        codingImpactCount,
        decisionCount,
        hasCodingPacketProjection: Boolean(codingPacketState.goal && workItemProjectionCount > 0),
        readinessState: debateReadiness.state,
      },
      e2e: {
        desktopTestCount: 328,
        hasProviderSmokeHarness: providerSmokeReadyCount > 0,
        hasVisualSmokeChecklist: true,
      },
      memory: {
        agentInstallCount: memoryInstallAudit.totalAgents,
        curatorCandidateCount: memoryRecords.filter(
          (record) =>
            record.activationState === "suggested" ||
            record.activationState === "quarantined" ||
            record.trustLevel === "untrusted",
        ).length,
        installedAgentCount: memoryInstallAudit.installedCount,
        promotedCount: memoryRecords.filter((record) => record.activationState === "active" || record.pinned).length,
      },
      onboarding: {
        blockingCheckCount: onboardingBlockedCount,
        passedCheckCount: onboardingPassedCount,
        totalCheckCount: metaOnboardingSignals.length,
      },
      provider: {
        assignedAgentCount: agents.filter((agent) => Boolean(agent.providerProfileId)).length,
        fallbackReadyCount: Math.max(0, activeProviderCount - 1),
        profileCount: providerProfiles.length,
        smokeReadyCount: providerSmokeReadyCount,
      },
      receipts: {
        receiptCount: workTraceIndex.length,
        searchableCount: workTraceIndex.filter((item) => item.searchable).length,
        unsafeReceiptCount: workTraceIndex.filter((item) => !item.searchable).length,
      },
      tmux: {
        hasRecoveryPlan: tmuxRecoveryPlan.state !== "manual_intervention",
        paneCount: terminalSlots.length,
        timelineBlockCount: tmuxBlocks.length,
      },
    });

    return {
      diagnostics,
      maturity,
      nextActions: deriveCockpitNextActions({
        controlQueue: controlQueueContinuity,
        diagnostics,
        maturity,
        snapshot: cockpitSnapshot,
        workTraceItems: workTraceIndex,
      }),
      smokePlan,
      workTraceItems: workTraceIndex,
    };
  }, [
    adapterStatus,
    agents,
    assistantDrafts,
    codingPacketState.goal,
    cockpitSnapshot,
    conversationMessages,
    controlQueueContinuity,
    debateSession,
    draftAttachments.length,
    eventSyncState.status,
    memoryInstallAudit,
    memoryRecords,
    metaOnboardingSignals,
    permissionSnapshot.summary.pending,
    providerProfiles,
    providerReadiness.status,
    providerRoutingConsoleItems,
    runtimeSnapshotState,
    selectedModel,
    tmuxStatuses,
    tmuxTimelineBlocks,
    workItemHandoffs,
    workItems,
  ]);

  const shellVisibility = getConversationShellVisibility({
    configLibraryActive,
    mode,
  });
  const railLayout = getConversationRailLayout({
    configLibraryActive,
    mode,
  });
  const focusedV0Surface = !configLibraryActive && isFocusedV0Surface(mode);
  const leftRailVisible = shellVisibility.showLeftRail || providerRegistrationOpen || adminRailOpen;
  const rightRailVisible = !focusedV0Surface;

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (!leftRailVisible && isMobileDrawerOpen) {
      setIsMobileDrawerOpen(false);
    }
  }, [isMobileDrawerOpen, leftRailVisible]);

  return (
    <div
      className={`app-shell ${mode === "tmux" ? "tmux-focus-shell" : ""} ${
        mode === "cockpit" ? "cockpit-focus-shell" : ""
      } ${
        mode === "annex" ? "annex-focus-shell" : ""
      } ${
        mode === "debate" ? "debate-focus-shell" : ""
      } ${
        mode === "conversation" && !configLibraryActive ? "conversation-v0-shell" : ""
      }`}
      style={{
        "--conversation-right-rail-max": `${railLayout.rightRailMaxWidthPx}px`,
        "--conversation-right-rail-min": `${railLayout.rightRailMinWidthPx}px`,
        "--conversation-right-rail-width": `${railLayout.rightRailWidthPx}px`,
      } as React.CSSProperties}
    >
      <RuntimeStatusBar
        drawerAvailable={leftRailVisible}
        mode={mode}
        onChangeMode={setMode}
        onCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenOpsDetail={() => setMode("cockpit")}
        onProbeDgx={handleProbeDgx}
        onToggleDrawer={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
        providerName={activeProvider?.name ?? "미선택"}
        snapshot={runtimeSnapshotState}
      />
      <main className="workspace-grid">
        {isMobileDrawerOpen && leftRailVisible ? (
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
        ) : null}
        {leftRailVisible ? (
          <aside
            className={`left-rail ${providerRegistrationOpen ? "provider-mode" : ""} ${isMobileDrawerOpen ? "drawer-open" : ""}`}
            aria-label="오케스트레이터 네비게이션"
          >

          <nav className="nav-stack">
            {navItems.map((item) => {
              const isActive = activeNavItem === item.id;
              return (
                <button
                  aria-expanded={isActive}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    setAdminRailOpen(true);
                    setActiveNavItem(item.id);
                    setProviderRegistrationOpen(item.id === "providers");
                    setIsMobileDrawerOpen(false);
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
              routingConsoleItems={providerRoutingConsoleItems}
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
                onImportExternalIngress={handleImportExternalIngress}
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
              onImportExternalIngress={handleImportExternalIngress}
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
              <span>EvolveMemento / 장기기억과 로컬 캐시 동기화 상태</span>
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
        ) : null}

        <section
          className={`center-board ${mode === "tmux" ? "tmux-center-board" : ""} ${mode === "cockpit" ? "cockpit-center-board" : ""} ${mode === "annex" ? "annex-center-board" : ""} ${mode === "debate" ? "debate-center-board" : ""} ${
            configLibraryActive ? "config-center-board" : ""
          }`}
        >
          {shellVisibility.showToolbarActions ? (
            <div className="board-toolbar">
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
          ) : null}

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
              controlQueueContinuity={controlQueueContinuity}
              draftAttachments={draftAttachments}
              draftMessage={draftMessage}
              maxDraftAttachments={maxDraftAttachments}
              agentToolRuntimeLabel={agentRoleToolRuntimeAudit.summary}
              memoryAdapterStatus={adapterStatus}
              memoryGovernanceLabel={memoryGovernanceSummary.installLabel}
              memoryRecordCount={memoryRecords.length}
              memoryScope={selectedAgentMemoryScope}
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
              onImportExternalIngress={handleImportExternalIngress}
              onPromoteToDebate={handlePromoteToDebate}
              onRejectPermission={(sourceItemId) => handleResolvePermission(sourceItemId, "rejected")}
              onRemoveDraftAttachment={handleRemoveDraftAttachment}
              onSelectAgent={setSelectedAgentId}
              onSendMessage={handleSendMessageStage2}
              onCloseAgentConfig={handleCloseAgentConfig}
              onReturn={handleCloseAgentConfig}
              returnLabel={returnModeAfterConfigClose === "annex" ? "← Annex로" : undefined}
              onOpenAgentConfig={openAgentConfigPanel}
              onUpdateAgentConfig={updateSelectedAgentConfig}
              onUpdateAgentPersona={updateSelectedAgentPersona}
              pendingProviderRetry={pendingProviderRetry}
              permissionSnapshot={permissionSnapshot}
              providerReadiness={providerReadiness}
              selectedAgent={selectedAgent}
              selectedAgentId={selectedAgent?.id}
              selectedModel={selectedModel}
              selectedProvider={selectedProvider}
              agentVisualsById={agentVisualsById}
              agentActivityById={agentActivityById}
            />
          ) : mode === "debate" ? (
            <Stage3DebateTable
              onCreateCodingPacket={handleCreateCodingPacket}
              onOpenAnnex={() => setMode("annex")}
              onSelectUtterance={handleSelectDebateUtterance}
              session={debateSession}
              agentVisualsById={agentVisualsById}
            />
          ) : mode === "tmux" ? (
            <TmuxSwarmBoard
              activeSessionId={activeSessionId}
              agentActivityById={agentActivityById}
              agentVisualsById={agentVisualsById}
              agents={agents}
              messages={conversationMessages}
              onApprovalQueued={handleTmuxApprovalQueued}
              packet={codingPacketState}
              commandDrafts={tmuxCommandDrafts}
              onCommandDraftChange={setTmuxCommandDrafts}
              statuses={tmuxStatuses}
              onStatusChange={setTmuxStatuses}
              outputs={tmuxOutputs}
              onOutputChange={setTmuxOutputs}
              timelineBlocks={tmuxTimelineBlocks}
              onTimelineBlocksChange={setTmuxTimelineBlocks}
            />
          ) : mode === "cockpit" ? (
            <OperatorCockpit
              onOpenAgentConversation={(agentId) => {
                setSelectedAgentId(agentId);
                setMode("conversation");
              }}
              onOpenMemory={openMemoryFromCockpit}
              onOpenProviderRouting={openProviderRoutingFromCockpit}
              onOpenRecovery={openRecoveryFromCockpit}
              onPreviewEvidence={() => setApprovalDrawerOpen(true)}
              readiness={cockpitReadiness}
              snapshot={cockpitSnapshot}
            />
          ) : mode === "annex" ? (
            <DebateAnnexPage
              codingPacketGoal={codingPacketState.goal}
              onBack={() => setMode("debate")}
              onViewApproval={() => setApprovalDrawerOpen(true)}
              onViewMemory={() => {
                setReturnModeAfterConfigClose("annex");
                setMode("conversation");
                setAgentConfigPanel({ open: true, tab: "injection" });
              }}
              pendingApprovals={permissionSnapshot.summary.pending}
              runtime={runtimeSnapshotState}
              session={debateSession}
            />
          ) : null}

          {shellVisibility.showWorkItemHandoffPanel ? (
            <WorkItemHandoffPanel
              drafts={assistantDrafts}
              handoffs={workItemHandoffs}
              items={workItems}
              onArchiveItem={handleArchiveWorkItem}
              onApproveHandoff={handleApproveWorkItemHandoff}
              onRouteItem={handleRouteWorkItem}
              onSendDraft={handleMarkAssistantDraftSent}
            />
          ) : null}

          {shellVisibility.showCodingPacketPanel ? (
            <CodingPacketPanel
              insightFindings={insightFindings}
              onReviewModeChange={handleReviewModeChange}
              packet={codingPacketState}
              reviewMode={reviewMode}
              onVerify={handleVerifyCodingPacket}
            />
          ) : null}
        </section>

        {rightRailVisible ? (
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
            {shellVisibility.showEvolveMementoPanel ? (
              <EvolveMementoPanel
                adapterStatus={adapterStatus}
                governanceSummary={memoryGovernanceSummary}
                inspector={memoryInspector}
                onActivate={handleActivateMemory}
                onForget={handleForgetMemory}
                onPin={handlePinMemory}
                onRemember={handleRememberCurrentContext}
              />
            ) : null}
            {shellVisibility.showEvolveMementoPanel ? (
              <HumanPeekPanel ingressSnapshot={ingressSnapshot} />
            ) : null}
          </aside>
        ) : null}
      </main>
      {shellVisibility.showTerminalDock ? (
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
      ) : null}
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
        onAsk={handleControlQueueAsk}
        onApprove={(sourceItemId) => handleResolvePermissionItem(sourceItemId, "approved")}
        onBlock={handleControlQueueBlock}
        onClose={() => setApprovalDrawerOpen(false)}
        onDelegate={handleControlQueueDelegate}
        onEdit={handleControlQueueEdit}
        onReject={(sourceItemId) => handleResolvePermissionItem(sourceItemId, "rejected")}
        open={approvalDrawerOpen}
        snapshot={permissionSnapshot}
      />
      <CommandPalette
        commands={paletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
        open={commandPaletteOpen}
      />
      <CheatSheetOverlay
        onClose={() => setCheatSheetOpen(false)}
        open={cheatSheetOpen}
      />
    </div>
  );
}

function parseStoredCenterMode(value: unknown): CenterMode {
  return value === "conversation" ||
    value === "debate" ||
    value === "tmux" ||
    value === "cockpit" ||
    value === "annex"
    ? value
    : "cockpit";
}
