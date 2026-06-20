import { describe, expect, it } from "vitest";
import { useAgentExpression } from "./useAgentExpression";

// Characterization tests for useAgentExpression's priority cascade (no behavior
// change). Despite the "use" prefix it is a pure function — no React hooks — that
// maps an agent's runtime signals to one AgentExpression via an ordered
// decision tree: taskStatus error > taskStatus success > isTyping (thinking) >
// isActive OR taskStatus running (speaking) > positive sentiment (agreeing) >
// negative sentiment (disagreeing) > neutral. The tests pin each rung AND the
// precedence between rungs. Pure, no DOM, no network.

describe("useAgentExpression", () => {
  it("returns error when taskStatus is error, outranking every other signal", () => {
    expect(
      useAgentExpression({
        isActive: true,
        isTyping: true,
        lastMessageSentiment: "positive",
        taskStatus: "error",
      }),
    ).toBe("error");
  });

  it("returns success for taskStatus success, but error still outranks success", () => {
    expect(useAgentExpression({ isActive: true, isTyping: true, taskStatus: "success" })).toBe("success");
  });

  it("returns thinking when typing (success/error absent), outranking active/sentiment", () => {
    expect(
      useAgentExpression({ isActive: true, isTyping: true, lastMessageSentiment: "positive" }),
    ).toBe("thinking");
  });

  it("returns speaking when active or task is running (not typing)", () => {
    expect(useAgentExpression({ isActive: true })).toBe("speaking");
    expect(useAgentExpression({ isActive: false, taskStatus: "running" })).toBe("speaking");
    // typing still outranks a running task
    expect(useAgentExpression({ isActive: false, isTyping: true, taskStatus: "running" })).toBe("thinking");
  });

  it("falls to sentiment only when idle and not typing", () => {
    expect(useAgentExpression({ isActive: false, lastMessageSentiment: "positive" })).toBe("agreeing");
    expect(useAgentExpression({ isActive: false, lastMessageSentiment: "negative" })).toBe("disagreeing");
  });

  it("returns neutral when idle with neutral or no sentiment", () => {
    expect(useAgentExpression({ isActive: false })).toBe("neutral");
    expect(useAgentExpression({ isActive: false, lastMessageSentiment: "neutral" })).toBe("neutral");
    expect(useAgentExpression({ isActive: false, taskStatus: "pending" })).toBe("neutral");
  });
});
