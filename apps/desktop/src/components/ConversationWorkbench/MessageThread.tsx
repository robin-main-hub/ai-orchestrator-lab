import {
  ImageIcon,
  FileText,
  X,
  ShieldAlert,
  Check,
  GitBranch,
  Sparkles,
  UserRound,
} from "lucide-react";
import { parseDelegateTags } from "@ai-orchestrator/agents";
import type {
  ConversationMessage,
  ConversationAttachment,
  ApprovalQueueItem,
} from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import type { WorkbenchAgent, PendingProviderRetry, AgentVisualSettings, AgentActivityStatus } from "../../types";
import type { AgentChatContinuitySummary } from "../../lib/agentChatContinuity";
import {
  formatAttachmentSize,
  getMessageAttachments,
  agentRoleLabel,
} from "../../lib/helpers";
import { messageLabel } from "../../lib/uiLabels";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import { PublicWorkTracePanel } from "../PublicWorkTracePanel";
import { createConversationMessagePublicWorkTrace } from "../../lib/publicWorkTrace";

export type DelegationPreviewItem = {
  id: string;
  target: string;
  prompt: string;
  sourceAgent: string;
  status: "detected" | "succeeded" | "blocked" | "failed" | "unknown_target" | "self_delegation";
  targetLabel?: string;
};

