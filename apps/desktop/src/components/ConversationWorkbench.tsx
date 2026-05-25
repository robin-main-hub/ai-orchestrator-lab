import { Archive, CheckCircle2, FileText, GitBranch, ImageIcon, Link2, Paperclip, Play, Send, ShieldAlert, Smartphone, X } from "lucide-react";
import type { ApprovalQueueItem, BranchExperiment, ContextPackTier, ConversationAttachment, ConversationMessage, ModelDescriptor, PermissionMatrixSnapshot, ProviderProfile } from "@ai-orchestrator/protocol";
import { attachmentAcceptForModel, attachmentCapabilityLabel, createDefaultPersonaSettings, formatAttachmentSize, getMessageAttachments, modelSupportsAnyAttachment, agentRoleLabel } from "../lib/helpers";
import { branchStatusLabel, contextPackTierLabel, creativityLevelLabel, messageLabel, soulModeLabel } from "../lib/uiLabels";
import type { AgentConfigFile, AgentConfigTab, AgentPersonaSettings, DraftAttachment, PendingProviderRetry, WindowAuditItem, WorkbenchAgent } from "../types";
import { AgentConfigDrawer } from "./AgentConfigDrawer";
import { WindowChecklist } from "./WindowChecklist";

export function ConversationWorkbench({
  activeSessionId,
  agentConfigPanel,
  configFiles,
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
  onApprovePermission,
  onBackupProjection,
  onContextPackTierChange,
  onCreateBranch,
  onCreateAgentRun,
  onCreateCodingPacket,
  onDraftMessageChange,
  onImportTelegram,
  onPromoteToDebate,
  onRejectPermission,
  onRemoveDraftAttachment,
  onSelectAgent,
  onSendMessage,
  onCloseAgentConfig,
  onOpenAgentConfig,
  onUpdateAgentConfig,
  onUpdateAgentPersona,
  pendingProviderRetry,
  permissionSnapshot,
  selectedAgent,
  selectedAgentId,
  selectedModel,
  selectedProvider,
}: {
  activeSessionId: string;
  agentConfigPanel: { open: boolean; tab: AgentConfigTab };
  configFiles: AgentConfigFile[];
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
  onApprovePermission: (sourceItemId: string) => void;
  onBackupProjection: () => void;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onCreateBranch: () => void;
  onCreateAgentRun: () => void;
  onCreateCodingPacket: () => void;
  onDraftMessageChange: (value: string) => void;
  onImportTelegram: () => void;
  onPromoteToDebate: () => void;
  onRejectPermission: (sourceItemId: string) => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSendMessage: () => void;
  onCloseAgentConfig: () => void;
  onOpenAgentConfig: (tab: AgentConfigTab) => void;
  onUpdateAgentConfig: (patch: Partial<Pick<WorkbenchAgent, "configSource" | "soulMode">>) => void;
  onUpdateAgentPersona: (patch: Partial<AgentPersonaSettings>) => void;
  pendingProviderRetry?: PendingProviderRetry;
  permissionSnapshot: PermissionMatrixSnapshot;
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
          configFiles={configFiles}
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
        <ApprovalQueueInlinePanel
          onApprove={onApprovePermission}
          onReject={onRejectPermission}
          pendingProviderRetry={pendingProviderRetry}
          queue={permissionSnapshot.queue}
        />
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

function ApprovalQueueInlinePanel({
  onApprove,
  onReject,
  pendingProviderRetry,
  queue,
}: {
  onApprove: (sourceItemId: string) => void;
  onReject: (sourceItemId: string) => void;
  pendingProviderRetry?: PendingProviderRetry;
  queue: ApprovalQueueItem[];
}) {
  const visibleQueue = queue.slice(0, 3);
  if (visibleQueue.length === 0) {
    return null;
  }

  return (
    <section className="conversation-approval-panel" aria-label="Permission approval queue">
      <header>
        <span>
          <ShieldAlert size={14} />
          승인 대기
        </span>
        <em>{queue.length} pending</em>
      </header>
      <div className="conversation-approval-list">
        {visibleQueue.map((item) => {
          const restoresDraft = pendingProviderRetry?.permissionItemId === item.sourceItemId;
          return (
            <article key={item.id}>
              <div>
                <strong>{item.summary}</strong>
                <small>
                  {item.permissions.join(", ") || "read_only"}
                  {restoresDraft ? " / 승인 시 입력창 복원" : ""}
                </small>
              </div>
              <div className="conversation-approval-actions">
                <button onClick={() => onApprove(item.sourceItemId)} type="button">
                  <CheckCircle2 size={13} />
                  승인
                </button>
                <button onClick={() => onReject(item.sourceItemId)} type="button">
                  <X size={13} />
                  거절
                </button>
              </div>
            </article>
          );
        })}
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
