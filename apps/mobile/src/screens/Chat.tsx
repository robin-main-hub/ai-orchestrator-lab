import { useState } from "react";
import type { MobileAttachment, MobileMessage } from "../types";
import { Composer } from "../components/Composer";
import { MessageList } from "../components/MessageList";

type Props = {
  onOpenDrawer: () => void;
  title?: string;
};

export function Chat({ onOpenDrawer, title }: Props) {
  const [messages, setMessages] = useState<MobileMessage[]>([]);
  const [pending, setPending] = useState(false);

  const handleSend = (text: string, attachments: MobileAttachment[]) => {
    const now = new Date().toISOString();
    const userMessage: MobileMessage = {
      id: `msg_${crypto.randomUUID()}`,
      role: "user",
      content: text || (attachments.length > 0 ? "(파일 첨부)" : ""),
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: now,
    };
    setMessages((prev) => [...prev, userMessage]);
    setPending(true);

    // Mock response until DGX backend wiring lands in the next PR.
    window.setTimeout(() => {
      const reply: MobileMessage = {
        id: `msg_${crypto.randomUUID()}`,
        role: "assistant",
        content: attachments.length > 0
          ? `mock: ${text || "파일을 받았습니다"} (첨부 ${attachments.length}개)`
          : `mock: ${text}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      setPending(false);
    }, 600);
  };

  return (
    <div className="chat">
      <header className="chat__header">
        <button
          type="button"
          className="chat__menu-button"
          onClick={onOpenDrawer}
          aria-label="메뉴 열기"
        >
          ☰
        </button>
        <div className="chat__title">{title ?? "새 대화"}</div>
      </header>
      <MessageList messages={messages} />
      <Composer onSend={handleSend} disabled={pending} />
    </div>
  );
}
