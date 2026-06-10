import { useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FileSearch,
  FileText,
  FolderSearch,
  Pencil,
  Terminal,
} from "lucide-react";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import type { ChatMessage, ChatPart, CodingToolName, ToolCall, ToolStatus } from "../../lib/codingChat";

/**
 * 코딩 스레드 — opencode-style message renderer. Text parts render as light
 * markdown (code fences become <pre>); tool parts render as collapsible
 * cards: bash/read/grep/glob show captured output, edit shows a colored
 * unified diff with an optional gated 적용 button, todo shows a checklist.
 * Presentational only; verified via static markup.
 */

const TOOL_ICONS: Record<CodingToolName, typeof Terminal> = {
  bash: Terminal,
  read: FileText,
  grep: FileSearch,
  glob: FolderSearch,
  write: Pencil,
  edit: FileDiff,
  todo: CheckSquare,
};

const TOOL_LABELS: Record<CodingToolName, string> = {
  bash: "터미널",
  read: "읽기",
  grep: "검색",
  glob: "파일 찾기",
  write: "파일 쓰기",
  edit: "수정 제안",
  todo: "할 일",
};

function statusBadge(status: ToolStatus): { label: string; variant: StatusBadgeVariant } {
  switch (status) {
    case "completed":
      return { label: "완료", variant: "success" };
    case "failed":
      return { label: "실패", variant: "danger" };
    case "denied":
      return { label: "거부됨", variant: "warning" };
    case "running":
      return { label: "실행 중", variant: "primary" };
    case "pending_approval":
      return { label: "승인 대기", variant: "warning" };
    case "proposed":
    default:
      return { label: "제안", variant: "muted" };
  }
}

/** light markdown: split on ``` fences; fenced segments render as <pre> */
function TextPart({ text }: { text: string }) {
  const segments = text.split(/```(?:\w+)?\n?/);
  return (
    <div className="coding-text">
      {segments.map((segment, index) =>
        index % 2 === 1 ? (
          <pre className="coding-code" key={index}>
            {segment.replace(/\n$/, "")}
          </pre>
        ) : segment.trim() ? (
          <p key={index}>{segment}</p>
        ) : null,
      )}
    </div>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="coding-diff">
      {diff.split("\n").map((line, index) => {
        const tone = line.startsWith("+") && !line.startsWith("+++")
          ? "add"
          : line.startsWith("-") && !line.startsWith("---")
            ? "del"
            : line.startsWith("@@")
              ? "hunk"
              : "ctx";
        return (
          <span className={`coding-diff__line coding-diff__line--${tone}`} key={index}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

function ToolCard({
  call,
  onApplyEdit,
}: {
  call: ToolCall;
  onApplyEdit?: (call: ToolCall) => void;
}) {
  const [open, setOpen] = useState(call.tool === "edit" || call.tool === "todo");
  const Icon = TOOL_ICONS[call.tool];
  const badge = statusBadge(call.status);
  const diff = call.tool === "edit" ? String(call.input.diff ?? "") : null;
  const todoItems = call.tool === "todo" && Array.isArray(call.input.items) ? call.input.items.map(String) : null;

  return (
    <section className={`coding-tool coding-tool--${call.status}`}>
      <button className="coding-tool__header" onClick={() => setOpen((value) => !value)} type="button">
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <Icon size={13} aria-hidden className="coding-tool__icon" />
        <span className="coding-tool__kind">{TOOL_LABELS[call.tool]}</span>
        <span className="coding-tool__title" title={call.title}>
          {call.title}
        </span>
        {call.status === "running" ? <span className="coding-tool__spinner os-breathe" aria-hidden /> : null}
        <StatusBadge size="sm" variant={badge.variant}>
          {badge.label}
        </StatusBadge>
      </button>
      {open ? (
        <div className="coding-tool__body">
          {diff !== null ? (
            <>
              <DiffView diff={diff} />
              {onApplyEdit ? (
                <button className="coding-tool__apply" onClick={() => onApplyEdit(call)} type="button">
                  적용 (게이트 통과)
                </button>
              ) : null}
            </>
          ) : null}
          {todoItems ? (
            <ul className="coding-todo">
              {todoItems.map((item, index) => (
                <li key={index}>□ {item}</li>
              ))}
            </ul>
          ) : null}
          {call.output && diff === null && !todoItems ? <pre className="coding-tool__output">{call.output}</pre> : null}
          {call.error && call.error !== call.output ? (
            <p className="coding-tool__error">{call.error}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MessageParts({ parts, onApplyEdit }: { parts: ChatPart[]; onApplyEdit?: (call: ToolCall) => void }) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === "text" ? (
          <TextPart key={index} text={part.text} />
        ) : (
          <ToolCard call={part.call} key={part.call.id} onApplyEdit={onApplyEdit} />
        ),
      )}
    </>
  );
}

export function CodingThread({
  messages,
  thinking,
  onApplyEdit,
}: {
  messages: ChatMessage[];
  /** show the thinking indicator under the last message */
  thinking?: boolean;
  onApplyEdit?: (call: ToolCall) => void;
}) {
  return (
    <div className="coding-thread">
      {messages.length === 0 ? (
        <div className="coding-thread__empty">
          <p>무엇을 만들까요? 명령은 모두 승인 게이트를 통과합니다.</p>
          <p className="coding-thread__empty-hint">
            <code>/help</code> 슬래시 명령 · <code>@경로</code> 파일 멘션 · Shift+Enter 줄바꿈
          </p>
        </div>
      ) : (
        messages.map((message) => (
          <article className={`coding-message coding-message--${message.role}`} key={message.id}>
            <header className="coding-message__role">{message.role === "user" ? "나" : "에이전트"}</header>
            <MessageParts parts={message.parts} onApplyEdit={message.role === "assistant" ? onApplyEdit : undefined} />
          </article>
        ))
      )}
      {thinking ? (
        <div className="coding-thinking" role="status" aria-label="응답 생성 중">
          <span className="os-thinking-dot" />
          <span className="os-thinking-dot" style={{ animationDelay: "0.2s" }} />
          <span className="os-thinking-dot" style={{ animationDelay: "0.4s" }} />
        </div>
      ) : null}
    </div>
  );
}
