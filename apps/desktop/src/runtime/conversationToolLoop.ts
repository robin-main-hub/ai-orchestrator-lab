import type { AgentMode, ChatPart, ToolCall } from "../lib/codingChat";
import { parseAssistantReply } from "../lib/codingChat";
import { isToolAllowed, MUTATING_TOOLS } from "../lib/codingTurnRunner";
import type { CompleteFn, ToolExecutionResult, ToolExecutor, WireMessage } from "../lib/codingTurnRunner";

/**
 * In-conversation tool loop (items 2 + 13). The conversation workbench has
 * already produced the FIRST assistant reply (streamed, persona-flavored);
 * when that reply contains ```tool fences this loop takes over: execute the
 * calls through the gated executor, feed results back as a user turn, and
 * re-complete until the model answers with plain text or the round cap hits.
 *
 * After a successful mutating tool (bash/write/edit), an optional
 * diagnostics round runs `diagnosticsCommand` (e.g. tsc --noEmit) through
 * the SAME gate; when diagnostics report errors the output is fed back to
 * the model for one corrective round (item 13).
 */

export type ConversationToolLoopEvent =
  | { type: "round_begin"; round: number }
  | { type: "assistant_delta"; round: number; text: string }
  | { type: "tool_status"; round: number; call: ToolCall }
  | { type: "usage"; usage: { inputTokens?: number; outputTokens?: number } }
  | { type: "diagnostics"; call: ToolCall; ok: boolean };

export type ConversationToolLoopInput = {
  /** the already-received first assistant reply (may contain tool fences) */
  initialReply: string;
  /** the wire messages that produced initialReply (system + history + user) */
  baseMessages: WireMessage[];
  agentMode: AgentMode;
  complete: CompleteFn;
  executeTool: ToolExecutor;
  makeToolId: (round: number, index: number) => string;
  onEvent?: (event: ConversationToolLoopEvent) => void;
  isCancelled?: () => boolean;
  maxRounds?: number;
  /** e.g. "pnpm exec tsc --noEmit" — run after mutating tools succeed */
  diagnosticsCommand?: string;
};

export type ConversationToolLoopResult = {
  status: "completed" | "cancelled" | "max_rounds";
  /** plain text of the last assistant reply (tool fences stripped) */
  finalContent: string;
  /** every tool call across all rounds, in execution order, with final status */
  toolCalls: ToolCall[];
  rounds: number;
  diagnostics?: { command: string; output: string; ok: boolean };
};

const DEFAULT_MAX_ROUNDS = 8;

