import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import {
  AUTO_COMPACT_CONTEXT_PERCENT,
  contextUsagePercent,
  estimateCostUsd,
  FALLBACK_CONTEXT_WINDOW,
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

// Characterization tests (no behavior change) for the two previously-unasserted tuning
// constants FALLBACK_CONTEXT_WINDOW and AUTO_COMPACT_CONTEXT_PERCENT. The block above
// pins the two functions with hardcoded literals (200_000 / 90% / 12_000) but never the
// named knobs the functions actually read, nor a subtle divergence between them. Pin:
//   - FALLBACK_CONTEXT_WINDOW (16_000) is the window contextUsagePercent substitutes when
//     no model window is known — so a windowless percent equals the explicit-fallback
//     percent (the coupling), and it is DISTINCT from the 12_000 absolute that
//     shouldAutoCompactConversation uses for its own windowless branch (a deliberate
//     mismatch the doc comment calls out);
//   - AUTO_COMPACT_CONTEXT_PERCENT (90) is the exact ratio the *windowed* compaction
//     branch fires at — driving the boundary from the constant itself (window * pct/100)
//     keeps the test self-consistent with the threshold.
describe("FALLBACK_CONTEXT_WINDOW / AUTO_COMPACT_CONTEXT_PERCENT", () => {
  it("FALLBACK_CONTEXT_WINDOW is the documented 16k window contextUsagePercent substitutes", () => {
    expect(FALLBACK_CONTEXT_WINDOW).toBe(16_000);
    // no window -> the constant is used: half the fallback reads as 50%
    expect(contextUsagePercent(FALLBACK_CONTEXT_WINDOW / 2, undefined)).toBe(50);
    // coupling: windowless == passing the fallback explicitly
    expect(contextUsagePercent(4_000, undefined)).toBe(contextUsagePercent(4_000, FALLBACK_CONTEXT_WINDOW));
  });

  it("does NOT drive shouldAutoCompact's windowless branch (which uses a distinct 12k absolute)", () => {
    expect(FALLBACK_CONTEXT_WINDOW).not.toBe(12_000);
    // a value over the 12k absolute but well under the 16k fallback still compacts,
    // proving the windowless compaction threshold is the 12k absolute, not 90% of 16k
    expect(shouldAutoCompactConversation({ lastInputTokens: 12_500 })).toBe(true);
    expect((FALLBACK_CONTEXT_WINDOW * AUTO_COMPACT_CONTEXT_PERCENT) / 100).toBeGreaterThan(12_500);
  });

  it("AUTO_COMPACT_CONTEXT_PERCENT is the exact ratio the windowed branch fires at", () => {
    expect(AUTO_COMPACT_CONTEXT_PERCENT).toBe(90);
    const window = 200_000;
    const atThreshold = (window * AUTO_COMPACT_CONTEXT_PERCENT) / 100;
    expect(shouldAutoCompactConversation({ lastInputTokens: atThreshold, contextWindow: window })).toBe(true);
    expect(shouldAutoCompactConversation({ lastInputTokens: atThreshold - 1, contextWindow: window })).toBe(false);
  });
});
