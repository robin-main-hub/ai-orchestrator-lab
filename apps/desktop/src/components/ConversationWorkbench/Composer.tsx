import React from "react";
import {
  ImageIcon,
  FileText,
  X,
  Send,
  Paperclip,
  Pencil,
} from "lucide-react";
import type { ModelDescriptor } from "@ai-orchestrator/protocol";
import { Button } from "@/ui/button";
import { cn } from "@/lib/utils";
import type { DraftAttachment, WorkbenchAgent } from "../../types";
import {
  attachmentCapabilityLabel,
} from "../../lib/helpers";
import { getAgentToolBadgeLabels } from "../../lib/agentToolProfiles";

export function Composer({
  attachmentAccept,
  attachmentEnabled,
  attachmentLimitReached,
  continuityPlaceholder,
  draftAttachments,
  draftMessage,
  maxDraftAttachments,
  onAddDraftAttachments,
  onDraftMessageChange,
  onRemoveDraftAttachment,
  onSendMessage,
  onSendSuggestion,
  promptSuggestions,
  selectedAgent,
  selectedModel,
  showDelegationChips,
}: {
  attachmentAccept: string;
  attachmentEnabled: boolean;
  attachmentLimitReached: boolean;
  continuityPlaceholder?: string;
  draftAttachments: DraftAttachment[];
  draftMessage: string;
  maxDraftAttachments: number;
  onAddDraftAttachments: (files: FileList | null) => void;
  onDraftMessageChange: (value: string) => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSendMessage: () => void;
  /** 추천대화 클릭 시 즉시 전송 */
  onSendSuggestion?: (text: string) => void;
  promptSuggestions?: string[];
  selectedAgent?: WorkbenchAgent;
  selectedModel?: ModelDescriptor;
  showDelegationChips: boolean;
}) {
  const canSend =
    Boolean(selectedAgent) &&
    (draftMessage.trim().length > 0 || draftAttachments.length > 0);

  // 자동 성장: 긴 추천대화/멀티라인 입력이 들어와도 줄이 잘리지 않게
  // scrollHeight에 맞춰 높이를 키운다 (최대 5줄 가량, 이후 스크롤).
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
  }, [draftMessage]);
  const toolLabels = selectedAgent ? getAgentToolBadgeLabels(selectedAgent.role).slice(0, 3) : [];

  return (
    <div className="shrink-0 border-t border-white/10 bg-zinc-950/90 shadow-[0_-20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {/* Delegation chips (companion only) */}
      {showDelegationChips ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
          <span className="text-xs text-cyan-300">
            도구 준비됨{toolLabels.length > 0 ? ` · ${toolLabels.join(", ")}` : ""}
          </span>
        </div>
      ) : null}

      {!draftMessage.trim() && promptSuggestions?.length ? (
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex w-full flex-col items-start gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
              바로 물어보기
            </span>
            {promptSuggestions.map((suggestion) => (
              <div className="flex w-full max-w-full items-stretch gap-1" key={suggestion}>
                <button
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-[12px] leading-snug text-zinc-300 transition hover:border-cyan-300/30 hover:bg-cyan-400/[0.08] hover:text-cyan-100"
                  onClick={() => (onSendSuggestion ? onSendSuggestion(suggestion) : onDraftMessageChange(suggestion))}
                  title="클릭하면 바로 전송"
                  type="button"
                >
                  {suggestion}
                </button>
                <button
                  aria-label="이 추천대화를 수정해서 보내기"
                  className="shrink-0 self-center rounded-xl border border-white/10 bg-white/[0.03] p-2 text-zinc-500 transition hover:border-violet-300/40 hover:bg-violet-400/[0.1] hover:text-violet-200"
                  onClick={() => onDraftMessageChange(suggestion)}
                  title="수정해서 보내기"
                  type="button"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="mx-auto flex max-w-4xl items-start gap-2 p-3"
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
              "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-cyan-200",
              (!attachmentEnabled || attachmentLimitReached) &&
                "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
            htmlFor="conversation-attachment-input"
            title={attachmentCapabilityLabel(selectedModel)}
          >
            <Paperclip className="h-4 w-4" />
          </label>
          <span className="text-center text-[9px] text-zinc-500">
            {draftAttachments.length}/{maxDraftAttachments}
          </span>
        </div>

        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            aria-label="메시지 입력"
            className="min-h-[56px] w-full resize-none rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3 pr-14 text-sm leading-6 text-zinc-100 shadow-inner shadow-black/20 outline-none placeholder:text-zinc-600 transition-colors focus-visible:border-cyan-400/50 focus-visible:bg-zinc-900"
            data-focus-id="composer-textarea"
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
            placeholder={continuityPlaceholder ?? `${selectedAgent?.name ?? "봇"}에게 말 걸기`}
            rows={1}
            value={draftMessage}
          />
          {draftAttachments.length > 0 ? (
            <div className="absolute bottom-2 left-2 right-12 flex flex-wrap gap-1">
              {draftAttachments.map((attachment) => (
                <span
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-1.5 py-0.5 text-[10px]"
                  key={attachment.id}
                >
                  {attachment.kind === "image" ? (
                    <ImageIcon className="h-2.5 w-2.5" />
                  ) : (
                    <FileText className="h-2.5 w-2.5" />
                  )}
                  <span className="max-w-[80px] truncate text-zinc-200">
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
          className="h-10 gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 text-white shadow-lg shadow-cyan-950/30 hover:from-cyan-400 hover:to-violet-400"
          disabled={!canSend}
          type="submit"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">보내기</span>
        </Button>
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
