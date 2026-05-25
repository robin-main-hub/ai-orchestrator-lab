import { useEffect, useRef } from "react";
import type { MobileMessage } from "../types";

type Props = {
  messages: MobileMessage[];
};

export function MessageList({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div ref={scrollRef} className="chat__messages">
      {messages.length === 0 ? (
        <div className="chat__empty">메시지를 입력해 대화를 시작하세요.</div>
      ) : (
        messages.map((message) => (
          <div key={message.id} className={`bubble bubble--${message.role}`}>
            {message.attachments && message.attachments.length > 0 ? (
              <div className="bubble__attachments">
                {message.attachments.map((att) =>
                  att.kind === "image" && att.previewDataUrl ? (
                    <img
                      key={att.id}
                      src={att.previewDataUrl}
                      alt={att.name}
                      className="bubble__attachment-image"
                    />
                  ) : (
                    <div key={att.id} className="bubble__attachment">
                      {att.kind === "clipboard-text" ? "📋" : att.kind === "image" ? "🖼️" : "📄"}{" "}
                      {att.name}
                    </div>
                  ),
                )}
              </div>
            ) : null}
            {message.content}
          </div>
        ))
      )}
    </div>
  );
}
