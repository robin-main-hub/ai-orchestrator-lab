import {
  ImageIcon,
  FileText,
  X,
  ShieldAlert,
  Check,
  GitBranch,
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
import {
  formatAttachmentSize,
  getMessageAttachments,
  agentRoleLabel,
} from "../../lib/helpers";
import { messageLabel } from "../../lib/uiLabels";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";

export type DelegationPreviewItem = {
  id: string;
  target: string;
  prompt: string;
  sourceAgent: string;
  status: "detected" | "succeeded" | "blocked" | "failed" | "unknown_target" | "self_delegation";
  targetLabel?: string;
};

export function MessageThread({
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
            queue={permissionSnapshotQueue}
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
              agents={agents}
              agentVisualsById={agentVisualsById}
              agentActivityById={agentActivityById}
            />
          ))
        )}
      </div>
    </div>
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
    <div className="flex gap-3">
      <AvatarWithStatus
        initials={initials}
        roleColor={roleColor}
        status={agentStatus}
        avatarDataUrl={visual?.avatarDataUrl}
        size="sm"
      />
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
