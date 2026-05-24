import { useEffect, useRef, useState, type ClipboardEvent, type ChangeEvent } from "react";
import type { MobileAttachment } from "../types";

type Props = {
  onSend: (text: string, attachments: MobileAttachment[]) => void;
  disabled?: boolean;
};

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024; // 5MB inline preview cap

async function fileToAttachment(file: File): Promise<MobileAttachment> {
  const id = `att_${crypto.randomUUID()}`;
  const isImage = file.type.startsWith("image/");
  const previewDataUrl =
    isImage && file.size <= MAX_PREVIEW_BYTES ? await readAsDataUrl(file) : undefined;
  return {
    id,
    kind: isImage ? "image" : "document",
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    previewDataUrl,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value === "string") resolve(value);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

export function Composer({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<MobileAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to CSS max-height.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
  }, [text]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments);
    setText("");
    setAttachments([]);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const next: MobileAttachment[] = [];
    for (const file of files) {
      try {
        next.push(await fileToAttachment(file));
      } catch (err) {
        console.warn("[mobile] failed to read file attachment", err);
      }
    }
    setAttachments((prev) => [...prev, ...next]);
    // Reset so selecting the same file twice still fires onChange.
    event.target.value = "";
  };

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const next: MobileAttachment[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (!file) continue;
        try {
          next.push(await fileToAttachment(file));
        } catch (err) {
          console.warn("[mobile] failed to read pasted file", err);
        }
      } else if (item.kind === "string" && item.type === "text/plain") {
        // Plain text gets inserted into the textarea by the default paste,
        // so we don't add it as an attachment unless it's very long.
        const text = await new Promise<string>((resolve) => item.getAsString(resolve));
        if (text.length > 1000) {
          event.preventDefault();
          next.push({
            id: `att_${crypto.randomUUID()}`,
            kind: "clipboard-text",
            name: `클립보드 텍스트 (${text.length}자)`,
            mimeType: "text/plain",
            sizeBytes: text.length,
            textContent: text,
          });
        }
      }
    }
    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !disabled;

  return (
    <div
      className="composer"
      style={{ paddingBottom: `calc(var(--safe-bottom) + var(--keyboard-inset, 0px) + 8px)` }}
    >
      {attachments.length > 0 ? (
        <div className="composer__attachments">
          {attachments.map((att) => (
            <div key={att.id} className="composer__attachment-chip">
              {att.kind === "clipboard-text" ? "📋" : att.kind === "image" ? "🖼️" : "📄"}
              <span>{att.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                aria-label="첨부 제거"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="composer__row">
        <button
          type="button"
          className="composer__file-button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="파일 첨부"
        >
          +
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="composer__file-input"
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.log"
          onChange={handleFileChange}
        />
        <div className="composer__textarea-wrap">
          <textarea
            ref={textareaRef}
            className="composer__textarea"
            placeholder="메시지를 입력하세요"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            rows={1}
            enterKeyHint="send"
          />
        </div>
        <button
          type="button"
          className="composer__send"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="전송"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
