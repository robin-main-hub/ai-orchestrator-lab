import type {
  ApprovalQueueItem,
  BranchExperiment,
  ContextPackTier,
  ConversationMessage,
  ModelDescriptor,
  PermissionMatrixSnapshot,
  ProviderProfile,
  ProviderRuntimeReadiness,
} from "@ai-orchestrator/protocol";
import { Activity, Archive, ChevronDown, Cpu, Database, FileText, GitFork, Package, Play, Smartphone, Sparkles, Swords, Wrench } from "lucide-react";
import type { AgentChannelMemoryScope } from "../../lib/agentConversationChannels";
import type { ControlQueueContinuitySummary } from "../../lib/controlQueueContinuity";
import {
  attachmentAcceptForModel,
  createAgentModelRouteLabel,
  createDefaultPersonaSettings,
  modelSupportsAnyAttachment,
} from "../../lib/helpers";
import {
  agentInitialsForDisplay,
  agentPrimaryDisplayName,
  agentSecondaryDisplayLabel,
} from "../../lib/agentDisplay";
import { createAgentChatContinuitySummary } from "../../lib/agentChatContinuity";
import { createAgentChannelHeaderMemoryLabel } from "../../lib/agentChannelStatus";
import { createAgentConversationPromptSuggestions } from "../../lib/agentConversationPrompts";
import { getAgentToolBadgeLabels, getAgentToolProfileSummary } from "../../lib/agentToolProfiles";
import { selectAgentRuntimeConfigFiles } from "../../lib/agentRuntimeConfig";
import { resolveAgentThinkingIndicator } from "../../lib/agentThinkingIndicator";
import { getConversationWorkbenchVisibility } from "../../lib/conversationWorkbenchVisibility";
import {
  createMakimaDelegationCards,
  type MakimaDelegationAssignmentView,
  type MakimaDelegationCard,
} from "../../lib/makimaDelegation";
import type {
  AgentConfigFile,
  AgentConfigTab,
  AgentPersonaSettings,
  DraftAttachment,
  PendingProviderRetry,
  WorkbenchAgent,
  AgentVisualSettings,
  AgentActivityStatus,
} from "../../types";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { AgentPortrait, type AgentState } from "../shared/AgentActivity";
import { AgentConfigDrawer } from "../AgentConfigDrawer";
import { AgentConversationFlowPanel } from "./AgentConversationFlowPanel";
import { AgentHermesControlCard } from "./AgentHermesControlCard";
import { LiveTerminalPanel } from "./LiveTerminalPanel";
import {
  ChatSidePanel,
  ChatSidePanelMenu,
  ChatSidePanelStub,
  type ChatSidePanelMode,
} from "./ChatSidePanel";
import { AgentLiveWorkStatus } from "./AgentLiveWorkStatus";
import { AgentMemoryContinuityPanel } from "./AgentMemoryContinuityPanel";
import { AgentQuickSwitchPanel } from "./AgentQuickSwitchPanel";
import { AgentRosterSkillPicker } from "./AgentRosterSkillPicker";
import { AgentSkillProfilePanel } from "./AgentSkillProfilePanel";
import { ProviderReadinessPreflight } from "./ProviderReadinessPreflight";
import { MakimaDelegationConsole } from "./MakimaDelegationConsole";
import { WorkTheater } from "./WorkTheater";
import { WorkspaceDiffPanel, WorkspaceFilesPanel } from "./WorkspaceChangesPanel";
import { buildForkBrief, forkMissionFromConversation } from "../../lib/conversationFork";
import { workbenchMissionStore } from "../../lib/workbenchMissions";
import {
  contextUsagePercent,
  estimateCostUsd,
  type ConversationUsageSummary,
} from "../../lib/conversationUsage";

// Sub-components
import { MessageThread } from "./MessageThread";
import { Composer } from "./Composer";

type AgentDetailPanel = "none" | "memory" | "model" | "skills";

