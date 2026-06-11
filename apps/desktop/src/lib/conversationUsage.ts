import type { ConversationMessage } from "@ai-orchestrator/protocol";

/**
 * Token/cost accounting for the conversation workbench (items 6 + 12).
 * Usage is summed from assistant message metadata (`metadata.usage`, written
 * by completeWorkbenchAgent), cost is estimated from a static per-model price
 * table, and the 90%-of-context threshold drives auto-compaction.
 */

export type ConversationUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** assistant turns that reported usage */
  turns: number;
  /** inputTokens of the most recent assistant turn — proxies current context size */
  lastInputTokens?: number;
  estimatedCostUsd?: number;
};

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
};

function readUsage(metadata: Record<string, unknown> | undefined): UsageLike | null {
  const usage = metadata?.usage;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const pick = (key: string) => (typeof u[key] === "number" ? (u[key] as number) : undefined);
  const result: UsageLike = {
    inputTokens: pick("inputTokens"),
    outputTokens: pick("outputTokens"),
    cacheReadInputTokens: pick("cacheReadInputTokens"),
    cacheCreationInputTokens: pick("cacheCreationInputTokens"),
  };
  if (result.inputTokens === undefined && result.outputTokens === undefined) return null;
  return result;
}

/** USD per 1M tokens: [input, output]. Unknown models → undefined cost. */
const MODEL_PRICE_TABLE: ReadonlyArray<{ pattern: RegExp; input: number; output: number }> = [
  { pattern: /claude.*opus|opus/i, input: 15, output: 75 },
  { pattern: /claude.*sonnet|sonnet/i, input: 3, output: 15 },
  { pattern: /claude.*haiku|haiku/i, input: 0.8, output: 4 },
  { pattern: /gpt-5.*mini|gpt-4o-mini|o4-mini/i, input: 0.6, output: 2.4 },
  { pattern: /gpt-5|gpt-4o|gpt-4\.1/i, input: 2.5, output: 10 },
  { pattern: /deepseek/i, input: 0.27, output: 1.1 },
];

export function estimateCostUsd(
  modelId: string | undefined,
  usage: { inputTokens: number; outputTokens: number },
): number | undefined {
  if (!modelId) return undefined;
  const entry = MODEL_PRICE_TABLE.find((candidate) => candidate.pattern.test(modelId));
  if (!entry) return undefined;
  return (usage.inputTokens * entry.input + usage.outputTokens * entry.output) / 1_000_000;
}

export function summarizeConversationUsage(
  messages: ReadonlyArray<ConversationMessage>,
  modelId?: string,
): ConversationUsageSummary {
  const summary: ConversationUsageSummary = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    turns: 0,
  };

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const usage = readUsage(message.metadata);
    if (!usage) continue;
    summary.turns += 1;
    summary.inputTokens += usage.inputTokens ?? 0;
    summary.outputTokens += usage.outputTokens ?? 0;
    summary.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
    summary.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
    if (usage.inputTokens !== undefined) summary.lastInputTokens = usage.inputTokens;
  }

  summary.totalTokens = summary.inputTokens + summary.outputTokens;
  summary.estimatedCostUsd = estimateCostUsd(modelId, summary);
  return summary;
}

/** Same fallback the coding workbench uses when the model has no known window. */
export const FALLBACK_CONTEXT_WINDOW = 16_000;
export const AUTO_COMPACT_CONTEXT_PERCENT = 90;

export function contextUsagePercent(lastInputTokens: number | undefined, contextWindow?: number): number {
  if (!lastInputTokens || lastInputTokens <= 0) return 0;
  const window = contextWindow && contextWindow > 0 ? contextWindow : FALLBACK_CONTEXT_WINDOW;
  return Math.min(100, Math.round((lastInputTokens / window) * 100));
}

/**
 * True when the last turn's input tokens crossed 90% of the model's context
 * window. Mirrors the coding workbench's 12000-token absolute fallback so
 * models without a declared window still compact.
 */
export function shouldAutoCompactConversation(input: {
  lastInputTokens?: number;
  contextWindow?: number;
}): boolean {
  if (!input.lastInputTokens) return false;
  if (!input.contextWindow || input.contextWindow <= 0) {
    return input.lastInputTokens >= 12_000;
  }
  // unrounded ratio — contextUsagePercent rounds for display and would fire at 89.5%
  return (input.lastInputTokens / input.contextWindow) * 100 >= AUTO_COMPACT_CONTEXT_PERCENT;
}
