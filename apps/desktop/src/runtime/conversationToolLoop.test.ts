import { describe, expect, it } from "vitest";
import type { ToolCall } from "../lib/codingChat";
import type { WireMessage } from "../lib/codingTurnRunner";
import { replyRequestsTools, runConversationToolLoop } from "./conversationToolLoop";

const fence = (json: string) => "```tool\n" + json + "\n```";
const baseMessages: WireMessage[] = [
  { role: "system", content: "system prompt" },
  { role: "user", content: "src 디렉터리 구조를 알려줘" },
];
const makeToolId = (round: number, index: number) => `tool_${round}_${index}`;

function completeQueue(replies: string[]) {
  const seen: WireMessage[][] = [];
  let cursor = 0;
  return {
    seen,
    complete: async (messages: WireMessage[]) => {
      seen.push(messages);
      const content = replies[cursor] ?? "끝";
      cursor += 1;
      return { content };
    },
  };
}

describe("replyRequestsTools", () => {
  it("detects parseable tool fences only", () => {
    expect(replyRequestsTools(fence('{"tool":"bash","command":"ls"}'))).toBe(true);
    expect(replyRequestsTools("그냥 텍스트")).toBe(false);
    expect(replyRequestsTools(fence("깨진 json"))).toBe(false);
  });
});

describe("runConversationToolLoop", () => {
  it("returns immediately when the initial reply has no tool calls", async () => {
    const { complete } = completeQueue([]);
    const result = await runConversationToolLoop({
      initialReply: "도구 없이 답합니다",
      baseMessages,
      agentMode: "build",
      complete,
      executeTool: async () => {
        throw new Error("must not execute");
      },
      makeToolId,
    });
    expect(result.status).toBe("completed");
    expect(result.finalContent).toBe("도구 없이 답합니다");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.rounds).toBe(1);
  });

  it("executes tools, feeds results back, and finishes on a plain-text reply", async () => {
    const executed: string[] = [];
    const { complete, seen } = completeQueue(["src에는 lib와 runtime이 있습니다"]);
    const result = await runConversationToolLoop({
      initialReply: "확인하겠습니다\n" + fence('{"tool":"bash","command":"ls src"}'),
      baseMessages,
      agentMode: "build",
      complete,
      executeTool: async (call: ToolCall) => {
        executed.push(String(call.input.command));
        return { status: "completed", output: "lib\nruntime" };
      },
      makeToolId,
    });

    expect(executed).toEqual(["ls src"]);
    expect(result.status).toBe("completed");
    expect(result.finalContent).toBe("src에는 lib와 runtime이 있습니다");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ tool: "bash", status: "completed", output: "lib\nruntime" });
    // the follow-up completion received the tool result as a user turn
    const followup = seen[0]!;
    expect(followup[followup.length - 1]).toMatchObject({ role: "user" });
    expect(followup[followup.length - 1]!.content).toContain("[tool_result bash]");
  });

  it("blocks mutating tools in plan mode without executing them", async () => {
    const { complete } = completeQueue(["분석만 정리합니다"]);
    let executions = 0;
    const result = await runConversationToolLoop({
      initialReply: fence('{"tool":"bash","command":"rm -rf /"}'),
      baseMessages,
      agentMode: "plan",
      complete,
      executeTool: async () => {
        executions += 1;
        return { status: "completed", output: "no" };
      },
      makeToolId,
    });
    expect(executions).toBe(0);
    expect(result.toolCalls[0]).toMatchObject({ tool: "bash", status: "denied" });
    expect(result.status).toBe("completed");
  });

  it("stops cooperatively when cancelled before a tool runs", async () => {
    const result = await runConversationToolLoop({
      initialReply: fence('{"tool":"bash","command":"ls"}'),
      baseMessages,
      agentMode: "build",
      complete: async () => ({ content: "" }),
      executeTool: async () => ({ status: "completed", output: "x" }),
      makeToolId,
      isCancelled: () => true,
    });
    expect(result.status).toBe("cancelled");
  });

  it("caps the number of rounds", async () => {
    const toolReply = fence('{"tool":"read","path":"a.txt"}');
    const result = await runConversationToolLoop({
      initialReply: toolReply,
      baseMessages,
      agentMode: "build",
      complete: async () => ({ content: toolReply }),
      executeTool: async () => ({ status: "completed", output: "내용" }),
      makeToolId,
      maxRounds: 3,
    });
    expect(result.status).toBe("max_rounds");
    expect(result.rounds).toBe(3);
    expect(result.toolCalls).toHaveLength(3);
  });

  it("runs the diagnostics command after a successful mutating tool", async () => {
    const commands: string[] = [];
    const { complete } = completeQueue(["파일을 수정했습니다"]);
    const result = await runConversationToolLoop({
      initialReply: fence('{"tool":"write","path":"a.ts","content":"x"}'),
      baseMessages,
      agentMode: "build",
      complete,
      executeTool: async (call: ToolCall) => {
        if (call.tool === "bash") commands.push(String(call.input.command));
        return { status: "completed", output: call.tool === "bash" ? "" : "written" };
      },
      makeToolId,
      diagnosticsCommand: "tsc --noEmit",
    });
    expect(commands).toEqual(["tsc --noEmit"]);
    expect(result.diagnostics).toMatchObject({ command: "tsc --noEmit", ok: true });
    expect(result.finalContent).toBe("파일을 수정했습니다");
  });

  it("feeds diagnostics errors back to the model for one corrective round", async () => {
    const { complete, seen } = completeQueue([
      "수정 완료",
      "오류 원인: a.ts의 타입 불일치 — number를 string으로 바꿔야 합니다",
    ]);
    const result = await runConversationToolLoop({
      initialReply: fence('{"tool":"write","path":"a.ts","content":"x"}'),
      baseMessages,
      agentMode: "build",
      complete,
      executeTool: async (call: ToolCall) =>
        call.tool === "bash"
          ? { status: "completed", output: "a.ts(3,1): error TS2322: Type 'number' is not assignable" }
          : { status: "completed", output: "written" },
      makeToolId,
      diagnosticsCommand: "tsc --noEmit",
    });
    expect(result.diagnostics).toMatchObject({ ok: false });
    expect(result.finalContent).toContain("수정 완료");
    expect(result.finalContent).toContain("타입 불일치");
    // corrective round saw the diagnostics output
    const lastConversation = seen[seen.length - 1]!;
    expect(lastConversation[lastConversation.length - 1]!.content).toContain("error TS2322");
  });

  it("skips diagnostics when no mutating tool succeeded", async () => {
    const commands: string[] = [];
    const { complete } = completeQueue(["조회만 했습니다"]);
    const result = await runConversationToolLoop({
      initialReply: fence('{"tool":"read","path":"a.ts"}'),
      baseMessages,
      agentMode: "build",
      complete,
      executeTool: async (call: ToolCall) => {
        if (call.tool === "bash") commands.push(String(call.input.command));
        return { status: "completed", output: "내용" };
      },
      makeToolId,
      diagnosticsCommand: "tsc --noEmit",
    });
    expect(commands).toEqual([]);
    expect(result.diagnostics).toBeUndefined();
  });
});
