import type { AgentMode, ChatPart, CodingToolName, ToolCall } from "./codingChat";
import { parseAssistantReply } from "./codingChat";
import { buildEditApplyScript, normalizeEditInput } from "./editEngine";

/**
 * The coding agent loop: send the conversation to the model, parse tool
 * fences out of the reply, execute each tool (through the injected executor —
 * in the runtime that is the gated dispatch/approve/replay/capture path),
 * feed results back, and repeat until the model answers with plain text or
 * the round cap is hit. Pure orchestration with injected effects, so the
 * whole loop is unit-tested with fakes.
 */

export type WireMessage = { role: "user" | "assistant" | "system"; content: string };

export type ToolExecutionResult = {
  status: "completed" | "failed" | "denied";
  output: string;
};

export type CompleteFn = (
  messages: WireMessage[],
  hooks: { onDelta?: (textSoFar: string) => void },
) => Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number } }>;

export type ToolExecutor = (call: ToolCall) => Promise<ToolExecutionResult>;

export type TurnEvent =
  | { type: "assistant_begin"; round: number }
  | { type: "assistant_delta"; round: number; text: string }
  | { type: "assistant_parts"; round: number; parts: ChatPart[] }
  | { type: "tool_status"; round: number; call: ToolCall }
  | { type: "usage"; usage: { inputTokens?: number; outputTokens?: number } };

/** mutating tools are blocked in plan mode (read-only investigation) */
export const MUTATING_TOOLS: ReadonlySet<CodingToolName> = new Set(["bash", "write", "edit"]);

export function isToolAllowed(tool: CodingToolName, agentMode: AgentMode): boolean {
  return agentMode === "build" || !MUTATING_TOOLS.has(tool);
}

export type RunCodingTurnInput = {
  /** system + history + the new user message, in wire format */
  messages: WireMessage[];
  agentMode: AgentMode;
  complete: CompleteFn;
  executeTool: ToolExecutor;
  onEvent: (event: TurnEvent) => void;
  makeToolId: (round: number, index: number) => string;
  maxToolRounds?: number;
  /** cooperative interrupt — checked between rounds and between tools */
  isCancelled?: () => boolean;
};

export type TurnOutcome = { status: "completed" | "cancelled" | "max_rounds"; rounds: number };

const DEFAULT_MAX_ROUNDS = 8;

export async function runCodingTurn(input: RunCodingTurnInput): Promise<TurnOutcome> {
  const maxRounds = input.maxToolRounds ?? DEFAULT_MAX_ROUNDS;
  const conversation: WireMessage[] = [...input.messages];

  for (let round = 0; round < maxRounds; round += 1) {
    if (input.isCancelled?.()) {
      return { status: "cancelled", rounds: round };
    }
    input.onEvent({ type: "assistant_begin", round });
    const reply = await input.complete(conversation, {
      onDelta: (text) => input.onEvent({ type: "assistant_delta", round, text }),
    });
    if (reply.usage) {
      input.onEvent({ type: "usage", usage: reply.usage });
    }

    const { parts, toolCalls } = parseAssistantReply(reply.content, (index) => input.makeToolId(round, index));
    input.onEvent({ type: "assistant_parts", round, parts });
    conversation.push({ role: "assistant", content: reply.content });

    if (toolCalls.length === 0) {
      return { status: "completed", rounds: round + 1 };
    }

    const results: string[] = [];
    for (const call of toolCalls) {
      if (input.isCancelled?.()) {
        input.onEvent({ type: "tool_status", round, call: { ...call, status: "denied", output: "사용자가 중단했습니다" } });
        return { status: "cancelled", rounds: round + 1 };
      }
      if (!isToolAllowed(call.tool, input.agentMode)) {
        const denied: ToolCall = {
          ...call,
          status: "denied",
          output: "PLAN 모드에서는 변경 도구(bash/write/edit)가 차단됩니다",
        };
        input.onEvent({ type: "tool_status", round, call: denied });
        results.push(`[tool_result ${call.tool} DENIED] PLAN 모드 — 변경 도구 차단`);
        continue;
      }

      input.onEvent({ type: "tool_status", round, call: { ...call, status: "running" } });
      let result: ToolExecutionResult;
      try {
        result = await input.executeTool(call);
      } catch (error) {
        result = { status: "failed", output: error instanceof Error ? error.message : String(error) };
      }
      const settled: ToolCall = {
        ...call,
        status: result.status,
        output: result.output,
        error: result.status === "failed" ? result.output : undefined,
      };
      input.onEvent({ type: "tool_status", round, call: settled });
      const tag = result.status === "completed" ? "" : ` ${result.status.toUpperCase()}`;
      results.push(`[tool_result ${call.tool}${tag}]\n${result.output}`);
    }

    let toolResultPayload = results.join("\n\n");
    // instruction fade-out 대응 (arXiv 2603.05344의 핵심 교훈): 도구 루프가
    // 깊어지면 초기 지시가 희미해진다 — 결정 지점에 가이드를 재주입한다.
    if (round >= 2) {
      const original = input.messages.find((message) => message.role === "user")?.content ?? "";
      toolResultPayload += `\n\n[시스템 리마인더] 원래 요청을 상기하세요: "${original.slice(0, 160)}". 지금까지의 도구 결과로 충분하면 추가 호출 없이 결론을 텍스트로 정리하세요. (도구 라운드 ${round + 1}/${maxRounds})`;
    }
    conversation.push({ role: "user", content: toolResultPayload });
  }

  return { status: "max_rounds", rounds: maxRounds };
}

