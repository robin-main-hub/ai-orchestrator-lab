import React from "react";
import {
  ImageIcon,
  FileText,
  X,
  Send,
  Paperclip,
  Pencil,
  Hammer,
  Square,
  Telescope,
} from "lucide-react";
import type { ModelDescriptor } from "@ai-orchestrator/protocol";
import { Plus, FlaskConical, AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { cn } from "@/lib/utils";
import type { DraftAttachment, WorkbenchAgent } from "../../types";
import {
  attachmentCapabilityLabel,
} from "../../lib/helpers";
import { getAgentToolBadgeLabels } from "../../lib/agentToolProfiles";
import type { AttachmentProcessingPlan } from "../../lib/attachmentProcessing";
import { attachmentDeliveryNote, summarizeRejectedAttachments } from "../../lib/attachmentWarnings";

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
  agentMode = "build",
  onAgentModeChange,
  turnActive = false,
  onStopTurn,
  queuedMessages,
  onRemoveQueuedMessage,
  onStartSwarmSearch,
  onStartAppBuild,
  rejectedAttachmentPlans,
  onOpenModelPicker,
}: {
  attachmentAccept: string;
  attachmentEnabled: boolean;
  attachmentLimitReached: boolean;
  continuityPlaceholder?: string;
  draftAttachments: DraftAttachment[];
  draftMessage: string;
  maxDraftAttachments: number;
  onAddDraftAttachments: (files: FileList | File[] | null) => void;
  onDraftMessageChange: (value: string) => void;
  onRemoveDraftAttachment: (attachmentId: string) => void;
  onSendMessage: () => void;
  /** 추천대화 클릭 시 즉시 전송 */
  onSendSuggestion?: (text: string) => void;
  promptSuggestions?: string[];
  selectedAgent?: WorkbenchAgent;
  selectedModel?: ModelDescriptor;
  showDelegationChips: boolean;
  /** 항목 4 — 플랜(읽기 전용)/빌드 토글 */
  agentMode?: "build" | "plan";
  onAgentModeChange?: (mode: "build" | "plan") => void;
  /** 항목 1 — 턴 진행 중이면 보내기 대신 중지 버튼 */
  turnActive?: boolean;
  onStopTurn?: () => void;
  /** 항목 8 — 대기 중인 메시지 큐 */
  queuedMessages?: string[];
  onRemoveQueuedMessage?: (index: number) => void;
  /** "+" 도구 메뉴 → 스웜 서치: 현재 입력(또는 직전 대화)을 주제로 4~16명 자동 병렬 조사 */
  onStartSwarmSearch?: (topic: string) => void;
  /** "+" 도구 메뉴 → 앱 빌드: 지금 대화를 구조화된 앱 초안으로(검토 패널). 자동 LLM 발사 없음 */
  onStartAppBuild?: (draft: string) => void;
  /** 직전 첨부 시 거부된 처리 플랜 — 조용히 실패하지 않게 경고로 표면화 */
  rejectedAttachmentPlans?: AttachmentProcessingPlan[];
  /** 모델 교체 CTA — 첨부 종류를 선택 모델이 지원 안 할 때 모델 선택을 연다 */
  onOpenModelPicker?: () => void;
}) {
  const canSend =
    Boolean(selectedAgent) &&
    (draftMessage.trim().length > 0 || draftAttachments.length > 0);
  const showStopButton = turnActive && Boolean(onStopTurn);
  // 첨부 거부를 조용히 삼키지 않고 표면화(정직성).
  const rejection = summarizeRejectedAttachments(rejectedAttachmentPlans);
  // Win+Shift+S 등으로 클립보드에 든 이미지를 Ctrl+V로 붙이면 첨부로 추가. 텍스트 paste는 그대로.
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (imageFiles.length === 0) return; // 이미지 없으면 기본 텍스트 붙여넣기 유지
    event.preventDefault();
    onAddDraftAttachments(imageFiles);
  };

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
    <div className="shrink-0 border-t border-white/10 bg-surface/90 shadow-[0_-20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {/* 항목 4 — 플랜/빌드 모드 토글 + 항목 8 큐 칩 */}
      {onAgentModeChange || (queuedMessages && queuedMessages.length > 0) ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-1.5">
          {onAgentModeChange ? (
            <div className="inline-flex overflow-hidden rounded-lg border border-white/10" role="tablist">
              <button
                aria-selected={agentMode === "build"}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] transition-colors",
                  agentMode === "build"
                    ? "bg-primary/20 font-semibold text-primary"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onAgentModeChange("build")}
                role="tab"
                title="모든 도구가 승인 게이트를 거쳐 실행됩니다"
                type="button"
              >
                <Hammer className="h-3 w-3" /> 빌드
              </button>
              <button
                aria-selected={agentMode === "plan"}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] transition-colors",
                  agentMode === "plan"
                    ? "bg-primary/20 font-semibold text-primary"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onAgentModeChange("plan")}
                role="tab"
                title="읽기 전용 — 변경 도구(bash/write/edit)가 차단됩니다"
                type="button"
              >
                <Telescope className="h-3 w-3" /> 플랜
              </button>
            </div>
          ) : null}
          {queuedMessages?.map((queued, index) => (
            <span
              className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10.5px] text-warning"
              key={`${index}_${queued.slice(0, 12)}`}
              title={`턴 종료 후 자동 발송: ${queued}`}
            >
              <span className="truncate">대기 {index + 1}: {queued}</span>
              {onRemoveQueuedMessage ? (
                <button
                  aria-label={`대기 메시지 ${index + 1} 제거`}
                  className="shrink-0 text-warning/70 hover:text-warning"
                  onClick={() => onRemoveQueuedMessage(index)}
                  type="button"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {/* Delegation chips (companion only) */}
      {showDelegationChips ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
          <span className="text-xs text-primary">
            도구 준비됨{toolLabels.length > 0 ? ` · ${toolLabels.join(", ")}` : ""}
          </span>
        </div>
      ) : null}

      {!draftMessage.trim() && promptSuggestions?.length ? (
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex w-full flex-col items-start gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              바로 물어보기
            </span>
            {promptSuggestions.map((suggestion) => (
              <div className="flex w-full max-w-full items-stretch gap-1" key={suggestion}>
                <button
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-[12px] leading-snug text-foreground transition hover:border-primary/30 hover:bg-primary/[0.08] hover:text-primary"
                  onClick={() => (onSendSuggestion ? onSendSuggestion(suggestion) : onDraftMessageChange(suggestion))}
                  title="클릭하면 바로 전송"
                  type="button"
                >
                  {suggestion}
                </button>
                <button
                  aria-label="이 추천대화를 수정해서 보내기"
                  className="shrink-0 self-center rounded-xl border border-white/10 bg-white/[0.03] p-2 text-muted-foreground transition hover:border-primary/40 hover:bg-primary/[0.1] hover:text-primary"
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

      {/* 첨부 거부 경고(조용한 실패 금지) — 모델 능력 미달이면 모델 교체 CTA */}
      {rejection.count > 0 ? (
        <div className="mx-auto flex max-w-4xl items-start gap-2 px-4 pt-2 text-[11px]" role="status">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-warning">
            <span>{rejection.count}개 첨부가 추가되지 않았습니다 — {rejection.reasons.join(" · ")}</span>
            {rejection.showModelCta ? (
              onOpenModelPicker ? (
                <button
                  className="ml-2 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning hover:bg-warning/20"
                  onClick={onOpenModelPicker}
                  type="button"
                >
                  <RefreshCcw className="h-3 w-3" /> 모델 바꾸기
                </button>
              ) : (
                <span className="ml-1 text-warning">— 첨부를 지원하는 모델로 바꾸세요</span>
              )
            ) : null}
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
              "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary",
              (!attachmentEnabled || attachmentLimitReached) &&
                "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
            htmlFor="conversation-attachment-input"
            title={attachmentCapabilityLabel(selectedModel)}
          >
            <Paperclip className="h-4 w-4" />
          </label>
          <span className="text-center text-[9px] text-muted-foreground">
            {draftAttachments.length}/{maxDraftAttachments}
          </span>
        </div>

        {/* "+" 도구 메뉴 (MCP 스타일) — 스웜 서치 / 앱 빌드 */}
        {onStartSwarmSearch || onStartAppBuild ? (
          <div className="flex shrink-0 flex-col gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  aria-label="도구 추가"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                  title="도구"
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 border-border bg-surface/95 p-1.5 text-foreground backdrop-blur-xl">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">도구</p>
                {onStartSwarmSearch ? (
                  <button
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-primary/10"
                    onClick={() => onStartSwarmSearch(draftMessage)}
                    type="button"
                  >
                    <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">스웜 서치</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        지금 입력(또는 직전 대화)을 주제로 4~16명 요원이 자동 병렬 조사
                      </span>
                    </span>
                  </button>
                ) : null}
                {onStartAppBuild ? (
                  <button
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-primary/10"
                    onClick={() => onStartAppBuild(draftMessage)}
                    type="button"
                  >
                    <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">앱 빌드</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        지금 대화를 구조화된 앱 초안으로 — 검토 후 미션 생성 (자동 LLM 발사 없음)
                      </span>
                    </span>
                  </button>
                ) : null}
              </PopoverContent>
            </Popover>
            <span className="text-center text-[9px] text-muted-foreground">도구</span>
          </div>
        ) : null}

        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            aria-label="메시지 입력"
            className="min-h-[56px] w-full resize-none rounded-2xl border border-white/10 bg-surface/70 px-4 py-3 pr-14 text-sm leading-6 text-foreground shadow-inner shadow-black/20 outline-none placeholder:text-muted-foreground transition-colors focus-visible:border-primary/50 focus-visible:bg-surface"
            data-focus-id="composer-textarea"
            onChange={(event) => onDraftMessageChange(event.target.value)}
            onPaste={handlePaste}
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
              {draftAttachments.map((attachment) => {
                // 정직 전달 안내: zip은 직접 못 읽음, excel은 구조 해석 주의, metadata_only는 내용 미전달.
                const deliveryNote = attachmentDeliveryNote(attachment);
                return (
                  <span
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-1.5 py-0.5 text-[10px]"
                    key={attachment.id}
                    title={deliveryNote}
                  >
                    {attachment.kind === "image" ? (
                      <ImageIcon className="h-2.5 w-2.5" />
                    ) : (
                      <FileText className="h-2.5 w-2.5" />
                    )}
                    <span className="max-w-[80px] truncate text-foreground">
                      {attachment.name}
                    </span>
                    {deliveryNote ? <AlertTriangle className="h-2.5 w-2.5 text-warning" aria-label="전달 주의" /> : null}
                    <button
                      aria-label={`${attachment.name} 제거`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveDraftAttachment(attachment.id)}
                      type="button"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Send / Stop (항목 1) */}
        {showStopButton ? (
          <Button
            aria-label="응답 생성 중지"
            className="h-10 gap-2 rounded-xl border border-destructive/40 bg-destructive/15 px-4 text-destructive hover:bg-destructive/25"
            onClick={() => onStopTurn?.()}
            type="button"
            variant="ghost"
          >
            <Square className="h-4 w-4 fill-current" />
            <span className="hidden sm:inline">중지</span>
          </Button>
        ) : (
          <Button
            className="h-10 gap-2 rounded-xl bg-primary px-4 text-primary-foreground shadow-lg hover:bg-primary/90"
            disabled={!canSend}
            type="submit"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">보내기</span>
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
