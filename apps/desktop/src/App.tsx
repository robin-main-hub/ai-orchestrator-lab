import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  ChevronRight,
  Database,
  GitBranch,
  MessageSquare,
  Send,
  Server,
  Terminal,
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
  AssistantDraft,
  ApprovalState,
  BackupProjection,
  BranchExperiment,
  CodingPacket,
  ConversationMessage,
  ContextPackTier,
  DeviceRebootRequest,
  DeviceRebootWatchdog,
  EventEnvelope,
  EventSource,
  ExternalApprovalItem,
  MemoryRecord,
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
  AgentConfigFile,
  AgentConfigFileKind,
  AgentConfigTab,
  AgentPersonaSettings,
  AgentProfilePack,
  AgentVisualSettings,
  CenterMode,
  DraftAttachment,
  ModelCatalog,
  NavItemId,
  ProviderRegistrationMode,
  Stage3DebateUtteranceView,
  WorkbenchAgent,
} from "./types";
import {
  agentVisualStorageKey,
  defaultObsidianVaultRoot,
  maxDraftAttachments,
  modelWindowSize,
  now,
  providerProfilesStorageKey,
} from "./lib/appConstants";
import {
  agentRoleLabel,
  classifyDraftAttachment,
  createDefaultPersonaSettings,
  createDraftAttachment,
  createInitialAgentVisualSettings,
  modelSupportsAnyAttachment,
  modelSupportsAttachmentKind,
  slugifyProviderName,
} from "./lib/helpers";
import { statusTone } from "./lib/uiLabels";
import {
  createInitialProviderProfiles,
  createModelDiscoveryFromRegistryEntry,
  mergeProviderProfilesFromRegistry,
  seededModelCatalog,
  seededProviderProfiles,
} from "./seeds/providers";
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
  initialBranchExperiments,
  initialConversationMessages,
  initialEventLog,
  navItems,
  terminalSlots,
} from "./seeds/conversation";
import { initialMemoryRecords } from "./seeds/memory";
import {
  initialAssistantDrafts,
  initialWorkItemHandoffs,
  initialWorkItems,
} from "./seeds/workItems";
import { initialAgentConfigFiles, initialAgentProfilePacks } from "./seeds/configFiles";
import { AgentConfigDrawer } from "./components/AgentConfigDrawer";
import { AgentSettingsPanel } from "./components/AgentSettingsPanel";
import { AgentStatePanel } from "./components/AgentStatePanel";
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
import { createInsightFindings, createMetaOnboardingSignals, statusForWorkLane } from "./lib/workbenchDerived";
import { WorkItemHandoffPanel } from "./components/WorkItemHandoffPanel";

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
  const [agentConfigFiles, setAgentConfigFiles] = useState<AgentConfigFile[]>(initialAgentConfigFiles);
  const [agentProfilePacks] = useState<AgentProfilePack[]>(initialAgentProfilePacks);
  const [selectedConfigFileId, setSelectedConfigFileId] = useState(initialAgentConfigFiles[0]?.id);
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
  const configLibraryActive = activeNavItem === "config_files";
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

  function createConfigFileDraft(kind: AgentConfigFileKind): AgentConfigFile {
    const createdAt = new Date().toISOString();
    const index = agentConfigFiles.filter((file) => file.kind === kind).length + 1;
    const kindPath: Record<AgentConfigFileKind, string> = {
      agents: "agents/shared/AGENTS.md",
      memory_policy: "agents/policies/MEMORY.md",
      prompt_template: "agents/templates/prompt.md",
      skill: "agents/skills/SKILL.md",
      soul: "agents/new-agent/SOUL.md",
    };
    const kindLabel: Record<AgentConfigFileKind, string> = {
      agents: "AGENTS.md",
      memory_policy: "Memory Policy",
      prompt_template: "Prompt Template",
      skill: "SKILL.md",
      soul: "SOUL.md",
    };

    return {
      id: `config_${kind}_${Date.now()}`,
      body: `${kindLabel[kind]} 초안\n\n- 목적:\n- 적용 대상:\n- 금지/주의:\n`,
      kind,
      label: `${kindLabel[kind]} 초안 ${index}`,
      linkedAgentIds: selectedAgent ? [selectedAgent.id] : [],
      path: kindPath[kind],
      scope: kind === "soul" ? "agent" : "project",
      tags: ["draft"],
      updatedAt: createdAt,
      version: 1,
    };
  }

  function handleCreateConfigFile(kind: AgentConfigFileKind) {
    const nextFile = createConfigFileDraft(kind);
    setAgentConfigFiles((files) => [nextFile, ...files]);
    setSelectedConfigFileId(nextFile.id);
    appendEvent("agent.config_file.created", {
      configFileId: nextFile.id,
      kind: nextFile.kind,
      label: nextFile.label,
      path: nextFile.path,
      rawSecretPersisted: false,
    });
  }

  function handleDuplicateConfigFile(configFileId: string) {
    const source = agentConfigFiles.find((file) => file.id === configFileId);
    if (!source) {
      return;
    }
    const nextFile: AgentConfigFile = {
      ...source,
      id: `config_${source.kind}_${Date.now()}`,
      label: `${source.label} 복사본`,
      updatedAt: new Date().toISOString(),
      version: source.version + 1,
    };
    setAgentConfigFiles((files) => [nextFile, ...files]);
    setSelectedConfigFileId(nextFile.id);
    appendEvent("agent.config_file.duplicated", {
      configFileId: nextFile.id,
      sourceConfigFileId: source.id,
      kind: nextFile.kind,
      rawSecretPersisted: false,
    });
  }

  function handleImportConfigFile(configFileId: string, fileName: string, body: string) {
    const source = agentConfigFiles.find((file) => file.id === configFileId);
    if (!source) {
      return;
    }
    const directoryPrefix = source.path.includes("/")
      ? `${source.path.split("/").slice(0, -1).join("/")}/`
      : "";
    const nextPath = `${directoryPrefix}${fileName}`;
    const nextLabel = fileName.replace(/\.(md|markdown|txt)$/i, "").trim() || source.label;

    setAgentConfigFiles((files) =>
      files.map((file) =>
        file.id === configFileId
          ? {
              ...file,
              body,
              label: nextLabel,
              path: nextPath,
              updatedAt: new Date().toISOString(),
              version: file.version + 1,
            }
          : file,
      ),
    );
    appendEvent("agent.config_file.imported", {
      configFileId,
      fileName,
      kind: source.kind,
      rawSecretPersisted: false,
    });
  }

  function handleSaveConfigFile(configFileId: string) {
    const source = agentConfigFiles.find((file) => file.id === configFileId);
    if (!source) {
      return;
    }
    appendEvent("agent.config_file.saved", {
      configFileId,
      kind: source.kind,
      label: source.label,
      path: source.path,
      version: source.version,
      rawSecretPersisted: false,
    });
  }

  function handleUpdateConfigFile(configFileId: string, patch: Partial<AgentConfigFile>) {
    setAgentConfigFiles((files) =>
      files.map((file) =>
        file.id === configFileId
          ? {
              ...file,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : file,
      ),
    );
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
