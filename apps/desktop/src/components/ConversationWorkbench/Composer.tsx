import React, { useRef, useEffect } from "react";
import {
  ImageIcon,
  FileText,
  X,
  Send,
  Paperclip,
} from "lucide-react";
import type { ModelDescriptor } from "@ai-orchestrator/protocol";
import { Button } from "@/ui/button";
import { cn } from "@/lib/utils";
import type { DraftAttachment, WorkbenchAgent } from "../../types";
import {
  attachmentCapabilityLabel,
} from "../../lib/helpers";
import { getCanSend } from "../../lib/composerSafety";

export function Composer({
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
  replyingToMessage,
  onCancelReply,
  isStreaming = false,
  onCancelStream,
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
  replyingToMessage?: any;
  onCancelReply?: () => void;
  isStreaming?: boolean;
  onCancelStream?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(150, textarea.scrollHeight)}px`;
    }
  }, [draftMessage]);

  const canSend = getCanSend({
    selectedAgent,
    isStreaming,
    draftMessage,
    draftAttachments,
  });

  return (
    <div className="shrink-0 border-t border-border bg-card/50">
      {replyingToMessage && (
        <div className="flex items-center justify-between border-b border-border/40 bg-primary/5 px-4 py-2 text-xs animate-in slide-in-from-bottom duration-200">
          <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
            <span className="font-semibold text-primary">
              {replyingToMessage.role === "user" ? "사용자" : "에이전트"}에게 답장
            </span>
            <p className="truncate text-muted-foreground mt-0.5">
              {replyingToMessage.content}
            </p>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              className="text-muted-foreground hover:text-foreground p-1 transition-colors"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

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

        <div className="relative flex-1 group">
          <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-cyan-500/0 via-blue-500/0 to-indigo-500/0 opacity-0 group-focus-within:from-cyan-500/30 group-focus-within:via-blue-500/30 group-focus-within:to-indigo-500/30 group-focus-within:opacity-100 transition-all duration-300 blur-sm -z-10" />
          
          <textarea
            ref={textareaRef}
            aria-label="메시지 입력"
            className="min-h-[44px] max-h-[150px] w-full resize-none rounded-md border border-border bg-card/40 px-3 py-2.5 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary/80 focus-visible:outline-none transition-all duration-200"
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

        {isStreaming ? (
          <Button
            className="h-9 gap-2 shadow-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-transform active:scale-[0.98]"
            onClick={(e) => {
              e.preventDefault();
              onCancelStream?.();
            }}
            type="button"
          >
            <span className="w-2 h-2 bg-current rounded-sm animate-pulse mr-0.5" />
            중단
          </Button>
        ) : (
          <Button
            className="h-9 gap-2 shadow-sm transition-transform active:scale-[0.98]"
            disabled={!canSend}
            type="submit"
          >
            <Send className="h-4 w-4" />
            보내기
          </Button>
        )}
      </form>
    </div>
  );
}

export function DelegationChip({
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
