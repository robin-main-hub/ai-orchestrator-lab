import { useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  GitBranch,
  ImageIcon,
  Package,
  Paperclip,
  Play,
  Send,
  Settings,
  ShieldAlert,
  Smartphone,
  Swords,
  X,
} from "lucide-react";
import { parseDelegateTags } from "@ai-orchestrator/agents";
import type {
  ApprovalQueueItem,
  BranchExperiment,
  ContextPackTier,
  ConversationAttachment,
  ConversationMessage,
  ModelDescriptor,
  PermissionMatrixSnapshot,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import {
  attachmentAcceptForModel,
  attachmentCapabilityLabel,
  createDefaultPersonaSettings,
  formatAttachmentSize,
  getMessageAttachments,
  modelSupportsAnyAttachment,
  agentRoleLabel,
  providerDisplayLabel,
} from "../lib/helpers";
import {
  branchStatusLabel,
  contextPackTierLabel,
  creativityLevelLabel,
  messageLabel,
  soulModeLabel,
} from "../lib/uiLabels";
import { getConversationWorkbenchVisibility } from "../lib/conversationWorkbenchVisibility";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import type {
  AgentConfigFile,
  AgentConfigTab,
  AgentPersonaSettings,
  DraftAttachment,
  PendingProviderRetry,
  WorkbenchAgent,
} from "../types";
import { AgentConfigDrawer } from "./AgentConfigDrawer";

/**
 * Conversation workbench — strict v0 port.
 *
 * source: docs/v0/v0-output/components/conversation/conversation-view.tsx
 *
 * Layout (v0):
 *   <flex h-full flex-col>
 *     <header h-14>     — agent info + session + Profile/Memory/Preview chips + Settings
 *     <flex-1>          — scrollable message thread
 *                         (inline approval queue + delegation panel above when active)
 *     <composer>        — delegation chips (companion only) + textarea + send
 *     <action-strip>    — 토론 전환 / 패킷 생성 / 실행 슬롯 / 백업 / Telegram + branch
 *     <approval-queue>  — collapsible Assistant Inbox strip
 *
 * All 40+ callbacks / props preserved unchanged so App.tsx contract
 * stays the same. What changes is purely the visual: Tailwind utility
 * classes + Shadcn primitives instead of the legacy BEM .workbench-* /
 * .chat-* / .composer-* CSS that v2 used.
 */

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
  const persona = agentPersona ?? (selectedAgent ? createDefaultPersonaSettings(selectedAgent) : undefined);
  const memoryMode = selectedProvider?.trustLevel === "trusted" ? "auto" : "manual";
  const attachmentEnabled = Boolean(selectedAgent && modelSupportsAnyAttachment(selectedModel));
  const attachmentAccept = attachmentAcceptForModel(selectedModel);
  const attachmentLimitReached = draftAttachments.length >= maxDraftAttachments;
  const adoptedBranchCount = branchExperiments.filter((branch) => branch.status === "adopted").length;
  const latestBranch = branchExperiments[0];
  const delegationItems = createDelegationPreviewItems(messages, agents);
  const canDelegate =
    selectedAgent?.role === "companion" || selectedAgent?.role === "orchestrator";
  const workbenchVisibility = getConversationWorkbenchVisibility({
    delegationItemCount: delegationItems.length,
    pendingApprovalCount: permissionSnapshot.queue.length,
    pendingProviderRetry: Boolean(pendingProviderRetry),
  });

  return (
    <section className="conversation-workbench flex h-full flex-col bg-background">
      {/* ── Header ───────────────────────────────────────────────── */}
      <ConversationHeader
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

      {/* ── Message thread + inline panels ───────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className="flex h-full flex-col gap-3 overflow-y-auto p-4"
          aria-label="대화 기록"
          tabIndex={0}
        >
          {workbenchVisibility.showInlineApprovalQueue ? (
            <ApprovalQueueInline
              onApprove={onApprovePermission}
              onReject={onRejectPermission}
              pendingProviderRetry={pendingProviderRetry}
              queue={permissionSnapshot.queue}
            />
          ) : null}
          {workbenchVisibility.showInlineDelegation ? (
            <DelegationInline items={delegationItems} />
          ) : null}
          {messages.length === 0 ? (
            <EmptyConversation />
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                selectedAgent={selectedAgent}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Action strip ─────────────────────────────────────────── */}
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
        onImportTelegram={onImportTelegram}
        onPromoteToDebate={onPromoteToDebate}
        showOverflowBranchControls={workbenchVisibility.showOverflowBranchControls}
      />

      {/* ── Composer ─────────────────────────────────────────────── */}
      <Composer
        attachmentAccept={attachmentAccept}
        attachmentEnabled={attachmentEnabled}
        attachmentLimitReached={attachmentLimitReached}
        draftAttachments={draftAttachments}
        draftMessage={draftMessage}
        maxDraftAttachments={maxDraftAttachments}
        onAddDraftAttachments={onAddDraftAttachments}
        onDraftMessageChange={onDraftMessageChange}
        onRemoveDraftAttachment={onRemoveDraftAttachment}
        onSendMessage={onSendMessage}
        selectedAgent={selectedAgent}
        selectedModel={selectedModel}
        showDelegationChips={workbenchVisibility.showComposerDelegationChips}
      />

      {/* ── Assistant Inbox approval strip ───────────────────────── */}
      <InboxApprovalStrip queue={permissionSnapshot.queue} />
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function ConversationHeader({
  agents,
  contextPackTier,
  memoryMode,
  onContextPackTierChange,
  onOpenAgentConfig,
  onSelectAgent,
  persona,
  selectedAgent,
  selectedAgentId,
  selectedModel,
  selectedProvider,
  sessionId,
}: {
  agents: WorkbenchAgent[];
  contextPackTier: ContextPackTier;
  memoryMode: string;
  onContextPackTierChange: (tier: ContextPackTier) => void;
  onOpenAgentConfig: (tab: AgentConfigTab) => void;
  onSelectAgent: (agentId: string) => void;
  persona?: AgentPersonaSettings;
  selectedAgent?: WorkbenchAgent;
  selectedAgentId?: string;
  selectedModel?: ModelDescriptor;
  selectedProvider?: ProviderProfile;
  sessionId: string;
}) {
  const cycleContextPackTier = () => {
    const order: ContextPackTier[] = ["lite", "standard", "full"];
    const currentIndex = order.indexOf(contextPackTier);
    const nextTier = order[(currentIndex + 1) % order.length] ?? "standard";
    onContextPackTierChange(nextTier);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/30 px-4">
      {/* Left: Agent selector */}
      <div className="flex min-w-0 items-center gap-3">
        <select
          aria-label="현재 대화 봇 선택"
          className="min-w-0 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-sm font-semibold text-foreground hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none"
          onChange={(event) => onSelectAgent(event.target.value)}
          value={selectedAgentId ?? ""}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} · {agent.id === selectedAgentId
                ? selectedModel?.id ?? agent.modelId ?? "model pending"
                : agent.modelId ?? "model pending"}
            </option>
          ))}
        </select>
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] text-muted-foreground">현재 대화 상대</span>
          <span className="truncate text-xs font-medium text-foreground">
            {selectedAgent?.name ?? "봇 선택 필요"} ·{" "}
            {selectedProvider ? providerDisplayLabel(selectedProvider.name) : "provider pending"}
          </span>
        </div>
      </div>

      {/* Center: session id */}
      <div className="hidden flex-col items-center md:flex">
        <span className="text-[10px] text-muted-foreground">session</span>
        <span className="text-xs font-medium text-foreground">
          {sessionId.slice(-12)}
        </span>
      </div>

      {/* Right: Profile / Memory / Context / Preview chips */}
      <div className="flex items-center gap-2">
        <HeaderChip
          label="Profile"
          onClick={() => onOpenAgentConfig("profile")}
          value={selectedAgent ? agentRoleLabel(selectedAgent.role) : "대기"}
        />
        <HeaderChip
          label="SOUL"
          onClick={() => onOpenAgentConfig("soul")}
          value={selectedAgent ? soulModeLabel(selectedAgent.soulMode) : "off"}
        />
        <HeaderChip
          label="창의성"
          onClick={() => onOpenAgentConfig("creativity")}
          value={persona ? creativityLevelLabel(persona.creativityLevel) : "균형"}
        />
        <HeaderChip
          label="Memory"
          onClick={() => onOpenAgentConfig("injection")}
          value={memoryMode}
        />
        <HeaderChip
          label="Context"
          onClick={cycleContextPackTier}
          title="ContextPack: Lite → Standard → Full"
          value={contextPackTierLabel(contextPackTier)}
        />
        <Button
          aria-label="agent settings"
          className="h-8 w-8"
          onClick={() => onOpenAgentConfig("edit")}
          size="icon"
          variant="ghost"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

