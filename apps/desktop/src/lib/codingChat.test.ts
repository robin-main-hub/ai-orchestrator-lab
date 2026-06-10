import { describe, expect, it } from "vitest";
import {
  appendUserMessage,
  beginAssistantMessage,
  buildSystemPrompt,
  compactSession,
  createCodingSession,
  extractMentions,
  parseAssistantReply,
  parseSlashCommand,
  pushCheckpoint,
  sessionToMarkdown,
  setAssistantParts,
  toProviderMessages,
  undoToLastCheckpoint,
  updateToolCall,
} from "./codingChat";

const NOW = "2026-06-10T00:00:00.000Z";

const baseSession = () =>
  createCodingSession({ id: "cs1", now: NOW, providerProfileId: "p1", modelId: "m1" });

describe("parseAssistantReply", () => {
  it("splits text and tool fences in order, keeps invalid JSON visible as text", () => {
    const reply = [
      "테스트를 돌려볼게요.",
      "```tool",
      '{"tool":"bash","command":"pnpm test"}',
      "```",
      "그 다음 파일을 읽습니다.",
      "```tool",
      "{not json",
      "```",
      "끝.",
    ].join("\n");
    const { parts, toolCalls } = parseAssistantReply(reply, (index) => `t${index}`);
    expect(parts.map((part) => part.type)).toEqual(["text", "tool", "text", "text", "text"]);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ id: "t0", tool: "bash", status: "proposed" });
    expect(toolCalls[0]!.input.command).toBe("pnpm test");
    expect(parts.some((part) => part.type === "text" && part.text.includes("{not json"))).toBe(true);
  });

  it("rejects unknown tool names (rendered as text)", () => {
    const { toolCalls, parts } = parseAssistantReply('```tool\n{"tool":"rm_rf","x":1}\n```', () => "t0");
    expect(toolCalls).toHaveLength(0);
    expect(parts[0]!.type).toBe("text");
  });
});

describe("session reducer", () => {
  it("user message titles the session, checkpoint + undo rewinds whole turns", () => {
    let session = baseSession();
    session = pushCheckpoint(session, { id: "cp1", label: "턴 1", now: NOW });
    session = appendUserMessage(session, { id: "u1", text: "버그 고쳐줘: 로그인 깨짐", now: NOW });
    session = beginAssistantMessage(session, { id: "a1", now: NOW });
    session = setAssistantParts(session, {
      messageId: "a1",
      parts: [{ type: "text", text: "보겠습니다" }],
      now: NOW,
    });
    expect(session.title).toContain("버그 고쳐줘");
    expect(session.messages).toHaveLength(2);

    session = undoToLastCheckpoint(session, NOW);
    expect(session.messages).toHaveLength(0);
    expect(session.checkpoints).toHaveLength(0);
  });

  it("updates a tool call in place", () => {
    let session = baseSession();
    session = beginAssistantMessage(session, { id: "a1", now: NOW });
    session = setAssistantParts(session, {
      messageId: "a1",
      parts: [
        { type: "tool", call: { id: "t0", tool: "bash", title: "pnpm test", input: { command: "pnpm test" }, status: "running" } },
      ],
      now: NOW,
    });
    session = updateToolCall(session, { messageId: "a1", call: { id: "t0", status: "completed", output: "ok" }, now: NOW });
    const part = session.messages[0]!.parts[0]!;
    expect(part.type === "tool" && part.call.status).toBe("completed");
    expect(part.type === "tool" && part.call.output).toBe("ok");
  });

  it("compaction folds old messages into a summary that reaches the provider payload", () => {
    let session = baseSession();
    for (let index = 0; index < 10; index += 1) {
      session = appendUserMessage(session, { id: `u${index}`, text: `메시지 ${index}`, now: NOW });
    }
    session = compactSession(session, { keepMessages: 4, now: NOW });
    expect(session.messages).toHaveLength(4);
    expect(session.compactedSummary).toContain("메시지 0");
    const wire = toProviderMessages(session);
    expect(wire[0]).toMatchObject({ role: "system" });
    expect(wire[0]!.content).toContain("이전 대화 요약");
  });
});

describe("toProviderMessages", () => {
  it("inlines tool results for completed/failed/denied calls", () => {
    let session = baseSession();
    session = beginAssistantMessage(session, { id: "a1", now: NOW });
    session = setAssistantParts(session, {
      messageId: "a1",
      parts: [
        { type: "tool", call: { id: "t0", tool: "bash", title: "pnpm test", input: {}, status: "completed", output: "1 passed" } },
        { type: "tool", call: { id: "t1", tool: "write", title: "파일 쓰기 a.ts", input: {}, status: "denied" } },
      ],
      now: NOW,
    });
    const wire = toProviderMessages(session);
    expect(wire[0]!.content).toContain("[tool_result bash]\n1 passed");
    expect(wire[0]!.content).toContain("DENIED");
  });
});

describe("slash commands + mentions + prompts", () => {
  it("parses every documented slash command", () => {
    expect(parseSlashCommand("/new")).toEqual({ kind: "new" });
    expect(parseSlashCommand("/compact now")).toEqual({ kind: "compact" });
    expect(parseSlashCommand("/PLAN")).toEqual({ kind: "plan" });
    expect(parseSlashCommand("/wat")).toEqual({ kind: "unknown", name: "/wat" });
    expect(parseSlashCommand("그냥 텍스트")).toBeNull();
  });

  it("extracts unique @file mentions", () => {
    expect(extractMentions("@src/App.tsx 그리고 @src/App.tsx, @docs/41-lorebook.md 봐줘")).toEqual([
      "src/App.tsx",
      "docs/41-lorebook.md",
    ]);
  });

  it("plan mode and mentions land in the system prompt", () => {
    const prompt = buildSystemPrompt({ agentMode: "plan", mentions: ["a.ts"], workingDir: "/srv/repo" });
    expect(prompt).toContain("PLAN 모드");
    expect(prompt).toContain("a.ts");
    expect(prompt).toContain("/srv/repo");
    expect(prompt).toContain('"tool":"bash"');
  });
});

describe("sessionToMarkdown", () => {
  it("renders a shareable transcript", () => {
    let session = baseSession();
    session = appendUserMessage(session, { id: "u1", text: "안녕", now: NOW });
    const markdown = sessionToMarkdown(session);
    expect(markdown).toContain("# 안녕");
    expect(markdown).toContain("## 사용자");
  });
});
