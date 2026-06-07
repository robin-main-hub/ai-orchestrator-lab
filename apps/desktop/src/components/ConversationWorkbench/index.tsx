import type {
  ApprovalQueueItem,
  BranchExperiment,
  ContextPackTier,
  ConversationMessage,
  ModelDescriptor,
  PermissionMatrixSnapshot,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import { Archive, ChevronDown, Cpu, Database, FileText, Package, Play, Smartphone, Sparkles, Swords, Wrench } from "lucide-react";
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
import { getAgentToolBadgeLabels, getAgentToolProfileSummary } from "../../lib/agentToolProfiles";
import { resolveAgentThinkingIndicator } from "../../lib/agentThinkingIndicator";
import { getConversationWorkbenchVisibility } from "../../lib/conversationWorkbenchVisibility";
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
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { AgentPortrait, type AgentState } from "../shared/AgentActivity";
import { AgentConfigDrawer } from "../AgentConfigDrawer";
import { AgentLiveWorkStatus } from "./AgentLiveWorkStatus";
import { AgentSkillProfilePanel } from "./AgentSkillProfilePanel";

// Sub-components
import { MessageThread } from "./MessageThread";
import { Composer } from "./Composer";

export function ConversationWorkbench({
  activeSessionId,
  agentToolRuntimeLabel,
  agentConfigPanel,
  configFiles,
  agentPersona,
  agents,
  branchExperiments,
  contextPackTier,
  controlQueueContinuity,
  draftAttachments,
  draftMessage,
  maxDraftAttachments,
  memoryAdapterStatus,
  memoryGovernanceLabel,
  memoryRecordCount,
  memoryScope,
  messages,
  onAddDraftAttachments,
  onAdoptBranch,
  onApprovePermission,
  onBackupProjection,
  onContextPackTierChange,
  onCreateBranch,
  onCreateAgentRun,
  onCreateCodingPacket,
  onDraftMessageChange,
  onImportExternalIngress,
  onPromoteToDebate,
  onRejectPermission,
  onRemoveDraftAttachment,
  onSelectAgent,
  onSendMessage,
  onCloseAgentConfig,
  onReturn,
  returnLabel,
  onOpenAgentConfig,
  onUpdateAgentConfig,
  onUpdateAgentPersona,
  pendingProviderRetry,
  permissionSnapshot,
  selectedAgent,
  selectedAgentId,
  selectedModel,
  selectedProvider,
  agentVisualsById,
  agentActivityById,
}: {
  activeSessionId: string;
  agentToolRuntimeLabel?: string;
  agentConfigPanel: { open: boolean; tab: AgentConfigTab };
  configFiles: AgentConfigFile[];
  agentPersona?: AgentPersonaSettings;
  agents: WorkbenchAgent[];
  branchExperiments: BranchExperiment[];
  contextPackTier: ContextPackTier;
  controlQueueContinuity?: ControlQueueContinuitySummary;
  draftAttachments: DraftAttachment[];
  draftMessage: string;
  maxDraftAttachments: number;
  memoryAdapterStatus: "loading" | "ready" | "error";
  memoryGovernanceLabel?: string;
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  messages: ConversationMessage[];
  onAddDraftAttachments: (files: FileList | null) => void;
  onAdoptBranch: () => void;
  onApprovePermission: (sourceItemId: string) => void;
  onBackupProjection: () => void;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onCreateBranch: () => void;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onDraftMessageChange: (value: string) => void;
  onImportExternalIngress: () => void;
  onPromoteToDebate: () => void;
  onRejectPermission: (sourceItemId: string) => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSendMessage: () => void;
  onCloseAgentConfig: () => void;
  onReturn?: () => void;
  returnLabel?: string;
  onOpenAgentConfig: (tab: AgentConfigTab) => void;
  onUpdateAgentConfig: (patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) => void;
  onUpdateAgentPersona: (patch: Partial<AgentPersonaSettings>) => void;
  pendingProviderRetry?: PendingProviderRetry;
  permissionSnapshot: PermissionMatrixSnapshot;
  selectedAgent?: WorkbenchAgent;
  selectedAgentId?: string;
  selectedModel?: ModelDescriptor;
  selectedProvider?: ProviderProfile;
  agentVisualsById?: Record<string, AgentVisualSettings>;
  agentActivityById?: Record<string, AgentActivityStatus>;
}) {
  const persona = agentPersona ?? (selectedAgent ? createDefaultPersonaSettings(selectedAgent) : undefined);
  const memoryMode = selectedProvider?.trustLevel === "trusted" ? "auto" : "manual";
  const attachmentEnabled = Boolean(selectedAgent && modelSupportsAnyAttachment(selectedModel));
  const attachmentAccept = attachmentAcceptForModel(selectedModel);
  const attachmentLimitReached = draftAttachments.length >= maxDraftAttachments;
  const canDelegate =
    selectedAgent?.role === "companion" || selectedAgent?.role === "orchestrator";
  const agentChatContinuity = createAgentChatContinuitySummary({
    adapterStatus: memoryAdapterStatus,
    agentName: selectedAgent?.name,
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
  const selectedAgentDisplayName = selectedAgent ? agentPrimaryDisplayName(selectedAgent) : "에이전트 선택";
  const selectedAgentSubtitle = selectedAgent ? agentSecondaryDisplayLabel(selectedAgent) : "대기";
  const selectedAgentModelRouteLabel = createAgentModelRouteLabel({
    modelId: selectedModel?.id ?? selectedAgent?.modelId,
    modelName: selectedModel?.name,
    providerName: selectedProvider?.name,
  });
  const toolLabels = selectedAgent ? getAgentToolBadgeLabels(selectedAgent.role).slice(0, 3) : [];
  const toolProfileSummary = selectedAgent ? getAgentToolProfileSummary(selectedAgent.role) : undefined;
  const headerMemoryLabel = createAgentChannelHeaderMemoryLabel(memoryScope);
  const personaSoulApplied = Boolean(persona?.soulMdPath || persona?.soulSummary);
  const personaAgentsMdApplied = Boolean(persona?.agentsMdPath || persona?.agentsInstruction);

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
                  {selectedAgentSubtitle} · 현재 모델: {selectedAgentModelRouteLabel}
                </span>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 border-zinc-800 bg-zinc-900/95 p-0 text-zinc-100 backdrop-blur-xl">
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="text-sm font-medium">{selectedAgentDisplayName}</p>
              <p className="text-xs text-zinc-500">
                세션 {activeSessionId.slice(-12)} · {messages.length}개 메시지
              </p>
            </div>
            <div className="space-y-1 p-2">
              <label className="block rounded-md px-3 py-2 hover:bg-zinc-800/40">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">대화 상대</span>
                <select
                  aria-label="현재 대화 봇 선택"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-violet-500"
                  onChange={(event) => onSelectAgent(event.target.value)}
                  value={selectedAgentId ?? ""}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agentPrimaryDisplayName(agent)} · {agent.modelId ?? "모델 연결 대기"}
                    </option>
                  ))}
                </select>
              </label>
              <ConversationMetaRow
                icon={Cpu}
                label="현재 모델"
                value={selectedAgentModelRouteLabel}
              />
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

        <div className="hidden items-center gap-2 text-[11px] text-zinc-500 sm:flex">
          <Database className="h-3.5 w-3.5 text-emerald-500" />
          <span>이전 대화 이어받음</span>
          {controlQueueContinuity?.hasItems ? <span>· {controlQueueContinuity.label}</span> : null}
          {agentToolRuntimeLabel ? <span>· {agentToolRuntimeLabel}</span> : null}
          {headerMemoryLabel ? <span>· {headerMemoryLabel}</span> : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button className="hidden h-8 gap-1.5 px-2 text-xs lg:inline-flex" disabled={!canDelegate} onClick={onPromoteToDebate} size="sm" variant="ghost">
            <Swords className="h-3.5 w-3.5" />
            토론
          </Button>
          <Button className="hidden h-8 gap-1.5 px-2 text-xs md:inline-flex" onClick={onCreateCodingPacket} size="sm" variant="ghost">
            <Package className="h-3.5 w-3.5" />
            패킷
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
              <Button className="w-full justify-start text-xs" onClick={onBackupProjection} size="sm" variant="ghost">
                <Archive className="h-3.5 w-3.5" />
                백업 상태
              </Button>
              <Button className="w-full justify-start text-xs" onClick={onImportExternalIngress} size="sm" variant="ghost">
                <Smartphone className="h-3.5 w-3.5" />
                외부 인입
              </Button>
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
        </div>
      </header>

      {selectedAgent && toolProfileSummary ? (
        <>
          <AgentCapabilityStrip
            continuityDetail={agentChatContinuity.detail}
            displayName={selectedAgentDisplayName}
            memoryQualityLabel={agentChatContinuity.memoryQualityLabel}
            modelLabel={`현재 모델 · ${selectedAgentModelRouteLabel}`}
            toolBoundaryLabel={toolProfileSummary.runtime.boundaryLabel}
            toolGroupLabel={toolProfileSummary.label}
            toolLabels={toolLabels}
            personaAgentsMdApplied={personaAgentsMdApplied}
            personaSoulApplied={personaSoulApplied}
          />
          <div className="shrink-0 border-b border-zinc-900/80 bg-zinc-950/90 px-4 py-2">
            <div className="mx-auto max-w-5xl">
              <AgentSkillProfilePanel role={selectedAgent.role} />
            </div>
          </div>
          {selectedAgentThinkingIndicator ? (
            <AgentLiveWorkStatus displayName={selectedAgentDisplayName} indicator={selectedAgentThinkingIndicator} />
          ) : null}
        </>
      ) : null}

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
        selectedAgent={selectedAgent}
        selectedModel={selectedModel}
        showDelegationChips={workbenchVisibility.showComposerDelegationChips}
      />
    </section>
  );
}

