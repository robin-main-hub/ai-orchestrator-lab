import type {
  ApprovalQueueItem,
  BranchExperiment,
  ContextPackTier,
  ConversationMessage,
  ModelDescriptor,
  PermissionMatrixSnapshot,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import type { AgentChannelMemoryScope } from "../../lib/agentConversationChannels";
import type { ControlQueueContinuitySummary } from "../../lib/controlQueueContinuity";
import {
  attachmentAcceptForModel,
  createDefaultPersonaSettings,
  modelSupportsAnyAttachment,
} from "../../lib/helpers";
import { createAgentChatContinuitySummary } from "../../lib/agentChatContinuity";
import { getAgentToolBadgeLabels } from "../../lib/agentToolProfiles";
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
import { AgentConfigDrawer } from "../AgentConfigDrawer";

// Sub-components
import { MessageThread } from "./MessageThread";
import { Composer } from "./Composer";
import { WorkbenchHeader } from "./WorkbenchHeader";
import { ActionStrip } from "./ActionStrip";
import { InboxApprovalStrip } from "./ApprovalQueue";
import { AgentChannelStatusBar } from "./AgentChannelStatusBar";
import { AgentConversationFlowPanel } from "./AgentConversationFlowPanel";

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
  const adoptedBranchCount = branchExperiments.filter((branch) => branch.status === "adopted").length;
  const latestBranch = branchExperiments[0];
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

      <WorkbenchHeader
        agents={agents}
        contextPackTier={contextPackTier}
        memoryMode={memoryMode}
        onContextPackTierChange={onContextPackTierChange}
        onOpenAgentConfig={onOpenAgentConfig}
        onSelectAgent={onSelectAgent}
        persona={persona}
        selectedAgent={selectedAgent}
        selectedAgentId={selectedAgentId}
        selectedModel={selectedModel}
        selectedProvider={selectedProvider}
        sessionId={activeSessionId}
      />

      <AgentChannelStatusBar
        adapterStatus={memoryAdapterStatus}
        agentToolRuntimeLabel={agentToolRuntimeLabel}
        controlQueueContinuity={controlQueueContinuity}
        memoryGovernanceLabel={memoryGovernanceLabel}
        memoryRecordCount={memoryRecordCount}
        memoryScope={memoryScope}
        messageCount={messages.length}
        modelId={selectedModel?.id}
        providerProfileId={selectedProvider?.id}
        selectedAgent={selectedAgent}
      />

      <AgentConversationFlowPanel
        adapterStatus={memoryAdapterStatus}
        memoryRecordCount={memoryRecordCount}
        memoryScope={memoryScope}
        selectedAgent={selectedAgent}
        selectedModel={selectedModel}
        selectedProvider={selectedProvider}
      />

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

      <ActionStrip
        adoptedBranchCount={adoptedBranchCount}
        branchExperiments={branchExperiments}
        canDelegate={canDelegate}
        latestBranch={latestBranch}
        onAdoptBranch={onAdoptBranch}
        onBackupProjection={onBackupProjection}
        onCreateAgentRun={onCreateAgentRun}
        onCreateBranch={onCreateBranch}
        onCreateCodingPacket={onCreateCodingPacket}
        onImportExternalIngress={onImportExternalIngress}
        onPromoteToDebate={onPromoteToDebate}
        showOverflowBranchControls={workbenchVisibility.showOverflowBranchControls}
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

      <InboxApprovalStrip queue={permissionSnapshot.queue} />
    </section>
  );
}
