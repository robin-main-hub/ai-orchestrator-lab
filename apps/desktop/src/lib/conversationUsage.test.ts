import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import {
  contextUsagePercent,
  estimateCostUsd,
  shouldAutoCompactConversation,
  summarizeConversationUsage,
} from "./conversationUsage";

function message(role: "user" | "assistant", usage?: Record<string, number>): ConversationMessage {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    sessionId: "session_test",
    role,
    content: "hello",
    createdAt: "2026-06-11T00:00:00.000Z",
    metadata: usage ? { usage } : undefined,
  };
}

describe("summarizeConversationUsage", () => {
  it("sums assistant usage and tracks the last input tokens", () => {
    const summary = summarizeConversationUsage([
      message("user"),
      message("assistant", { inputTokens: 100, outputTokens: 20 }),
      message("user"),
      message("assistant", { inputTokens: 250, outputTokens: 50, cacheReadInputTokens: 80 }),
    ]);
    expect(summary.inputTokens).toBe(350);
    expect(summary.outputTokens).toBe(70);
    expect(summary.totalTokens).toBe(420);
    expect(summary.cacheReadInputTokens).toBe(80);
    expect(summary.turns).toBe(2);
    expect(summary.lastInputTokens).toBe(250);
  });

  it("ignores assistant messages without usage metadata", () => {
    const summary = summarizeConversationUsage([message("assistant"), message("assistant", undefined)]);
    expect(summary.turns).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.lastInputTokens).toBeUndefined();
  });
});

describe("estimateCostUsd", () => {
  it("prices known model families per 1M tokens", () => {
    expect(estimateCostUsd("claude-opus-4-8", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(15);
    expect(estimateCostUsd("claude-haiku-4-5", { inputTokens: 0, outputTokens: 1_000_000 })).toBe(4);
  });

  it("returns undefined for unknown models", () => {
    expect(estimateCostUsd("qwen3-coder", { inputTokens: 1000, outputTokens: 1000 })).toBeUndefined();
    expect(estimateCostUsd(undefined, { inputTokens: 1000, outputTokens: 1000 })).toBeUndefined();
  });
});

describe("contextUsagePercent / shouldAutoCompactConversation", () => {
  it("computes percentage against the model window", () => {
    expect(contextUsagePercent(90_000, 200_000)).toBe(45);
    expect(contextUsagePercent(undefined, 200_000)).toBe(0);
    expect(contextUsagePercent(300_000, 200_000)).toBe(100);
  });

  it("compacts at 90% of the declared window", () => {
    expect(shouldAutoCompactConversation({ lastInputTokens: 179_000, contextWindow: 200_000 })).toBe(false);
    expect(shouldAutoCompactConversation({ lastInputTokens: 180_000, contextWindow: 200_000 })).toBe(true);
  });

  it("falls back to the 12000-token absolute threshold without a window", () => {
    expect(shouldAutoCompactConversation({ lastInputTokens: 11_999 })).toBe(false);
    expect(shouldAutoCompactConversation({ lastInputTokens: 12_000 })).toBe(true);
    expect(shouldAutoCompactConversation({})).toBe(false);
  });
});