export function ConversationWorkbench({
  activeSessionId,
  agentsPanel,
  agentToolRuntimeLabel,
  agentConfigPanel,
  configFiles,
  agentPersona,
  agents,
  branchExperiments,
  contextPackTier,
  controlQueueContinuity,
  delegationAssignmentsByAgentId,
  draftAttachments,
  draftMessage,
  maxDraftAttachments,
  memoryAdapterStatus,
  memoryGovernanceLabel,
  memoryRecordCount,
  memoryScope,
  messageCountByAgentId,
  messages,
  onAddDraftAttachments,
  onAdoptBranch,
  onApprovePermission,
  onBackupProjection,
  onContextPackTierChange,
  onCreateBranch,
  onCreateAgentRun,
  onCreateCodingPacket,
  onCreateDelegationAssignment,
  onDraftMessageChange,
  onOpenDelegatedAgentConversation,
  onProgressDelegationAssignment,
  onImportExternalIngress,
  onPromoteToDebate,
  onRejectPermission,
  onRemoveDraftAttachment,
  onSelectAgent,
  onSendMessage,
  onSendSuggestion,
  onCloseAgentConfig,
  onReturn,
  returnLabel,
  onOpenAgentConfig,
  onAssignModel,
  onAssignProvider,
  onRefreshProviderModels,
  onUpdateAgentConfig,
  onUpdateAgentPersona,
  pendingProviderRetry,
  permissionSnapshot,
  providerReadiness,
  defaultCredentialProviderIds,
  modelCatalog,
  providers,
  selectedAgent,
  selectedAgentId,
  selectedModel,
  selectedProvider,
  viewMode = "chat",
  onChangeViewMode,
  agentVisualsById,
  agentActivityById,
  agentMode = "build",
  onAgentModeChange,
  streamingPreview,
  queuedMessages,
  onRemoveQueuedMessage,
  onStopTurn,
  usageSummary,
  compactedVersion,
  onRollbackTurn,
  onApproveCommandPattern,
}: {
  activeSessionId: string;
  /** "에이전트" 사이드 패널 모드에 주입되는 에이전트 레일 (App의 AgentsSidebar) */
  agentsPanel?: React.ReactNode;
  agentToolRuntimeLabel?: string;
  agentConfigPanel: { open: boolean; tab: AgentConfigTab };
  configFiles: AgentConfigFile[];
  agentPersona?: AgentPersonaSettings;
  agents: WorkbenchAgent[];
  branchExperiments: BranchExperiment[];
  contextPackTier: ContextPackTier;
  controlQueueContinuity?: ControlQueueContinuitySummary;
  delegationAssignmentsByAgentId?: Record<string, MakimaDelegationAssignmentView>;
  draftAttachments: DraftAttachment[];
  draftMessage: string;
  maxDraftAttachments: number;
  memoryAdapterStatus: "loading" | "ready" | "error";
  memoryGovernanceLabel?: string;
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  messageCountByAgentId?: Record<string, number>;
  messages: ConversationMessage[];
  onAddDraftAttachments: (files: FileList | null) => void;
  onAdoptBranch: () => void;
  onApprovePermission: (sourceItemId: string) => void;
  onBackupProjection: () => void;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onCreateBranch: () => void;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onCreateDelegationAssignment?: (card: MakimaDelegationCard) => void;
  onDraftMessageChange: (value: string) => void;
  onOpenDelegatedAgentConversation?: (agentId: string) => void;
  onProgressDelegationAssignment?: (card: MakimaDelegationCard, assignment: MakimaDelegationAssignmentView) => void;
  onImportExternalIngress: () => void;
  onPromoteToDebate: () => void;
  onRejectPermission: (sourceItemId: string) => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSendMessage: () => void;
  /** 추천대화 즉시 전송 (드래프트 거치지 않음) */
  onSendSuggestion?: (text: string) => void;
  onCloseAgentConfig: () => void;
  onReturn?: () => void;
  returnLabel?: string;
  onOpenAgentConfig: (tab: AgentConfigTab) => void;
  onAssignModel: (agentId: string, modelId: string) => void;
  onAssignProvider: (agentId: string, providerId: string) => void;
  onRefreshProviderModels?: (providerId: string) => Promise<void> | void;
  onUpdateAgentConfig: (patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) => void;
  onUpdateAgentPersona: (patch: Partial<AgentPersonaSettings>) => void;
  pendingProviderRetry?: PendingProviderRetry;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  defaultCredentialProviderIds?: Set<string>;
  modelCatalog: Record<string, ModelDescriptor[]>;
  providers: ProviderProfile[];
  selectedAgent?: WorkbenchAgent;
  selectedAgentId?: string;
  selectedModel?: ModelDescriptor;
  selectedProvider?: ProviderProfile;
  viewMode?: "chat" | "agents";
  /** 대화↔에이전트 뷰 토글 (App이 소유) */
  onChangeViewMode?: (mode: "chat" | "agents") => void;
  agentVisualsById?: Record<string, AgentVisualSettings>;
  agentActivityById?: Record<string, AgentActivityStatus>;
  /** 항목 4 — 플랜(읽기 전용)/빌드 모드 */
  agentMode?: "build" | "plan";
  onAgentModeChange?: (mode: "build" | "plan") => void;
  /** 항목 1 — 진행 중 스트리밍 텍스트 */
  streamingPreview?: { agentId: string; text: string } | null;
  /** 항목 8 — 턴 종료 후 자동 발송될 대기 메시지 */
  queuedMessages?: string[];
  onRemoveQueuedMessage?: (index: number) => void;
  /** 항목 1 — 진행 중 턴 중지 */
  onStopTurn?: () => void;
  /** 항목 12 — 토큰/비용 HUD */
  usageSummary?: ConversationUsageSummary;
  /** 항목 6 — 자동 압축 적용 횟수(배지) */
  compactedVersion?: number;
  /** 항목 9 — 턴 롤백 */
  onRollbackTurn?: (assistantMessageId: string) => void;
  /** 항목 10 — "이 명령 계열 세션 동안 허용" */
  onApproveCommandPattern?: (command: string) => void;
}) {
  const [activeAgentDetailPanel, setActiveAgentDetailPanel] = useState<AgentDetailPanel>("none");
  const persona = agentPersona ?? (selectedAgent ? createDefaultPersonaSettings(selectedAgent) : undefined);
  const memoryMode = selectedProvider?.trustLevel === "trusted" ? "auto" : "manual";
  const attachmentEnabled = Boolean(selectedAgent && modelSupportsAnyAttachment(selectedModel));
  const attachmentAccept = attachmentAcceptForModel(selectedModel);
  const attachmentLimitReached = draftAttachments.length >= maxDraftAttachments;
  const canDelegate =
    selectedAgent?.role === "companion" || selectedAgent?.role === "orchestrator";
  const selectedAgentDisplayName = selectedAgent ? agentPrimaryDisplayName(selectedAgent) : "에이전트 선택";
  const agentChatContinuity = createAgentChatContinuitySummary({
    adapterStatus: memoryAdapterStatus,
    agentName: selectedAgentDisplayName,
    memoryRecordCount,
    messageCount: messages.length,
    toolLabels: selectedAgent ? getAgentToolBadgeLabels(selectedAgent.role) : [],
  });
  
  // To create preview list and visibility check, we pass state/counters
  // delegation calculation is done in MessageThread locally, so visibility helper can also use it
  const delegationCount = messages.filter(
    (m) => m.role === "assistant" && (m.metadata?.delegationTags || m.metadata?.delegations)
  ).length;

  const workbenchVisibility = getConversationWorkbenchVisibility({
    delegationItemCount: delegationCount,
    pendingApprovalCount: permissionSnapshot.queue.length,
    pendingProviderRetry: Boolean(pendingProviderRetry),
  });
  const selectedAgentActivity = selectedAgent ? agentActivityById?.[selectedAgent.id] ?? "idle" : "idle";
  const selectedAgentState = mapConversationAgentState(selectedAgentActivity);
  const selectedAgentThinkingIndicator = resolveAgentThinkingIndicator(selectedAgent?.id, agentActivityById);
  const selectedAgentInitials = selectedAgent ? agentInitialsForDisplay(selectedAgent) : "AI";
  const selectedAgentSubtitle = selectedAgent ? agentSecondaryDisplayLabel(selectedAgent) : "대기";
  const selectedAgentWorkStatusLabel = createAgentWorkStatusLabel(selectedAgentActivity, selectedAgentDisplayName);
  const latestConversationMessage = messages.at(-1);
  const latestAssistantMessageContent =
    latestConversationMessage?.role === "assistant" ? latestConversationMessage.content : undefined;
  const promptSuggestions = selectedAgent
    ? createAgentConversationPromptSuggestions({
        activity: selectedAgentActivity,
        displayName: selectedAgentDisplayName,
        lastAssistantMessageContent: latestAssistantMessageContent,
        memoryRecordCount,
        messageCount: messages.length,
        pendingApprovalCount: permissionSnapshot.queue.length,
        role: selectedAgent.role,
      })
    : [];
  const latestUserMessageContent = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const delegationRequest = draftMessage.trim() || latestUserMessageContent.trim();
  const makimaDelegationCards =
    selectedAgent?.role === "orchestrator"
      ? createMakimaDelegationCards({
          agents,
          request: delegationRequest,
        })
      : [];
  const selectedAgentModelRouteSource =
    selectedAgent?.modelId && selectedModel?.id === selectedAgent.modelId
      ? "agent"
      : selectedProvider?.defaultModel && selectedModel?.id === selectedProvider.defaultModel
        ? "provider_default"
        : selectedModel
          ? "catalog"
          : undefined;
  const selectedAgentModelRouteLabel = createAgentModelRouteLabel({
    modelId: selectedModel?.id ?? selectedAgent?.modelId,
    modelName: selectedModel?.name,
    providerName: selectedProvider?.name,
    source: selectedAgentModelRouteSource,
  });
  const toolLabels = selectedAgent ? getAgentToolBadgeLabels(selectedAgent.role).slice(0, 3) : [];
  const toolProfileSummary = selectedAgent ? getAgentToolProfileSummary(selectedAgent.role) : undefined;
  const selectedAgentRuntimeConfigFiles = selectedAgent ? selectAgentRuntimeConfigFiles(selectedAgent, configFiles) : [];
  const selectedAgentLearnedSkillLabels = selectedAgentRuntimeConfigFiles
    .filter((file) => file.kind === "skill")
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .map((file) => file.label);
  const headerMemoryLabel = createAgentChannelHeaderMemoryLabel(memoryScope);
  const personaSoulApplied = Boolean(persona?.soulMdPath || persona?.soulSummary);
  const personaAgentsMdApplied = Boolean(persona?.agentsMdPath || persona?.agentsInstruction);
  const pendingRetryAgent = pendingProviderRetry?.agentId
    ? agents.find((agent) => agent.id === pendingProviderRetry.agentId) ?? selectedAgent
    : undefined;
  const pendingRetryAgentName = pendingRetryAgent ? agentPrimaryDisplayName(pendingRetryAgent) : undefined;
  const focusAgentsPanel = (focusId: string) => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-focus-id="${focusId}"]`)?.focus({ preventScroll: false });
    });
  };
  const focusMissionBriefPanel = () => {
    setActiveAgentDetailPanel("none");
    focusAgentsPanel("agent-mission-brief");
  };
  const openAgentDetailPanel = (panel: Exclude<AgentDetailPanel, "none">, focusId: string) => {
    setActiveAgentDetailPanel(panel);
    focusAgentsPanel(focusId);
  };
  const refreshSelectedProviderModels = () => {
    if (selectedProvider?.id && onRefreshProviderModels) {
      void onRefreshProviderModels(selectedProvider.id);
    }
  };
  const focusQuickSwitchPanel = () => {
    refreshSelectedProviderModels();
    openAgentDetailPanel("model", "agent-quick-switch-panel");
  };
  const focusMemoryPanel = () => openAgentDetailPanel("memory", "agent-memory-continuity-panel");
  const focusSkillPanel = () => openAgentDetailPanel("skills", "agent-skill-profile-panel");
  const openAgentDetailForRoster = (agentId: string, panel: Exclude<AgentDetailPanel, "none">) => {
    onSelectAgent(agentId);
    openAgentDetailPanel(
      panel,
      panel === "model"
        ? "agent-quick-switch-panel"
        : panel === "memory"
          ? "agent-memory-continuity-panel"
          : "agent-skill-profile-panel",
    );
  };
  // Codex식 확장 패널 — 대화를 가리지 않는 우측 분할
  const [sidePanelMode, setSidePanelMode] = useState<ChatSidePanelMode>("none");
  const backgroundAssignmentCount = Object.keys(delegationAssignmentsByAgentId ?? {}).length;

  const applyPromptSuggestion = (prompt: string) => {
    onDraftMessageChange(prompt);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-focus-id='composer-textarea']")?.focus({ preventScroll: false });
    });
  };
  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-focus-id='composer-textarea']")?.focus({ preventScroll: false });
    });
  };

  return (
    <section className="conversation-workbench flex h-full flex-col bg-zinc-950">
      {agentConfigPanel.open && selectedAgent && persona ? (
        <AgentConfigDrawer
          activeTab={agentConfigPanel.tab}
          agent={selectedAgent}
          configFiles={configFiles}
          memoryMode={memoryMode}
          onClose={onCloseAgentConfig}
          onUpdateAgentConfig={onUpdateAgentConfig}
          onUpdatePersona={onUpdateAgentPersona}
          persona={persona}
          provider={selectedProvider}
          onReturn={onReturn}
          returnLabel={returnLabel}
        />
      ) : null}

      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/60 bg-zinc-950 px-4">
        <Popover>
          <PopoverTrigger asChild>
            <button className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-900/60">
              <AgentPortrait
                initials={selectedAgentInitials}
                state={selectedAgentState}
                size="sm"
                tintClassName="bg-violet-600/15 text-violet-300"
              />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-zinc-100">
                  <span className="truncate">{selectedAgentDisplayName}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform group-data-[state=open]:rotate-180" />
                </span>
                <span className="truncate text-[11px] text-zinc-500">
                  {selectedAgentSubtitle} · 대화 모델: {selectedAgentModelRouteLabel}
                </span>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 border-zinc-800 bg-zinc-900/95 p-0 text-zinc-100 backdrop-blur-xl">
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="text-sm font-medium">{selectedAgentDisplayName}</p>
              <p className="text-xs text-zinc-500">
                전용 대화방 · {messages.length}개 메시지
              </p>
            </div>
            <div className="space-y-1 p-2">
              <AgentRosterSkillPicker
                agentActivityById={agentActivityById}
                agents={agents}
                messageCountByAgentId={messageCountByAgentId}
                onOpenMemory={(agentId) => openAgentDetailForRoster(agentId, "memory")}
                onOpenModel={(agentId) => openAgentDetailForRoster(agentId, "model")}
                onOpenSkills={(agentId) => openAgentDetailForRoster(agentId, "skills")}
                onSelectAgent={onSelectAgent}
                selectedAgentId={selectedAgentId}
              />
              <ConversationMetaRow
                icon={Cpu}
                label="대화 모델"
                value={selectedAgentModelRouteLabel}
              />
              <ConversationMetaRow icon={Activity} label="현재 상태" value={selectedAgentWorkStatusLabel} />
              <ConversationMetaRow icon={Database} label="기억" value={`${memoryRecordCount}건 · ${memoryGovernanceLabel ?? memoryMode}`} />
              <ConversationMetaRow
                icon={Sparkles}
                label="인격"
                value={`${personaSoulApplied ? "SOUL 적용" : "SOUL 대기"} · ${personaAgentsMdApplied ? "AGENTS 적용" : "AGENTS 대기"}`}
              />
              <ConversationMetaRow icon={Wrench} label="도구" value={toolLabels.length > 0 ? toolLabels.join(", ") : "연결 대기"} />
              <ConversationMetaRow icon={Sparkles} label="연속성" value={agentChatContinuity.memoryQualityLabel} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-zinc-800 p-2">
              <Button className="h-8 text-xs" onClick={() => onOpenAgentConfig("profile")} size="sm" variant="ghost">
                프로필
              </Button>
              <Button className="h-8 text-xs" onClick={() => onOpenAgentConfig("injection")} size="sm" variant="ghost">
                기억 주입
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label="대화 상태 요약 보기"
              className="hidden h-8 gap-1.5 rounded-full border border-zinc-800/80 bg-zinc-900/70 px-2 text-[11px] text-zinc-400 hover:border-cyan-500/30 hover:text-cyan-100 sm:inline-flex"
              size="sm"
              variant="ghost"
            >
              <Database className="h-3.5 w-3.5 text-cyan-400" />
              상태 요약
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 border-zinc-800 bg-zinc-900/95 p-3 text-zinc-100 backdrop-blur-xl">
            <div className="space-y-2 text-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">대화 연속성</p>
              <ConversationMetaRow icon={Database} label="이전 대화" value="이어받음" />
              {controlQueueContinuity?.hasItems ? (
                <ConversationMetaRow icon={Archive} label="큐 연속성" value={controlQueueContinuity.label} />
              ) : null}
              {agentToolRuntimeLabel ? (
                <ConversationMetaRow icon={Wrench} label="도구 상태" value={agentToolRuntimeLabel} />
              ) : null}
              {headerMemoryLabel ? (
                <ConversationMetaRow icon={Sparkles} label="기억 상태" value={headerMemoryLabel} />
              ) : null}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex shrink-0 items-center gap-1">
          {onChangeViewMode ? (
            <div className="mr-1 hidden items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5 md:inline-flex">
              <button
                aria-pressed={viewMode === "chat"}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${viewMode === "chat" ? "bg-violet-400/15 text-violet-100" : "text-zinc-400 hover:text-zinc-100"}`}
                onClick={() => onChangeViewMode("chat")}
                title="대화 중심 뷰"
                type="button"
              >
                대화
              </button>
              <button
                aria-pressed={viewMode === "agents"}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${viewMode === "agents" ? "bg-violet-400/15 text-violet-100" : "text-zinc-400 hover:text-zinc-100"}`}
                onClick={() => onChangeViewMode("agents")}
                title="에이전트 상세·스킬·기억·위임 뷰"
                type="button"
              >
                에이전트
              </button>
            </div>
          ) : null}
          {usageSummary && usageSummary.turns > 0 ? (
            <UsageHudChip
              compactedVersion={compactedVersion}
              contextWindow={selectedModel?.contextWindow}
              modelId={selectedModel?.id}
              usage={usageSummary}
            />
          ) : null}
          <Button
            className="hidden h-8 gap-1.5 px-2 text-xs lg:inline-flex"
            disabled={!canDelegate}
            onClick={onPromoteToDebate}
            size="sm"
            title={canDelegate ? "현재 대화를 토론으로 넘깁니다" : "오케스트레이터 또는 동반자 역할에서만 토론으로 넘길 수 있습니다"}
            variant="ghost"
          >
            <Swords className="h-3.5 w-3.5" />
            토론
          </Button>
          <Button className="hidden h-8 gap-1.5 px-2 text-xs xl:inline-flex" onClick={onCreateAgentRun} size="sm" variant="ghost">
            <Play className="h-3.5 w-3.5" />
            실행
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button aria-label="대화 작업 더 보기" className="h-8 w-8" size="icon" variant="ghost">
                <FileText className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 border-zinc-800 bg-zinc-900/95 p-2 text-zinc-100 backdrop-blur-xl">
              <Button className="w-full justify-start text-xs" onClick={onCreateBranch} size="sm" variant="ghost">
                <FileText className="h-3.5 w-3.5" />
                분기 생성 ({branchExperiments.length})
              </Button>
              <Button
                className="w-full justify-start text-xs"
                disabled={!branchExperiments.some((branch) => branch.status !== "adopted")}
                onClick={onAdoptBranch}
                size="sm"
                variant="ghost"
              >
                <FileText className="h-3.5 w-3.5" />
                분기 채택
              </Button>
            </PopoverContent>
          </Popover>
          <ChatSidePanelMenu
            backgroundBadge={backgroundAssignmentCount || undefined}
            mode={sidePanelMode}
            onChangeMode={setSidePanelMode}
          />
        </div>
      </header>

      {viewMode === "agents" && selectedAgent && toolProfileSummary ? (
        <>
          <AgentHermesControlCard
            continuityDetail={agentChatContinuity.detail}
            displayName={selectedAgentDisplayName}
            learnedSkillLabels={selectedAgentLearnedSkillLabels}
            memoryQualityLabel={agentChatContinuity.memoryQualityLabel}
            modelLabel={`대화 모델 · ${selectedAgentModelRouteLabel}`}
            nextPrompt={promptSuggestions[0]}
            onApplyNextPrompt={applyPromptSuggestion}
            onEditAgents={() => onOpenAgentConfig("agents_md")}
            onEditMemory={focusMemoryPanel}
            onEditModel={focusQuickSwitchPanel}
            onEditSoul={() => onOpenAgentConfig("soul")}
            onFocusChat={focusComposer}
            onViewSkills={focusSkillPanel}
            toolBoundaryLabel={toolProfileSummary.runtime.boundaryLabel}
            toolGroupLabel={toolProfileSummary.label}
            toolLabels={toolLabels}
            personaAgentsMdApplied={personaAgentsMdApplied}
            personaSoulApplied={personaSoulApplied}
            workStatusLabel={selectedAgentWorkStatusLabel}
          />
          {activeAgentDetailPanel !== "none" ? (
            <div className="shrink-0 border-b border-zinc-900/80 bg-zinc-950/90 px-4 py-2">
              <div className="mx-auto max-w-5xl">
                {activeAgentDetailPanel === "memory" ? (
                  <div className="grid gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                    <AgentMemoryContinuityPanel
                      adapterStatus={memoryAdapterStatus}
                      agentName={selectedAgentDisplayName}
                      memoryRecordCount={memoryRecordCount}
                      memoryScope={memoryScope}
                      messageCount={messages.length}
                      onEditAgents={() => onOpenAgentConfig("agents_md")}
                      onEditMemory={() => onOpenAgentConfig("injection")}
                      onEditSoul={() => onOpenAgentConfig("soul")}
                      onViewTools={focusSkillPanel}
                      personaAgentsMdApplied={personaAgentsMdApplied}
                      personaSoulApplied={personaSoulApplied}
                      toolLabels={toolLabels}
                    />
                    <AgentConversationFlowPanel
                      adapterStatus={memoryAdapterStatus}
                      memoryRecordCount={memoryRecordCount}
                      memoryScope={memoryScope}
                      selectedAgent={selectedAgent}
                      selectedModel={selectedModel}
                      selectedProvider={selectedProvider}
                    />
                  </div>
                ) : null}
                {activeAgentDetailPanel === "skills" ? (
                  <AgentSkillProfilePanel
                    displayName={selectedAgentDisplayName}
                    onOpenConfig={() => onOpenAgentConfig("agents_md")}
                    onViewToolOptions={focusMemoryPanel}
                    role={selectedAgent.role}
                    runtimeConfigFiles={selectedAgentRuntimeConfigFiles}
                  />
                ) : null}
                {activeAgentDetailPanel === "model" ? (
                  <AgentQuickSwitchPanel
                    defaultCredentialProviderIds={defaultCredentialProviderIds}
                    modelCatalog={modelCatalog}
                    onAssignModel={onAssignModel}
                    onAssignProvider={onAssignProvider}
                    onBack={focusMissionBriefPanel}
                    onRefreshModels={onRefreshProviderModels}
                    onUpdateAgentConfig={onUpdateAgentConfig}
                    providers={providers}
                    selectedAgent={selectedAgent}
                    selectedProvider={selectedProvider}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          {selectedAgentThinkingIndicator ? (
            <AgentLiveWorkStatus displayName={selectedAgentDisplayName} indicator={selectedAgentThinkingIndicator} />
          ) : null}
          <ProviderReadinessPreflight
            pendingRetryAgentName={pendingRetryAgentName}
            providerName={selectedProvider?.name}
            readiness={providerReadiness}
            selectedModelName={selectedModel?.name ?? selectedModel?.id ?? selectedAgent?.modelId}
          />
        </>
      ) : null}

      {viewMode === "agents" && selectedAgent?.role === "orchestrator" && onCreateDelegationAssignment &&
       (makimaDelegationCards.length > 0 || backgroundAssignmentCount > 0) && sidePanelMode !== "background" ? (
        <button
          className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-violet-500/[0.07] px-4 py-1.5 text-left text-[11.5px] text-violet-200 transition hover:bg-violet-500/[0.12]"
          onClick={() => setSidePanelMode("background")}
          type="button"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
          백그라운드 작업 — 위임 후보 {makimaDelegationCards.length}건 · 출격 {backgroundAssignmentCount}명 (패널에서 보기)
        </button>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
      <MessageThread
        agentChatContinuity={agentChatContinuity}
        messages={messages}
        selectedAgent={selectedAgent}
        workbenchVisibility={workbenchVisibility}
        permissionSnapshotQueue={permissionSnapshot.queue}
        pendingProviderRetry={pendingProviderRetry}
        onApprovePermission={onApprovePermission}
        onRejectPermission={onRejectPermission}
        agents={agents}
        agentVisualsById={agentVisualsById}
        agentActivityById={agentActivityById}
        streamingPreview={streamingPreview}
        onRollbackTurn={onRollbackTurn}
        onApproveCommandPattern={onApproveCommandPattern}
      />

      <Composer
        attachmentAccept={attachmentAccept}
        attachmentEnabled={attachmentEnabled}
        attachmentLimitReached={attachmentLimitReached}
        draftAttachments={draftAttachments}
        draftMessage={draftMessage}
        continuityPlaceholder={agentChatContinuity.placeholder}
        maxDraftAttachments={maxDraftAttachments}
        onAddDraftAttachments={onAddDraftAttachments}
        onDraftMessageChange={onDraftMessageChange}
        onRemoveDraftAttachment={onRemoveDraftAttachment}
        onSendMessage={onSendMessage}
        onSendSuggestion={onSendSuggestion}
        promptSuggestions={promptSuggestions}
        selectedAgent={selectedAgent}
        selectedModel={selectedModel}
        showDelegationChips={workbenchVisibility.showComposerDelegationChips}
        agentMode={agentMode}
        onAgentModeChange={onAgentModeChange}
        turnActive={selectedAgentActivity === "tooling" || selectedAgentActivity === "preparing"}
        onStopTurn={onStopTurn}
        queuedMessages={queuedMessages}
        onRemoveQueuedMessage={onRemoveQueuedMessage}
      />
        </div>

        <ChatSidePanel mode={sidePanelMode} onClose={() => setSidePanelMode("none")}>
          {sidePanelMode === "background" ? (
            <>
              <ForkConversationButton
                draft={draftMessage}
                messages={messages}
                sessionTitle={selectedAgent?.name}
              />
              {onCreateDelegationAssignment ? (
                <MakimaDelegationConsole
                assignmentsByAgentId={delegationAssignmentsByAgentId}
                cards={makimaDelegationCards}
                onCreateAllAssignments={(cards) => cards.forEach(onCreateDelegationAssignment)}
                onCreateAssignment={onCreateDelegationAssignment}
                onOpenAssignedAgent={onOpenDelegatedAgentConversation}
                  onProgressAssignment={onProgressDelegationAssignment}
                  request={delegationRequest}
                />
              ) : (
                <ChatSidePanelStub mode="background" />
              )}
            </>
          ) : null}
          {sidePanelMode === "plan" ? (
            <WorkTheater
              agents={agents}
              assignmentsByAgentId={delegationAssignmentsByAgentId}
              cards={makimaDelegationCards}
              onOpenAgent={onOpenDelegatedAgentConversation}
            />
          ) : null}
          {sidePanelMode === "terminal" ? (
            <LiveTerminalPanel sessionId={activeSessionId} />
          ) : null}
          {sidePanelMode === "agents" ? (
            agentsPanel ? (
              <div className="chat-side-panel-agents p-2">{agentsPanel}</div>
            ) : (
              <ChatSidePanelStub mode="agents" />
            )
          ) : null}
          {sidePanelMode === "diff" ? <WorkspaceDiffPanel /> : null}
          {sidePanelMode === "files" ? <WorkspaceFilesPanel /> : null}
        </ChatSidePanel>
      </div>
    </section>
  );
}

/** 항목 6·12 — 토큰/비용 HUD 칩: 컨텍스트 80% 이상이면 경고색, 압축 적용 시 배지 */
function UsageHudChip({
  usage,
  modelId,
  contextWindow,
  compactedVersion,
}: {
  usage: ConversationUsageSummary;
  modelId?: string;
  contextWindow?: number;
  compactedVersion?: number;
}) {
  const percent = contextUsagePercent(usage.lastInputTokens, contextWindow);
  const costUsd = usage.estimatedCostUsd ?? estimateCostUsd(modelId, usage);
  const warning = percent >= 80;
  const formatTokens = (value: number) =>
    value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[10.5px] tabular-nums md:inline-flex ${
        warning
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-zinc-800/80 bg-zinc-900/70 text-zinc-400"
      }`}
      data-testid="conversation-usage-hud"
      title={`입력 ${usage.inputTokens.toLocaleString()} · 출력 ${usage.outputTokens.toLocaleString()} 토큰 · ${usage.turns}턴${
        costUsd !== undefined ? ` · 약 $${costUsd.toFixed(4)}` : ""
      }${contextWindow ? ` · 컨텍스트 ${percent}%` : ""}`}
    >
      <Cpu className="h-3 w-3" />
      {formatTokens(usage.totalTokens)} tok
      {costUsd !== undefined ? <span>· ${costUsd >= 0.01 ? costUsd.toFixed(2) : costUsd.toFixed(4)}</span> : null}
      {contextWindow && percent > 0 ? <span className={warning ? "font-semibold" : ""}>· {percent}%</span> : null}
      {compactedVersion ? (
        <span className="rounded-full bg-cyan-500/15 px-1.5 text-cyan-300">압축됨 v{compactedVersion}</span>
      ) : null}
    </span>
  );
}

function ConversationMetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-zinc-800/40">
      <span className="flex items-center gap-2 text-xs text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-xs font-medium text-zinc-100">{value}</span>
    </div>
  );
}

function mapConversationAgentState(status: AgentActivityStatus): AgentState {
  if (status === "preparing") return "thinking";
  if (status === "responding" || status === "tooling" || status === "capturing" || status === "dispatching" || status === "testing") {
    return "responding";
  }
  if (status === "waiting_approval") return "waiting_approval";
  if (status === "error") return "error";
  return "idle";
}

function createAgentWorkStatusLabel(status: AgentActivityStatus, displayName: string): string {
  if (status === "preparing") return `${displayName}가 요청을 정리하는 중`;
  if (status === "tooling") return `${displayName}가 도구 후보를 고르는 중`;
  if (status === "capturing") return `${displayName}가 작업창을 읽는 중`;
  if (status === "dispatching") return `${displayName}가 명령을 전달하는 중`;
  if (status === "testing") return `${displayName}가 검증을 돌리는 중`;
  if (status === "waiting_approval") return `${displayName}가 승인을 기다리는 중`;
  if (status === "responding") return `${displayName}가 답변을 다듬는 중`;
  if (status === "error") return `${displayName}가 막힌 원인을 정리하는 중`;
  return `${displayName}가 다음 말을 기다리는 중`;
}

