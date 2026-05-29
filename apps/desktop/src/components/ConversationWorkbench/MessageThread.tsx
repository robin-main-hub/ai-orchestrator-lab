import React, { useRef, useEffect } from "react";
import {
  ImageIcon,
  FileText,
  X,
  ShieldAlert,
  Check,
  GitBranch,
  CornerUpLeft,
  Smile,
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
import { useStreamingStore } from "../../store/useStreamingStore";

export type DelegationPreviewItem = {
  id: string;
  target: string;
  prompt: string;
  sourceAgent: string;
  status: "detected" | "succeeded" | "blocked" | "failed" | "unknown_target" | "self_delegation";
  targetLabel?: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

function getMessageDateString(timestamp?: string | number | Date) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return DATE_FORMATTER.format(d);
}

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
  reactions,
  onToggleReaction,
  replyingToMessage,
  onSetReplyingToMessage,
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
  reactions?: Record<string, { emoji: string; count: number; users: string[] }[]>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  replyingToMessage?: ConversationMessage;
  onSetReplyingToMessage?: (message: ConversationMessage) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const reasoningSnippets = useStreamingStore((state) => state.reasoningSnippets);
  const agentSteps = useStreamingStore((state) => state.agentSteps);
  const handleScrollToBottom = React.useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);
  const delegationItems = createDelegationPreviewItems(messages, agents);
  const shouldAutoScrollRef = useRef(true);
  const prevFirstMessageIdRef = useRef<string | undefined>(undefined);

  const messageMetadata = React.useMemo(() => {
    return messages.map((message) => {
      const dateStr = getMessageDateString(message.createdAt);
      const label = message.role === "user" ? "사용자" : messageLabel(message, selectedAgent);
      return { dateStr, label };
    });
  }, [messages, selectedAgent]);

  const firstMessageId = messages[0]?.id;

  useEffect(() => {
    if (firstMessageId !== prevFirstMessageIdRef.current) {
      shouldAutoScrollRef.current = true;
      prevFirstMessageIdRef.current = firstMessageId;
    }
  }, [firstMessageId]);

  useEffect(() => {
    if (listRef.current && shouldAutoScrollRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, agentActivityById]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    // We add a tiny buffer (like 100px) to determine if user is close to the bottom
    const isCloseToBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScrollRef.current = isCloseToBottom;
  };

  const renderedBubbles = [];
  let lastDate = "";

  const isAnyAgentActive = Boolean(
    agentActivityById &&
      Object.values(agentActivityById).some(
        (status) => status === "preparing" || status === "responding"
      )
  );

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;

    const currentMeta = messageMetadata[i];
    const prevMeta = messageMetadata[i - 1];
    const nextMeta = messageMetadata[i + 1];

    const currentDate = currentMeta?.dateStr ?? "";
    const label = currentMeta?.label ?? "";

    if (currentDate !== lastDate) {
      renderedBubbles.push(
        <div key={`date_${message.id}`} className="my-4 flex items-center justify-center">
          <span className="rounded-full bg-card/60 border border-border/20 px-3 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
            {currentDate}
          </span>
        </div>
      );
      lastDate = currentDate;
    }

    const prevMessage = messages[i - 1];
    const nextMessage = messages[i + 1];

    const isSameSenderPrev = prevMessage && prevMessage.role === message.role && 
      (message.role === "user" ? true : (prevMessage.metadata?.agentId === message.metadata?.agentId || prevMeta?.label === label));
    const isWithin5MinPrev = prevMessage && (new Date(message.createdAt ?? Date.now()).getTime() - new Date(prevMessage.createdAt ?? Date.now()).getTime() < 5 * 60 * 1000);
    const isSameDayPrev = prevMessage && (currentDate === prevMeta?.dateStr);
    const isGroupedWithPrev = Boolean(isSameSenderPrev && isWithin5MinPrev && isSameDayPrev);

    const isSameSenderNext = nextMessage && nextMessage.role === message.role &&
      (message.role === "user" ? true : (nextMessage.metadata?.agentId === message.metadata?.agentId || nextMeta?.label === label));
    const isWithin5MinNext = nextMessage && (new Date(nextMessage.createdAt ?? Date.now()).getTime() - new Date(message.createdAt ?? Date.now()).getTime() < 5 * 60 * 1000);
    const isSameDayNext = nextMessage && (currentDate === nextMeta?.dateStr);
    const isGroupedWithNext = Boolean(isSameSenderNext && isWithin5MinNext && isSameDayNext);

    const senderAgent = message.role === "user" ? undefined : agents.find(
      (a) =>
        a.name === label ||
        a.id === message.metadata?.agentId ||
        a.role === message.metadata?.agentRole ||
        (message.metadata?.agentName && a.name === String(message.metadata.agentName))
    );
    const senderAgentVisual = senderAgent && agentVisualsById ? agentVisualsById[senderAgent.id] : undefined;
    const senderAgentActivity = senderAgent && agentActivityById ? (agentActivityById[senderAgent.id] ?? "idle") : "idle";

    renderedBubbles.push(
      <MessageBubble
        key={message.id}
        message={message}
        selectedAgent={selectedAgent}
        senderAgent={senderAgent}
        senderAgentVisual={senderAgentVisual}
        senderAgentActivity={senderAgentActivity}
        isAnyAgentActive={isAnyAgentActive}
        isGroupedWithPrev={isGroupedWithPrev}
        isGroupedWithNext={isGroupedWithNext}
        isLastMessageInChat={i === messages.length - 1}
        reactions={reactions?.[message.id] ?? EMPTY_REACTIONS}
        onToggleReaction={onToggleReaction}
        onSetReplyingToMessage={onSetReplyingToMessage}
        onScrollToBottom={handleScrollToBottom}
      />
    );
  }

  const typingAgents = agents.filter(agent => {
    const activity = agentActivityById?.[agent.id];
    return activity === "preparing" || activity === "responding";
  });

  const isStreaming = messages.slice(-5).some((msg) => msg.metadata?.streaming);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className={cn(
          "flex h-full flex-col gap-2 overflow-y-auto p-4",
          isStreaming ? "scroll-auto" : "scroll-smooth"
        )}
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
          renderedBubbles
        )}

        {typingAgents.map(agent => {
          const initials = agent.name.slice(0, 2).toUpperCase();
          const roleColor = roleColorFromRole(agent.role);
          const visual = agentVisualsById?.[agent.id];
          const activeStep = agentSteps[agent.id];
          const reasoningSnippet = reasoningSnippets[agent.id];
          
          return (
            <div key={`typing_${agent.id}`} className="flex gap-3 mt-2 items-end animate-in fade-in slide-in-from-bottom-2 duration-300">
              <AvatarWithStatus
                initials={initials}
                roleColor={roleColor}
                status="active"
                avatarDataUrl={visual?.avatarDataUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-[9px] text-muted-foreground/80">{agent.name}가 실행 중...</span>
                  {activeStep && (
                    <span className="inline-flex items-center rounded-sm bg-primary/10 border border-primary/20 px-1 py-0.5 text-[8px] font-mono leading-none text-primary animate-pulse">
                      {activeStep}
                    </span>
                  )}
                </div>
                <div className="inline-flex flex-wrap items-center gap-2.5 rounded-2xl rounded-tl-none border border-border/80 bg-card/60 p-2.5 shadow-sm backdrop-blur-sm">
                  <div className="flex gap-1 items-center py-0.5 px-1 bg-muted/40 rounded-full shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: "-0.3s" }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: "-0.15s" }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-bounce"></span>
                  </div>
                  {reasoningSnippet && (
                    <div className="flex items-center gap-1.5 border-l border-border/30 pl-2.5 max-w-[320px] md:max-w-[400px]">
                      <span className="text-[9px] font-semibold text-primary/80 font-mono tracking-wider uppercase bg-primary/5 px-1 py-0.5 rounded border border-primary/10">Thinking</span>
                      <span className="text-[9px] text-muted-foreground font-mono truncate leading-none">
                        {reasoningSnippet}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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

const EMPTY_REACTIONS: { emoji: string; count: number; users: string[] }[] = [];

const MessageBubble = React.memo(function MessageBubble({
  message,
  selectedAgent,
  senderAgent,
  senderAgentVisual,
  senderAgentActivity,
  isAnyAgentActive,
  isGroupedWithPrev,
  isGroupedWithNext,
  isLastMessageInChat,
  reactions,
  onToggleReaction,
  onSetReplyingToMessage,
  onScrollToBottom,
}: {
  message: ConversationMessage;
  selectedAgent?: WorkbenchAgent;
  senderAgent?: WorkbenchAgent;
  senderAgentVisual?: AgentVisualSettings;
  senderAgentActivity: AgentActivityStatus;
  isAnyAgentActive: boolean;
  isGroupedWithPrev: boolean;
  isGroupedWithNext: boolean;
  isLastMessageInChat: boolean;
  reactions: { emoji: string; count: number; users: string[] }[];
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onSetReplyingToMessage?: (message: ConversationMessage) => void;
  onScrollToBottom?: () => void;
}) {
  const streamingContent = useStreamingStore(
    (state) => state.chunks[message.id]
  );
  const content = Boolean(message.metadata?.streaming) ? (streamingContent ?? message.content) : message.content;

  useEffect(() => {
    if (Boolean(message.metadata?.streaming) && onScrollToBottom) {
      onScrollToBottom();
    }
  }, [streamingContent, message.metadata?.streaming, onScrollToBottom]);

  const attachments = getMessageAttachments(message);
  const label = message.role === "user" ? "사용자" : messageLabel(message, selectedAgent);
  const time = new Date(message.createdAt ?? Date.now()).toLocaleTimeString(
    "ko-KR",
    { hour: "2-digit", minute: "2-digit" },
  );

  const handleScrollToQuote = (quoteId: string) => {
    const el = document.getElementById(quoteId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "transition-all", "duration-500");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 1500);
    }
  };

  const renderReadCheckmark = () => {
    if (message.role !== "user") return null;
    const isRead = !isLastMessageInChat || isAnyAgentActive;
    
    return (
      <span className="ml-1 text-[9px] font-mono text-primary/70 select-none">
        {isRead ? "✓✓" : "✓"}
      </span>
    );
  };

  const replyTo = message.metadata?.replyTo as any;
  const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  if (message.role === "user") {
    const bubbleCorners = cn(
      "bg-primary/15 p-3 text-sm leading-relaxed text-foreground break-words",
      !isGroupedWithPrev && !isGroupedWithNext && "rounded-2xl rounded-tr-none",
      !isGroupedWithPrev && isGroupedWithNext && "rounded-2xl rounded-tr-none rounded-br-sm",
      isGroupedWithPrev && isGroupedWithNext && "rounded-2xl rounded-tr-sm rounded-br-sm",
      isGroupedWithPrev && !isGroupedWithNext && "rounded-2xl rounded-tr-sm"
    );

    return (
      <div id={message.id} className={cn("flex justify-end animate-in fade-in duration-200", isGroupedWithPrev ? "mt-0.5" : "mt-2")}>
        <div className="max-w-[75%] space-y-1 group relative">
          
          <div className="absolute left-0 top-1/2 -translate-x-[105%] -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 bg-popover/90 backdrop-blur-md border border-border/60 shadow-lg px-2.5 py-1 rounded-full z-20">
            {onSetReplyingToMessage && (
              <button
                onClick={() => onSetReplyingToMessage(message)}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors rounded-full hover:bg-muted"
                title="답장하기"
                type="button"
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="w-[1px] h-3 bg-border" />
            <div className="flex gap-1">
              {reactionEmojis.slice(0, 3).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction?.(message.id, emoji)}
                  className="hover:scale-125 transition-transform duration-100 p-0.5 text-xs"
                  type="button"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {!isGroupedWithPrev && (
            <div className="flex items-center justify-end gap-2 pr-1">
              <span className="text-[9px] text-muted-foreground">{time}</span>
              <span className="text-xs font-semibold text-foreground">사용자</span>
            </div>
          )}
          <div className={bubbleCorners}>
            {replyTo && (
              <div
                onClick={() => handleScrollToQuote(replyTo.id)}
                className="mb-2 cursor-pointer border-l-2 border-primary/50 bg-primary/5 px-2 py-1 text-xs text-muted-foreground rounded hover:bg-primary/10 transition-colors truncate max-w-full"
              >
                <span className="font-semibold text-primary block text-[10px]">
                  @{replyTo.senderLabel}
                </span>
                {replyTo.content}
              </div>
            )}

            <p className="whitespace-pre-wrap text-sm break-words">{message.content}</p>
            {attachments.length > 0 ? (
              <MessageAttachments attachments={attachments} />
            ) : null}

            <div className="flex justify-end items-center mt-1 text-[9px] text-muted-foreground">
              {isGroupedWithPrev && <span>{time}</span>}
              {renderReadCheckmark()}
            </div>
          </div>

          {reactions.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1 mt-1 pr-1">
              {reactions.map((r) => {
                const userReacted = r.users.includes("user");
                return (
                  <button
                    key={r.emoji}
                    onClick={() => onToggleReaction?.(message.id, r.emoji)}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors shadow-sm",
                      userReacted
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border/80 text-muted-foreground hover:bg-muted"
                    )}
                    title={r.users.join(", ")}
                    type="button"
                  >
                    <span>{r.emoji}</span>
                    <span className="font-mono text-[9px]">{r.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const initials = (senderAgent?.name ?? selectedAgent?.name ?? label).slice(0, 2).toUpperCase();
  const roleColor = senderAgent ? roleColorFromRole(senderAgent.role) : "orchestrator";
  const agentStatus = senderAgent
    ? senderAgentActivity === "responding"
      ? ("active" as const)
      : senderAgentActivity === "preparing"
        ? ("pending" as const)
        : senderAgentActivity === "idle"
          ? ("idle" as const)
          : ("online" as const)
    : undefined;

  const bubbleCorners = cn(
    "border border-border/80 bg-card p-3 text-sm leading-relaxed text-foreground shadow-sm break-words",
    !isGroupedWithPrev && !isGroupedWithNext && "rounded-2xl rounded-tl-none",
    !isGroupedWithPrev && isGroupedWithNext && "rounded-2xl rounded-tl-none rounded-bl-sm",
    isGroupedWithPrev && isGroupedWithNext && "rounded-2xl rounded-tl-sm rounded-bl-sm",
    isGroupedWithPrev && !isGroupedWithNext && "rounded-2xl rounded-tl-sm"
  );

  return (
    <div id={message.id} className={cn("flex gap-3 animate-in fade-in duration-200", isGroupedWithPrev ? "mt-0.5 pl-[36px]" : "mt-3")}>
      {!isGroupedWithPrev && (
        <AvatarWithStatus
          initials={initials}
          roleColor={roleColor}
          status={agentStatus}
          avatarDataUrl={senderAgentVisual?.avatarDataUrl}
          size="sm"
        />
      )}
      <div className="min-w-0 flex-1 space-y-1 group relative">
        
        <div className="absolute right-0 top-1/2 translate-x-[105%] -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 bg-popover/90 backdrop-blur-md border border-border/60 shadow-lg px-2.5 py-1 rounded-full z-20">
          <div className="flex gap-1">
            {reactionEmojis.slice(0, 3).map((emoji) => (
              <button
                key={emoji}
                onClick={() => onToggleReaction?.(message.id, emoji)}
                className="hover:scale-125 transition-transform duration-100 p-0.5 text-xs"
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="w-[1px] h-3 bg-border" />
          {onSetReplyingToMessage && (
            <button
              onClick={() => onSetReplyingToMessage(message)}
              className="text-muted-foreground hover:text-foreground p-1 transition-colors rounded-full hover:bg-muted"
              title="답장하기"
              type="button"
            >
              <CornerUpLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {!isGroupedWithPrev && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs font-semibold text-foreground">{label}</span>
            <span className="text-[9px] text-muted-foreground">{time}</span>
          </div>
        )}
        <div className={bubbleCorners}>
          {replyTo && (
            <div
              onClick={() => handleScrollToQuote(replyTo.id)}
              className="mb-2 cursor-pointer border-l-2 border-primary/50 bg-primary/5 px-2 py-1 text-xs text-muted-foreground rounded hover:bg-primary/10 transition-colors truncate max-w-full"
            >
              <span className="font-semibold text-primary block text-[10px]">
                @{replyTo.senderLabel}
              </span>
              {replyTo.content}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">
              {content}
              {!!message.metadata?.streaming && (
                <span className="inline-flex ml-1.5 items-center gap-1" aria-hidden="true">
                  <span className="w-1 h-1 bg-primary/90 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
                  <span className="w-1 h-1 bg-primary/90 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
                  <span className="w-1 h-1 bg-primary/90 rounded-full animate-bounce" />
                </span>
              )}
            </p>
            {!!message.metadata?.error && (
              <div className="mt-1.5 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-2.5 py-1.5 flex items-start gap-2 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold mr-1">오류:</span>
                  <span>{String(message.metadata.error)}</span>
                </div>
              </div>
            )}
          </div>
          {attachments.length > 0 ? (
            <MessageAttachments attachments={attachments} />
          ) : null}

          {isGroupedWithPrev && (
            <div className="mt-1 text-[9px] text-muted-foreground text-right select-none">
              {time}
            </div>
          )}
        </div>

        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 pl-1">
            {reactions.map((r) => {
              const userReacted = r.users.includes("user");
              return (
                <button
                  key={r.emoji}
                  onClick={() => onToggleReaction?.(message.id, r.emoji)}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors shadow-sm",
                    userReacted
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-card border-border/80 text-muted-foreground hover:bg-muted"
                  )}
                  title={r.users.join(", ")}
                  type="button"
                >
                  <span>{r.emoji}</span>
                  <span className="font-mono text-[9px]">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

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
  const recentMessages = messages.slice(-20);
  return recentMessages
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