export function partsToText(parts: ChatPart[]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

/** true when the reply contains at least one parseable tool fence */
export function replyRequestsTools(reply: string): boolean {
  return parseAssistantReply(reply, (index) => `probe_${index}`).toolCalls.length > 0;
}

export async function runConversationToolLoop(
  input: ConversationToolLoopInput,
): Promise<ConversationToolLoopResult> {
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const onEvent = input.onEvent ?? (() => {});
  const conversation: WireMessage[] = [...input.baseMessages];
  const allToolCalls: ToolCall[] = [];
  let finalContent = "";
  let mutatingToolSucceeded = false;
  let reply = input.initialReply;
  let rounds = 0;

  const finish = (
    status: ConversationToolLoopResult["status"],
  ): ConversationToolLoopResult => ({
    status,
    finalContent,
    toolCalls: allToolCalls,
    rounds,
    diagnostics: undefined,
  });

  for (let round = 0; round < maxRounds; round += 1) {
    rounds = round + 1;
    const { parts, toolCalls } = parseAssistantReply(reply, (index) => input.makeToolId(round, index));
    finalContent = partsToText(parts) || finalContent;
    conversation.push({ role: "assistant", content: reply });

    if (toolCalls.length === 0) break;

    const results: string[] = [];
    for (const call of toolCalls) {
      if (input.isCancelled?.()) {
        onEvent({ type: "tool_status", round, call: { ...call, status: "denied", output: "사용자가 중단했습니다" } });
        return finish("cancelled");
      }
      let settled: ToolCall;
      if (!isToolAllowed(call.tool, input.agentMode)) {
        settled = { ...call, status: "denied", output: "PLAN 모드에서는 변경 도구(bash/write/edit)가 차단됩니다" };
        results.push(`[tool_result ${call.tool} DENIED] PLAN 모드 — 변경 도구 차단`);
      } else {
        onEvent({ type: "tool_status", round, call: { ...call, status: "running" } });
        let result: ToolExecutionResult;
        try {
          result = await input.executeTool(call);
        } catch (error) {
          result = { status: "failed", output: error instanceof Error ? error.message : String(error) };
        }
        settled = {
          ...call,
          status: result.status,
          output: result.output,
          error: result.status === "failed" ? result.output : undefined,
        };
        if (result.status === "completed" && MUTATING_TOOLS.has(call.tool)) {
          mutatingToolSucceeded = true;
        }
        const tag = result.status === "completed" ? "" : ` ${result.status.toUpperCase()}`;
        results.push(`[tool_result ${call.tool}${tag}]\n${result.output}`);
      }
      onEvent({ type: "tool_status", round, call: settled });
      allToolCalls.push(settled);
    }

    if (input.isCancelled?.()) return finish("cancelled");
    if (round === maxRounds - 1) {
      return finish("max_rounds");
    }

    let payload = results.join("\n\n");
    if (round >= 2) {
      const original = [...input.baseMessages].reverse().find((m) => m.role === "user")?.content ?? "";
      payload += `\n\n[시스템 리마인더] 원래 요청: "${original.slice(0, 160)}". 도구 결과가 충분하면 추가 호출 없이 결론을 텍스트로 정리하세요. (라운드 ${round + 1}/${maxRounds})`;
    }
    conversation.push({ role: "user", content: payload });

    onEvent({ type: "round_begin", round: round + 1 });
    const next = await input.complete([...conversation], {
      onDelta: (text) => onEvent({ type: "assistant_delta", round: round + 1, text }),
    });
    if (next.usage) onEvent({ type: "usage", usage: next.usage });
    reply = next.content;
  }

  const base = finish("completed");

  // ── diagnostics round (item 13) ──────────────────────────────────────────
  if (!mutatingToolSucceeded || !input.diagnosticsCommand || input.isCancelled?.()) {
    return base;
  }
  const diagCall: ToolCall = {
    id: input.makeToolId(maxRounds, 0),
    tool: "bash",
    title: `진단: ${input.diagnosticsCommand}`,
    input: { command: input.diagnosticsCommand },
    status: "proposed",
  };
  let diagResult: ToolExecutionResult;
  try {
    diagResult = await input.executeTool(diagCall);
  } catch (error) {
    diagResult = { status: "failed", output: error instanceof Error ? error.message : String(error) };
  }
  const ok = diagResult.status === "completed" && !/\berror(\b|s\b| TS\d+)/i.test(diagResult.output);
  const settledDiag: ToolCall = { ...diagCall, status: diagResult.status, output: diagResult.output };
  onEvent({ type: "diagnostics", call: settledDiag, ok });
  allToolCalls.push(settledDiag);
  const diagnostics = { command: input.diagnosticsCommand, output: diagResult.output, ok };

  if (ok || input.isCancelled?.()) {
    return { ...base, diagnostics };
  }

  // one corrective round: surface the diagnostics to the model
  conversation.push({
    role: "user",
    content: `[diagnostics ${input.diagnosticsCommand}]\n${diagResult.output.slice(0, 4000)}\n\n위 진단 출력에 오류가 있습니다. 수정 방안을 텍스트로 요약하세요 (추가 도구 호출 없이).`,
  });
  try {
    const corrective = await input.complete([...conversation], {
      onDelta: (text) => onEvent({ type: "assistant_delta", round: maxRounds, text }),
    });
    if (corrective.usage) onEvent({ type: "usage", usage: corrective.usage });
    const { parts } = parseAssistantReply(corrective.content, (index) => input.makeToolId(maxRounds + 1, index));
    const correctiveText = partsToText(parts);
    return {
      ...base,
      finalContent: correctiveText ? `${base.finalContent}\n\n${correctiveText}`.trim() : base.finalContent,
      rounds: rounds + 1,
      diagnostics,
    };
  } catch {
    return { ...base, diagnostics };
  }
}
