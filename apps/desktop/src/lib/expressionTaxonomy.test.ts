import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPRESSION,
  EXPRESSION_KEYS,
  EXPRESSION_LABEL_KO,
  EXPRESSION_TIERS,
  isExpressionKey,
  WORK_STATE_EXPRESSION,
} from "./expressionTaxonomy";

// Characterization tests for the persona expression taxonomy (no behavior
// change). The module is parallel tables (keys, Korean labels, prep tiers,
// work-state→expression map) plus an isExpressionKey guard. These pin the
// guard's membership semantics and the cross-table consistency invariants that
// keep the labels, tiers and work-state map aligned with the 28-key set. All
// pure.
describe("isExpressionKey", () => {
  it("accepts a declared key and rejects anything else", () => {
    expect(isExpressionKey("neutral")).toBe(true);
    expect(isExpressionKey("pride")).toBe(true);
    expect(isExpressionKey("remorse")).toBe(true);
    expect(isExpressionKey("happy")).toBe(false);
    expect(isExpressionKey("")).toBe(false);
    expect(isExpressionKey("Neutral")).toBe(false); // case-sensitive
  });
});

describe("expression taxonomy consistency", () => {
  it("declares 28 unique expression keys", () => {
    expect(EXPRESSION_KEYS).toHaveLength(28);
    expect(new Set(EXPRESSION_KEYS).size).toBe(28);
  });

  it("provides a Korean label for every key and no extras", () => {
    const labelKeys = Object.keys(EXPRESSION_LABEL_KO);
    expect(labelKeys).toHaveLength(EXPRESSION_KEYS.length);
    for (const key of EXPRESSION_KEYS) {
      expect(EXPRESSION_LABEL_KO[key]).toBeTruthy();
    }
    expect(new Set(labelKeys)).toEqual(new Set(EXPRESSION_KEYS));
  });

  it("keeps the default expression a valid key (neutral)", () => {
    expect(DEFAULT_EXPRESSION).toBe("neutral");
    expect(isExpressionKey(DEFAULT_EXPRESSION)).toBe(true);
  });

  it("maps every work state to a valid expression key", () => {
    for (const expression of Object.values(WORK_STATE_EXPRESSION)) {
      expect(isExpressionKey(expression)).toBe(true);
    }
    expect(WORK_STATE_EXPRESSION.completed).toBe("pride");
    expect(WORK_STATE_EXPRESSION.failed).toBe("sadness");
    expect(WORK_STATE_EXPRESSION.needs_approval).toBe(WORK_STATE_EXPRESSION.blocked);
  });

  it("layers the prep tiers as disjoint subsets growing into the full set", () => {
    const { essential, recommended, full } = EXPRESSION_TIERS;
    expect(essential).toHaveLength(8);
    expect(recommended).toHaveLength(8);
    expect(full).toBe(EXPRESSION_KEYS);
    // essential and recommended share no keys
    expect(essential.filter((key) => recommended.includes(key))).toEqual([]);
    // both tiers are drawn from the full key set
    for (const key of [...essential, ...recommended]) {
      expect(isExpressionKey(key)).toBe(true);
    }
  });
});