function AgentCapabilityStrip({
  continuityDetail,
  displayName,
  memoryQualityLabel,
  modelLabel,
  toolBoundaryLabel,
  toolGroupLabel,
  toolLabels,
  personaAgentsMdApplied,
  personaSoulApplied,
}: {
  continuityDetail: string;
  displayName: string;
  memoryQualityLabel: string;
  modelLabel: string;
  toolBoundaryLabel: string;
  toolGroupLabel: string;
  toolLabels: string[];
  personaAgentsMdApplied: boolean;
  personaSoulApplied: boolean;
}) {
  return (
    <div className="shrink-0 border-b border-zinc-900/80 bg-zinc-950/95 px-4 py-2">
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto">
        <span className="shrink-0 rounded-full border border-violet-300/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-100">
          {displayName} 전용 방
        </span>
        <span
          className="shrink-0 rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] text-fuchsia-100"
          title={`${personaSoulApplied ? "SOUL.md 적용됨" : "SOUL.md 대기"} · ${personaAgentsMdApplied ? "AGENTS.md 적용됨" : "AGENTS.md 대기"}`}
        >
          {personaSoulApplied && personaAgentsMdApplied ? "SOUL/AGENTS 적용" : "인격 설정 확인"}
        </span>
        <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
          {toolGroupLabel} · {toolBoundaryLabel}
        </span>
        {toolLabels.map((label) => (
          <span
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300"
            key={label}
          >
            {label}
          </span>
        ))}
        <span className="shrink-0 rounded-full border border-emerald-300/15 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100">
          {memoryQualityLabel}
        </span>
        <span className="min-w-40 shrink-0 truncate rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-400">
          {modelLabel}
        </span>
        <span className="min-w-60 truncate text-[11px] text-zinc-600">{continuityDetail}</span>
      </div>
    </div>
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
      <span className="min-w-0 truncate text-right font-mono text-xs text-zinc-100">{value}</span>
    </div>
  );
}

function mapConversationAgentState(status: AgentActivityStatus): AgentState {
  if (status === "preparing") return "thinking";
  if (status === "responding") return "responding";
  return "idle";
}