// ─── tool call → gated shell command ────────────────────────────────────────

/**
 * Map a read-style tool call to the single shell command that implements it.
 * bash runs the command as-is; write uses a quoted heredoc; edit is NOT
 * mapped here (the UI renders the diff and applies it explicitly).
 */
export function toolToCommand(call: ToolCall): string | null {
  const input = call.input;
  switch (call.tool) {
    case "bash":
      return String(input.command ?? "").trim() || null;
    case "read": {
      const path = String(input.path ?? "").trim();
      return path ? `sed -n '1,200p' "${path}"` : null;
    }
    case "grep": {
      const pattern = String(input.pattern ?? "").trim();
      if (!pattern) return null;
      const path = String(input.path ?? ".").trim() || ".";
      return `rg -n --max-count 50 ${JSON.stringify(pattern)} "${path}" || true`;
    }
    case "glob": {
      const pattern = String(input.pattern ?? "").trim();
      return pattern ? `find . -path ${JSON.stringify(`*${pattern}*`)} -not -path '*/node_modules/*' | head -50` : null;
    }
    case "write": {
      const path = String(input.path ?? "").trim();
      const content = String(input.content ?? "");
      if (!path) return null;
      return `cat > "${path}" <<'__ORCH_EOF__'\n${content}\n__ORCH_EOF__`;
    }
    case "edit": {
      // P0-1: search/replace 블록을 4단계 계층 매칭으로 원자적 적용 (전체 덮어쓰기 X)
      const path = String(input.path ?? "").trim();
      const blocks = normalizeEditInput(input);
      return buildEditApplyScript(path, blocks);
    }
    case "todo":
    default:
      return null;
  }
}

/**
 * Build the runtime ToolExecutor over the gated dispatch/capture effects
 * (closedLoopRuntime adapter shape). todo renders locally; edit returns its
 * diff for the card and asks the model to use write for application (the UI
 * also offers a gated 적용 button).
 */
export function createGatedToolExecutor(effects: {
  dispatch: (command: string, context: { stepIndex: number }) => Promise<void> | void;
  capture: () => Promise<string> | string;
}): ToolExecutor {
  let sequence = 0;
  return async (call) => {
    if (call.tool === "todo") {
      const items = Array.isArray(call.input.items) ? call.input.items.map(String) : [];
      return { status: "completed", output: items.map((item) => `□ ${item}`).join("\n") || "(빈 목록)" };
    }
    const command = toolToCommand(call);
    if (!command) {
      // edit인데 명령이 없으면 search/replace 입력이 비었다는 뜻 — 명확히 안내
      if (call.tool === "edit") {
        return {
          status: "failed",
          output: 'edit 입력이 비어 있습니다. {"tool":"edit","path":"...","search":"...","replace":"..."} 형식으로 주세요.',
        };
      }
      return { status: "failed", output: `도구 입력이 비어 있습니다: ${call.tool}` };
    }
    sequence += 1;
    await effects.dispatch(command, { stepIndex: -(500 + sequence) });
    const output = await effects.capture();
    return { status: "completed", output: output || "(출력 없음)" };
  };
}
