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

  it("feeds STRUCTURED diagnostics back to the model when it can't fix", async () => {
    const { complete, seen } = completeQueue([
      "수정 완료",
      "오류 원인: a.ts의 타입 불일치 — number를 string으로 바꿔야 합니다", // 도구 없음 → 자기수정 중단
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
    // 자기수정 피드백은 구조화된 형태(파일:라인 + 코드)로 전달된다
    const feedback = seen[seen.length - 1]!.map((m) => m.content).join("\n");
    expect(feedback).toContain("a.ts:3:1");
    expect(feedback).toContain("TS2322");
  });

  it("자기수정: 진단 실패 → edit로 고치고 재진단하면 통과 (P1-4)", async () => {
    const { complete } = completeQueue([
      "파일을 작성했습니다", // 메인 루프 종료(도구 없음)
      fence('{"tool":"edit","path":"a.ts","search":"bad","replace":"good"}'), // 자기수정 라운드
      "타입 오류를 고쳤습니다",
    ]);
    let tscRuns = 0;
    const result = await runConversationToolLoop({
      initialReply: fence('{"tool":"write","path":"a.ts","content":"bad"}'),
      baseMessages,
      agentMode: "build",
      complete,
      executeTool: async (call: ToolCall) => {
        if (call.tool === "bash") {
          tscRuns += 1;
          return tscRuns === 1
            ? { status: "completed", output: "a.ts(1,1): error TS2322: bad type" } // 첫 진단 실패
            : { status: "completed", output: "Found 0 errors." }; // 재진단 통과
        }
        return { status: "completed", output: "applied" };
      },
      makeToolId,
      diagnosticsCommands: ["tsc --noEmit"],
      maxFixAttempts: 2,
    });
    expect(tscRuns).toBe(2); // 최초 진단 + 자기수정 후 재진단
    expect(result.diagnostics?.ok).toBe(true);
    expect(result.diagnostics?.fixAttempts).toBe(1);
    expect(result.toolCalls.some((c) => c.tool === "edit")).toBe(true);
  });

  it("다단계 파이프라인: 첫 단계(tsc) 실패 시 다음 단계로 넘어가지 않는다", async () => {
    const { complete } = completeQueue(["작성 완료", "고치지 못했습니다"]);
    const ran: string[] = [];
    const result = await runConversationToolLoop({
      initialReply: fence('{"tool":"write","path":"a.ts","content":"x"}'),
      baseMessages,
      agentMode: "build",
      complete,
      executeTool: async (call: ToolCall) => {
        if (call.tool === "bash") {
          ran.push(String(call.input.command));
          return { status: "completed", output: "a.ts(1,1): error TS2322: nope" };
        }
        return { status: "completed", output: "written" };
      },
      makeToolId,
      diagnosticsCommands: ["tsc --noEmit", "eslint ."],
      maxFixAttempts: 1,
    });
    // tsc가 실패했으니 eslint 단계는 (수정 전엔) 실행되지 않는다
    expect(ran.filter((c) => c.includes("tsc")).length).toBeGreaterThanOrEqual(1);
    expect(ran.some((c) => c.includes("eslint"))).toBe(false);
    expect(result.diagnostics?.stages?.[0]).toMatchObject({ tool: "tsc", ok: false });
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
