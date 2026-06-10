import { describe, expect, it, vi } from "vitest";
import type { ToolCall } from "./codingChat";
import {
  createGatedToolExecutor,
  isToolAllowed,
  runCodingTurn,
  toolToCommand,
  type TurnEvent,
  type WireMessage,
} from "./codingTurnRunner";

const system: WireMessage = { role: "system", content: "sys" };
const user: WireMessage = { role: "user", content: "pnpm test 돌려줘" };

const toolReply = '실행할게요.\n```tool\n{"tool":"bash","command":"pnpm test"}\n```';
const finalReply = "테스트 1개 통과했습니다. 끝.";

describe("runCodingTurn", () => {
  it("round-trips tool results back to the model and finishes on a plain reply", async () => {
    const completions = [toolReply, finalReply];
    const seenPayloads: WireMessage[][] = [];
    const complete = vi.fn(async (messages: WireMessage[]) => {
      seenPayloads.push(messages.map((m) => ({ ...m })));
      return { content: completions.shift()!, usage: { inputTokens: 10, outputTokens: 5 } };
    });
    const executeTool = vi.fn(async () => ({ status: "completed" as const, output: "1 passed" }));
    const events: TurnEvent[] = [];

    const outcome = await runCodingTurn({
      messages: [system, user],
      agentMode: "build",
      complete,
      executeTool,
      onEvent: (event) => events.push(event),
      makeToolId: (round, index) => `r${round}t${index}`,
    });

    expect(outcome).toEqual({ status: "completed", rounds: 2 });
    expect(executeTool).toHaveBeenCalledOnce();
    // second round payload carries the assistant reply + the tool result
    const second = seenPayloads[1]!;
    expect(second.some((m) => m.role === "assistant" && m.content.includes("pnpm test"))).toBe(true);
    expect(second[second.length - 1]!.content).toContain("[tool_result bash]\n1 passed");
    // events: running then completed status for the tool
    const statuses = events.filter((e): e is Extract<TurnEvent, { type: "tool_status" }> => e.type === "tool_status");
    expect(statuses.map((e) => e.call.status)).toEqual(["running", "completed"]);
    expect(events.filter((e) => e.type === "usage")).toHaveLength(2);
  });

  it("PLAN mode denies mutating tools without executing them", async () => {
    const completions = [toolReply, finalReply];
    const complete = vi.fn(async () => ({ content: completions.shift()! }));
    const executeTool = vi.fn();
    const events: TurnEvent[] = [];

    await runCodingTurn({
      messages: [system, user],
      agentMode: "plan",
      complete,
      executeTool,
      onEvent: (event) => events.push(event),
      makeToolId: (round, index) => `r${round}t${index}`,
    });

    expect(executeTool).not.toHaveBeenCalled();
    const denied = events.find((e) => e.type === "tool_status");
    expect(denied && denied.type === "tool_status" && denied.call.status).toBe("denied");
  });

  it("stops at the round cap when the model keeps calling tools", async () => {
    const complete = vi.fn(async () => ({ content: toolReply }));
    const executeTool = vi.fn(async () => ({ status: "completed" as const, output: "ok" }));
    const outcome = await runCodingTurn({
      messages: [system, user],
      agentMode: "build",
      complete,
      executeTool,
      onEvent: () => {},
      makeToolId: (round, index) => `r${round}t${index}`,
      maxToolRounds: 3,
    });
    expect(outcome).toEqual({ status: "max_rounds", rounds: 3 });
    expect(executeTool).toHaveBeenCalledTimes(3);
  });

  it("deep tool loops re-inject the original request (instruction fade-out guard)", async () => {
    const seenPayloads: WireMessage[][] = [];
    const complete = vi.fn(async (messages: WireMessage[]) => {
      seenPayloads.push(messages.map((m) => ({ ...m })));
      return { content: toolReply };
    });
    const executeTool = vi.fn(async () => ({ status: "completed" as const, output: "ok" }));
    await runCodingTurn({
      messages: [system, user],
      agentMode: "build",
      complete,
      executeTool,
      onEvent: () => {},
      makeToolId: (round, index) => `r${round}t${index}`,
      maxToolRounds: 4,
    });
    // 첫 두 라운드 결과엔 리마인더 없음, 3라운드째(round>=2)부터 원래 요청 재주입
    const lastOf = (payload: WireMessage[]) => payload[payload.length - 1]!.content;
    expect(lastOf(seenPayloads[2]!)).not.toContain("[시스템 리마인더]");
    expect(lastOf(seenPayloads[3]!)).toContain("[시스템 리마인더]");
    expect(lastOf(seenPayloads[3]!)).toContain("pnpm test 돌려줘");
  });

  it("cooperative cancel stops between rounds", async () => {
    let cancelled = false;
    const complete = vi.fn(async () => {
      cancelled = true; // cancel right after the first completion
      return { content: toolReply };
    });
    const executeTool = vi.fn(async () => ({ status: "completed" as const, output: "ok" }));
    const outcome = await runCodingTurn({
      messages: [system, user],
      agentMode: "build",
      complete,
      executeTool,
      onEvent: () => {},
      makeToolId: (round, index) => `r${round}t${index}`,
      isCancelled: () => cancelled,
    });
    expect(outcome.status).toBe("cancelled");
  });

  it("a throwing executor records a failed tool and the model still hears about it", async () => {
    const completions = [toolReply, finalReply];
    const seenPayloads: WireMessage[][] = [];
    const complete = vi.fn(async (messages: WireMessage[]) => {
      seenPayloads.push(messages.map((m) => ({ ...m })));
      return { content: completions.shift()! };
    });
    const executeTool = vi.fn(async () => {
      throw new Error("approval rejected");
    });
    const events: TurnEvent[] = [];
    await runCodingTurn({
      messages: [system, user],
      agentMode: "build",
      complete,
      executeTool,
      onEvent: (event) => events.push(event),
      makeToolId: (round, index) => `r${round}t${index}`,
    });
    const failed = events.filter((e) => e.type === "tool_status").map((e) => e.type === "tool_status" && e.call.status);
    expect(failed).toContain("failed");
    expect(seenPayloads[1]![seenPayloads[1]!.length - 1]!.content).toContain("FAILED");
  });
});