function HeaderChip({
  label,
  value,
  onClick,
  title,
}: {
  label: string;
  value: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      className="flex flex-col items-end rounded-md px-2 py-1 text-[10px] transition-colors hover:bg-card/60"
      onClick={onClick}
      title={title}
      type="button"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </button>
  );
}

function EmptyConversation() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <span className="font-mono text-lg font-bold text-primary">AI</span>
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">
        대화를 시작하세요
      </h3>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        아래 입력창에 메시지를 입력하면 대화가 시작됩니다.
        <br />
        <kbd className="rounded border border-border bg-card/60 px-1 py-0.5 text-[10px]">
          ⌘K
        </kbd>
        로 봇 전환.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  selectedAgent,
}: {
  message: ConversationMessage;
  selectedAgent?: WorkbenchAgent;
}) {
  const attachments = getMessageAttachments(message);
  const label = messageLabel(message, selectedAgent);
  const time = new Date(message.createdAt ?? Date.now()).toLocaleTimeString(
    "ko-KR",
    { hour: "2-digit", minute: "2-digit" },
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] space-y-1">
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] text-muted-foreground">{time}</span>
            <span className="text-sm font-medium text-foreground">사용자</span>
          </div>
          <div className="rounded-lg rounded-tr-none bg-primary/15 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {message.content}
            </p>
            {attachments.length > 0 ? (
              <MessageAttachments attachments={attachments} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // assistant / system / other
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">
        {(selectedAgent?.name ?? label).slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
        <div className="rounded-lg rounded-tl-none border border-border bg-card p-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {message.content}
          </p>
          {attachments.length > 0 ? (
            <MessageAttachments attachments={attachments} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MessageAttachments({
  attachments,
}: {
  attachments: ConversationAttachment[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2 py-1 text-[10px]"
          key={attachment.id}
        >
          {attachment.kind === "image" ? (
            <ImageIcon className="h-3 w-3 text-primary" />
          ) : (
            <FileText className="h-3 w-3 text-primary" />
          )}
          <span className="font-medium text-foreground">{attachment.name}</span>
          <span className="text-muted-foreground">
            {formatAttachmentSize(attachment.size)}
          </span>
        </span>
      ))}
    </div>
  );
}

function ApprovalQueueInline({
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
  const visible = queue.slice(0, 3);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-warning">
          <ShieldAlert className="h-3.5 w-3.5" />
          승인 대기
        </span>
        <span className="text-[10px] text-muted-foreground">
          {queue.length} pending
        </span>
      </div>
      <div className="space-y-2">
        {visible.map((item) => {
          const restoresDraft =
            pendingProviderRetry?.permissionItemId === item.sourceItemId;
          return (
            <div
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {item.summary}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {item.permissions.join(", ") || "read_only"}
                  {restoresDraft ? " · 승인 시 입력창 복원" : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  className="h-7 gap-1 text-xs"
                  onClick={() => onApprove(item.sourceItemId)}
                  size="sm"
                >
                  <Check className="h-3 w-3" />
                  승인
                </Button>
                <Button
                  className="h-7 gap-1 text-xs"
                  onClick={() => onReject(item.sourceItemId)}
                  size="sm"
                  variant="ghost"
                >
                  <X className="h-3 w-3" />
                  거절
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DelegationInline({ items }: { items: DelegationPreviewItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-chart-5/40 bg-chart-5/5 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-chart-5">
          <GitBranch className="h-3.5 w-3.5" />
          Delegation
        </span>
        <span className="text-[10px] text-muted-foreground">
          {items.length} tracked
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            className="rounded-md border border-border bg-card/40 px-3 py-1.5"
            key={item.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-foreground">
                {item.targetLabel ?? item.target}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono",
                  delegationToneClasses(item.status),
                )}
              >
                {delegationStatusLabel(item.status)}
              </span>
            </div>
            <p className="truncate text-[10px] text-muted-foreground">
              {item.sourceAgent} → {item.target}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] text-foreground">
              {item.prompt}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Composer({
  attachmentAccept,
  attachmentEnabled,
  attachmentLimitReached,
  draftAttachments,
  draftMessage,
  maxDraftAttachments,
  onAddDraftAttachments,
  onDraftMessageChange,
  onRemoveDraftAttachment,
  onSendMessage,
  selectedAgent,
  selectedModel,
  showDelegationChips,
}: {
  attachmentAccept: string;
  attachmentEnabled: boolean;
  attachmentLimitReached: boolean;
  draftAttachments: DraftAttachment[];
  draftMessage: string;
  maxDraftAttachments: number;
  onAddDraftAttachments: (files: FileList | null) => void;
  onDraftMessageChange: (value: string) => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSendMessage: () => void;
  selectedAgent?: WorkbenchAgent;
  selectedModel?: ModelDescriptor;
  showDelegationChips: boolean;
}) {
  const canSend =
    Boolean(selectedAgent) &&
    (draftMessage.trim().length > 0 || draftAttachments.length > 0);

  return (
    <div className="shrink-0 border-t border-border bg-card/50">
      {/* Delegation chips (companion only) */}
      {showDelegationChips ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2">
          <span className="text-xs text-muted-foreground">Delegation tools ready</span>
        </div>
      ) : null}

      <form
        className="flex items-end gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSendMessage();
        }}
      >
        {/* Attachment button */}
        <div className="flex shrink-0 flex-col gap-1">
          <input
            accept={attachmentAccept}
            className="hidden"
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
            className={cn(
              "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground",
              (!attachmentEnabled || attachmentLimitReached) &&
                "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
            htmlFor="conversation-attachment-input"
            title={attachmentCapabilityLabel(selectedModel)}
          >
            <Paperclip className="h-4 w-4" />
          </label>
          <span className="text-[9px] text-muted-foreground">
            {draftAttachments.length}/{maxDraftAttachments}
          </span>
        </div>

        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            aria-label="메시지 입력"
            className="min-h-[44px] w-full resize-none rounded-md border border-border bg-card/40 px-3 py-2.5 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
            onChange={(event) => onDraftMessageChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              if (canSend) onSendMessage();
            }}
            placeholder={`${selectedAgent?.name ?? "봇"}에게 말 걸기`}
            rows={1}
            value={draftMessage}
          />
          {draftAttachments.length > 0 ? (
            <div className="absolute bottom-2 left-2 right-12 flex flex-wrap gap-1">
              {draftAttachments.map((attachment) => (
                <span
                  className="inline-flex items-center gap-1 rounded bg-card/80 px-1.5 py-0.5 text-[10px]"
                  key={attachment.id}
                >
                  {attachment.kind === "image" ? (
                    <ImageIcon className="h-2.5 w-2.5" />
                  ) : (
                    <FileText className="h-2.5 w-2.5" />
                  )}
                  <span className="max-w-[80px] truncate text-foreground">
                    {attachment.name}
                  </span>
                  <button
                    aria-label={`${attachment.name} 제거`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveDraftAttachment(attachment.id)}
                    type="button"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Send */}
        <Button
          className="h-9 gap-2"
          disabled={!canSend}
          type="submit"
        >
          <Send className="h-4 w-4" />
          보내기
        </Button>
      </form>
    </div>
  );
}

function DelegationChip({
  disabled = false,
  icon,
  label,
  onClick,
  shortcut,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-md bg-card/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-card hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
      {shortcut ? (
        <kbd className="ml-1 rounded border border-border/50 bg-background/50 px-1 py-0.5 text-[9px] text-muted-foreground">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function ActionStrip({
  adoptedBranchCount,
  branchExperiments,
  canDelegate,
  latestBranch,
  onAdoptBranch,
  onBackupProjection,
  onCreateAgentRun,
  onCreateBranch,
  onCreateCodingPacket,
  onImportTelegram,
  onPromoteToDebate,
  showOverflowBranchControls,
}: {
  adoptedBranchCount: number;
  branchExperiments: BranchExperiment[];
  canDelegate: boolean;
  latestBranch?: BranchExperiment;
  onAdoptBranch: () => void;
  onBackupProjection: () => void;
  onCreateAgentRun: () => void;
  onCreateBranch: () => void;
  onCreateCodingPacket: () => void;
  onImportTelegram: () => void;
  onPromoteToDebate: () => void;
  showOverflowBranchControls: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card/30 px-4 py-2">
      <DelegationChip
        disabled={!canDelegate}
        icon={<Swords className="h-3.5 w-3.5" />}
        label="토론 전환"
        onClick={onPromoteToDebate}
        shortcut="⌘⇧D"
      />
      <DelegationChip
        icon={<Package className="h-3.5 w-3.5" />}
        label="패킷 생성"
        onClick={onCreateCodingPacket}
      />
      <DelegationChip
        icon={<Play className="h-3.5 w-3.5" />}
        label="실행 슬롯"
        onClick={onCreateAgentRun}
      />
      <Button
        className="h-7 gap-1.5 text-xs"
        onClick={onBackupProjection}
        size="sm"
        variant="ghost"
      >
        <Archive className="h-3.5 w-3.5" />
        백업 상태
      </Button>
      <Button
        className="h-7 gap-1.5 text-xs"
        onClick={onImportTelegram}
        size="sm"
        variant="ghost"
      >
        <Smartphone className="h-3.5 w-3.5" />
        Telegram
      </Button>
      {showOverflowBranchControls ? (
        <div className="ml-auto flex items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1 text-[10px]">
          <Database className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Branch</span>
          <span className="font-mono text-foreground">
            {branchExperiments.length} · 채택 {adoptedBranchCount}
          </span>
          {latestBranch ? (
            <span
              className="text-muted-foreground"
              title={latestBranch.summary}
            >
              · {branchStatusLabel(latestBranch.status)}
            </span>
          ) : null}
          <Button
            className="h-6 px-2 text-[10px]"
            onClick={onCreateBranch}
            size="sm"
            variant="ghost"
          >
            분기
          </Button>
          <Button
            className="h-6 px-2 text-[10px]"
            disabled={!branchExperiments.some((b) => b.status !== "adopted")}
            onClick={onAdoptBranch}
            size="sm"
            variant="ghost"
          >
            채택
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function InboxApprovalStrip({ queue }: { queue: ApprovalQueueItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const pending = queue.filter((q) => q.state === "required").length;
  if (queue.length === 0) return null;
  return (
    <div className="shrink-0 border-t border-border bg-card/30">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-2 transition-colors hover:bg-card/60"
        onClick={() => setIsOpen((o) => !o)}
        type="button"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">
            Assistant Inbox
          </span>
          <span className="text-[10px] text-muted-foreground">
            {queue.length} tasks / {pending} pending
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {queue.slice(0, 8).map((item) => (
            <div
              className={cn(
                "flex w-52 shrink-0 flex-col rounded-md border border-border bg-card p-2",
                item.state === "required" && "border-primary/40",
              )}
              key={item.id}
            >
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{item.requestedBy}</span>
                <span className="font-mono">{item.state}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-foreground line-clamp-1">
                {item.summary}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                {item.permissions.join(" · ")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Helpers carried from v2 (logic unchanged) ───────────────────────

type DelegationPreviewItem = {
  id: string;
  target: string;
  prompt: string;
  sourceAgent: string;
  status: "detected" | "succeeded" | "blocked" | "failed" | "unknown_target" | "self_delegation";
  targetLabel?: string;
};

function createDelegationPreviewItems(
  messages: ConversationMessage[],
  agents: WorkbenchAgent[],
): DelegationPreviewItem[] {
  return messages
    .flatMap((message) => {
      if (message.role !== "assistant") return [];
      const sourceAgent = String(message.metadata?.agentName ?? "assistant");
      const metadataDelegations = normalizeDelegationMetadata(message.metadata);
      const candidates =
        metadataDelegations.length > 0
          ? metadataDelegations
          : parseDelegateTags(message.content).map((tag) => ({
              prompt: tag.prompt,
              status: "detected" as const,
              target: tag.target,
            }));
      return candidates.map((item, index) => {
        const target = item.target;
        const normalizedTarget = normalizeDelegationKey(target);
        const matchedAgent = agents.find((agent) =>
          [agent.role, agent.id, agent.name, agent.personaName]
            .filter((value): value is string => Boolean(value))
            .some((value) => normalizeDelegationKey(value) === normalizedTarget),
        );
        return {
          id: `${message.id}_delegate_${index}`,
          prompt: item.prompt,
          sourceAgent,
          status: item.status,
          target,
          targetLabel: matchedAgent
            ? `${matchedAgent.name} / ${agentRoleLabel(matchedAgent.role)}`
            : undefined,
        };
      });
    })
    .slice(-4)
    .reverse();
}

function normalizeDelegationKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeDelegationMetadata(metadata: ConversationMessage["metadata"]) {
  const rawDelegations = metadata?.delegationTags ?? metadata?.delegations;
  if (!Array.isArray(rawDelegations)) return [];
  return rawDelegations.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const target = typeof record.target === "string" ? record.target : undefined;
    const prompt = typeof record.prompt === "string" ? record.prompt : undefined;
    if (!target || !prompt) return [];
    return [
      {
        prompt,
        status: normalizeDelegationStatus(record.status ?? record.kind),
        target,
      },
    ];
  });
}

function normalizeDelegationStatus(value: unknown): DelegationPreviewItem["status"] {
  return value === "succeeded" ||
    value === "blocked" ||
    value === "failed" ||
    value === "unknown_target" ||
    value === "self_delegation"
    ? value
    : "detected";
}

function delegationStatusLabel(status: DelegationPreviewItem["status"]) {
  switch (status) {
    case "succeeded":
      return "done";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    case "unknown_target":
      return "unknown";
    case "self_delegation":
      return "loop guard";
    case "detected":
    default:
      return "detected";
  }
}

function delegationToneClasses(status: DelegationPreviewItem["status"]): string {
  switch (status) {
    case "succeeded":
      return "bg-success/15 text-success";
    case "blocked":
    case "failed":
      return "bg-destructive/15 text-destructive";
    case "unknown_target":
    case "self_delegation":
      return "bg-warning/15 text-warning";
    case "detected":
    default:
      return "bg-card/60 text-muted-foreground";
  }
}