/** Phase B — 이 대화를 격리 worker 미션으로 포크 (코딩 탭 Mission Board에 나타남) */
function ForkConversationButton({
  messages,
  draft,
  sessionTitle,
}: {
  messages: ConversationMessage[];
  draft: string;
  sessionTitle?: string;
}) {
  const [forked, setForked] = useState<string | null>(null);
  const canFork = messages.some((message) => message.role === "user") || draft.trim().length > 0;
  return (
    <div className="border-b border-white/10 p-3">
      <button
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/10 px-3 py-2.5 text-[12.5px] font-semibold text-violet-100 transition-colors hover:bg-violet-500/20 disabled:opacity-40"
        disabled={!canFork}
        onClick={() => {
          const brief = buildForkBrief({ messages, draft });
          const mission = forkMissionFromConversation({ brief, sessionTitle });
          workbenchMissionStore.add(mission);
          setForked(mission.title);
        }}
        type="button"
      >
        <GitFork className="h-4 w-4" /> 이 대화를 worker로 포크
      </button>
      {forked ? (
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-200">
          포크됨 — <span className="font-semibold">{forked}</span>. 코딩 탭의 Mission Board에서 격리 worker(worktree·tmux)로 이어집니다.
          자동 병합은 막혀 있고 diff/verify 게이트를 거칩니다.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          현재 대화의 맥락과 @멘션 파일을 brief로 묶어 격리 worker 미션을 만듭니다.
        </p>
      )}
    </div>
  );
}