describe("toolToCommand", () => {
  const call = (tool: ToolCall["tool"], input: Record<string, unknown>): ToolCall => ({
    id: "t0",
    tool,
    title: "t",
    input,
    status: "proposed",
  });

  it("maps read/grep/glob/write to gated shell commands", () => {
    expect(toolToCommand(call("bash", { command: "pnpm test" }))).toBe("pnpm test");
    expect(toolToCommand(call("read", { path: "src/a.ts" }))).toContain('sed -n');
    expect(toolToCommand(call("grep", { pattern: "TODO", path: "src" }))).toContain("rg -n");
    expect(toolToCommand(call("glob", { pattern: "*.test.ts" }))).toContain("find .");
    const write = toolToCommand(call("write", { path: "a.txt", content: "hello\nworld" }))!;
    expect(write).toContain('cat > "a.txt"');
    expect(write).toContain("__ORCH_EOF__");
    expect(toolToCommand(call("edit", { path: "a", diff: "x" }))).toBeNull();
  });
});

describe("createGatedToolExecutor", () => {
  it("dispatches through the gate then captures output; todo/edit stay local", async () => {
    const dispatched: string[] = [];
    const effects = {
      dispatch: vi.fn(async (command: string) => void dispatched.push(command)),
      capture: vi.fn(async () => "captured output"),
    };
    const execute = createGatedToolExecutor(effects);

    const bash = await execute({ id: "t0", tool: "bash", title: "", input: { command: "ls" }, status: "running" });
    expect(bash).toEqual({ status: "completed", output: "captured output" });
    expect(dispatched).toEqual(["ls"]);

    const todo = await execute({ id: "t1", tool: "todo", title: "", input: { items: ["a", "b"] }, status: "running" });
    expect(todo.output).toBe("□ a\n□ b");
    const edit = await execute({ id: "t2", tool: "edit", title: "", input: { path: "x", diff: "d" }, status: "running" });
    expect(edit.status).toBe("completed");
    expect(effects.dispatch).toHaveBeenCalledTimes(1); // only bash hit the gate
  });
});

describe("isToolAllowed", () => {
  it("plan mode allows only read-style tools", () => {
    expect(isToolAllowed("read", "plan")).toBe(true);
    expect(isToolAllowed("grep", "plan")).toBe(true);
    expect(isToolAllowed("glob", "plan")).toBe(true);
    expect(isToolAllowed("todo", "plan")).toBe(true);
    expect(isToolAllowed("bash", "plan")).toBe(false);
    expect(isToolAllowed("write", "plan")).toBe(false);
    expect(isToolAllowed("edit", "plan")).toBe(false);
    expect(isToolAllowed("bash", "build")).toBe(true);
  });
});
