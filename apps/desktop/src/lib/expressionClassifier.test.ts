import { describe, expect, it } from "vitest";
import { classifyExpression } from "./expressionClassifier";
import { EXPRESSION_KEYS, EXPRESSION_TIERS, isExpressionKey } from "./expressionTaxonomy";

describe("classifyExpression — work context", () => {
  it("maps closed-loop outcomes to expressions (highest priority)", () => {
    expect(classifyExpression({ outcome: "completed" })).toBe("pride");
    expect(classifyExpression({ outcome: "failed" })).toBe("sadness");
    expect(classifyExpression({ outcome: "needs_approval" })).toBe("nervousness");
    expect(classifyExpression({ outcome: "progressing" })).toBe("curiosity");
  });

  it("maps run status when no outcome is given", () => {
    expect(classifyExpression({ loopStatus: "completed" })).toBe("pride");
    expect(classifyExpression({ loopStatus: "awaiting_human" })).toBe("nervousness");
    expect(classifyExpression({ running: true })).toBe("curiosity");
  });

  it("outcome wins over text", () => {
    expect(classifyExpression({ outcome: "completed", text: "짜증나" })).toBe("pride");
  });
});

describe("classifyExpression — casual sentiment", () => {
  it("reads casual chat sentiment from the latest message", () => {
    expect(classifyExpression({ text: "ㅋㅋㅋ 웃기네" })).toBe("amusement");
    expect(classifyExpression({ text: "고마워!" })).toBe("gratitude");
    expect(classifyExpression({ text: "사랑해" })).toBe("love");
    expect(classifyExpression({ text: "헐 대박" })).toBe("surprise");
    expect(classifyExpression({ text: "너무 슬퍼 ㅠㅠ" })).toBe("sadness");
    expect(classifyExpression({ text: "짜증나 진짜" })).toBe("annoyance");
    expect(classifyExpression({ text: "이거 어떻게 해?" })).toBe("curiosity");
  });

  it("falls back to neutral", () => {
    expect(classifyExpression({})).toBe("neutral");
    expect(classifyExpression({ text: "오늘 회의는 3시" })).toBe("neutral");
  });
});

describe("taxonomy", () => {
  it("has 28 SillyTavern-compatible keys with tiers fully contained", () => {
    expect(EXPRESSION_KEYS).toHaveLength(28);
    expect(new Set(EXPRESSION_KEYS).size).toBe(28);
    for (const key of [...EXPRESSION_TIERS.essential, ...EXPRESSION_TIERS.recommended]) {
      expect(isExpressionKey(key)).toBe(true);
    }
    expect(EXPRESSION_TIERS.essential).toHaveLength(8);
    expect(EXPRESSION_TIERS.recommended).toHaveLength(8);
  });
});
