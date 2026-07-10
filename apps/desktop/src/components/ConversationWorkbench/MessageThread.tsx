import {
  ImageIcon,
  FileText,
  X,
  ShieldAlert,
  Check,
  GitBranch,
  Sparkles,
  UserRound,
  Undo2,
  TerminalSquare,
} from "lucide-react";
import { useState } from "react";
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
import type { EmptyConversationHint } from "../../lib/emptyConversationHint";
import { resolveAgentThinkingIndicator } from "../../lib/agentThinkingIndicator";
import {
  formatAttachmentSize,
  getMessageAttachments,
  agentRoleLabel,
} from "../../lib/helpers";
import { messageLabel } from "../../lib/uiLabels";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";
import { resolvePersonaPortraitUrl } from "../../lib/personaPortrait";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import { PublicWorkTracePanel } from "../PublicWorkTracePanel";
import { createConversationMessagePublicWorkTrace } from "../../lib/publicWorkTrace";
import { agentInitialsForDisplay, agentPrimaryDisplayName } from "../../lib/agentDisplay";
import type { AgentThinkingStep } from "../../lib/agentThinkingIndicator";
import { compactPublicText } from "../../lib/publicRedaction";
import type { AttachmentProcessingPlan } from "../../lib/attachmentProcessing";

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
  emptyHint,
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
  streamingPreview,
  onRollbackTurn,
  onApproveCommandPattern,
}: {
  agentChatContinuity: AgentChatContinuitySummary;
  /** 제안7 — 빈 대화 맥락 힌트(공급자/승인/기억 상태에 따른 다음 행동) */
  emptyHint?: EmptyConversationHint;
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
  /** 항목 1 — 진행 중 스트리밍 텍스트(점진 렌더링, 승인 대기 시 인라인 액션 포함) */
  streamingPreview?: {
    agentId: string;
    text: string;
    pendingApproval?: { sourceItemId: string; command: string };
    toolCalls?: Array<{ id: string; tool: string; title: string; status: string; output?: string }>;
  } | null;
  /** 항목 9 — 어시스턴트 턴 롤백 */
  onRollbackTurn?: (assistantMessageId: string) => void;
  /** 항목 10 — "이 명령 계열 세션 동안 허용" */
  onApproveCommandPattern?: (command: string) => void;
}) {
  const delegationItems = createDelegationPreviewItems(messages, agents);
  const thinkingIndicator = resolveAgentThinkingIndicator(selectedAgent?.id, agentActivityById);
  // 같은 채널의 진행 중 스트림이면 텍스트·도구칩·승인대기 중 무엇이든 있으면 버블을 띄운다
  const activeStream =
    streamingPreview && selectedAgent && streamingPreview.agentId === selectedAgent.id
      ? streamingPreview
      : undefined;
  const hasStreamContent = Boolean(
    activeStream &&
      (activeStream.text.trim() || (activeStream.toolCalls?.length ?? 0) > 0 || activeStream.pendingApproval),
  );
  const showPendingBubble =
    !hasStreamContent && shouldShowAssistantPendingBubble(messages, thinkingIndicator?.status);

  return (
    <div className="relative flex-1 overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_420px_at_78%_-10%,var(--accent-dim),transparent)]" />
      <div
        className="relative flex h-full flex-col gap-3 overflow-y-auto px-4 py-5"
        aria-label="대화 기록"
        tabIndex={0}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {workbenchVisibility.showInlineApprovalQueue ? (
            <ApprovalQueueInline
              onApprove={onApprovePermission}
              onApprovePattern={onApproveCommandPattern}
              onReject={onRejectPermission}
              pendingProviderRetry={pendingProviderRetry}
              queue={permissionSnapshotQueue}
            />
          ) : null}
          {workbenchVisibility.showInlineDelegation ? (
            <DelegationInline items={delegationItems} />
          ) : null}
          {messages.length === 0 ? (
            <EmptyConversation
              portraitUrl={
                (selectedAgent && agentVisualsById?.[selectedAgent.id]?.avatarDataUrl) ??
                resolvePersonaPortraitUrl(selectedAgent?.personaName, selectedAgent?.role)
              }
              agentName={selectedAgent?.name}
              hint={emptyHint}
              summary={agentChatContinuity}
            />
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                selectedAgent={selectedAgent}
                agents={agents}
                agentVisualsById={agentVisualsById}
                agentActivityById={agentActivityById}
                onRollbackTurn={onRollbackTurn}
              />
            ))
          )}
          {hasStreamContent && selectedAgent && activeStream ? (
            <StreamingDraftBubble
              agent={selectedAgent}
              agentVisualsById={agentVisualsById}
              text={activeStream.text}
              toolCalls={activeStream.toolCalls}
              pendingApproval={activeStream.pendingApproval}
              onApprove={onApprovePermission}
              onApprovePattern={onApproveCommandPattern}
              onReject={onRejectPermission}
            />
          ) : null}
          {showPendingBubble && selectedAgent && thinkingIndicator ? (
            <AssistantPendingBubble
              activity={thinkingIndicator.status}
              agent={selectedAgent}
              agentVisualsById={agentVisualsById}
              label={thinkingIndicator.label}
              narration={thinkingIndicator.narration}
              steps={thinkingIndicator.steps}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function shouldShowAssistantPendingBubble(
  messages: ConversationMessage[],
  activity?: AgentActivityStatus,
) {
  if (!activity || activity === "idle") return false;
  const lastMessage = messages.at(-1);
  return lastMessage?.role === "user";
}

export function assistantPendingLabel(activity?: AgentActivityStatus) {
  if (activity === "responding") return "답변을 다듬고 있어요";
  if (activity === "tooling") return "도구를 고르는 중이에요";
  if (activity === "capturing") return "작업창을 읽는 중이에요";
  if (activity === "dispatching") return "명령을 전달하는 중이에요";
  if (activity === "testing") return "검증을 돌리는 중이에요";
  if (activity === "waiting_approval") return "승인을 기다리고 있어요";
  if (activity === "error") return "막힌 원인을 정리하고 있어요";
  return "요청을 정리하고 있어요";
}

export type AssistantMessageStatusSummary = {
  detail: string;
  label: string;
  variant: StatusBadgeVariant;
};

export type AssistantRuntimeEvidenceBadge = {
  label: string;
  variant: StatusBadgeVariant;
};

export function resolveAssistantMessageStatusSummary(
  message: ConversationMessage,
): AssistantMessageStatusSummary | undefined {
  if (message.role !== "assistant") return undefined;
  const metadata = message.metadata ?? {};
  if (metadata.requiresServerApproval === true) {
    return {
      detail: "승인 후 같은 요청을 이어 붙일 수 있습니다.",
      label: "승인 필요",
      variant: "warning",
    };
  }
  if (typeof metadata.error === "string" && metadata.error.trim()) {
    return {
      detail: compactPublicText(metadata.error, 96),
      label: "호출 실패",
      variant: "danger",
    };
  }
  if (metadata.realProviderCall === true) {
    return {
      detail: "모델 응답이 기록되고 공개 작업 로그로 요약되었습니다.",
      label: "응답 기록",
      variant: "success",
    };
  }
  return undefined;
}

export function createAssistantRuntimeEvidenceBadges(message: ConversationMessage): AssistantRuntimeEvidenceBadge[] {
  if (message.role !== "assistant") return [];
  const metadata = message.metadata ?? {};
  const badges: AssistantRuntimeEvidenceBadge[] = [];
  if (metadata.personaSoulApplied === true) badges.push({ label: "SOUL", variant: "success" });
  if (metadata.personaAgentsMdApplied === true) badges.push({ label: "AGENTS", variant: "success" });
  if (metadata.identityGuardApplied === true) badges.push({ label: "이름 보정", variant: "primary" });
  const recalledMemoryCount = readFiniteNumber(metadata.recalledMemoryCount);
  if (recalledMemoryCount !== undefined) {
    badges.push({ label: `기억 ${recalledMemoryCount}개`, variant: recalledMemoryCount > 0 ? "success" : "muted" });
  }
  const runtimeConfigCount = readStringArray(metadata.runtimeConfigFileIds).length;
  if (runtimeConfigCount > 0) badges.push({ label: `인격 파일 ${runtimeConfigCount}개`, variant: "primary" });
  const toolCount = readStringArray(metadata.roleToolProfileTools).length;
  if (toolCount > 0) badges.push({ label: `도구 ${toolCount}개`, variant: "primary" });
  return badges;
}

export function resolveMessageSenderAgent({
  agents,
  label,
  message,
}: {
  agents: WorkbenchAgent[];
  label: string;
  message: ConversationMessage;
}) {
  const metadataAgentName = typeof message.metadata?.agentName === "string" ? message.metadata.agentName : undefined;
  return agents.find(
    (agent) =>
      agent.id === message.metadata?.agentId ||
      agent.name === label ||
      agentPrimaryDisplayName(agent) === label ||
      agent.personaName === label ||
      (metadataAgentName &&
        (agent.name === metadataAgentName ||
          agentPrimaryDisplayName(agent) === metadataAgentName ||
          agent.personaName === metadataAgentName)),
  );
}

function AssistantPendingBubble({
  activity,
  agent,
  agentVisualsById,
  label,
  narration,
  steps,
}: {
  activity?: AgentActivityStatus;
  agent: WorkbenchAgent;
  agentVisualsById?: Record<string, AgentVisualSettings>;
  label: string;
  narration: string;
  steps: AgentThinkingStep[];
}) {
  const visual = agentVisualsById?.[agent.id];
  const status =
    activity === "responding" ||
      activity === "tooling" ||
      activity === "capturing" ||
      activity === "dispatching" ||
      activity === "testing"
      ? ("active" as const)
      : activity === "error"
        ? ("offline" as const)
        : ("pending" as const);
  const displayName = agentPrimaryDisplayName(agent);

  return (
    <div className="flex gap-3 py-1.5" aria-live="polite" aria-label={`${displayName} 응답 준비 중`}>
      <AvatarWithStatus
        initials={agentInitialsForDisplay(agent)}
        roleColor={roleColorFromRole(agent.role)}
        status={status}
        avatarDataUrl={visual?.avatarDataUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-foreground">{displayName}</span>
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
        <div className="inline-flex max-w-[82%] items-center gap-3 rounded-2xl rounded-tl-md border border-primary/15 bg-surface/80 px-3 py-2.5 shadow-lg shadow-black/20 backdrop-blur-xl">
          <span className="text-sm text-foreground">{compactPublicText(narration || assistantPendingLabel(activity), 88)}</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="message-thinking-dot" />
            <span className="message-thinking-dot [animation-delay:160ms]" />
            <span className="message-thinking-dot [animation-delay:320ms]" />
          </span>
        </div>
        <div className="flex max-w-[82%] flex-wrap gap-1.5 px-1" aria-label="응답 준비 단계">
          {steps.map((step) => (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                step.state === "done"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : step.state === "active"
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-border bg-surface/60 text-muted-foreground"
              }`}
              key={step.label}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  step.state === "active"
                    ? "animate-pulse bg-primary"
                    : step.state === "done"
                      ? "bg-primary"
                      : "bg-muted-foreground"
                }`}
              />
              {step.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 항목 1 — 스트리밍 중 점진 렌더링되는 드래프트 버블 (+승인 대기 시 인라인 액션 3개) */
function StreamingDraftBubble({
  agent,
  agentVisualsById,
  text,
  toolCalls,
  pendingApproval,
  onApprove,
  onApprovePattern,
  onReject,
}: {
  agent: WorkbenchAgent;
  agentVisualsById?: Record<string, AgentVisualSettings>;
  text: string;
  toolCalls?: Array<{ id: string; tool: string; title: string; status: string; output?: string }>;
  pendingApproval?: { sourceItemId: string; command: string };
  onApprove?: (sourceItemId: string) => void;
  onApprovePattern?: (command: string) => void;
  onReject?: (sourceItemId: string) => void;
}) {
  const visual = agentVisualsById?.[agent.id];
  const displayName = agentPrimaryDisplayName(agent);
  const activeToolCount = (toolCalls ?? []).filter((c) => c.status === "running" || c.status === "proposed").length;
  const statusLabel = pendingApproval
    ? "승인 대기 중"
    : activeToolCount > 0
      ? `도구 ${activeToolCount}개 실행 중…`
      : "작성 중…";
  return (
    <div className="flex gap-3 py-1.5" aria-live="polite" aria-label={`${displayName} 응답 작성 중`} data-testid="streaming-draft-bubble">
      <AvatarWithStatus
        initials={agentInitialsForDisplay(agent)}
        roleColor={roleColorFromRole(agent.role)}
        status="active"
        avatarDataUrl={visual?.avatarDataUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-foreground">{displayName}</span>
          <span className="text-[10px] text-primary">{statusLabel}</span>
        </div>
        <div className="rounded-2xl rounded-tl-md border border-primary/15 bg-surface/70 p-3 shadow-lg shadow-black/20 backdrop-blur-xl">
          {text.trim() ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {text}
              {!pendingApproval ? (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" aria-hidden="true" />
              ) : null}
            </p>
          ) : null}
          {toolCalls && toolCalls.length > 0 ? (
            <div className={`space-y-1 ${text.trim() ? "mt-2" : ""}`} aria-label="진행 중 도구">
              {toolCalls.map((call) => (
                <ToolCallChip call={call} key={call.id} />
              ))}
            </div>
          ) : null}
          {pendingApproval ? (
            <div
              className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2"
              data-testid="streaming-approval-actions"
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="text-[11px] text-warning">이 명령을 실행할까요?</span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  className="h-7 gap-1 text-xs"
                  onClick={() => onApprove?.(pendingApproval.sourceItemId)}
                  size="sm"
                >
                  <Check className="h-3 w-3" /> 허용
                </Button>
                <Button
                  className="h-7 gap-1 text-xs text-primary"
                  onClick={() => {
                    onApprovePattern?.(pendingApproval.command);
                    onApprove?.(pendingApproval.sourceItemId);
                  }}
                  size="sm"
                  title="이 명령 계열(프리픽스)을 세션 동안 자동 승인합니다"
                  variant="ghost"
                >
                  <Check className="h-3 w-3" /> 계열 허용
                </Button>
                <Button
                  className="h-7 gap-1 text-xs text-destructive"
                  onClick={() => onReject?.(pendingApproval.sourceItemId)}
                  size="sm"
                  variant="ghost"
                >
                  <X className="h-3 w-3" /> 거절
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyConversation({
  summary,
  portraitUrl,
  agentName,
  hint,
}: {
  summary: AgentChatContinuitySummary;
  portraitUrl?: string;
  agentName?: string;
  hint?: EmptyConversationHint;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center shadow-2xl shadow-black/30 backdrop-blur-xl">
      {portraitUrl ? (
        <img
          alt={agentName ?? "에이전트"}
          className="h-20 w-20 rounded-2xl border border-primary/30 object-cover shadow-[0_0_40px_var(--accent-dim)] ring-1 ring-white/10"
          src={portraitUrl}
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-[0_0_32px_var(--accent-dim)]">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
      )}
      {/* 제안7: 맥락 힌트 — 공급자/승인/기억 상태에 따른 "지금 먼저 할 것" */}
      {hint ? (
        <div
          className={`mt-5 flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
            hint.tone === "amber"
              ? "border-warning/30 bg-warning/10 text-warning"
              : hint.tone === "cyan"
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-white/10 bg-white/5 text-foreground"
          }`}
          role="status"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              hint.tone === "amber" ? "bg-warning" : hint.tone === "cyan" ? "bg-primary" : "bg-muted-foreground"
            }`}
          />
          {hint.suggestion}
        </div>
      ) : null}
      <h3 className={`${hint ? "mt-3" : "mt-5"} text-base font-semibold text-foreground`}>
        {summary.title}
      </h3>
      <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
        <span className="mb-1 inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
          {summary.memoryQualityLabel}
        </span>
        <br />
        {summary.detail}
        <br />
        <kbd className="mt-2 inline-flex rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-foreground">
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
  onRollbackTurn,
}: {
  message: ConversationMessage;
  selectedAgent?: WorkbenchAgent;
  agents: WorkbenchAgent[];
  agentVisualsById?: Record<string, AgentVisualSettings>;
  agentActivityById?: Record<string, AgentActivityStatus>;
  onRollbackTurn?: (assistantMessageId: string) => void;
}) {
  const attachments = getMessageAttachments(message);
  const attachmentProcessingPlans = readMessageAttachmentProcessingPlans(message);
  const toolCallChips = readMessageToolCalls(message);
  const label = messageLabel(message, selectedAgent, agents);
  const publicWorkTrace = createConversationMessagePublicWorkTrace(message);
  const assistantStatusSummary = resolveAssistantMessageStatusSummary(message);
  const runtimeEvidenceBadges = createAssistantRuntimeEvidenceBadges(message);
  const time = new Date(message.createdAt ?? Date.now()).toLocaleTimeString(
    "ko-KR",
    { hour: "2-digit", minute: "2-digit" },
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-2 py-1.5">
        <div className="max-w-[82%] space-y-1">
          <div className="flex items-center justify-end gap-2 px-1">
            <span className="text-[10px] text-muted-foreground">{time}</span>
            <span className="text-xs font-medium text-foreground">사용자</span>
          </div>
          <div className="rounded-2xl rounded-tr-md border border-primary/20 bg-primary p-3 shadow-lg shadow-black/20">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
              {message.content}
            </p>
            {attachments.length > 0 ? (
              <MessageAttachments attachments={attachments} processingPlans={attachmentProcessingPlans} />
            ) : null}
            <PublicWorkTracePanel trace={publicWorkTrace} />
          </div>
        </div>
        <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-primary shadow-[0_0_20px_var(--accent-dim)]">
          <UserRound className="h-4 w-4" />
        </div>
      </div>
    );
  }

  const senderAgent = resolveMessageSenderAgent({ agents, label, message });
  const initials = senderAgent ? agentInitialsForDisplay(senderAgent) : label.slice(0, 2).toUpperCase();
  const roleColor = senderAgent ? roleColorFromRole(senderAgent.role) : "orchestrator";
  const activity = senderAgent && agentActivityById ? agentActivityById[senderAgent.id] : "idle";
  const agentStatus = senderAgent
    ? activity === "responding" ||
      activity === "tooling" ||
      activity === "capturing" ||
      activity === "dispatching" ||
      activity === "testing"
      ? ("active" as const)
      : activity === "preparing" || activity === "waiting_approval"
        ? ("pending" as const)
        : activity === "error"
          ? ("offline" as const)
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
        <div className="group flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground">{time}</span>
          {onRollbackTurn && message.metadata?.notice !== true ? (
            <button
              aria-label="이 턴으로 되돌리기"
              className="ml-auto hidden items-center gap-1 rounded-md border border-border bg-surface/80 px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-warning/40 hover:text-warning group-hover:inline-flex"
              onClick={() => onRollbackTurn(message.id)}
              title="이 턴(사용자 메시지 포함)을 대화에서 제거합니다 — 파일은 자동 복원되지 않음"
              type="button"
            >
              <Undo2 className="h-3 w-3" /> 되돌리기
            </button>
          ) : null}
        </div>
        <div className="rounded-2xl rounded-tl-md border border-white/10 bg-surface/70 p-3 shadow-lg shadow-black/20 backdrop-blur-xl">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {message.content}
          </p>
          {toolCallChips.length > 0 ? (
            <div className="mt-2 space-y-1" aria-label="도구 실행 기록">
              {toolCallChips.map((call) => (
                <ToolCallChip call={call} key={call.id} />
              ))}
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <MessageAttachments attachments={attachments} processingPlans={attachmentProcessingPlans} />
          ) : null}
          {assistantStatusSummary ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
              <StatusBadge variant={assistantStatusSummary.variant}>{assistantStatusSummary.label}</StatusBadge>
              <span className="text-[10px] leading-relaxed text-muted-foreground">
                {assistantStatusSummary.detail}
              </span>
            </div>
          ) : null}
          {runtimeEvidenceBadges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="응답 근거 배지">
              {runtimeEvidenceBadges.map((badge, index) => (
                <StatusBadge key={`${badge.label}:${index}`} size="sm" variant={badge.variant}>
                  {badge.label}
                </StatusBadge>
              ))}
            </div>
          ) : null}
          <PublicWorkTracePanel trace={publicWorkTrace} />
        </div>
      </div>
    </div>
  );
}

type MessageToolCallChipData = {
  id: string;
  tool: string;
  title: string;
  status: string;
  output?: string;
};

/** assistant metadata.toolCalls(대화 도구 루프 기록)를 표시용으로 파싱 */
export function readMessageToolCalls(message: ConversationMessage): MessageToolCallChipData[] {
  const raw = message.metadata?.toolCalls;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry, index) => ({
      id: typeof entry.id === "string" ? entry.id : `tool_${index}`,
      tool: typeof entry.tool === "string" ? entry.tool : "tool",
      title: typeof entry.title === "string" ? entry.title : String(entry.tool ?? "tool"),
      status: typeof entry.status === "string" ? entry.status : "completed",
      output: typeof entry.output === "string" ? entry.output : undefined,
    }));
}

/** 항목 2 — 도구 호출 칩: 상태·명령, 클릭하면 출력 미리보기 */
function ToolCallChip({ call }: { call: MessageToolCallChipData }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = call.status === "running" || call.status === "proposed";
  const statusVariant: StatusBadgeVariant =
    call.status === "completed"
      ? "success"
      : call.status === "denied"
        ? "warning"
        : call.status === "failed"
          ? "danger"
          : isActive
            ? "primary"
            : "muted";
  const statusText =
    call.status === "completed"
      ? "완료"
      : call.status === "denied"
        ? "차단"
        : call.status === "failed"
          ? "실패"
          : call.status === "running"
            ? "실행 중"
            : call.status === "proposed"
              ? "대기"
              : call.status;
  return (
    <div className={`rounded-xl border bg-black/25 ${isActive ? "border-primary/30" : "border-white/10"}`}>
      <button
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <TerminalSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? "animate-pulse text-primary" : "text-primary"}`} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{call.title}</span>
        <StatusBadge size="sm" variant={statusVariant}>
          {statusText}
        </StatusBadge>
      </button>
      {expanded && call.output ? (
        <pre className="max-h-40 overflow-auto border-t border-white/10 px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          {call.output}
        </pre>
      ) : null}
    </div>
  );
}

function MessageAttachments({
  attachments,
  processingPlans,
}: {
  attachments: ConversationAttachment[];
  processingPlans: AttachmentProcessingPlan[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => {
        const processingMode = resolveAttachmentProcessingModeForDisplay(attachment, processingPlans);
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-foreground backdrop-blur"
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
            {processingMode ? (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                {attachmentProcessingLabel(processingMode)}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export function resolveAttachmentProcessingModeForDisplay(
  attachment: ConversationAttachment,
  processingPlans: AttachmentProcessingPlan[] = [],
) {
  const plannedMode = processingPlans.find((plan) =>
    plan.status === "accepted" &&
    plan.kind === attachment.kind &&
    plan.name === attachment.name &&
    plan.size === attachment.size
  )?.processingMode;
  if (plannedMode) return plannedMode;
  return readAttachmentProcessingMode(attachment);
}

function readAttachmentProcessingMode(attachment: ConversationAttachment) {
  const value = (attachment as ConversationAttachment & { processingMode?: unknown }).processingMode;
  return value === "vision_candidate" || value === "document_candidate" || value === "metadata_only"
    ? value
    : undefined;
}

function readMessageAttachmentProcessingPlans(message: ConversationMessage): AttachmentProcessingPlan[] {
  const value = message.metadata?.attachmentProcessingPlans;
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): AttachmentProcessingPlan[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Partial<AttachmentProcessingPlan>;
    const kind = record.kind;
    const name = record.name;
    const processingMode = record.processingMode;
    const size = record.size;
    const status = record.status;
    const storage = record.storage;
    if (
      (kind !== "image" && kind !== "document" && kind !== "other") ||
      typeof name !== "string" ||
      (processingMode !== "vision_candidate" &&
        processingMode !== "document_candidate" &&
        processingMode !== "metadata_only") ||
      typeof size !== "number" ||
      (status !== "accepted" && status !== "rejected") ||
      (storage !== "metadata_only" && storage !== "local_cache" && storage !== "dgx_object_storage")
    ) {
      return [];
    }
    return [
      {
        kind,
        name,
        processingMode,
        ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
        size,
        status,
        storage,
      },
    ];
  });
}

export function attachmentProcessingLabel(processingMode: "vision_candidate" | "document_candidate" | "metadata_only") {
  if (processingMode === "vision_candidate") return "이미지 후보";
  if (processingMode === "document_candidate") return "문서 후보";
  return "파일 정보만";
}

export function approvalPermissionListLabel(permissions: string[]) {
  const labels = permissions
    .map((permission) => approvalPermissionLabel(permission))
    .filter((label, index, all) => all.indexOf(label) === index);
  return labels.length > 0 ? labels.join(", ") : "보기 전용";
}

function approvalPermissionLabel(permission: string) {
  switch (permission) {
    case "read_only":
      return "보기 전용";
    case "provider_completion":
      return "모델 호출";
    case "terminal_run":
      return "터미널 실행";
    case "network":
      return "네트워크";
    case "local_filesystem":
      return "로컬 파일 접근";
    default:
      return permission.replace(/_/g, " ");
  }
}

function ApprovalQueueInline({
  onApprove,
  onApprovePattern,
  onReject,
  pendingProviderRetry,
  queue,
}: {
  onApprove: (sourceItemId: string) => void;
  /** 항목 10 — 승인하면서 같은 명령 계열을 세션 동안 자동 허용 */
  onApprovePattern?: (command: string) => void;
  onReject: (sourceItemId: string) => void;
  pendingProviderRetry?: PendingProviderRetry;
  queue: ApprovalQueueItem[];
}) {
  const visible = queue.slice(0, 3);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/10 p-3 shadow-lg shadow-warning/20 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-warning">
          <ShieldAlert className="h-3.5 w-3.5" />
          승인 대기
        </span>
        <span className="rounded-full border border-warning/20 bg-black/20 px-2 py-0.5 text-[10px] text-warning">
          {queue.length}건 대기
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
                <p className="truncate text-xs font-medium text-foreground">
                  {item.summary}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {approvalPermissionListLabel(item.permissions)}
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
                {onApprovePattern ? (
                  <Button
                    className="h-7 gap-1 text-xs text-primary"
                    onClick={() => {
                      onApprovePattern(item.summary);
                      onApprove(item.sourceItemId);
                    }}
                    size="sm"
                    title="이 명령 계열(프리픽스)을 세션 동안 자동 승인합니다"
                    variant="ghost"
                  >
                    <Check className="h-3 w-3" />
                    계열 허용
                  </Button>
                ) : null}
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
    <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3 shadow-lg shadow-primary/20 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-primary">
          <GitBranch className="h-3.5 w-3.5" />
          위임 추적
        </span>
        <span className="rounded-full border border-primary/20 bg-black/20 px-2 py-0.5 text-[10px] text-primary">
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
              <span className="truncate text-xs font-medium text-foreground">
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
            ? `${agentPrimaryDisplayName(matchedAgent)} / ${agentRoleLabel(matchedAgent.role)}`
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

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function delegationStatusLabel(status: DelegationPreviewItem["status"]) {
  switch (status) {
    case "succeeded":
      return "완료";
    case "blocked":
      return "차단";
    case "failed":
      return "실패";
    case "unknown_target":
      return "대상 없음";
    case "self_delegation":
      return "자기위임 차단";
    case "detected":
    default:
      return "감지됨";
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
