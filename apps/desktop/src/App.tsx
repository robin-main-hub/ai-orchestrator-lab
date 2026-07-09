import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Brain,
  ChevronRight,
  Database,
  GitBranch,
  MessageSquare,
  Send,
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
  createCodingPacketFromConversation,
  createStage2Event,
  DEFAULT_SESSION_ID,
  renderObsidianMarkdown,
} from "./runtime/stage2Runtime";
import {
  createStage3DebateSession,
  runStage3DebateSession,
  type Stage3DebateSession,
} from "./runtime/stage3Runtime";
import { computeBlueprintReviewForSession } from "./lib/designPacketFromDebate";
import type { CockpitDetailFocus } from "./lib/cockpitNextActions";
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
import { replyRequestsTools, runConversationToolLoop } from "./runtime/conversationToolLoop";
import { grantDgxApproval, rejectDgxApproval } from "./runtime/stage34ApprovalServer";
import { withBackoffRetry } from "./lib/retryPolicy";
import { selectModelForWorkload } from "./lib/modelWorkloadRouting";
import {
  shouldAutoCompactConversation,
  summarizeConversationUsage,
} from "./lib/conversationUsage";
import { createPatternApprovalStrategy, extractCommandPrefix } from "./lib/sessionPatternApproval";
import { DANGEROUS_PATTERN } from "./lib/safeCommandPolicy";
import { patchCandidatesFromApprovalItems } from "./lib/patchHandoffToCandidate";
import {
  CONVERSATION_SLASH_HELP,
  parseConversationSlashCommand,
  type ConversationSlashCommand,
} from "./lib/conversationSlashCommands";
import { rollbackToTurn } from "./lib/conversationCheckpoints";
import {
  buildCreateSnapshotCommand,
  buildRestoreFilesCommand,
  parseSnapshotOutput,
  resolveSnapshotRef,
} from "./lib/gitSnapshot";
import { readAttachmentContent } from "./lib/attachmentContent";
import { condense, renderCondensate, type Condensate, type CondenserTurn } from "./lib/conversationCondenser";
import { buildCovenantFromPersona } from "./lib/personaCovenant";
import { buildForkBrief, forkMissionFromConversation } from "./lib/conversationFork";
import { workbenchMissionStore } from "./lib/workbenchMissions";
import { createAutoApproveStrategy } from "./lib/autoApproveStrategy";
import { createClosedLoopEffects, pollForApprovalDecision } from "./lib/closedLoopRuntime";
import { createGatedToolExecutor, type WireMessage } from "./lib/codingTurnRunner";
import { workspaceChangeLedger } from "./lib/workspaceChangeLedger";
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
  BlueprintRevisionDraft,
  DesignBlueprintInput,
  ServerMissionRecord,
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
import { createWorkTraceSearchIndex, type WorkTraceSearchItem } from "./lib/workTraceSearch";
import { deriveDebateDecisionReadiness } from "./lib/debateDecisionReadiness";
import { deriveTmuxRecoveryPlan } from "./lib/tmuxRecoveryPlan";
import { createSummonRegistry, type SummonRegistry } from "./lib/personaSummon";
import { DEFAULT_SWARM_PANES } from "./lib/autonomyRunForm";
import { createSettingsDiagnostics } from "./lib/settingsDiagnostics";
import { createProductionSmokePlan } from "./lib/productionSmokePlan";
import { createOrchestrationMaturityReport } from "./lib/orchestrationMaturity";
import { createExperienceRoadmap } from "./lib/orchestrationExperienceRoadmap";
import { createOrchestrationOsDebateSession } from "./lib/orchestrationOsDebate";
import { deriveCockpitNextActions } from "./lib/cockpitNextActions";
import type { CockpitNextActionItem } from "./lib/cockpitNextActions";
import { deriveCockpitHealthFromSnapshot } from "./lib/cockpitHealthRollup";
import { isNavCenterActive, MODE_OWNS_CENTER_NAV } from "./lib/navSurface";
import { resolveExternalIngressTargetAgentId } from "./lib/externalIngressRouting";
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
import {
  createCodingPacketExecutionSlotBlock,
  isCodingPacketExecutionHandoff,
} from "./lib/codingPacketExecutionLoop";
import { createControlQueueContinuitySummary } from "./lib/controlQueueContinuity";
import { controlQueuePermissionLabel, sanitizeControlQueueText } from "./lib/controlQueuePresentation";
import { shouldRefreshControlQueueOnOpen } from "./lib/controlQueueAutoRefresh";
import {
  createUnifiedControlQueueSnapshot,
  parseUnifiedControlQueueSourceItemId,
} from "./lib/controlQueueUnifiedApprovals";
import {
  createAgentRoleToolRuntimeAudit,
} from "./lib/agentRuntimeConfig";
import { applyAgentIdentityResponseGuard } from "./lib/agentIdentityResponseGuard";
import { createCompletionMemoryRecallMessages } from "./lib/agentCompletionRecall";
import { createMemoryGovernanceSummary } from "./lib/memoryGovernance";
import { createConversationTurnMemoryCandidate } from "./lib/memoryCuratorRuntime";
import { createProviderRoutingConsoleItems } from "./lib/providerRoutingConsole";
import { createProviderFailureConversationReply } from "./lib/providerFallbackPlan";
import {
  createProviderReplayConversationMessage,
  createProviderReplayMemoryCandidate,
} from "./lib/providerReplayDelivery";
import { agentPrimaryDisplayName } from "./lib/agentDisplay";
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
  createNextDraftRejectedAttachmentPlans,
  reprocessMessageAttachmentsForModel,
  type AttachmentProcessingPlan,
} from "./lib/attachmentProcessing";
import {
  createCockpitLocalHealthIndicators,
  createCockpitServerSnapshotIndicator,
  resolveCockpitPayloadBindingStatus,
  sanitizeCockpitProjectionText,
} from "./lib/cockpitProjectionHealth";
import { createPermissionApprovalLedger } from "./lib/permissionApprovalLedger";
import { seededProviderProfiles } from "./seeds/providers";
import { sampleDebateSession } from "./seeds/sampleDebate";
import { resolveInitialDebateSession } from "./lib/initialDebateSession";
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
  navSections,
  terminalSlots,
} from "./seeds/conversation";
import { DashboardView } from "./components/DashboardView";
import { projectAutonomyRunHistory } from "./lib/autonomyRunHistory";
import { PERSONA_CODEX } from "./lib/personaCodex";
import { selectDailyParty } from "./lib/dailyParty";
import { planConversationSwarm, type SwarmDraft } from "./lib/conversationSwarmPlan";
import { loadHermesPool, saveHermesPool } from "./lib/hermesPoolStore";
import { acquireHermesSlot } from "./lib/hermesSlotPool";
import { summarizeHermesPool } from "./lib/hermesSlotPool";
import { personaAvatars as dashboardPersonaAvatars } from "./lib/personaAvatarSource";
import { ControlQueueDrawer } from "./components/ControlQueueDrawer";
import { AgentConfigDrawer } from "./components/AgentConfigDrawer";
import { AgentSettingsPanel } from "./components/AgentSettingsPanel";
import { AutonomyRunContainer } from "./components/AutonomyRunContainer";
import { ParallelMissionContainer } from "./components/ParallelMissionContainer";
import { CodingWorkbench } from "./components/coding/CodingWorkbench";
import { ResearchSwarmContainer } from "./components/research/ResearchSwarmContainer";
import { RmasRunView } from "./components/rmas/RmasRunView";
import { OperatorCockpit } from "./components/operator-cockpit/OperatorCockpit";
import { AgentsSidebar } from "./components/AgentsSidebar";
import { BackupRailMenu } from "./components/BackupRailMenu";
import { ChannelRailPanel } from "./components/ChannelRailPanel";
import { CodingPacketPanel } from "./components/CodingPacketPanel";
import { CheatSheetOverlay } from "./components/CheatSheetOverlay";
import { ApprovalToastBarConnector } from "./components/ApprovalToastBarConnector";
import { resolvePersonaPortraitUrl } from "./lib/personaPortrait";
import { CommandPalette, type CommandEntry } from "./components/CommandPalette";
import { AssistantInboxContainer } from "./components/inbox/AssistantInboxContainer";
import type { InboxCommand } from "./components/inbox/AssistantInbox";
import { buildInboxPaletteCommands } from "./lib/inboxPaletteCommands";
import {
  readUserViews,
  applyUserSavedInboxView,
  type UserSavedView,
} from "./lib/userSavedViews";
import { ConfigLibraryPanel } from "./components/ConfigLibraryPanel";
import { ConversationWorkbench } from "./components/ConversationWorkbench";
import { DebateAnnexPage } from "./components/debate-chamber/DebateAnnexPage";
import { EvolveMementoPanel } from "./components/EvolveMementoPanel";
import { HumanPeekPanel } from "./components/HumanPeekPanel";
import { OperationsRailPanel } from "./components/OperationsRailPanel";
import { ProjectRailPanel } from "./components/ProjectRailPanel";
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
import { createTurboEditGenerator } from "./lib/turboEditGenerator";
import { requestCompletion } from "./lib/codingAgentClient";
import { parseStoredAgentProfiles, parseStoredSelectedAgentId } from "./lib/agentProfilePersistence";
import { getRestoreFocusSelector, type FocusHistory } from "./lib/focusRestoration";
import {
  type MakimaDelegationAssignmentView,
  createMakimaDelegationWorkItems,
  type MakimaDelegationCard,
} from "./lib/makimaDelegation";
import { readJsonState, writeJsonState } from "./lib/persistentJsonState";
import { putPreviewRef, resolvePreviewRef, type ActivePreviewRef, type ActivePreviewRefMap } from "./lib/activePreviewRef";
import type { PreviewAnnotationDraft } from "./lib/previewAnnotations";
import { useProjectRecordController } from "./hooks/useProjectRecordController";
import { createInsightFindings, createMetaOnboardingSignals } from "./lib/workbenchDerived";
import { WorkItemHandoffPanel } from "./components/WorkItemHandoffPanel";
import { SummonTheater } from "./components/SummonTheater";
import { RunWorkspace, type RunMode } from "./components/RunWorkspace";
import { createMakimaDelegationCards } from "./lib/makimaDelegation";
import { AppShellNav } from "./components/AppShellNav";
import {
  appShellSections,
  defaultAppShellTabId,
  findAppShellTab,
  resolveAppShellTabForSurface,
  type AppShellSection,
  type AppShellSectionId,
  type AppShellTabId,
  type AppShellVirtualSurface,
} from "./lib/appShellIa";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/ui/sheet";
import { ReadOnlyModelCatalogPanel } from "./components/ReadOnlyModelCatalogPanel";
import { ReadOnlyMemoryLibraryPanel } from "./components/ReadOnlyMemoryLibraryPanel";
import "./styles/renewal-shell.css";

const safeVirtualSurfaces: ReadonlySet<AppShellVirtualSurface> = new Set([
  "operations_queue",
  "operations_missions",
  "system_runtime",
  "system_models",
  "library_memory",
]);

function isTabRendered(tab: { target: { nav?: string; mode?: string; virtual?: AppShellVirtualSurface | null } }): boolean {
  return Boolean(tab.target.nav || tab.target.mode || (tab.target.virtual && safeVirtualSurfaces.has(tab.target.virtual)));
}

const routeBackedShellSections: readonly AppShellSection[] = appShellSections.map((section) => ({
  ...section,
  tabs: section.tabs.filter(isTabRendered),
}));

