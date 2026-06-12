import type { AgentMode, ChatPart, ToolCall } from "../lib/codingChat";
import { parseAssistantReply } from "../lib/codingChat";
import { isToolAllowed, MUTATING_TOOLS } from "../lib/codingTurnRunner";
import type { CompleteFn, ToolExecutionResult, ToolExecutor, WireMessage } from "../lib/codingTurnRunner";
import { formatDiagnosticsForModel, parseDiagnostics } from "../lib/diagnosticsParser";

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
  /** e.g. "pnpm exec tsc --noEmit" — run after mutating tools succeed (단일, 하위호환) */
  diagnosticsCommand?: string;
  /** P1-4: 다단계 검증 파이프라인 (예: tsc → eslint → test). 순차 실행, 첫 실패에서 중단. */
  diagnosticsCommands?: string[];
  /** P1-4: 진단 실패 시 모델이 실제로 고치도록 도구 호출을 허용하는 자기수정 횟수 (기본 2) */
  maxFixAttempts?: number;
};

export type ConversationToolLoopResult = {
  status: "completed" | "cancelled" | "max_rounds";
  /** plain text of the last assistant reply (tool fences stripped) */
  finalContent: string;
  /** every tool call across all rounds, in execution order, with final status */
  toolCalls: ToolCall[];
  rounds: number;
  diagnostics?: {
    command: string;
    output: string;
    ok: boolean;
    /** P1-4: 각 단계 결과 (다단계 파이프라인일 때) */
    stages?: Array<{ command: string; ok: boolean; tool: string; errorCount: number }>;
    /** P1-4: 자기수정 시도 횟수 */
    fixAttempts?: number;
  };
};

const DEFAULT_MAX_ROUNDS = 8;
const DEFAULT_MAX_FIX_ATTEMPTS = 2;

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

  // ── diagnostics + self-correction (P1-4) ──────────────────────────────────
  const diagnosticsCommands =
    input.diagnosticsCommands && input.diagnosticsCommands.length > 0
      ? input.diagnosticsCommands
      : input.diagnosticsCommand
        ? [input.diagnosticsCommand]
        : [];
  if (!mutatingToolSucceeded || diagnosticsCommands.length === 0 || input.isCancelled?.()) {
    return base;
  }

  const maxFixAttempts = input.maxFixAttempts ?? DEFAULT_MAX_FIX_ATTEMPTS;
  let diagRoundId = maxRounds;
  let correctedContent = base.finalContent;
  let lastStages: Array<{ command: string; ok: boolean; tool: string; errorCount: number }> = [];
  let firstFailOutput = "";
  let firstFailCommand = "";

  // 단계별 파이프라인을 1회 돌려, 첫 실패 단계의 구조화 에러를 반환한다.
  const runPipelineOnce = async (): Promise<{ ok: boolean; feedback: string }> => {
    lastStages = [];
    firstFailOutput = "";
    firstFailCommand = "";
    for (const command of diagnosticsCommands) {
      if (input.isCancelled?.()) return { ok: false, feedback: "" };
      const call: ToolCall = {
        id: input.makeToolId(diagRoundId, 0),
        tool: "bash",
        title: `진단: ${command}`,
        input: { command },
        status: "proposed",
      };
      diagRoundId += 1;
      let result: ToolExecutionResult;
      try {
        result = await input.executeTool(call);
      } catch (error) {
        result = { status: "failed", output: error instanceof Error ? error.message : String(error) };
      }
      const report = parseDiagnostics(command, result.output, { toolStatus: result.status });
      lastStages.push({ command, ok: report.ok, tool: report.tool, errorCount: report.errorCount });
      const settled: ToolCall = { ...call, status: result.status, output: result.output };
      onEvent({ type: "diagnostics", call: settled, ok: report.ok });
      allToolCalls.push(settled);
      if (!report.ok) {
        firstFailOutput = result.output;
        firstFailCommand = command;
        return { ok: false, feedback: formatDiagnosticsForModel(report) };
      }
    }
    return { ok: true, feedback: "" };
  };

  let attempt = 0;
  let pipeline = await runPipelineOnce();

  // 실패 시: 구조화 에러를 모델에 주고 실제 수정(edit/write)을 시도 → 재진단. 최대 N회.
  while (!pipeline.ok && attempt < maxFixAttempts && !input.isCancelled?.()) {
    attempt += 1;
    conversation.push({
      role: "user",
      content: [
        `[검증 실패 — 자기수정 ${attempt}/${maxFixAttempts}]`,
        pipeline.feedback,
        "",
        "위 오류를 edit/write 도구로 직접 고치세요. 수정이 끝나면 도구 호출 없이 한 줄로 정리하세요.",
      ].join("\n"),
    });
    let fix: { content: string; usage?: { inputTokens?: number; outputTokens?: number } };
    try {
      fix = await input.complete([...conversation], {
        onDelta: (text) => onEvent({ type: "assistant_delta", round: diagRoundId, text }),
      });
    } catch {
      break;
    }
    if (fix.usage) onEvent({ type: "usage", usage: fix.usage });
    const { parts, toolCalls: fixCalls } = parseAssistantReply(fix.content, (i) => input.makeToolId(diagRoundId, i));
    conversation.push({ role: "assistant", content: fix.content });
    const fixText = partsToText(parts);
    if (fixText) correctedContent = `${correctedContent}\n\n${fixText}`.trim();

    // 모델이 제안한 수정 도구를 게이트로 실행 (plan 모드면 차단)
    let appliedFix = false;
    const results: string[] = [];
    for (const call of fixCalls) {
      if (input.isCancelled?.()) break;
      if (!isToolAllowed(call.tool, input.agentMode)) {
        results.push(`[tool_result ${call.tool} DENIED] PLAN 모드 — 변경 도구 차단`);
        continue;
      }
      onEvent({ type: "tool_status", round: diagRoundId, call: { ...call, status: "running" } });
      let r: ToolExecutionResult;
      try {
        r = await input.executeTool(call);
      } catch (error) {
        r = { status: "failed", output: error instanceof Error ? error.message : String(error) };
      }
      const settled: ToolCall = { ...call, status: r.status, output: r.output, error: r.status === "failed" ? r.output : undefined };
      onEvent({ type: "tool_status", round: diagRoundId, call: settled });
      allToolCalls.push(settled);
      if (r.status === "completed" && MUTATING_TOOLS.has(call.tool)) appliedFix = true;
      results.push(`[tool_result ${call.tool}]\n${r.output}`);
    }
    if (results.length > 0) conversation.push({ role: "user", content: results.join("\n\n") });
    diagRoundId += 1;

    if (!appliedFix) break; // 모델이 수정 도구를 안 냈으면 더 돌려도 의미 없음
    pipeline = await runPipelineOnce();
  }

  return {
    ...base,
    finalContent: correctedContent,
    rounds: diagRoundId - maxRounds + rounds,
    diagnostics: {
      command: firstFailCommand || diagnosticsCommands[diagnosticsCommands.length - 1]!,
      output: firstFailOutput,
      ok: pipeline.ok,
      stages: lastStages,
      fixAttempts: attempt,
    },
  };
}
