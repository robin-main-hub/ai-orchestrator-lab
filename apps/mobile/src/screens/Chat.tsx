import { useEffect, useMemo, useRef, useState } from "react";
import type { MobileAttachment, MobileMessage, MobileSoul } from "../types";
import { Composer } from "../components/Composer";
import { MessageList } from "../components/MessageList";
import { SoulSwitcher } from "../components/SoulSwitcher";
import {
  SessionListSheet,
  type MobileSessionEntry,
} from "../components/SessionListSheet";
import { useSoulBackground } from "../hooks/useBackgroundImage";
import { requestChatCompletion } from "../lib/chatCompletion";
import { MobileApiError } from "../lib/api";

type Props = {
  souls: MobileSoul[];
  activeSoulId: string;
  onChangeSoul: (soulId: string) => void;
};

export function Chat({ souls, activeSoulId, onChangeSoul }: Props) {
  const [messages, setMessages] = useState<MobileMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [soulSwitcherOpen, setSoulSwitcherOpen] = useState(false);
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [sessions, setSessions] = useState<MobileSessionEntry[]>([]);
  const [chatNonce, setChatNonce] = useState(0);
  const sessionIdRef = useRef<string>(generateSessionId(activeSoulId));

  // Re-apply background each time the active SOUL changes.
  useSoulBackground(activeSoulId);

  const activeSoul = useMemo(
    () => souls.find((s) => s.id === activeSoulId) ?? souls[0]!,
    [souls, activeSoulId],
  );

  // Reset transient chat state whenever the user switches SOULs or starts a
  // new conversation. (Persisted message history will come from event sync in
  // a follow-up PR.) Each reset also rolls a fresh sessionId so server-side
  // /events/sync can keep turns grouped correctly.
  useEffect(() => {
    setMessages([]);
    sessionIdRef.current = generateSessionId(activeSoulId);
  }, [activeSoulId, chatNonce]);

  const handleSend = async (text: string, attachments: MobileAttachment[]) => {
    const now = new Date().toISOString();
    const userContent = text || (attachments.length > 0 ? "(파일 첨부)" : "");
    const userMessage: MobileMessage = {
      id: `msg_${crypto.randomUUID()}`,
      role: "user",
      content: userContent,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: now,
    };
    setMessages((prev) => [...prev, userMessage]);
    setPending(true);

    const history = messages.map((m) => ({
      role: m.role,
      // Attachments are not yet uploaded server-side; for now we surface a
      // text marker in history so the model knows files were attached.
      content: m.attachments?.length
        ? `${m.content}\n[첨부 ${m.attachments.length}개]`
        : m.content,
    }));

    let replyContent: string;
    try {
      const response = await requestChatCompletion({
        sessionId: sessionIdRef.current,
        soul: activeSoul,
        history,
        userText: userContent,
      });
      if (response.status === "succeeded" && response.content) {
        replyContent = response.content;
      } else {
        replyContent = `⚠️ ${response.error ?? "응답을 받지 못했습니다."}`;
      }
    } catch (err) {
      replyContent = formatChatError(err, activeSoul);
    }

    const reply: MobileMessage = {
      id: `msg_${crypto.randomUUID()}`,
      role: "assistant",
      content: replyContent,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, reply]);
    setPending(false);

    setSessions((prev) => {
      const id = sessionIdRef.current;
      const entry: MobileSessionEntry = {
        id,
        title: text.slice(0, 30) || `${activeSoul.name}와 대화`,
        soulId: activeSoul.id,
        lastMessagePreview: reply.content,
        updatedAt: reply.createdAt,
      };
      const filtered = prev.filter((s) => s.id !== id);
      return [entry, ...filtered].slice(0, 20);
    });
  };

  const handleNewSession = () => {
    setChatNonce((n) => n + 1);
  };

  return (
    <div className="chat">
      <header className="chat__header">
        <button
          type="button"
          className="chat__menu-button"
          onClick={() => setSessionListOpen(true)}
          aria-label="이전 대화 목록"
        >
          ☰
        </button>
        <button
          type="button"
          onClick={() => setSoulSwitcherOpen(true)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 0,
          }}
          aria-label={`현재 ${activeSoul.name}, 탭하여 변경`}
        >
          <span
            className="soul-card__avatar"
            style={{
              background: activeSoul.accentColor,
              width: 28,
              height: 28,
              fontSize: 14,
            }}
          >
            {activeSoul.avatarEmoji}
          </span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{activeSoul.name}</span>
          <span aria-hidden style={{ color: "var(--text-muted)" }}>
            ⌄
          </span>
        </button>
        <button
          type="button"
          className="chat__menu-button"
          onClick={handleNewSession}
          aria-label="새 대화"
        >
          ＋
        </button>
      </header>
      <MessageList messages={messages} />
      <Composer onSend={handleSend} disabled={pending} />

      <SoulSwitcher
        open={soulSwitcherOpen}
        souls={souls}
        activeSoulId={activeSoulId}
        onSelect={onChangeSoul}
        onClose={() => setSoulSwitcherOpen(false)}
      />
      <SessionListSheet
        open={sessionListOpen}
        sessions={sessions}
        onSelect={() => {
          // Wiring loads a stored session in the event-sync PR.
          handleNewSession();
        }}
        onNewSession={handleNewSession}
        onClose={() => setSessionListOpen(false)}
      />
    </div>
  );
}

function generateSessionId(soulId: string): string {
  return `session_mobile_${soulId}_${Date.now().toString(36)}`;
}

function formatChatError(err: unknown, soul: MobileSoul): string {
  if (err instanceof MobileApiError) {
    return `⚠️ ${soul.name}: ${err.userMessage}`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return `⚠️ ${soul.name}: 예상치 못한 오류 — ${message}`;
}