export function MessageThread({
  agentChatContinuity,
  messages,
  selectedAgent,
  workbenchVisibility,
  permissionSnapshotQueue,
  pendingProviderRetry,
  onApprovePermission,
  onRejectPermission,
  agents,
  agentVisualsById,
  agentActivityById,
}: {
  agentChatContinuity: AgentChatContinuitySummary;
  messages: ConversationMessage[];
  selectedAgent?: WorkbenchAgent;
  workbenchVisibility: {
    showInlineApprovalQueue: boolean;
    showInlineDelegation: boolean;
  };
  permissionSnapshotQueue: ApprovalQueueItem[];
  pendingProviderRetry?: PendingProviderRetry;
  onApprovePermission: (sourceItemId: string) => void;
  onRejectPermission: (sourceItemId: string) => void;
  agents: WorkbenchAgent[];
  agentVisualsById?: Record<string, AgentVisualSettings>;
  agentActivityById?: Record<string, AgentActivityStatus>;
}) {
  const delegationItems = createDelegationPreviewItems(messages, agents);

  return (
    <div className="relative flex-1 overflow-hidden bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.12),transparent_32%),radial-gradient(circle_at_84%_18%,rgba(139,92,246,0.12),transparent_32%)]" />
      <div
        className="relative flex h-full flex-col gap-3 overflow-y-auto px-4 py-5"
        aria-label="대화 기록"
        tabIndex={0}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {workbenchVisibility.showInlineApprovalQueue ? (
            <ApprovalQueueInline
              onApprove={onApprovePermission}
              onReject={onRejectPermission}
              pendingProviderRetry={pendingProviderRetry}
              queue={permissionSnapshotQueue}
            />
          ) : null}
          {workbenchVisibility.showInlineDelegation ? (
            <DelegationInline items={delegationItems} />
          ) : null}
          {messages.length === 0 ? (
            <EmptyConversation summary={agentChatContinuity} />
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                selectedAgent={selectedAgent}
                agents={agents}
                agentVisualsById={agentVisualsById}
                agentActivityById={agentActivityById}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyConversation({ summary }: { summary: AgentChatContinuitySummary }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 shadow-[0_0_32px_rgba(34,211,238,0.18)]">
        <Sparkles className="h-6 w-6 text-cyan-300" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-zinc-100">
        {summary.title}
      </h3>
      <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
        <span className="mb-1 inline-flex rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-0.5 text-[10px] text-violet-100">
          {summary.memoryQualityLabel}
        </span>
        <br />
        {summary.detail}
        <br />
        <kbd className="mt-2 inline-flex rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300">
          ⌘K
        </kbd>
        로 역할 전환.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  selectedAgent,
  agents,
  agentVisualsById,
  agentActivityById,
}: {
  message: ConversationMessage;
  selectedAgent?: WorkbenchAgent;
  agents: WorkbenchAgent[];
  agentVisualsById?: Record<string, AgentVisualSettings>;
  agentActivityById?: Record<string, AgentActivityStatus>;
}) {
  const attachments = getMessageAttachments(message);
  const label = messageLabel(message, selectedAgent);
  const publicWorkTrace = createConversationMessagePublicWorkTrace(message);
  const time = new Date(message.createdAt ?? Date.now()).toLocaleTimeString(
    "ko-KR",
    { hour: "2-digit", minute: "2-digit" },
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-2 py-1.5">
        <div className="max-w-[82%] space-y-1">
          <div className="flex items-center justify-end gap-2 px-1">
            <span className="text-[10px] text-zinc-600">{time}</span>
            <span className="text-xs font-medium text-zinc-300">사용자</span>
          </div>
          <div className="rounded-2xl rounded-tr-md border border-cyan-300/20 bg-gradient-to-br from-cyan-500 to-violet-500 p-3 shadow-lg shadow-cyan-950/30">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
              {message.content}
            </p>
            {attachments.length > 0 ? (
              <MessageAttachments attachments={attachments} />
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.22)]">
          <UserRound className="h-4 w-4" />
        </div>
      </div>
    );
  }

  const senderAgent = agents.find(
    (a) =>
      a.id === message.metadata?.agentId ||
      a.name === label ||
      (message.metadata?.agentName && a.name === String(message.metadata.agentName))
  );
  const initials = (senderAgent?.name ?? selectedAgent?.name ?? label).slice(0, 2).toUpperCase();
  const roleColor = senderAgent ? roleColorFromRole(senderAgent.role) : "orchestrator";
  const activity = senderAgent && agentActivityById ? agentActivityById[senderAgent.id] : "idle";
  const agentStatus = senderAgent
    ? activity === "responding"
      ? ("active" as const)
      : activity === "preparing"
        ? ("pending" as const)
        : activity === "idle"
          ? ("idle" as const)
          : ("online" as const)
    : undefined;
  const visual = senderAgent && agentVisualsById ? agentVisualsById[senderAgent.id] : undefined;

  return (
    <div className="flex gap-3 py-1.5">
      <AvatarWithStatus
        initials={initials}
        roleColor={roleColor}
        status={agentStatus}
        avatarDataUrl={visual?.avatarDataUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-zinc-200">{label}</span>
          <span className="text-[10px] text-zinc-600">{time}</span>
        </div>
        <div className="rounded-2xl rounded-tl-md border border-white/10 bg-zinc-900/70 p-3 shadow-lg shadow-black/20 backdrop-blur-xl">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
            {message.content}
          </p>
          {attachments.length > 0 ? (
            <MessageAttachments attachments={attachments} />
          ) : null}
          <PublicWorkTracePanel trace={publicWorkTrace} />
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-zinc-200 backdrop-blur"
          key={attachment.id}
        >
          {attachment.kind === "image" ? (
            <ImageIcon className="h-3 w-3 text-cyan-300" />
          ) : (
            <FileText className="h-3 w-3 text-cyan-300" />
          )}
          <span className="font-medium text-zinc-100">{attachment.name}</span>
          <span className="text-zinc-500">
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
    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3 shadow-lg shadow-amber-950/20 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-amber-300">
          <ShieldAlert className="h-3.5 w-3.5" />
          승인 대기
        </span>
        <span className="rounded-full border border-amber-400/20 bg-black/20 px-2 py-0.5 text-[10px] text-amber-200">
          {queue.length} pending
        </span>
      </div>
      <div className="space-y-2">
        {visible.map((item) => {
          const restoresDraft =
            pendingProviderRetry?.permissionItemId === item.sourceItemId;
          return (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-100">
                  {item.summary}
                </p>
                <p className="truncate text-[10px] text-zinc-500">
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
    <div className="rounded-2xl border border-violet-400/25 bg-violet-500/10 p-3 shadow-lg shadow-violet-950/20 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-violet-300">
          <GitBranch className="h-3.5 w-3.5" />
          위임 추적
        </span>
        <span className="rounded-full border border-violet-400/20 bg-black/20 px-2 py-0.5 text-[10px] text-violet-200">
          {items.length}건 추적
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            key={item.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-zinc-100">
                {item.targetLabel ?? item.target}
              </span>
              <StatusBadge
                variant={delegationVariantFromStatus(item.status)}
                size="sm"
                className="shrink-0 font-mono text-[9px]"
              >
                {delegationStatusLabel(item.status)}
              </StatusBadge>
            </div>
            <p className="truncate text-[10px] text-zinc-500">
              {item.sourceAgent} → {item.target}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] text-zinc-300">
              {item.prompt}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──

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

function delegationVariantFromStatus(status: DelegationPreviewItem["status"]): StatusBadgeVariant {
  switch (status) {
    case "succeeded":
      return "success";
    case "blocked":
    case "failed":
      return "danger";
    case "unknown_target":
    case "self_delegation":
      return "warning";
    case "detected":
    default:
      return "muted";
  }
}