const routeBackedDefaultTabBySection: Record<AppShellSectionId, AppShellTabId> = Object.fromEntries(
  appShellSections.map((section) => {
    const first = section.tabs.find((tab) => tab.target.nav || tab.target.mode);
    return [section.id, first?.id ?? defaultAppShellTabId];
  }),
) as Record<AppShellSectionId, AppShellTabId>;

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
  const [activeNavItem, setActiveNavItem] = useState<NavItemId>("dashboard");
  const [summonSeedPersona, setSummonSeedPersona] = useState<string | null>(null);
  const [summonSeedMode, setSummonSeedMode] = useState<RunMode>("single");
  // 대화창 "스웜 서치" → 리서치 뷰 자동 편성 시드 (주제 + 동적 4~16 요원)
  const [swarmSeed, setSwarmSeed] = useState<{ id: string; topic: string; drafts: SwarmDraft[] } | null>(null);
  const [conversationViewMode, setConversationViewMode] = useState<"chat" | "agents">("chat");
  /**
   * 가장 최근 observed Preview의 missionId/url/observedAt. PreviewRunCard가 observed 분기에서
   * publishEnvironment.onPreviewObserved → 여기로 lift. ChatSidePanel "미리보기" 탭이 이 URL을
   * 임베드한다. fake URL 0 — observed 분기에서만 갱신되고 preview_not_running/error는 건드리지 않는다.
   */
  const [activePreviewRefByMissionId, setActivePreviewRefByMissionId] = useState<ActivePreviewRefMap>({});
  const [annexInitialTab, setAnnexInitialTab] = useState<"status" | "memory" | "queue">("status");
  const [approvalDrawerOpen, setApprovalDrawerOpen] = useState(false);
  // Read-only runtime status surface (system.runtime shell tab). UI toggle only —
  // not a store; reuses the existing runtimeSnapshotState / RuntimeRailPanel.
  const [runtimeSurfaceOpen, setRuntimeSurfaceOpen] = useState(false);
  // Read-only model/provider catalog surface (system.models shell tab). UI toggle
  // only — reuses providerRoutingConsoleItems + modelCatalog; no store, no fetch.
  const [modelsSurfaceOpen, setModelsSurfaceOpen] = useState(false);
  // Read-only memory library surface (library.memory shell tab). UI toggle only —
  // reuses memoryInspector + memoryRecords + governance summary; no store, no fetch.
  const [memorySurfaceOpen, setMemorySurfaceOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // Batch 11 LINE C — one-shot view command pushed to the Assistant Inbox from the
  // Command Palette. View-only (mode/focus/category/clear); never an action.
  const [inboxCommand, setInboxCommand] = useState<InboxCommand | undefined>(undefined);
  const goInboxCommand = (kind: InboxCommand["kind"], value?: string) => {
    setActiveNavItem("command_center");
    setInboxCommand((prev) => ({ kind, value, nonce: (prev?.nonce ?? 0) + 1 }));
  };
  // Batch 12 LINE D — apply a user saved view from the palette (view-only).
  const applyInboxView = (v: UserSavedView) => {
    setActiveNavItem("command_center");
    setInboxCommand((prev) => ({ ...applyUserSavedInboxView(v), nonce: (prev?.nonce ?? 0) + 1 }));
  };
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
  const conversationMessageCountByAgentId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(conversationMessagesByAgentId).map(([agentId, messages]) => [agentId, messages.length]),
      ),
    [conversationMessagesByAgentId],
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
  // ── 대화 워크벤치 OpenCode 메커니즘 상태 (항목 1·4·6·8·10) ────────────────
  const [conversationAgentMode, setConversationAgentMode] = useState<"build" | "plan">(() => {
    try {
      return localStorage.getItem("orch.conversation.agentMode.v1") === "plan" ? "plan" : "build";
    } catch {
      return "build";
    }
  });
  const [streamingPreview, setStreamingPreview] = useState<{
    agentId: string;
    text: string;
    /** 도구 실행이 인간 승인을 기다리는 중 — 버블에 허용/계열 허용/거절 버튼을 띄운다 */
    pendingApproval?: { sourceItemId: string; command: string };
    /** 진행 중 도구 호출 라이브 칩 — 실행되는 순간부터 상태가 갱신되며 쌓인다 */
    toolCalls?: Array<{ id: string; tool: string; title: string; status: string; output?: string }>;
  } | null>(null);
  const [queuedConversationMessages, setQueuedConversationMessages] = useState<string[]>([]);
  const [sessionApprovedPrefixes, setSessionApprovedPrefixes] = useState<string[]>([]);
  const [conversationCondensateByAgentId, setConversationCondensateByAgentId] = useState<Record<string, Condensate>>({});
  const conversationTurnAbortRef = useRef<AbortController | null>(null);
  const conversationTurnCancelledRef = useRef(false);
  const conversationTurnInFlightRef = useRef(false);
  const queuedConversationMessagesRef = useRef<string[]>([]);
  const sessionApprovedPrefixesRef = useRef<string[]>([]);
  /** 에이전트별로 이미 응축한 메시지 수 — 같은 턴을 두 번 응축하지 않기 위한 워터마크 */
  const conversationCondensedUpToRef = useRef<Record<string, number>>({});

  const handleConversationAgentModeChange = useCallback((nextMode: "build" | "plan") => {
    setConversationAgentMode(nextMode);
    try {
      localStorage.setItem("orch.conversation.agentMode.v1", nextMode);
    } catch {
      // localStorage 불가 환경(테스트 등)에서는 세션 상태만 유지
    }
  }, []);

  const handleApproveCommandPattern = useCallback((command: string) => {
    const prefix = extractCommandPrefix(command);
    if (!prefix) return;
    const next = Array.from(new Set([...sessionApprovedPrefixesRef.current, prefix]));
    sessionApprovedPrefixesRef.current = next;
    setSessionApprovedPrefixes(next);
  }, []);

  const enqueueConversationMessage = useCallback((content: string) => {
    const next = [...queuedConversationMessagesRef.current, content];
    queuedConversationMessagesRef.current = next;
    setQueuedConversationMessages(next);
  }, []);

  const handleRemoveQueuedConversationMessage = useCallback((index: number) => {
    const next = queuedConversationMessagesRef.current.filter((_, i) => i !== index);
    queuedConversationMessagesRef.current = next;
    setQueuedConversationMessages(next);
  }, []);

  const dequeueConversationMessage = useCallback((): string | undefined => {
    const [next, ...rest] = queuedConversationMessagesRef.current;
    if (next === undefined) return undefined;
    queuedConversationMessagesRef.current = rest;
    setQueuedConversationMessages(rest);
    return next;
  }, []);

  const handleStopConversationTurn = useCallback(() => {
    conversationTurnCancelledRef.current = true;
    conversationTurnAbortRef.current?.abort();
  }, []);
  const conversationUsageSummaryByAgentId = useMemo(() => {
    const summaries: Record<string, ReturnType<typeof summarizeConversationUsage>> = {};
    for (const [agentId, channelMessages] of Object.entries(conversationMessagesByAgentId)) {
      summaries[agentId] = summarizeConversationUsage(channelMessages);
    }
    return summaries;
  }, [conversationMessagesByAgentId]);

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

  const [codingPacketState, setCodingPacketState] = useState<CodingPacket>(codingPacket);
  const [summonRegistry, setSummonRegistry] = useState<SummonRegistry>(() =>
    createSummonRegistry(DEFAULT_SWARM_PANES.map((pane) => ({ paneId: pane.paneId, role: pane.role }))),
  );
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
  const makimaDelegationAssignmentsByAgentId = useMemo(
    () =>
      workItems.reduce<Record<string, MakimaDelegationAssignmentView>>((assignments, item) => {
        if (
          item.status === "archived" ||
          !item.ownerAgentId ||
          !item.sourceRefs.some((source) => source.title === "Makima Delegation Console") ||
          assignments[item.ownerAgentId]
        ) {
          return assignments;
        }

        assignments[item.ownerAgentId] = {
          lane: item.lane,
          status: item.status,
          updatedAt: item.updatedAt,
          workItemId: item.id,
        };
        return assignments;
      }, {}),
    [workItems],
  );

  function handleApproveWorkItemHandoffAndRoute(handoffId: string) {
    const targetHandoff = workItemHandoffs.find((handoff) => handoff.id === handoffId);
    const targetWorkItem = targetHandoff
      ? workItems.find((item) => item.id === targetHandoff.workItemId)
      : undefined;
    const createdAt = new Date().toISOString();

    handleApproveWorkItemHandoff(handoffId);

    if (!targetHandoff || !isCodingPacketExecutionHandoff(targetHandoff)) {
      return;
    }

    const block = createCodingPacketExecutionSlotBlock({
      createdAt,
      handoff: { ...targetHandoff, approvalState: "approved" },
      packet: codingPacketState,
      sessionId: activeSessionId,
      workItem: targetWorkItem,
    });

    setTmuxTimelineBlocks((blocks) => ({
      ...blocks,
      code: [...(blocks.code ?? []), block],
    }));
    setTmuxStatuses((statuses) => ({
      ...statuses,
      code: "idle",
    }));
    setMode("tmux");
    appendEvent("coding_packet.execution_slot.ready", {
      handoffId: targetHandoff.id,
      payloadRef: targetHandoff.payloadRef,
      timelineBlockId: block.id,
      targetSurface: targetHandoff.targetSurface,
      redaction: "applied",
    });
  }

  const [cockpitFocus, setCockpitFocus] = useState<CockpitDetailFocus | undefined>();
  /**
   * Blueprint Revision applied 기록(debateId 별). 사용자가 BlueprintReviewCard에서
   * "수정안 적용"을 누른 시점의 draft + appliedAt만 저장한다(영속화 없음 — 세션 메모리).
   * Mission/scaffold/GitHub write는 절대 자동 실행하지 않는다(state 변경뿐).
   */
  const [appliedBlueprintRevisionByDebateId, setAppliedBlueprintRevisionByDebateId] = useState<
    Record<string, { draft: BlueprintRevisionDraft; appliedAt: string }>
  >({});
  /**
   * sourceSessionId(앱 빌더 진입 세션) → 생성된 missionId 매핑.
   *   - AppBuildContainer의 onCreated 콜백에서 채워진다.
   *   - debate session에 동일 sourceSessionId가 있으면 토론↔미션 매핑이 성립.
   *   - 영속화 없음(세션 메모리). 페이지 새로고침 시 비워짐 — 추측 금지.
   */
  const [missionIdBySourceSessionId, setMissionIdBySourceSessionId] = useState<Record<string, string>>({});
  // 현재 대화 세션에서 생성된 미션의 observed preview만 ChatSidePanel "미리보기"에 노출 —
  // 다른 미션의 stale URL이 새지 않도록 missionId 키로만 resolve (핸드오프 지적 사항).
  const currentMissionPreviewRef = resolvePreviewRef(
    activePreviewRefByMissionId,
    missionIdBySourceSessionId[activeSessionId],
  );
  const [previewAnnotationDraft, setPreviewAnnotationDraft] = useState<PreviewAnnotationDraft | null>(null);
  // OSS-H10 — ProjectRecord 영속화 layer. 단일 호출. RunWorkspace.boardProps로 내려보낸다.
  // 자동 rerun/provider 호출/GitHub write 0 — 단지 mission state를 missionId별로 영속화하고 RecentProjectsPanel에 노출.
  const projectRecordController = useProjectRecordController();
  // Engine E2 — read-only subscription to the shared mission store, feeding the
  // Assistant Inbox Runner Theater. getSnapshot only; no mutation, no dispatch.
  const runnerSessionsSnapshot = useSyncExternalStore(
    workbenchMissionStore.subscribe,
    workbenchMissionStore.getSnapshot,
    workbenchMissionStore.getSnapshot,
  );
  // RecentProjectsPanel "이어서" 클릭 target. MissionBoardContainer가 펼친 뒤 onResumeConsumed로 비운다.
  const [pendingResumeMissionId, setPendingResumeMissionId] = useState<string | null>(null);
  /**
   * MissionBoardContainer가 노출하는 scaffold 캐시 invalidate 함수에 대한 외부 핸들.
   * BlueprintReviewCard의 "수정안으로 스캐폴드 다시 생성" 클릭 → handler가 이 ref로 invalidate
   * 호출 → Container의 useEffect가 새 scaffold/latest를 조회. 자동 GitHub write 없음.
   */
  const refreshScaffoldHandleRef = useRef<((missionId: string) => void) | null>(null);
  const [debateSession, setDebateSession] = useState<Stage3DebateSession>(() =>
    resolveInitialDebateSession({
      sample: sampleDebateSession,
      fallback: () =>
        createStage3DebateSession({
          messages: initialConversationMessages,
          agents: seededAgentProfiles,
          providers: seededProviderProfiles,
          events: initialEventLog,
          runtime: runtimeSnapshot,
          createdAt: now,
        }),
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
  // 승인 toast 동료감(companion): 큐 항목엔 페르소나가 없으므로(requestedBy=actor enum뿐)
  // 세션의 활성 에이전트 신원을 best-effort로 넘긴다. 아바타는 사용자 업로드 우선, 없으면
  // 번들 캐릭터 초상화(personaName->role)로 폴백. 신원을 모르면 바가 actor 라벨로 정직 폴백한다.
  const approvalToastRequester = useMemo(
    () =>
      selectedAgent
        ? {
            activeAgent: {
              name: selectedAgent.personaName ?? selectedAgent.name,
              role: selectedAgent.role,
              model: selectedAgent.modelId,
              avatarUrl:
                agentVisualsById[selectedAgent.id]?.avatarDataUrl ??
                resolvePersonaPortraitUrl(selectedAgent.personaName, selectedAgent.role),
            },
          }
        : undefined,
    [agentVisualsById, selectedAgent],
  );
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
    handleBindProviderDefaultCredential,
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
    resolveProviderDefaultCredential,
    secretVaultSnapshot,
    selectedModel,
    selectedProvider,
    defaultCredentialProviderIds,
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
    const assistantMessage = createProviderReplayConversationMessage({
      approval,
      createdAt,
      id: `message_agent_replay_${crypto.randomUUID()}`,
      pending,
      result,
      targetAgent,
    });

    setConversationMessagesByAgentId((channels) =>
      updateAgentChannelMessages(channels, pending.agentId, (messages) => [...messages, assistantMessage]),
    );
    if (targetAgent) {
      const memoryScope = createAgentChannelMemoryScope(
        pending.agentId,
        pending.sessionId,
        pending.providerProfileId,
      );
      handleQueueMemoryCuratorCandidate(
        createProviderReplayMemoryCandidate({
          assistantMessage,
          createdAt,
          memoryScope,
          pending,
          targetAgent,
          trustLevel: providerProfiles.find((provider) => provider.id === pending.providerProfileId)?.trustLevel ?? "limited",
        }),
      );
    }
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
      identityGuardApplied: assistantMessage.metadata?.identityGuardApplied,
      memoryCandidateQueued: Boolean(targetAgent),
      route: result.route,
      redaction: "applied",
    }, { sessionId: pending.sessionId });
  }, [agents, appendEvent, handleQueueMemoryCuratorCandidate, pendingProviderRetry, providerProfiles]);
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
  const previousApprovalDrawerOpenRef = useRef(approvalDrawerOpen);

  useEffect(() => {
    const previousOpen = previousApprovalDrawerOpenRef.current;
    previousApprovalDrawerOpenRef.current = approvalDrawerOpen;
    if (
      shouldRefreshControlQueueOnOpen({
        isOpen: approvalDrawerOpen,
        previousOpen,
        status: approvalServerStatus,
      })
    ) {
      void handleRefreshApprovalQueue();
    }
  }, [approvalDrawerOpen, approvalServerStatus, handleRefreshApprovalQueue]);

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
  const unifiedControlQueueSnapshot = useMemo(
    () =>
      createUnifiedControlQueueSnapshot({
        approvalServerSnapshot,
        permissionSnapshot,
      }),
    [approvalServerSnapshot, permissionSnapshot],
  );
  // 승인/큐 진입의 단일 명명 핸들러 — 화면마다 인라인 () => setApprovalDrawerOpen(true)로
  // 흩어져 있던 "Control Queue 열기"를 한 곳으로 모은다(액션 동선 일관화). 배지가 가리키는
  // 수(unifiedControlQueueSnapshot.summary.pending)와 열리는 드로어 내용이 항상 같은 큐.
  const openControlQueue = useCallback(() => setApprovalDrawerOpen(true), []);
  const toggleControlQueue = useCallback(() => setApprovalDrawerOpen((open) => !open), []);
  // 대화 탭 인라인 승인 카드용: 로컬(stage9) 권한 큐에 더해 서버 승인 대기 건
  // (대화 도구 루프의 tmux dispatch 등)을 합쳐서 보여준다. 이게 없으면 도구
  // 실행이 승인을 기다리는 동안 카드가 안 떠서 턴이 멈춘 것처럼 보인다.
  const conversationPermissionSnapshot = useMemo(() => {
    const serverApprovalItems = (approvalServerSnapshot?.approvals ?? [])
      .filter((approval) => approval.state === "required")
      .map((approval) => {
        const payload = approval.replay?.payload as { commandPreview?: unknown } | undefined;
        const commandPreview =
          typeof payload?.commandPreview === "string" ? payload.commandPreview : undefined;
        return {
          id: approval.id,
          sourceItemId: approval.sourceItemId ?? approval.id,
          summary: commandPreview?.split("\n")[0]?.slice(0, 160) ?? approval.reason,
          requestedBy: approval.actor,
          action: approval.action,
          reason: approval.reason,
          sourceTrust: approval.sourceTrust,
          permissions: approval.requestedLevels,
          state: approval.state,
          createdAt: approval.createdAt,
          expiresAt: approval.expiresAt,
          replayKind: approval.replay?.kind,
        };
      });
    if (serverApprovalItems.length === 0) {
      return permissionSnapshot;
    }
    const localSourceItemIds = new Set(permissionSnapshot.queue.map((item) => item.sourceItemId));
    return {
      ...permissionSnapshot,
      queue: [
        ...permissionSnapshot.queue,
        ...serverApprovalItems.filter((item) => !localSourceItemIds.has(item.sourceItemId)),
      ],
    };
  }, [approvalServerSnapshot, permissionSnapshot]);

  /** 대화 카드 승인: 서버 승인 건이면 grant만 수행 — replay는 도구 루프 폴러가 1회 실행 (이중 실행 방지) */
  const handleConversationApprovePermission = useCallback(
    (sourceItemId: string) => {
      const serverApproval = (approvalServerSnapshot?.approvals ?? []).find(
        (approval) => (approval.sourceItemId ?? approval.id) === sourceItemId && approval.state === "required",
      );
      if (serverApproval) {
        void grantDgxApproval({
          request: {
            approvalId: serverApproval.id,
            actor: "user",
            reason: "대화 인라인 승인",
            decidedAt: new Date().toISOString(),
          },
        }).then(() => handleRefreshApprovalQueue());
        return;
      }
      handleResolvePermission(sourceItemId, "approved");
    },
    [approvalServerSnapshot, handleRefreshApprovalQueue],
  );
  const handleConversationRejectPermission = useCallback(
    (sourceItemId: string) => {
      const serverApproval = (approvalServerSnapshot?.approvals ?? []).find(
        (approval) => (approval.sourceItemId ?? approval.id) === sourceItemId && approval.state === "required",
      );
      if (serverApproval) {
        void rejectDgxApproval({
          request: {
            approvalId: serverApproval.id,
            actor: "user",
            reason: "대화 인라인 거절",
            decidedAt: new Date().toISOString(),
          },
        }).then(() => handleRefreshApprovalQueue());
        return;
      }
      handleResolvePermission(sourceItemId, "rejected");
    },
    [approvalServerSnapshot, handleRefreshApprovalQueue],
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
    if (!selectedModel || draftAttachments.length === 0) {
      return;
    }
    const result = reprocessMessageAttachmentsForModel({
      attachments: draftAttachments,
      maxAttachmentCount: maxDraftAttachments,
      modelModalities: getModelInputModalities(selectedModel),
    });
    setDraftAttachments(result.attachments);
    setDraftRejectedAttachmentPlans((current) =>
      createNextDraftRejectedAttachmentPlans({
        acceptedAttachmentCount: result.attachments.length,
        currentRejectedPlans: current,
        incomingRejectedPlans: result.rejectedPlans,
        maxRejectedPlanCount: maxDraftAttachments,
      }),
    );
    if (result.rejectedPlans.length > 0) {
      appendEvent("conversation.attachment.reprocessed", {
        selectedModelId: selectedModel.id,
        acceptedCount: result.attachments.length,
        rejectedCount: result.rejectedPlans.length,
        processingPlans: result.processingPlans,
        attachmentStorage: "metadata_only",
        reason: "selected model changed",
        redaction: "metadata_only",
      });
    }
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

  function handleAddDraftAttachments(fileList: FileList | File[] | null) {
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
    const acceptedPairs = incomingFiles.flatMap((file, index) => {
      const plan = processingPlans[index];
      if (!plan || plan.status !== "accepted") return [];
      return [
        {
          file,
          attachment: {
            ...createDraftAttachment(file),
            processingMode: plan.processingMode,
            processingStatus: plan.status,
            processingReason: plan.reason,
          },
        },
      ];
    });
    const nextAttachments = acceptedPairs.map((pair) => pair.attachment);
    const rejectedPlans = processingPlans.filter((plan) => plan.status === "rejected");

    if (nextAttachments.length === 0) {
      setDraftRejectedAttachmentPlans([]);
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
    // 항목 3 — 첨부 바이트 읽기: 이미지→dataURL(≤4MB), 텍스트류→본문 인라인(≤64K).
    // 비동기로 채워 넣고, 읽기 실패 시 메타데이터 전용 전송으로 자연 강등된다.
    for (const pair of acceptedPairs) {
      void readAttachmentContent(pair.file, pair.attachment).then((hydrated) => {
        if (hydrated === pair.attachment) return;
        setDraftAttachments((current) =>
          current.map((entry) => (entry.id === pair.attachment.id ? { ...entry, ...hydrated } : entry)),
        );
      });
    }
    setDraftRejectedAttachmentPlans((current) =>
      createNextDraftRejectedAttachmentPlans({
        acceptedAttachmentCount: nextAttachments.length,
        currentRejectedPlans: current,
        incomingRejectedPlans: rejectedPlans,
        maxRejectedPlanCount: maxDraftAttachments,
      }),
    );
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
    onDelta,
    abortSignal,
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
    onDelta?: (textSoFar: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<WorkbenchCompletionResult> {
    const completionContext = resolveAgentCompletionContext({
      agent,
      channels: conversationMessagesByAgentId,
      fallbackProviderProfileId: provider.id ?? agent.providerProfileId ?? "provider_unassigned",
      sessionId: activeSessionId,
    });
    const recallMessages = createCompletionMemoryRecallMessages(
      completionContext.previousMessages,
      userMessage,
    );
    const targetMemoryInspector = await createScopedMemoryInspector(
      completionContext.memoryScope,
      recallMessages,
      provider,
    );
    const condensate = conversationCondensateByAgentId[agent.id];
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
      agentMode: conversationAgentMode,
      condensedSummary: condensate ? renderCondensate(condensate) : undefined,
      // 위임 서브에이전트 응답에서 tool 펜스가 나오면 위임 합성이 깨지므로 primary 턴에만 도구 지시를 넣는다
      toolLoopEnabled: purpose === "primary",
    });
    const pipelineMetadata = pipelineMessages[0]?.metadata ?? {};
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
    const result = await withBackoffRetry(
      () =>
        requestDgxProviderCompletion({
          provider,
          modelId,
          messages: pipelineMessages,
          approvalState,
          permissionDecision,
          localSecretResolver: resolveProviderDefaultCredential,
          onDelta,
          abortSignal,
        }),
      {
        onRetry: ({ attempt, delayMs, error }) =>
          appendEvent("provider.completion.retried", {
            agentId: agent.id,
            providerProfileId: provider.id,
            modelId,
            attempt,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
            purpose,
          }),
      },
    );
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
        personaDisplayName: pipelineMetadata.personaDisplayName,
        personaIdentityKey: pipelineMetadata.personaIdentityKey,
        personaSoulApplied: pipelineMetadata.personaSoulApplied,
        personaAgentsMdApplied: pipelineMetadata.personaAgentsMdApplied,
        personaSafetyApplied: pipelineMetadata.personaSafetyApplied,
        personaFragmentsInjected: pipelineMetadata.personaFragmentsInjected,
        personaSoulMdPath: pipelineMetadata.personaSoulMdPath,
        personaAgentsMdPath: pipelineMetadata.personaAgentsMdPath,
        recallTraceId: pipelineMetadata.recallTraceId,
        realProviderCall: true,
        identityGuardApplied: guardedReply.guardApplied,
        purpose,
      },
      pipelineMessages: pipelineMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
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
        window.setTimeout(() => {
          setAgentActivity(targetAgent.id, "tooling");
        }, 120);
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
        setAgentActivity(targetAgent.id, "error");
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
        }, 900);
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

  /** 시스템 알림용 어시스턴트 메시지 (슬래시 명령·롤백 결과 등 — 프로바이더 호출 아님) */
  function appendConversationNotice(
    noticeContent: string,
    sessionId: string,
    extraMetadata: Record<string, unknown> = {},
  ) {
    const notice: ConversationMessage = {
      id: `message_notice_${crypto.randomUUID()}`,
      sessionId,
      role: "assistant",
      content: noticeContent,
      createdAt: new Date().toISOString(),
      metadata: {
        agentId: selectedAgent?.id,
        notice: true,
        realProviderCall: false,
        ...extraMetadata,
      },
    };
    if (activeSessionIdRef.current === sessionId) {
      setConversationMessages((messages) => [...messages, notice]);
    }
    appendEvent("conversation.message.created", {
      messageId: notice.id,
      role: "assistant",
      content: notice.content,
      metadata: notice.metadata,
      redaction: "applied",
    }, { sessionId });
  }

  /**
   * 항목 6 — 파이프라인이 프롬프트에서 떨어뜨리는(마지막 8턴 이전) 메시지를
   * MT-OSC 응축기로 압축해 다음 턴 시스템 프롬프트에 주입한다. 이미 응축한
   * 구간은 건너뛰어 중복 응축을 막는다.
   */
  function compactConversationForAgent(agentId: string, sessionId: string, trigger: "auto" | "manual"): boolean {
    const channelMessages = conversationMessagesByAgentId[agentId] ?? [];
    const alreadyCondensedUpTo = conversationCondensedUpToRef.current[agentId] ?? 0;
    const condenseEnd = Math.max(alreadyCondensedUpTo, channelMessages.length - 8);
    const window: CondenserTurn[] = channelMessages
      .slice(alreadyCondensedUpTo, condenseEnd)
      .filter((message) => message.role === "user" || message.role === "assistant")
      .filter((message) => message.metadata?.notice !== true)
      .map((message) => ({
        id: message.id,
        role: message.role as "user" | "assistant",
        text: message.content,
      }));
    if (window.length === 0) {
      return false;
    }
    conversationCondensedUpToRef.current[agentId] = condenseEnd;
    // P1-6: 해당 에이전트의 페르소나(SOUL.md 요약/금지 스타일/예시 대화)로 Covenant를
    // 만들어, 압축 시 캐릭터 정체성·말투 발화가 소실되지 않게 한다.
    const covenant = buildCovenantFromPersona(agentPersonaById[agentId]);
    const next = condense({ prior: conversationCondensateByAgentId[agentId] ?? null, window, covenant });
    setConversationCondensateByAgentId((current) => ({ ...current, [agentId]: next }));
    appendEvent("conversation.compacted", {
      agentId,
      trigger,
      pairCount: next.pairs.length,
      tokenEstimate: next.tokenEstimate,
      version: next.version,
    }, { sessionId });
    return true;
  }

  /** 항목 9 + P1-5 — 턴 롤백: 대화 절단 + git 스냅샷 기반 파일 복원 명령 안내 */
  function handleRollbackConversationTurn(assistantMessageId: string) {
    const sessionId = activeSessionIdRef.current;
    const rolledMessage = conversationMessages.find((m) => m.id === assistantMessageId);
    const result = rollbackToTurn(conversationMessages, assistantMessageId);
    if (!result) return;
    setConversationMessages(() => result.messages);
    appendEvent("conversation.turn.rolled_back", {
      assistantMessageId,
      removedCount: result.removedCount,
      touchedFiles: result.touchedFiles,
    }, { sessionId });
    if (result.touchedFiles.length > 0) {
      // P1-5: 턴 스냅샷 ref가 있으면 그 시점으로, 없으면 HEAD 기준으로 복원.
      // git checkout은 파괴적이라 자동 실행하지 않고 명령을 제시한다(비파괴 원칙).
      const baseRef = (rolledMessage?.metadata?.snapshotRef as string | undefined) ?? "HEAD";
      const restoreCommand = buildRestoreFilesCommand(baseRef, result.touchedFiles);
      const lines = [
        `턴을 되돌렸습니다 (메시지 ${result.removedCount}개 제거).`,
        "이 턴이 변경한 파일:",
        ...result.touchedFiles.map((file) => `- ${file}`),
      ];
      if (restoreCommand) {
        lines.push(
          "",
          `파일도 ${baseRef === "HEAD" ? "마지막 커밋" : "턴 시작 시점"}으로 되돌리려면 이 명령을 실행하세요(코딩 탭/터미널):`,
          "```",
          restoreCommand,
          "```",
        );
      }
      appendConversationNotice(lines.join("\n"), sessionId, {
        rollback: true,
        rolledBackMessageId: assistantMessageId,
        snapshotRef: baseRef,
      });
    }
  }

  /** 항목 4·6·7 — 대화 전용 슬래시 명령 */
  function handleConversationSlashCommand(command: ConversationSlashCommand, sessionId: string) {
    switch (command.kind) {
      case "plan":
      case "build": {
        handleConversationAgentModeChange(command.kind);
        appendEvent("conversation.agent_mode.changed", { agentMode: command.kind, via: "slash" }, { sessionId });
        appendConversationNotice(
          command.kind === "plan"
            ? "PLAN 모드로 전환했습니다 — 변경 도구(bash/write/edit)는 차단되고 읽기/분석만 수행합니다."
            : "BUILD 모드로 전환했습니다 — 모든 도구가 승인 게이트를 거쳐 실행됩니다.",
          sessionId,
          { slashCommand: command.kind },
        );
        return;
      }
      case "compact": {
        const compacted = selectedAgent ? compactConversationForAgent(selectedAgent.id, sessionId, "manual") : false;
        appendConversationNotice(
          compacted
            ? "이전 턴을 압축했습니다. 요약은 다음 턴부터 시스템 프롬프트에 주입됩니다."
            : "압축할 이전 턴이 없습니다 (최근 8턴은 항상 원문으로 유지).",
          sessionId,
          { slashCommand: "compact" },
        );
        return;
      }
      case "fork": {
        const brief = buildForkBrief({ messages: conversationMessages, draft: command.task });
        const mission = forkMissionFromConversation({
          brief,
          model: selectedModel?.id,
          sessionTitle: activeSessionId,
        });
        workbenchMissionStore.add(mission);
        appendEvent("conversation.forked", {
          missionId: mission.id,
          task: brief.task,
          mentionCount: brief.mentions.length,
        }, { sessionId });
        appendConversationNotice(
          `대화를 미션으로 포크했습니다: "${brief.task}"\n코딩 워크벤치 미션 보드에서 격리 실행 후 diff/verify 게이트로 검토하세요.`,
          sessionId,
          { slashCommand: "fork", missionId: mission.id },
        );
        return;
      }
      case "help":
      case "unknown":
      default: {
        appendConversationNotice(
          command.kind === "unknown"
            ? `알 수 없는 명령: /${command.name}\n\n${CONVERSATION_SLASH_HELP}`
            : CONVERSATION_SLASH_HELP,
          sessionId,
          { slashCommand: command.kind },
        );
        return;
      }
    }
  }

  async function handleSendMessageStage2(overrideContent?: string) {
    const content = (overrideContent ?? draftMessage).trim();
    if ((!content && draftAttachments.length === 0) || !selectedAgent || !selectedProvider) {
      return;
    }

    const targetSessionId = activeSessionIdRef.current;
    const createdAt = new Date().toISOString();

    // 슬래시 명령 (항목 4·6·7) — "/etc/..." 같은 경로성 입력은 명령으로 취급하지 않음
    if (content.startsWith("/")) {
      const slash = parseConversationSlashCommand(content);
      if (slash && (slash.kind !== "unknown" || /^[a-z]+$/i.test(slash.name))) {
        handleConversationSlashCommand(slash, targetSessionId);
        if (!overrideContent) setDraftMessage("");
        return;
      }
    }

    // 항목 8 — 에이전트가 턴 진행 중이면 큐에 적재, 턴이 끝나면 자동 발송
    if (conversationTurnInFlightRef.current) {
      enqueueConversationMessage(content);
      appendEvent("conversation.message.queued", {
        position: queuedConversationMessagesRef.current.length,
        contentLength: content.length,
      }, { sessionId: targetSessionId });
      if (!overrideContent) setDraftMessage("");
      return;
    }
    const authLabel = selectedAgent.authBinding?.label ?? "인증 정보 대기";
    const authMode = selectedAgent.authBinding?.mode ?? "provider_profile";
    // 항목 5 — 워크로드 기반 라우팅: plan 모드는 같은 프로바이더의 저비용 모델로
    const baseModelId = selectedModel?.id ?? selectedAgent.modelId ?? selectedProvider.defaultModel ?? "모델 대기";
    const workloadRouting = selectModelForWorkload({
      agentMode: conversationAgentMode,
      selectedModelId: baseModelId,
      catalogForProvider: modelCatalog[selectedProvider.id] ?? [],
    });
    const modelId = workloadRouting.modelId;
    const attachmentRecheck = selectedModel
      ? reprocessMessageAttachmentsForModel({
        attachments: draftAttachments,
        maxAttachmentCount: maxDraftAttachments,
        modelModalities: getModelInputModalities(selectedModel),
      })
      : { attachments: draftAttachments, rejectedPlans: [], processingPlans: [] };
    const attachments = attachmentRecheck.attachments;
    const allRejectedPlans = createNextDraftRejectedAttachmentPlans({
      acceptedAttachmentCount: attachments.length,
      currentRejectedPlans: draftRejectedAttachmentPlans,
      incomingRejectedPlans: attachmentRecheck.rejectedPlans,
      maxRejectedPlanCount: maxDraftAttachments,
    });
    const messageContent = content || `첨부 ${attachments.length}개`;
    const attachmentMetadata = attachments.map((attachment) => ({ ...attachment }));
    const attachmentProcessingPlans = createAttachmentProcessingPlansForMessage({
      attachments: attachmentMetadata,
      rejectedPlans: allRejectedPlans,
    });
    if (!content && attachments.length === 0) {
      const blockedReason =
        attachmentRecheck.rejectedPlans[0]?.reason ??
        allRejectedPlans[0]?.reason ??
        "선택 모델이 첨부를 처리할 수 없음";
      setDraftRejectedAttachmentPlans(allRejectedPlans.slice(-maxDraftAttachments));
      appendEvent("conversation.attachment.blocked", {
        selectedModelId: selectedModel?.id ?? modelId,
        reason: blockedReason,
        attemptedCount: draftAttachments.length,
        processingPlans: attachmentRecheck.processingPlans,
        attachmentStorage: "metadata_only",
      }, { sessionId: targetSessionId });
      return;
    }
    if (attachmentRecheck.rejectedPlans.length > 0) {
      appendEvent("conversation.attachment.reprocessed", {
        selectedModelId: selectedModel?.id ?? modelId,
        acceptedCount: attachments.length,
        rejectedCount: attachmentRecheck.rejectedPlans.length,
        processingPlans: attachmentRecheck.processingPlans,
        attachmentStorage: "metadata_only",
        redaction: "metadata_only",
      }, { sessionId: targetSessionId });
    }
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
          sessionId: targetSessionId,
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
      setAgentActivity(selectedAgent.id, providerNeedsApproval ? "waiting_approval" : "error");
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
    appendEvent("provider.completion.requested", {
      agentId: selectedAgent.id,
      providerProfileId: selectedProvider.id,
      modelId,
      authMode,
      authLabel,
      routePreference: isDgxRoutedProvider(selectedProvider) ? "server_proxy" : "direct_provider",
      agentMode: conversationAgentMode,
      workloadRoutedBy: workloadRouting.routedBy,
      workloadRoutingReason: workloadRouting.reason,
    }, { sessionId: targetSessionId });
    setAgentActivity(selectedAgent.id, "tooling");

    // 항목 1 — 턴 수명주기: 스트리밍 미리보기 + 중지(abort) 지원
    const turnAbortController = new AbortController();
    conversationTurnAbortRef.current = turnAbortController;
    conversationTurnCancelledRef.current = false;
    conversationTurnInFlightRef.current = true;
    // 안전망: 어떤 단계(스트림/도구/승인 폴링/진단)에서 hang하든 턴이 영원히
    // in-flight로 남지 않도록 하드 데드라인을 건다. 만료 시 abort → catch가
    // 부분 응답을 확정하고 finally가 inFlight를 풀어 큐가 다시 흐른다.
    const TURN_HARD_DEADLINE_MS = 8 * 60_000;
    const turnDeadlineTimer = window.setTimeout(() => {
      conversationTurnCancelledRef.current = true;
      turnAbortController.abort();
    }, TURN_HARD_DEADLINE_MS);
    let streamedSoFar = "";
    let liveToolCalls: Array<{ id: string; tool: string; title: string; status: string; output?: string }> = [];
    const reportDelta = (text: string) => {
      streamedSoFar = text;
      setStreamingPreview({ agentId: selectedAgent.id, text, toolCalls: liveToolCalls });
    };

    let reply = "";
    let completionMetadata: Record<string, unknown> = {};
    let toolCallsMetadata: Array<Record<string, unknown>> | undefined;
    let diagnosticsMetadata: Record<string, unknown> | undefined;
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
        onDelta: reportDelta,
        abortSignal: turnAbortController.signal,
      });
      reply = result.content;
      completionMetadata = {
        ...result.metadata,
        ...(workloadRouting.routedBy === "workload"
          ? { workloadRoutedModelId: modelId, workloadRoutingReason: workloadRouting.reason }
          : {}),
      };

      // 항목 2·10·13 — 응답에 tool 펜스가 있으면 게이트 도구 루프 실행
      if (result.pipelineMessages && replyRequestsTools(reply) && !conversationTurnCancelledRef.current) {
        const turnId = crypto.randomUUID().slice(0, 8);
        let gateSequence = 0;
        // 인간 승인으로 넘어가는 순간: 승인 대기열을 새로고침해 인라인 카드를 띄우고,
        // 드래프트 버블에 대기 상태를 노출한다 (안 그러면 "정체"처럼 보인다)
        const humanWithVisibility = async (sourceItemId: string, context: { command: string }) => {
          void handleRefreshApprovalQueue();
          setStreamingPreview({
            agentId: selectedAgent.id,
            text: `${streamedSoFar.trim() ? `${streamedSoFar}\n\n` : ""}⏳ 승인 대기: ${context.command.slice(0, 120)}`,
            pendingApproval: { sourceItemId, command: context.command },
          });
          return pollForApprovalDecision({ sourceItemId, timeoutMs: 300_000 });
        };
        const approvalStrategy = createPatternApprovalStrategy({
          base: createAutoApproveStrategy({ fallback: humanWithVisibility }),
          getApprovedPrefixes: () => sessionApprovedPrefixesRef.current,
          grant: async (sourceItemId, context) => {
            const grantResult = await grantDgxApproval({
              request: { sourceItemId, actor: "user", reason: `세션 패턴 승인: ${context.prefix}` },
            });
            return "status" in grantResult && grantResult.status === "approved";
          },
        });
        const effects = createClosedLoopEffects({
          sessionId: targetSessionId,
          role: "code",
          paneId: "role:code",
          awaitApprovalDecision: approvalStrategy,
          newId: (stepIndex) => `conv_${turnId}_h${gateSequence++}_${stepIndex}`,
          now: () => new Date().toISOString(),
        });
        const gatedExecutor = createGatedToolExecutor(effects);
        // BUILD 모드 파일 도구(write/edit/read/grep/glob/todo)는 자동 승인 —
        // 모드 토글이 곧 사용자의 사전 승인이며, 승인 기록은 서버에 그대로 남는다.
        // 파일 쓸 때마다 사람 클릭을 기다리며 턴이 멈추던 흐름을 제거한다 (Codex 방식).
        // bash만 safe-prefix 자동 / 위험 명령 인간 게이트를 유지한다.
        let autoGateSequence = 0;
        const autoGrantEffects = createClosedLoopEffects({
          sessionId: targetSessionId,
          role: "code",
          paneId: "role:code",
          awaitApprovalDecision: async (sourceItemId) => {
            const granted = await grantDgxApproval({
              request: {
                sourceItemId,
                actor: "user",
                reason: "BUILD 모드 파일 도구 사전 승인 (대화 도구 루프)",
                decidedAt: new Date().toISOString(),
              },
            });
            return "status" in granted && granted.status === "approved" ? "approved" : "rejected";
          },
          newId: (stepIndex) => `conv_${turnId}_a${autoGateSequence++}_${stepIndex}`,
          now: () => new Date().toISOString(),
        });
        const autoGrantExecutor = createGatedToolExecutor(autoGrantEffects);

        // P1-5: 턴 시작 비파괴 스냅샷(git stash create). build 모드에서만, 실패해도
        // 턴은 계속 진행. 스냅샷 ref를 어시스턴트 메시지 메타에 남겨 롤백 시 정확한
        // 복원 기준으로 쓴다(없으면 HEAD).
        let turnSnapshotRef: string | undefined;
        if (conversationAgentMode === "build") {
          try {
            const snapId = `snap_${turnId}`;
            const snap = await autoGrantExecutor({
              id: `${turnId}_snap`,
              tool: "bash",
              title: "턴 스냅샷",
              input: { command: buildCreateSnapshotCommand(snapId) },
              status: "proposed",
            });
            turnSnapshotRef = resolveSnapshotRef(parseSnapshotOutput(snap.output)) ?? undefined;
          } catch {
            // 스냅샷 실패는 무시 — 롤백 시 HEAD 기준으로 폴백
          }
        }

        const toolLoop = await runConversationToolLoop({
          initialReply: reply,
          baseMessages: result.pipelineMessages.filter(
            (message): message is WireMessage => message.role !== "tool",
          ),
          agentMode: conversationAgentMode,
          complete: async (wireMessages, hooks) => {
            const completion = await requestDgxProviderCompletion({
              provider: selectedProvider,
              modelId,
              messages: wireMessages.map((message) => ({
                id: `message_toolloop_${crypto.randomUUID()}`,
                sessionId: targetSessionId,
                role: message.role,
                content: message.content,
                createdAt: new Date().toISOString(),
              })),
              approvalState: providerApprovalState,
              permissionDecision: providerApprovalState === "approved" ? "allow" : undefined,
              localSecretResolver: resolveProviderDefaultCredential,
              onDelta: hooks.onDelta,
              abortSignal: turnAbortController.signal,
            });
            return { content: completion.content, usage: completion.usage };
          },
          executeTool: async (call) => {
            workspaceChangeLedger.recordToolCall(call);
            // 파일 도구(write/edit/read/grep/glob/todo)는 항상 자동 승인.
            if (call.tool !== "bash") return autoGrantExecutor(call);
            // BUILD 모드 bash: 위험 명령(rm/sudo/curl/git push 등 DANGEROUS_PATTERN)만
            // 인간 게이트로 묻고, mkdir·tsc·ls·node 같은 일반 빌드 명령은 자동 진행한다.
            // (PLAN 모드면 bash 자체가 도구 루프 진입 전에 차단된다.)
            const command = String((call.input as { command?: unknown }).command ?? "");
            return DANGEROUS_PATTERN.test(command) ? gatedExecutor(call) : autoGrantExecutor(call);
          },
          makeToolId: (round, index) => `tool_${turnId}_${round}_${index}`,
          onEvent: (event) => {
            if (event.type === "assistant_delta") reportDelta(event.text);
            if (event.type === "tool_status") {
              // 도구 호출이 시작되는 순간부터 라이브 칩으로 버블에 쌓고, 같은 id는
              // 상태만 갱신한다 — 작업 끝까지 기다리지 않고 진행 과정을 그대로 본다.
              const chip = {
                id: event.call.id,
                tool: event.call.tool,
                title: event.call.title,
                status: event.call.status,
                output: typeof event.call.output === "string" ? event.call.output.slice(0, 2000) : undefined,
              };
              const existingIndex = liveToolCalls.findIndex((c) => c.id === chip.id);
              liveToolCalls =
                existingIndex >= 0
                  ? liveToolCalls.map((c, i) => (i === existingIndex ? chip : c))
                  : [...liveToolCalls, chip];
              setStreamingPreview({
                agentId: selectedAgent.id,
                text: streamedSoFar,
                toolCalls: liveToolCalls,
              });
              appendEvent("conversation.tool.status", {
                toolCallId: event.call.id,
                tool: event.call.tool,
                status: event.call.status,
                title: event.call.title,
                round: event.round,
              }, { sessionId: targetSessionId });
            }
            if (event.type === "diagnostics") {
              const chip = {
                id: event.call.id,
                tool: event.call.tool,
                title: event.call.title,
                status: event.call.status,
                output: typeof event.call.output === "string" ? event.call.output.slice(0, 2000) : undefined,
              };
              liveToolCalls = [...liveToolCalls.filter((c) => c.id !== chip.id), chip];
              setStreamingPreview({ agentId: selectedAgent.id, text: streamedSoFar, toolCalls: liveToolCalls });
              appendEvent("conversation.diagnostics.completed", {
                command: event.call.title,
                ok: event.ok,
              }, { sessionId: targetSessionId });
            }
          },
          isCancelled: () => conversationTurnCancelledRef.current,
          // P1-4: build 모드는 다단계 검증(타입체크 → 린트)을 순차로 돌리고,
          // 실패 시 구조화 에러를 모델에 주어 edit/write로 자기수정하게 한다.
          diagnosticsCommands:
            conversationAgentMode === "build"
              ? ["pnpm exec tsc --noEmit", "pnpm exec eslint ."]
              : undefined,
        });
        reply = toolLoop.finalContent.trim() ? toolLoop.finalContent : reply;
        toolCallsMetadata = toolLoop.toolCalls.map((call) => ({
          id: call.id,
          tool: call.tool,
          title: call.title,
          status: call.status,
          input: call.input,
          output: typeof call.output === "string" ? call.output.slice(0, 2000) : undefined,
        }));
        if (toolLoop.diagnostics) {
          diagnosticsMetadata = {
            command: toolLoop.diagnostics.command,
            ok: toolLoop.diagnostics.ok,
            output: toolLoop.diagnostics.output.slice(0, 2000),
          };
        }
        completionMetadata = {
          ...completionMetadata,
          toolLoopRounds: toolLoop.rounds,
          toolLoopStatus: toolLoop.status,
          ...(turnSnapshotRef ? { snapshotRef: turnSnapshotRef } : {}),
        };
      }

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
      if (conversationTurnCancelledRef.current || turnAbortController.signal.aborted) {
        // 항목 1 — 중지: 부분 스트림이 있으면 그대로 확정, 없으면 중단 알림만
        reply = streamedSoFar.trim()
          ? `${streamedSoFar}\n\n(사용자가 응답 생성을 중단함 — 부분 응답)`
          : "(사용자가 응답 생성을 중단했습니다)";
        completionMetadata = {
          cancelled: true,
          realProviderCall: Boolean(streamedSoFar.trim()),
          partialLength: streamedSoFar.length,
        };
        setAgentActivity(selectedAgent.id, "idle");
        appendEvent("provider.completion.cancelled", {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          modelId,
          partialLength: streamedSoFar.length,
        }, { sessionId: targetSessionId });
      } else if (error instanceof ProviderCompletionPermissionRequiredError) {
        const permissionItemId = error.sourceItemId ?? error.approvalId ?? providerPermissionId;
        setPendingProviderRetry({
          permissionItemId,
          sessionId: targetSessionId,
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
        setAgentActivity(selectedAgent.id, "waiting_approval");
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
          agentDisplayName: agentPrimaryDisplayName(selectedAgent),
          errorMessage,
          provider: selectedProvider,
          providers: providerProfiles,
        });
        completionMetadata = {
          error: errorMessage,
          realProviderCall: false,
        };
        setAgentActivity(selectedAgent.id, "error");
        appendEvent("provider.completion.dgx.failed", {
          agentId: selectedAgent.id,
          providerProfileId: selectedProvider.id,
          modelId,
          error: errorMessage,
        }, { sessionId: targetSessionId });
      }
    } finally {
      window.clearTimeout(turnDeadlineTimer);
      conversationTurnInFlightRef.current = false;
      conversationTurnAbortRef.current = null;
      setStreamingPreview(null);
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
        ...(toolCallsMetadata && toolCallsMetadata.length > 0 ? { toolCalls: toolCallsMetadata } : {}),
        ...(diagnosticsMetadata ? { diagnostics: diagnosticsMetadata } : {}),
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
        agentName: agentPrimaryDisplayName(selectedAgent),
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
      const nextActivity: AgentActivityStatus = completionMetadata.requiresServerApproval
        ? "waiting_approval"
        : completionMetadata.error
          ? "error"
          : "responding";
      setAgentActivity(selectedAgent.id, nextActivity);
      setConversationMessages((messages) => [...messages, assistantMessage]);
      prependAssistantDraft(assistantDraft);
      updateWorkItem(workItem.id, {
        lane: completionMetadata.realProviderCall ? "check" : "ask",
        status: completionMetadata.realProviderCall ? "drafted" : "waiting_input",
        updatedAt: assistantMessage.createdAt,
      });
      if (nextActivity === "responding") {
        window.setTimeout(() => {
          setAgentActivity(selectedAgent.id, "idle");
        }, 450);
      }
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

    // 항목 6 — 컨텍스트 90% 초과 시 자동 압축 (다음 턴부터 응축 요약 주입)
    const turnUsage = completionMetadata.usage as { inputTokens?: number } | undefined;
    if (
      shouldAutoCompactConversation({
        lastInputTokens: turnUsage?.inputTokens,
        contextWindow: selectedModel?.contextWindow,
      })
    ) {
      compactConversationForAgent(selectedAgent.id, targetSessionId, "auto");
    }

    // 항목 8 — 턴이 끝났으니 큐 선두 메시지를 자동 발송
    const nextQueued = dequeueConversationMessage();
    if (nextQueued) {
      window.setTimeout(() => {
        void handleSendMessageStage2(nextQueued);
      }, 80);
    }
  }

  function handleCreateCodingPacket(sourceMode: CenterMode = mode) {
    const createdAt = new Date().toISOString();

    const {
      packet: nextPacket,
      readinessState,
      handoff,
      workItem,
    } = sourceMode === "debate" || sourceMode === "annex"
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
    const executionSlotBlock = createCodingPacketExecutionSlotBlock({
      createdAt,
      handoff,
      packet: nextPacket,
      routeState: "pending_approval",
      sessionId: activeSessionId,
      workItem,
    });
    setTmuxTimelineBlocks((current) => ({
      ...current,
      code: [...(current.code ?? []), executionSlotBlock],
    }));
    setTmuxStatuses((current) => ({
      ...current,
      code: "blocked",
    }));
    appendEvent("coding_packet.created", {
      packet: nextPacket,
      goal: nextPacket.goal,
      contextPackTier,
      adoptedBranchCount: adoptedBranchSummaries.length,
      contextCount: nextPacket.context.length,
      decisionCount: nextPacket.decisions.length,
      filesToInspect: nextPacket.filesToInspect,
      sourceMode: sourceMode === "debate" || sourceMode === "annex" ? "debate" : "conversation",
      debateReadiness: readinessState,
      executionSlotTimelineBlockId: executionSlotBlock.id,
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

  async function handlePromoteToDebate(seed?: { blueprintContext?: DesignBlueprintInput; sourceSessionId?: string }) {
    // 앱빌더 검토 패널에서 넘어온 경우 편집 초안/출처 세션을 토론에 **실제로** 싣는다.
    // 명령 팔레트/버튼 등 인자 없이 불릴 수도 있으므로(이벤트 객체 포함) blueprintContext가
    // 실제 초안일 때만 사용한다 — 아니면 기존 conversation-only 동작.
    const blueprintContext = seed && typeof seed === "object" && "blueprintContext" in seed ? seed.blueprintContext : undefined;
    const sourceSessionId = seed && typeof seed === "object" && "sourceSessionId" in seed ? seed.sourceSessionId : undefined;
    const input = {
      messages: conversationMessages,
      agents,
      providers: providerProfiles,
      events: eventLog,
      runtime: runtimeSnapshotState,
      blueprintContext,
      sourceSessionId,
    };
    // Show the skeleton immediately (rounds pending) and switch to the chamber,
    // then run the REAL multi-agent engine to fill rounds with live responses.
    const skeleton = createStage3DebateSession(input);
    skeleton.runState = "running";
    setDebateSession(skeleton);
    setMode("debate");
    appendEvent("debate.context.promoted", {
      debateId: skeleton.id,
      participantCount: skeleton.participants.length,
      roundCount: skeleton.rounds.length,
      problemLength: skeleton.problem.length,
      // provenance — 앱빌더 초안에서 왔으면 출처 세션/초안 제목을 trace에 남긴다.
      ...(sourceSessionId ? { sourceSessionId } : {}),
      ...(blueprintContext ? { fromBlueprint: true, blueprintTitle: blueprintContext.title } : {}),
    });
    appendEvent("debate.round.started", {
      debateId: skeleton.id,
      roundId: skeleton.rounds[0]?.id,
      kind: skeleton.rounds[0]?.kind,
    });

    try {
      const live = await runStage3DebateSession({ ...input, debateId: skeleton.id });
      live.runState = "live";
      // point 5: 초안 출처 토론이면 종료 후 리뷰를 도출(자동 적용·미션 생성 없음 — 표시·trace용).
      // 일반 대화 토론(blueprintContext 없음)이면 undefined → 리뷰가 붙지 않는다.
      const blueprintReview = computeBlueprintReviewForSession({
        ...live,
        blueprintContext,
        sourceSessionId,
      });
      const finalSession = blueprintReview ? { ...live, blueprintReview } : live;
      setDebateSession(finalSession);
      appendEvent("debate.run.completed", {
        debateId: live.id,
        roundCount: live.rounds.length,
        utteranceCount: live.rounds.reduce((sum, round) => sum + round.utterances.length, 0),
      });
      if (blueprintReview) {
        // redacted summary만 — raw 초안/화면 본문은 trace에 넣지 않는다. 모델 출력이라 generated.
        appendEvent("debate.blueprint.reviewed", {
          debateId: live.id,
          blueprintTitle: blueprintReview.blueprintTitle,
          adoptedCount: blueprintReview.adopted.length,
          rejectedCount: blueprintReview.rejected.length,
          riskCount: blueprintReview.risks.length,
          blueprintDeltaCount: blueprintReview.blueprintDelta.length,
          recommendedNextAction: blueprintReview.recommendedNextAction,
          truthStatus: blueprintReview.truthStatus,
          redaction: "applied",
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setDebateSession((current) =>
        current.id === skeleton.id ? { ...current, runState: "error", runError: reason } : current,
      );
      appendEvent("debate.run.failed", { debateId: skeleton.id, reason });
    }
  }

  function handleRunOsDebate() {
    const roadmap = createExperienceRoadmap({
      diagnostics: cockpitReadiness.diagnostics,
      maturity: cockpitReadiness.maturity,
      snapshot: cockpitSnapshot,
      workTraceItems: cockpitReadiness.workTraceItems,
    });
    const session = createOrchestrationOsDebateSession({
      agents,
      providers: providerProfiles,
      roadmap,
      trigger: "20개 큰 바위 다음 실행 순서 결정",
    });

    setDebateSession(session);
    setMode("debate");
    appendEvent("debate.os.generated", {
      debateId: session.id,
      participantCount: session.participants.length,
      roundCount: session.rounds.length,
      source: "command_palette",
    });
  }

  /**
   * Blueprint Revision Apply (point 5 후속) — 사용자가 "수정안 적용"을 누르면 호출.
   * 정직성:
   *   - DesignBlueprint draft는 자동으로 덮어쓰지 않는다 — applied revision을 별도 state에
   *     기록(debateId 별). 추후 사용자가 AppBuild를 다시 열 때 baseline에 반영 여부 선택 가능.
   *   - Mission/scaffold/GitHub write는 절대 자동 실행하지 않는다(이 핸들러는 state 업데이트
   *     + appendEvent만).
   *   - trace event는 redacted summary만(raw 본문/transcript는 절대 trace에 넣지 않음).
   *   - truthStatus는 항상 planned(observed 아님).
   */
  /**
   * AppBuildContainer가 from-blueprint 미션을 만든 직후 호출.
   *   - sourceSessionId가 있으면 missionIdBySourceSessionId 매핑에 저장.
   *   - 이후 동일 sourceSessionId로 시작한 debate가 있으면 Stage3DebateTable의
   *     onScaffoldRefresh가 이 매핑으로 missionId를 찾아 refreshScaffold를 호출.
   *   - 자동 실행 없음 — 단순 매핑 저장.
   */
  const handlePreviewObserved = useCallback((ref: ActivePreviewRef) => {
    setActivePreviewRefByMissionId((prev) => putPreviewRef(prev, ref));
    appendEvent("mission.preview.active_ref.observed", {
      missionId: ref.missionId,
      url: ref.url,
      observedAt: ref.observedAt,
      truthStatus: "observed",
    });
  }, [appendEvent]);

  const handlePreviewAnnotationDraft = useCallback((draft: PreviewAnnotationDraft) => {
    setPreviewAnnotationDraft(draft);
    appendEvent("mission.preview_annotation.sent_to_turbo", {
      missionId: draft.missionId,
      annotationId: draft.annotation.id,
      summary: draft.annotation.description,
      url: draft.annotation.viewportClick?.url,
      percentX: draft.annotation.viewportClick?.percentX,
      percentY: draft.annotation.viewportClick?.percentY,
      selector: "unknown",
      selectorReason: "iframe_boundary",
      sentAt: draft.sentAt,
    });
  }, [appendEvent]);

  const handleAppBuildMissionCreated = useCallback(
    (mission: ServerMissionRecord, sourceSessionId?: string) => {
      if (!sourceSessionId) return;
      setMissionIdBySourceSessionId((prev) => ({
        ...prev,
        [sourceSessionId]: mission.mission.missionId,
      }));
      appendEvent("appbuild.mission.linked", {
        sourceSessionId,
        missionId: mission.mission.missionId,
        // mission.title은 trace에 짧게만(추측/raw 본문 금지).
        title: mission.mission.title.slice(0, 200),
      });
    },
    [appendEvent],
  );

  /**
   * 사용자가 BlueprintReviewCard에서 "수정안으로 스캐폴드 다시 생성"을 누르면 호출.
   *   - debateSession.sourceSessionId로 missionIdBySourceSessionId에서 missionId 조회.
   *   - 매핑 없으면 noop(BlueprintReviewCard CTA는 미배선 — 그래도 안전선).
   *   - 매핑 있으면 refreshScaffoldHandleRef.current(missionId) 호출 →
   *     MissionBoardContainer가 캐시 invalidate → 새 scaffold/latest 조회.
   *   - GitHub write, Mission 자동 생성, scaffold apply는 절대 자동 실행하지 않는다.
   *   - redacted trace event(missionId만) 남긴다.
   */
  const handleRequestScaffoldRefreshFromDebate = useCallback(() => {
    const sourceSessionId = debateSession.sourceSessionId;
    if (!sourceSessionId) return;
    const missionId = missionIdBySourceSessionId[sourceSessionId];
    if (!missionId) return;
    refreshScaffoldHandleRef.current?.(missionId);
    appendEvent("appbuild.scaffold.refresh.requested", {
      debateId: debateSession.id,
      sourceSessionId,
      missionId,
    });
  }, [debateSession.sourceSessionId, debateSession.id, missionIdBySourceSessionId, appendEvent]);

  const handleApplyBlueprintRevision = useCallback(
    (draft: BlueprintRevisionDraft) => {
      const debateId = debateSession.id;
      const appliedAt = new Date().toISOString();
      setAppliedBlueprintRevisionByDebateId((prev) => ({
        ...prev,
        [debateId]: { draft, appliedAt },
      }));
      appendEvent("appbuild.blueprint.revision.applied", {
        debateId,
        blueprintTitle: draft.title.slice(0, 200),
        addedCriteriaCount: draft.addedCriteria.length,
        riskNotesCount: draft.riskNotes.length,
        truthStatus: draft.truthStatus, // "planned"
        appliedAt,
        // raw 본문 redacted — addedCriteria 텍스트 자체는 trace에 넣지 않는다.
        redaction: "applied",
      });
    },
    [debateSession.id, appendEvent],
  );

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

    const externalIngressTargetAgentId = resolveExternalIngressTargetAgentId({ agents });
    const externalIngressMessage: ConversationMessage = {
      id: `message_external_ingress_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "user",
      content: normalizedEvent.normalizedText,
      createdAt: receivedAt,
      metadata: {
        agentId: externalIngressTargetAgentId,
        channel: normalizedEvent.channel,
        ingressEventId: normalizedEvent.id,
        approvalState: snapshot.result.approvalState,
        sourceTrust: normalizedEvent.sourceTrust,
      },
    };

    setConversationMessagesByAgentId((channels) =>
      updateAgentChannelMessages(channels, externalIngressTargetAgentId, (messages) => [
        ...messages,
        externalIngressMessage,
      ]),
    );
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

  function handleResolveUnifiedControlQueueItem(
    sourceItemId: string,
    state: Extract<ApprovalState, "approved" | "rejected">,
  ) {
    const source = parseUnifiedControlQueueSourceItemId(sourceItemId);
    if (source.kind === "local") {
      handleResolvePermissionItem(source.sourceItemId, state);
      return;
    }

    const approval = approvalServerSnapshot?.approvals.find((item) => item.id === source.approvalId);
    if (!approval) {
      appendEvent("approval.server.resolve_missing", {
        approvalId: source.approvalId,
        sourceItemId,
        state,
        authorityNodeId: "dgx-02",
        redaction: "applied",
      });
      return;
    }

    void handleResolveServerApproval(approval, state);
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

  function handleCreateMakimaDelegationAssignment(card: MakimaDelegationCard) {
    if (makimaDelegationAssignmentsByAgentId[card.targetAgentId]) {
      setSelectedAgentId(card.targetAgentId);
      setMode("conversation");
      setApprovalDrawerOpen(false);
      return;
    }

    const createdAt = new Date().toISOString();
    const latestUserMessage =
      conversationMessages
        .filter((message) => message.role === "user")
        .at(-1)?.content ?? "";
    const request = draftMessage.trim() || latestUserMessage.trim() || card.summary;
    const { handoff, workItem } = createMakimaDelegationWorkItems({
      card,
      createdAt,
      orchestratorAgentId: selectedAgent?.id,
      request,
      sessionId: activeSessionId,
    });

    prependWorkItem(workItem);
    prependWorkItemHandoff(handoff);
    setMode("cockpit");
    setApprovalDrawerOpen(false);
    appendEvent("makima.delegation.assignment.created", {
      handoffId: handoff.id,
      ownerAgentId: card.targetAgentId,
      targetSurface: handoff.targetSurface,
      workItemId: workItem.id,
    });
  }

  function handleOpenDelegatedAgentConversation(agentId: string) {
    setSelectedAgentId(agentId);
    setMode("conversation");
    setApprovalDrawerOpen(false);
  }

  function handleProgressMakimaDelegationAssignment(
    card: MakimaDelegationCard,
    assignment: MakimaDelegationAssignmentView,
  ) {
    const updatedAt = new Date().toISOString();
    const nextState = nextMakimaDelegationWorkState(assignment.status);

    updateWorkItem(assignment.workItemId, {
      lane: nextState.lane,
      status: nextState.status,
      updatedAt,
    });
    setAgentActivityById((current) => ({
      ...current,
      [card.targetAgentId]: nextState.activity,
    }));
    appendEvent("makima.delegation.assignment.progressed", {
      ownerAgentId: card.targetAgentId,
      status: nextState.status,
      workItemId: assignment.workItemId,
    });
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
      setAgentActivity(selectedAgent.id, "tooling");
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "dispatching");
      }, 220);
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "testing");
      }, 680);
      window.setTimeout(() => {
        setAgentActivity(selectedAgent.id, "idle");
      }, 1200);
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
    setAnnexInitialTab("memory");
    setMode("annex");
  }

  function openRecoveryFromCockpit() {
    setAnnexInitialTab("queue");
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

  function handleOpenWorkTrace(item: WorkTraceSearchItem) {
    if (item.kind === "conversation") {
      const matchedMessage = Object.values(conversationMessagesByAgentId)
        .flat()
        .find((message) => message.id === item.id);
      const agentId = matchedMessage?.metadata?.agentId;
      if (typeof agentId === "string" && agents.some((agent) => agent.id === agentId)) {
        setSelectedAgentId(agentId);
      }
      setMode("conversation");
      return;
    }

    if (item.kind === "debate") {
      setMode("debate");
      return;
    }

    if (item.kind === "tmux") {
      setMode("tmux");
      return;
    }

    if (item.kind === "approval") {
      openControlQueue();
      return;
    }

    setMode("conversation");
    setAgentConfigPanel({ open: true, tab: "injection" });
  }

  function handleAskAgentFromAnnex(ref: { id: string; source: string; title: string }) {
    const targetAgentId = debateSession.participants[0]?.agentId;
    if (targetAgentId && agents.some((agent) => agent.id === targetAgentId)) {
      setSelectedAgentId(targetAgentId);
    }
    setDraftMessage(`Annex 근거 "${ref.title}"를 기준으로 다음 구현 판단과 필요한 조치를 이어서 설명해줘.`);
    setMode("conversation");
    appendEvent("debate.annex.evidence_routed_to_conversation", {
      evidenceId: ref.id,
      evidenceSource: ref.source,
      targetAgentId,
      redaction: "applied",
    });
  }

  const paletteCommands: CommandEntry[] = [
    // Batch 12 LINE A — inbox view commands from a pure, unit-tested builder.
    ...buildInboxPaletteCommands(
      {
        goInbox: () => setActiveNavItem("command_center"),
        dispatch: goInboxCommand,
        applyView: applyInboxView,
      },
      readUserViews(),
    ),
    {
      id: "switch.conversation",
      verb: "전환",
      label: "대화",
      hint: "선택 에이전트와 바로 대화",
      shortcut: "⌘1",
      run: () => setMode("conversation"),
    },
    {
      id: "switch.agents",
      verb: "전환",
      label: "agents",
      hint: "에이전트 상세, 스킬, 기억, SOUL/AGENTS 설정",
      run: () => { setMode("conversation"); setConversationViewMode("agents"); },
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
      label: "관제판",
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
      run: toggleControlQueue,
    },
    {
      id: "open.big-rocks",
      verb: "점검",
      label: "20개 큰 바위 로드맵",
      hint: "Cockpit 세부 정보에서 성숙한 OS 기준 확인",
      run: () => {
        setCockpitFocus({ label: "다음 큰 바위", helper: "성숙도와 작업 영수증을 확인", surface: "maturity" });
        setMode("cockpit");
      },
    },
    {
      id: "open.receipts",
      verb: "점검",
      label: "작업 영수증 장부",
      hint: "마스킹, 테스트, 실패 후 수정 기록 확인",
      run: () => {
        setCockpitFocus({ label: "작업 영수증", helper: "마스킹·테스트·수정 기록", surface: "receipts" });
        setMode("cockpit");
      },
    },
    {
      id: "agent.skills",
      verb: "에이전트",
      label: "선택 에이전트 스킬 보기",
      hint: "SOUL/AGENTS/EvolveMemento 적용 지침 확인",
      run: () => {
        setMode("conversation");
        setConversationViewMode("agents");
        queueMicrotask(() => {
          document.querySelector<HTMLElement>("[data-focus-id='agent-skill-profile-panel']")?.focus();
        });
      },
    },
    {
      id: "workflow.single-loop",
      verb: "작업",
      label: "요청→수정→검증→PR 루프",
      hint: "대화로 돌아가 다음 실행 패킷을 준비",
      run: () => {
        setMode("conversation");
        setDraftMessage((current) =>
          current.trim()
            ? current
            : "지금 목표를 요청→수정→검증→PR→기록 루프로 쪼개서 다음 실행 계획을 제안해줘.",
        );
      },
    },
    {
      id: "visual.qa",
      verb: "검수",
      label: "v0 검은 테마 시각 QA",
      hint: "Cockpit 기준으로 화면 노이즈와 색상 상태 점검",
      run: () => {
        setCockpitFocus({ label: "진단", helper: "화면 노이즈·색상 상태 점검", surface: "diagnostics" });
        setMode("cockpit");
      },
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
      id: "debate.os",
      verb: "토론",
      label: "OS 5턴 토론 실행",
      hint: "20개 큰 바위 기준으로 Debate Chamber에 실제 토론 세션을 생성",
      run: handleRunOsDebate,
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
    onControlQueue: toggleControlQueue,
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
    onReject: () => handleResolveNextPermission("rejected"),
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
        } else if (activity === "waiting_approval") {
          status = "waiting_approval";
          statusRingColor = "yellow";
        } else if (activity === "error") {
          status = "error";
          statusRingColor = "red";
        } else if (activity === "preparing" || activity === "responding" || activity === "tooling" || activity === "capturing" || activity === "dispatching" || activity === "testing") {
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
      approvals: unifiedControlQueueSnapshot.queue
        .filter((q) => q.state === "required")
        .map((q) => {
          const matrixItem = permissionSnapshot.items.find((item) => item.id === q.sourceItemId);

          let evidenceRefs: EvidenceRef[] = [];
          let commandPreview: string | undefined = undefined;
          let payloadBindingStatus: "bound" | "unbound" | "expired" = resolveCockpitPayloadBindingStatus({
            expiresAt: q.expiresAt,
            hasReplayMetadata: Boolean(q.replayKind && q.replayEndpoint),
            sourceTrust: matrixItem?.sourceTrust ?? q.sourceTrust,
          });
          let securityRisk: string | undefined = undefined;

          if (matrixItem) {
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
            tamperWarning: false,
            securityRisk,
          };
        }),
      handoffs: workItemHandoffs
        .filter((handoff) => handoff.approvalState === "required")
        .map((handoff) => {
          const item = workItems.find((w) => w.id === handoff.workItemId);
          return {
            id: handoff.id,
            ownerAgentId: item?.ownerAgentId || "agent_unassigned",
            nextAction: sanitizeCockpitProjectionText(handoff.summary),
            targetSurface: handoff.targetSurface,
            payloadRef: handoff.payloadRef ? sanitizeCockpitProjectionText(handoff.payloadRef) : undefined,
            approvalState: handoff.approvalState,
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
    unifiedControlQueueSnapshot.queue,
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
    const allConversationMessages = Object.values(conversationMessagesByAgentId).flat();
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
        approvalItems: unifiedControlQueueSnapshot.queue,
        conversationMessages: allConversationMessages,
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
        pendingApprovalCount: unifiedControlQueueSnapshot.summary.pending,
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
    conversationMessagesByAgentId,
    controlQueueContinuity,
    debateSession,
    draftAttachments.length,
    eventSyncState.status,
    memoryInstallAudit,
    memoryRecords,
    metaOnboardingSignals,
    providerProfiles,
    providerReadiness.status,
    providerRoutingConsoleItems,
    runtimeSnapshotState,
    selectedModel,
    tmuxStatuses,
    tmuxTimelineBlocks,
    unifiedControlQueueSnapshot.queue,
    unifiedControlQueueSnapshot.summary.pending,
    workItemHandoffs,
    workItems,
  ]);

  // 대시보드 "다음 할 일 1개" — 콕핏 L1과 동일한 단일 소스(snapshot+nextActions)에서
  // red/yellow/green + 가장 긴급한 액션 하나를 도출한다.
  const dashboardHealthRollup = useMemo(
    () => deriveCockpitHealthFromSnapshot(cockpitSnapshot, cockpitReadiness.nextActions),
    [cockpitSnapshot, cockpitReadiness.nextActions],
  );
  // 대시보드 "오늘의 파티" — 하드코딩 2명 대신 날짜 로테이션 + 현재 활성(Hermes 슬롯)
  // + 최근 작전 페르소나를 앞세워 매일 바뀌게. (왜 오늘인지 reason 포함)
  const dashboardParty = useMemo(() => {
    const recentPersonaNames = projectAutonomyRunHistory(eventLog)
      .map((run) => run.personaName)
      .filter((name): name is string => Boolean(name));
    const boundPersonaNames = loadHermesPool()
      .slots.map((slot) => slot.persona)
      .filter((name): name is string => Boolean(name));
    const dateSeed = new Date().toISOString().slice(0, 10);
    return selectDailyParty({ codex: PERSONA_CODEX, recentPersonaNames, boundPersonaNames, dateSeed, size: 3 }).map(
      (member) => ({ ...member, avatarUrl: dashboardPersonaAvatars[member.personaName] }),
    );
  }, [eventLog]);
  // 대시보드의 "다음 할 일" CTA 라우팅: 승인성 신호는 제자리(드로어), 나머지는
  // 상세가 사는 콕핏으로 — 액션 동선을 한 패턴으로 묶는다.
  const handleDashboardNextAction = (action: CockpitNextActionItem) => {
    if (action.targetSurface === "approvals" || action.targetSurface === "control_queue") {
      openControlQueue();
      return;
    }
    setMode("cockpit");
    setActiveNavItem(MODE_OWNS_CENTER_NAV);
    setProviderRegistrationOpen(false);
    setAdminRailOpen(false);
  };
  // 대화창 "+" → 스웜 서치: 입력(또는 직전 대화)을 주제로 4~16명 자동 편성 후 리서치 뷰로.
  const handleStartSwarmSearch = (rawTopic: string) => {
    const fromDraft = rawTopic.trim();
    const lastUser = [...conversationMessages].reverse().find((message) => message.role === "user")?.content?.trim() ?? "";
    const topic = fromDraft || lastUser;
    if (!topic) return;
    const plan = planConversationSwarm({ topic });
    setSwarmSeed({ id: `swarm_${Date.now()}`, topic: plan.topic, drafts: plan.drafts });
    setActiveNavItem("research");
    setProviderRegistrationOpen(false);
    setAdminRailOpen(false);
  };

  // 단일 좌표 판정 — '중앙을 점유하는 nav 목록'은 lib/navSurface로 추출(유령 좌표
  // "runtime" 제거 포함). 두 useState(mode/activeNavItem)는 유지하되 판정은 한 곳에서.
  const navCenterActive = isNavCenterActive(activeNavItem);

  const activeShellTabId = resolveAppShellTabForSurface({ activeNavItem, mode });
  const activeShellSection = routeBackedShellSections.find((s) => s.tabs.some((t) => t.id === activeShellTabId)) ?? routeBackedShellSections[0]!;
  const activeShellTab = activeShellSection.tabs.find((t) => t.id === activeShellTabId) ?? activeShellSection.tabs[0]!;

  const handleSelectShellTab = useCallback((tabId: AppShellTabId) => {
    const tab = findAppShellTab(tabId);
    if (tab.target.mode) setMode(tab.target.mode);
    if (tab.target.nav) setActiveNavItem(tab.target.nav);
    // operations.launch (nav "run") starts the run workspace on its launch tab,
    // resetting any sticky board selection left over from operations.missions.
    if (tab.target.nav === "run") setSummonSeedMode("single");
    if (tab.target.virtual === "operations_queue") setApprovalDrawerOpen(true);
    // operations.missions reuses the single existing RunWorkspace mission board
    // (one board instance only): land on the run workspace, opened on its board.
    if (tab.target.virtual === "operations_missions") setActiveNavItem("run");
    if (tab.target.virtual === "operations_missions") setSummonSeedMode("board");
    // system.runtime shows the existing RuntimeRailPanel read-only in a sheet —
    // selection only toggles this sheet: no route change, no node restart.
    if (tab.target.virtual === "system_runtime") setRuntimeSurfaceOpen(true);
    // system.models shows the read-only provider/model catalog in a sheet —
    // selection only toggles this sheet: no route change, no provider mutation.
    if (tab.target.virtual === "system_models") setModelsSurfaceOpen(true);
    // library.memory shows the read-only memory library catalog in a sheet —
    // selection only toggles this sheet: read-only, no write/sync/eval/curation.
    if (tab.target.virtual === "library_memory") setMemorySurfaceOpen(true);
  }, []);

  const handleSelectShellSection = useCallback((sectionId: AppShellSectionId) => {
    handleSelectShellTab(routeBackedDefaultTabBySection[sectionId]);
  }, [handleSelectShellTab]);

  const shellVisibility = getConversationShellVisibility({
    configLibraryActive,
    mode,
    navCenterActive,
  });
  const railLayout = getConversationRailLayout({
    configLibraryActive,
    mode,
  });
  const focusedV0Surface = !configLibraryActive && !navCenterActive && isFocusedV0Surface(mode);
  const leftRailVisible = shellVisibility.showLeftRail || providerRegistrationOpen || adminRailOpen;
  // 대화/agents는 풀와이드 집중 화면 유지 — 에이전트 레일은 ChatSidePanel의 "에이전트" 모드로 흡수됨
  const rightRailVisible = !focusedV0Surface && !navCenterActive;

  // Switching the top-bar mode (대화/토론/Tmux/콕핏…) hands the center back to
  // that mode — leave the nav-owned center view so the tabs never look dead.
  const previousModeRef = useRef(mode);
  useEffect(() => {
    if (previousModeRef.current === mode) {
      return;
    }
    previousModeRef.current = mode;
    if (navCenterActive) {
      // mode가 중앙을 가져가므로 nav를 비운다("none"). 이전엔 여기서 "sessions"로
      // 떨궈 — 주석의 의도("mode에 중앙을 넘긴다")와 달리 nav(sessions 페이지)를
      // 유지해, 팔레트로 mode 전환 시 엉뚱하게 세션 페이지가 뜨곤 했다. onChangeMode
      // (탭 클릭)와 같은 센티넬로 통일해 동선이 갈리지 않게 한다.
      setActiveNavItem(MODE_OWNS_CENTER_NAV);
      setProviderRegistrationOpen(false);
      // the admin rail was opened to navigate here — close it so focused
      // surfaces (토론/Tmux/콕핏) get their full-bleed stage back
      setAdminRailOpen(false);
    }
  }, [mode, navCenterActive]);

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (!leftRailVisible && isMobileDrawerOpen) {
      setIsMobileDrawerOpen(false);
    }
  }, [isMobileDrawerOpen, leftRailVisible]);

  const agentsSidebarNode = (
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
  );

  return (
    <div
      className={`app-shell ${navCenterActive ? "nav-center-shell" : ""} ${
        !navCenterActive && mode === "tmux" ? "tmux-focus-shell" : ""
      } ${
        !navCenterActive && mode === "cockpit" ? "cockpit-focus-shell" : ""
      } ${
        !navCenterActive && mode === "annex" ? "annex-focus-shell" : ""
      } ${
        !navCenterActive && mode === "debate" ? "debate-focus-shell" : ""
      } ${
        !navCenterActive && mode === "conversation" && !configLibraryActive
          ? "conversation-v0-shell"
          : ""
      } ${
        /* 설정파일 활성 시 좌측 레일을 아이콘 전용 60px로 유지 — 한글 라벨 회귀 방지 */
        configLibraryActive ? "compact-rail-shell" : ""
      }`}
      style={{
        "--conversation-right-rail-max": `${railLayout.rightRailMaxWidthPx}px`,
        "--conversation-right-rail-min": `${railLayout.rightRailMinWidthPx}px`,
        "--conversation-right-rail-width": `${railLayout.rightRailWidthPx}px`,
      } as React.CSSProperties}
    >
      <RuntimeStatusBar
        drawerAvailable={leftRailVisible}
        homeActive={activeNavItem === "dashboard"}
        mode={mode}
        onChangeMode={(nextMode) => {
          setMode(nextMode);
          // a top-bar tab always claims the center — leave any nav-owned view,
          // even when the mode value itself is unchanged (same sentinel as the
          // mode-change effect so the two enforcement sites never drift)
          if (navCenterActive) {
            setActiveNavItem(MODE_OWNS_CENTER_NAV);
            setProviderRegistrationOpen(false);
            setAdminRailOpen(false);
          }
        }}
        onCommandPalette={() => setCommandPaletteOpen(true)}
        onHome={() => openManagementRail("dashboard")}
        onOpenOpsDetail={() => setMode("cockpit")}
        onProbeDgx={handleProbeDgx}
        onToggleDrawer={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
        providerName={activeProvider?.name ?? "미선택"}
        snapshot={runtimeSnapshotState}
      />
      <AppShellNav
        activeSection={activeShellSection}
        activeTab={activeShellTab}
        pendingApprovals={unifiedControlQueueSnapshot.summary.pending}
        providerName={activeProvider?.name ?? "local-provider"}
        sections={routeBackedShellSections}
        onCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenQueue={() => setApprovalDrawerOpen(true)}
        onProbeRuntime={handleProbeDgx}
        onSelectSection={handleSelectShellSection}
        onSelectTab={handleSelectShellTab}
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
            className={`left-rail ${providerRegistrationOpen ? "provider-mode" : ""} ${isMobileDrawerOpen ? "drawer-open" : ""} ${configLibraryActive ? "compact" : ""}`}
            aria-label="오케스트레이터 네비게이션"
          >

          <nav className="nav-stack">
            {navSections.map((section) => (
              <div className="nav-section" key={section.id}>
                <p className="nav-section__label">{section.label}</p>
                {section.items.map((item) => {
                  const isActive = activeNavItem === item.id;
                  return (
                    <button
                      aria-expanded={isActive}
                      aria-label={item.label}
                      className={`nav-item ${isActive ? "active" : ""}`}
                      key={item.id}
                      onClick={() => {
                        setAdminRailOpen(false);
                        setActiveNavItem(item.id);
                        setProviderRegistrationOpen(false);
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
              </div>
            ))}
          </nav>











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
                    unifiedControlQueueSnapshot.summary.pending > 0 ? "needs-attention" : ""
                  }`}
                  onClick={toggleControlQueue}
                  title="Control Queue (⌘⇧A)"
                  type="button"
                >
                  <ShieldCheck size={16} />
                  Queue {unifiedControlQueueSnapshot.summary.pending}
                </button>
                <button className="primary-button" onClick={() => handleCreateCodingPacket()} type="button">
                  <Send size={16} />
                  Coding Packet
                </button>
              </div>
            </div>
          ) : null}

          {activeNavItem === "dashboard" ? (
            <DashboardView
              personas={dashboardParty}
              personaAvatars={dashboardPersonaAvatars}
              runtime={runtimeSnapshotState}
              hermesPool={summarizeHermesPool(loadHermesPool())}
              pendingApprovals={unifiedControlQueueSnapshot.summary.pending}
              healthRollup={dashboardHealthRollup}
              onActivateNextAction={handleDashboardNextAction}
              history={projectAutonomyRunHistory(eventLog)}
              onNavigate={(target) => {
                if (target.mode) {
                  setMode(target.mode);
                }
                // mode만 있고 nav가 없으면 모드 화면(콕핏/토론/tmux)이 중앙을 온전히
                // 차지하도록 nav를 비운다. (기존엔 "sessions"로 떨어져 엉뚱한 페이지가 떴음)
                const nextNav = target.nav ?? (target.mode ? "none" : "sessions");
                setActiveNavItem(nextNav);
                setProviderRegistrationOpen(nextNav === "providers");
                setAdminRailOpen(false);
              }}
              onOpenApprovalQueue={openControlQueue}
              onSummonPersona={(personaName, target) => {
                setSummonSeedPersona(personaName);
                setSummonSeedMode(target === "parallel" ? "parallel" : "single");
                setActiveNavItem("run");
                setProviderRegistrationOpen(false);
              }}
            />
          ) : activeNavItem === "run" ? (
            <RunWorkspace
              key={`${summonSeedPersona ?? "run"}:${summonSeedMode}`}
              initialMode={summonSeedMode}
              autonomyProps={{
                seedPersonaName: summonSeedPersona ?? undefined,
                decisionReadiness: deriveDebateDecisionReadiness(debateSession),
                onOpenDebate: () => {
                  setMode("debate");
                  setActiveNavItem("none");
                  setProviderRegistrationOpen(false);
                  setAdminRailOpen(false);
                },
                onOpenApprovalQueue: openControlQueue,
                historyEvents: eventLog,
                onRegistryChange: setSummonRegistry,
                onRunEvents: (events) => setEventLog((current) => [...current, ...events]),
                onRunMemory: handleQueueMemoryCuratorCandidate,
                registry: summonRegistry,
                seedPacket: codingPacketState,
              }}
              parallelProps={{ seedPersonaName: summonSeedPersona ?? undefined }}
              boardProps={{
                packet: codingPacketState,
                sourceSessionId: activeSessionId,
                debateId: debateSession.id,
                refreshScaffoldHandleRef,
                onPreviewObserved: handlePreviewObserved,
                previewAnnotationDraft,
                projectRecordController,
                activePreviewRefByMissionId,
                pendingResumeMissionId,
                onResumeConsumed: () => setPendingResumeMissionId(null),
                /**
                 * GitHub Publish 표면(opt-in) — Workspace 상세에 "GitHub로 내보내기" CTA를 노출한다.
                 *
                 * 정직성:
                 *  - serverBaseUrl만 넘기고, getScaffoldFiles는 의도적으로 미배선:
                 *    현재 desktop은 mission별 scaffold plan content를 client state로 유지하지 않는다.
                 *    추측 금지 — file path/content를 서버에서 다시 읽거나 AppBuild 흐름에서
                 *    실제 ScaffoldFile[]을 캐시한 다음에야 여기에 연결한다.
                 *  - resolvePrefill 미지정 → builtinMissionPrefill이 mission.title/goal/missionId로
                 *    branch/PR draft만 채운다. file 필드는 비워둠(prefill ≠ execute).
                 *  - onContextEvent로 trace를 EventStorage에 적재해 mission provenance 보존.
                 */
                publishEnvironment: {
                  serverBaseUrl: resolveDgxServerBaseUrls(undefined)[0] ?? DEFAULT_DGX_SERVER_BASE_URL,
                  onContextEvent: (type, payload) => appendEvent(type, payload),
                  // PreviewRunCard observed → 최신 ref만 보관. observed 분기에서만 호출되므로
                  // preview_not_running/error로 인해 기존 URL이 가짜로 덮어쓰이지 않는다.
                  onPreviewObserved: (ref) => setActivePreviewRefByMissionId((prev) => putPreviewRef(prev, ref)),
                  // TODO(W3a-followup): scaffold plan content fetch + cache가 들어오면
                  //   getScaffoldFiles: (item) => scaffoldFilesByMissionId.get(item.missionId)
                  // 형태로 연결. 그 전까지는 file 필드를 비워두는 것이 정직(추측 금지).
                  // OSS-H6 — Turbo Edits in-app generator. selectedProvider/selectedModel이
                  // 둘 다 있을 때만 enable. 없으면 undefined를 반환해 카드가 "provider 미설정"으로 표시.
                  // 자동 overlay/Preview 0 — generator는 텍스트만 반환한다.
                  getTurboEditGenerator: (item) => {
                    const profileId = selectedProvider?.id;
                    const modelId = selectedModel?.id;
                    if (!profileId || !modelId) return undefined;
                    const serverBaseUrl =
                      resolveDgxServerBaseUrls(undefined)[0] ?? DEFAULT_DGX_SERVER_BASE_URL;
                    return {
                      generator: createTurboEditGenerator({
                        providerProfileId: profileId,
                        modelId,
                        missionId: item.missionId,
                        serverBaseUrl,
                        requestCompletion: (request, opts) =>
                          requestCompletion(request, {
                            serverBaseUrl: opts?.serverBaseUrl ?? serverBaseUrl,
                            fetchImpl: opts?.fetchImpl,
                          }),
                      }),
                      providerLabel: `${selectedProvider?.name ?? profileId} · ${modelId}`,
                    };
                  },
                },
                // 미션 워커를 실제 페르소나 + 점유한 Hermes 슬롯으로 구성한다.
                // 익명 역할 하드코딩 대신 사용자가 키운 캐릭터가 일하게.
                buildWorkers: () => {
                  let pool = loadHermesPool();
                  const workers = (["architect", "builder", "verifier"] as const).map((role) => {
                    const agent = agents.find((candidate) => candidate.enabled && candidate.role === role);
                    const slug = agent?.personaName ?? role;
                    const acquisition = acquireHermesSlot(pool, slug);
                    pool = acquisition.pool;
                    return {
                      agentId: agent?.id ?? `agent_${role}`,
                      role,
                      displayName: agent ? agentPrimaryDisplayName(agent) : role,
                      personaName: agent?.personaName,
                      soulMode: agent?.soulMode ?? ("summary" as const),
                      configSource: agent?.configSource ?? ("internal" as const),
                      hermesSlotId: acquisition.slot.id,
                    };
                  });
                  saveHermesPool(pool);
                  return workers;
                },
              }}
            />
          ) : activeNavItem === "theater" ? (
            <SummonTheater
              agents={agents}
              assignmentsByAgentId={makimaDelegationAssignmentsByAgentId}
              events={eventLog}
              onOpenAgent={handleOpenDelegatedAgentConversation}
              cards={createMakimaDelegationCards({
                agents,
                request:
                  [...conversationMessages].reverse().find((message) => message.role === "user")?.content ?? "",
              })}
            />
          ) : activeNavItem === "coding" ? (
            <CodingWorkbench
              modelCatalog={modelCatalog}
              providerProfiles={providerProfiles}
              serverBaseUrl={resolveDgxServerBaseUrls(undefined)[0] ?? DEFAULT_DGX_SERVER_BASE_URL}
              onContextEvent={(type, payload) => appendEvent(type, payload)}
            />
          ) : activeNavItem === "research" ? (
            <ResearchSwarmContainer providerProfiles={providerProfiles} seed={swarmSeed ?? undefined} />
          ) : activeNavItem === "rmas" ? (
            <RmasRunView
              providerProfiles={providerProfiles}
              modelCatalog={modelCatalog}
              serverBaseUrl={resolveDgxServerBaseUrls(undefined)[0] ?? DEFAULT_DGX_SERVER_BASE_URL}
              onContextEvent={(type, payload) => appendEvent(type, payload)}
            />
          ) : activeNavItem === "sessions" ? (
            <div className="nav-center-page" data-page="sessions">
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
                approvalError={approvalServerError}
                approvalServerSnapshot={approvalServerSnapshot}
                approvalServerStatus={approvalServerStatus}
                backupSnapshot={backupSnapshot}
                ingressSnapshot={ingressSnapshot}
                onCheckProviderVault={handleCheckProviderVault}
                onExportBackup={handleExportBackupProjections}
                onImportExternalIngress={handleImportExternalIngress}
                onRefreshApprovals={handleRefreshApprovalQueue}
                onOpenControlQueue={openControlQueue}
                pendingTmuxApprovalKeys={pendingTmuxApprovalKeys}
                permissionSnapshot={permissionSnapshot}
                providerReadiness={providerReadiness}
                secretVaultSnapshot={secretVaultSnapshot}
                tmuxRedispatchOutcomes={tmuxRedispatchOutcomes}
              />
            </>
          </div>
) : activeNavItem === "projects" ? (
            <div className="nav-center-page" data-page="projects">
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
          </div>
) : activeNavItem === "providers" ? (
            <div className="nav-center-page" data-page="providers">
            <ProviderRegistrationMenu
              modelCatalog={modelCatalog}
              modelDiscoveryByProviderId={modelDiscoveryByProviderId}
	              onClose={() => {
	                setProviderRegistrationOpen(false);
	                setActiveNavItem("dashboard");
	              }}
              onBindDefaultCredential={handleBindProviderDefaultCredential}
	              onDiscoverModels={handleDiscoverProviderModels}
              onRemoveProvider={handleRemoveProvider}
              onRenameProvider={handleRenameProvider}
              onRegister={handleRegisterProvider}
	              profiles={providerProfiles}
	              routingConsoleItems={providerRoutingConsoleItems}
	              defaultCredentialProviderIds={defaultCredentialProviderIds}
	              usedProviderIds={usedProviderIds}
	            />
          </div>
) : activeNavItem === "channels" ? (
            <div className="nav-center-page" data-page="channels">
            <ChannelRailPanel
              ingressSnapshot={ingressSnapshot}
              onImportExternalIngress={handleImportExternalIngress}
              permissionSnapshot={permissionSnapshot}
              runtime={runtimeSnapshotState}
            />
          </div>
) : activeNavItem === "backup" ? (
            <div className="nav-center-page" data-page="backup">
            <BackupRailMenu
              onExportBackup={handleExportBackupProjections}
              projections={backupProjectionsState}
              snapshot={backupSnapshot}
            />
          </div>
          ) : activeNavItem === "command_center" ? (
            <AssistantInboxContainer
              live={{
                // Honest LIVE wiring (LINE H): real app state only. dgx gate
                // stays DISABLED by default → observed:false rendered honestly.
                runnerGateMode: "dgx_disabled",
                // Real event log — filtered to learning-loop events inside the
                // projection. Server auto-emit is OFF, so this is usually empty
                // → honest empty state (not a fixture).
                learningEvents: eventLog,
                // Real persisted project records (H10). Empty → honest empty.
                projectRecords: projectRecordController.records,
                // LINE C — total real event-log size for the live command strip.
                eventLogCount: eventLog.length,
                // LINE B (Batch 8) — real events + injected now for Today/Recent
                // lanes. Date.now() is injected HERE (not in the pure projection).
                recentEvents: eventLog,
                nowMs: Date.now(),
                // Batch 18 LINE B — LIVE Patch Candidate seam. Real H8 runner patch
                // handoffs map to read-only candidates via patchCandidatesFromApprovalItems.
                // The runner-patch approval queues live per-mission (MissionWorkspaceDetail)
                // and are not yet unified into an app-level feed, so this is honest-empty
                // for now; wiring a real source is swapping the [] for those queue items.
                // No fetch / server call / EventStorage write / runner dispatch.
                patchCandidates: patchCandidatesFromApprovalItems([]),
                // Engine E2 — real runner/mission sessions (shared store snapshot)
                // for the read-only Runner Theater. Read-only; no dispatch/start/
                // write. Empty store → honest "no runner sessions observed".
                runnerSessions: runnerSessionsSnapshot,
              }}
              // LINE A (Batch 8) — remember the last seat (local UI pref only).
              persistViewMode
              // LINE C (Batch 11) — one-shot view command from the Command Palette.
              command={inboxCommand}
            />
          ) : configLibraryActive ? (
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
              delegationAssignmentsByAgentId={makimaDelegationAssignmentsByAgentId}
              draftAttachments={draftAttachments}
              draftMessage={draftMessage}
              maxDraftAttachments={maxDraftAttachments}
              agentToolRuntimeLabel={agentRoleToolRuntimeAudit.summary}
              memoryAdapterStatus={adapterStatus}
              memoryGovernanceLabel={memoryGovernanceSummary.installLabel}
              memoryRecordCount={memoryRecords.length}
              memoryScope={selectedAgentMemoryScope}
              messageCountByAgentId={conversationMessageCountByAgentId}
              messages={conversationMessages}
              onAddDraftAttachments={handleAddDraftAttachments}
              rejectedAttachmentPlans={draftRejectedAttachmentPlans}
              onAdoptBranch={handleAdoptBranchExperiment}
              onApprovePermission={handleConversationApprovePermission}
              onBackupProjection={handleExportBackupProjections}
              onContextPackTierChange={handleContextPackTierChange}
              onCreateBranch={handleCreateBranchExperiment}
              onCreateAgentRun={handleCreateAgentRun}
              onCreateCodingPacket={handleCreateCodingPacket}
              onCreateDelegationAssignment={handleCreateMakimaDelegationAssignment}
              onDraftMessageChange={setDraftMessage}
              onOpenDelegatedAgentConversation={handleOpenDelegatedAgentConversation}
              onProgressDelegationAssignment={handleProgressMakimaDelegationAssignment}
              onImportExternalIngress={handleImportExternalIngress}
              onPromoteToDebate={handlePromoteToDebate}
              onAppBuildMissionCreated={handleAppBuildMissionCreated}
              onRejectPermission={handleConversationRejectPermission}
              onRemoveDraftAttachment={handleRemoveDraftAttachment}
              onSelectAgent={setSelectedAgentId}
              onSendMessage={handleSendMessageStage2}
              onSendSuggestion={(text) => void handleSendMessageStage2(text)}
              agentsPanel={agentsSidebarNode}
              onCloseAgentConfig={handleCloseAgentConfig}
              onReturn={handleCloseAgentConfig}
              returnLabel={returnModeAfterConfigClose === "annex" ? "← Annex로" : undefined}
              onOpenAgentConfig={openAgentConfigPanel}
              onAssignModel={handleAssignModel}
              onAssignProvider={handleAssignProvider}
              onRefreshProviderModels={handleDiscoverProviderModels}
              onUpdateAgentConfig={updateSelectedAgentConfig}
              onUpdateAgentPersona={updateSelectedAgentPersona}
              pendingProviderRetry={pendingProviderRetry}
              permissionSnapshot={conversationPermissionSnapshot}
              providerReadiness={providerReadiness}
              defaultCredentialProviderIds={defaultCredentialProviderIds}
              modelCatalog={modelCatalog}
              providers={providerProfiles}
              selectedAgent={selectedAgent}
              selectedAgentId={selectedAgent?.id}
              selectedModel={selectedModel}
              selectedProvider={selectedProvider}
              viewMode={conversationViewMode}
              onChangeViewMode={setConversationViewMode}
              agentVisualsById={agentVisualsById}
              agentActivityById={agentActivityById}
              agentMode={conversationAgentMode}
              onAgentModeChange={handleConversationAgentModeChange}
              streamingPreview={streamingPreview}
              queuedMessages={queuedConversationMessages}
              onRemoveQueuedMessage={handleRemoveQueuedConversationMessage}
              onStopTurn={handleStopConversationTurn}
              usageSummary={selectedAgent ? conversationUsageSummaryByAgentId[selectedAgent.id] : undefined}
              compactedVersion={selectedAgent ? conversationCondensateByAgentId[selectedAgent.id]?.version : undefined}
              onRollbackTurn={handleRollbackConversationTurn}
              onApproveCommandPattern={handleApproveCommandPattern}
              onStartSwarmSearch={handleStartSwarmSearch}
              previewUrl={currentMissionPreviewRef?.url}
              previewMeta={currentMissionPreviewRef ? { missionId: currentMissionPreviewRef.missionId, observedAt: currentMissionPreviewRef.observedAt } : undefined}
              onSendPreviewAnnotation={handlePreviewAnnotationDraft}
            />
          ) : mode === "debate" ? (
            <Stage3DebateTable
              onCreateCodingPacket={handleCreateCodingPacket}
              onOpenAnnex={() => setMode("annex")}
              onSelectUtterance={handleSelectDebateUtterance}
              session={debateSession}
              agentVisualsById={agentVisualsById}
              blueprintBaseline={debateSession.blueprintContext}
              onApplyBlueprintRevision={handleApplyBlueprintRevision}
              blueprintAppliedNotice={(() => {
                const entry = appliedBlueprintRevisionByDebateId[debateSession.id];
                if (!entry) return undefined;
                const when = entry.appliedAt.slice(0, 16).replace("T", " ");
                return `초안에 적용됨 · Mission 자동 생성 없음 · 새 결정 ${entry.draft.addedCriteria.length}, 위험 ${entry.draft.riskNotes.length} · ${when}`;
              })()}
              /* onScaffoldRefresh: debate의 sourceSessionId로 missionIdBySourceSessionId 조회.
                  매핑이 있을 때만 CTA를 노출한다(부재 시 미노출 — 추측 금지). 클릭 시 ref 기반으로
                  Container의 scaffold 캐시를 invalidate → Publish prefill 자동 갱신. GitHub write 0. */
              onScaffoldRefresh={
                debateSession.sourceSessionId &&
                missionIdBySourceSessionId[debateSession.sourceSessionId]
                  ? handleRequestScaffoldRefreshFromDebate
                  : undefined
              }
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
              initialFocus={cockpitFocus}
              onOpenAgentConversation={(agentId) => {
                setSelectedAgentId(agentId);
                setMode("conversation");
              }}
              onOpenMemory={openMemoryFromCockpit}
              onOpenProviderRouting={openProviderRoutingFromCockpit}
              onOpenRecovery={openRecoveryFromCockpit}
              onOpenControlQueue={openControlQueue}
              onOpenWorkTrace={handleOpenWorkTrace}
              onPreviewEvidence={openControlQueue}
              onApproveHandoff={handleApproveWorkItemHandoffAndRoute}
              readiness={cockpitReadiness}
              snapshot={cockpitSnapshot}
            />
          ) : mode === "annex" ? (
            <DebateAnnexPage
              initialTab={annexInitialTab}
              codingPacketGoal={codingPacketState.goal}
              onAskAgent={handleAskAgentFromAnnex}
              onBack={() => setMode("debate")}
              onCreateCodingPacket={() => handleCreateCodingPacket("annex")}
              onViewApproval={openControlQueue}
              onViewMemory={() => {
                setReturnModeAfterConfigClose("annex");
                setMode("conversation");
                setAgentConfigPanel({ open: true, tab: "injection" });
              }}
              pendingApprovals={unifiedControlQueueSnapshot.summary.pending}
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
              onApproveHandoff={handleApproveWorkItemHandoffAndRoute}
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
            {agentsSidebarNode}
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
        onApprove={(sourceItemId) => handleResolveUnifiedControlQueueItem(sourceItemId, "approved")}
        onBlock={handleControlQueueBlock}
        onBulkApproveSafe={(sourceItemIds) => {
          // 안전 검증 항목 일괄 승인 — 단일 trace 기록 후 기존 항목별 처리로 fan-out
          appendEvent("control_queue.safe_subset.bulk_approved", {
            count: sourceItemIds.length,
            sourceItemIds,
            note: "safeCommandPolicy 허용 계열 + 실제 명령 항목만 일괄 승인 (안전 항목만)",
          });
          sourceItemIds.forEach((sourceItemId) => handleResolveUnifiedControlQueueItem(sourceItemId, "approved"));
        }}
        onClose={() => setApprovalDrawerOpen(false)}
        onDelegate={handleControlQueueDelegate}
        onEdit={handleControlQueueEdit}
        onReject={(sourceItemId) => handleResolveUnifiedControlQueueItem(sourceItemId, "rejected")}
        open={approvalDrawerOpen}
        redispatchOutcomes={tmuxRedispatchOutcomes}
        snapshot={unifiedControlQueueSnapshot}
      />
      {/* system.runtime shell surface — existing RuntimeRailPanel rendered
          read-only (reboot control omitted) from the existing runtime snapshot.
          No new store / fetch loop; selection just toggles this sheet. */}
      <Sheet open={runtimeSurfaceOpen} onOpenChange={setRuntimeSurfaceOpen}>
        <SheetContent side="right" className="overflow-y-auto p-4 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle>런타임 상태</SheetTitle>
            <SheetDescription>
              런타임 노드 · 동기화 · DGX 라우트 진단 (읽기 전용)
            </SheetDescription>
          </SheetHeader>
          <RuntimeRailPanel
            dgxRouteDiagnostics={dgxRouteDiagnostics}
            onProbeDgx={handleProbeDgx}
            rebootWatchdogs={rebootWatchdogs}
            snapshot={runtimeSnapshotState}
          />
        </SheetContent>
      </Sheet>
      {/* system.models shell surface — read-only provider/model catalog rendered
          from the existing providerRoutingConsoleItems projection + modelCatalog.
          No provider mutation, no credential entry, no secret, no fetch. */}
      <Sheet open={modelsSurfaceOpen} onOpenChange={setModelsSurfaceOpen}>
        <SheetContent side="right" className="overflow-y-auto p-4 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle>모델 카탈로그</SheetTitle>
            <SheetDescription>
              공급자별 모델 · 신뢰/준비 상태 · 라우트 (읽기 전용)
            </SheetDescription>
          </SheetHeader>
          <ReadOnlyModelCatalogPanel items={providerRoutingConsoleItems} modelCatalog={modelCatalog} />
        </SheetContent>
      </Sheet>
      {/* library.memory shell surface — read-only memory library catalog rendered
          from the existing memoryInspector + memoryRecords + governance summary.
          No memory write/sync/eval, no curator approval, no record body content. */}
      <Sheet open={memorySurfaceOpen} onOpenChange={setMemorySurfaceOpen}>
        <SheetContent side="right" className="overflow-y-auto p-4 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle>메모리 라이브러리</SheetTitle>
            <SheetDescription>
              메모리 거버넌스 · 분포 · 기록 메타데이터 (읽기 전용)
            </SheetDescription>
          </SheetHeader>
          <ReadOnlyMemoryLibraryPanel
            adapterStatus={adapterStatus}
            governanceSummary={memoryGovernanceSummary}
            inspector={memoryInspector}
            records={memoryRecords}
          />
        </SheetContent>
      </Sheet>
      <CommandPalette
        commands={paletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
        open={commandPaletteOpen}
      />
      <CheatSheetOverlay
        onClose={() => setCheatSheetOpen(false)}
        open={cheatSheetOpen}
      />
      {/* 제안1: 전역 단일 승인 액션 표면 — 대기 승인이 있을 때만 하단에 떠서 원터치 허용/거절 */}
      <ApprovalToastBarConnector
        queue={unifiedControlQueueSnapshot.queue}
        requester={approvalToastRequester}
        onApprove={handleConversationApprovePermission}
        onReject={handleConversationRejectPermission}
        onOpenHistory={() => setApprovalDrawerOpen(true)}
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

function nextMakimaDelegationWorkState(status: MakimaDelegationAssignmentView["status"]): {
  activity: AgentActivityStatus;
  lane: MakimaDelegationAssignmentView["lane"];
  status: MakimaDelegationAssignmentView["status"];
} {
  if (status === "planned" || status === "blocked") {
    return { activity: "dispatching", lane: "auto", status: "in_progress" };
  }

  if (status === "in_progress" || status === "running") {
    return { activity: "waiting_approval", lane: "check", status: "ready_for_review" };
  }

  if (status === "ready_for_review" || status === "waiting_approval") {
    return { activity: "idle", lane: "approve", status: "done" };
  }

  return { activity: "idle", lane: "auto", status: "done" };
}
