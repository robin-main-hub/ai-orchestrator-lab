import { describe, expect, it } from "vitest";
import { isLowCostModelId, selectModelForWorkload } from "./modelWorkloadRouting";

const catalog = [
  { id: "claude-opus-4-8", contextWindow: 200_000 },
  { id: "claude-haiku-4-5", contextWindow: 200_000 },
  { id: "gpt-5", contextWindow: 128_000 },
];

describe("selectModelForWorkload", () => {
  it("keeps the selection in build mode", () => {
    const result = selectModelForWorkload({
      agentMode: "build",
      selectedModelId: "claude-opus-4-8",
      catalogForProvider: catalog,
    });
    expect(result).toMatchObject({ modelId: "claude-opus-4-8", routedBy: "selection" });
  });

  it("routes plan mode to a low-cost sibling on the same provider", () => {
    const result = selectModelForWorkload({
      agentMode: "plan",
      selectedModelId: "claude-opus-4-8",
      catalogForProvider: catalog,
    });
    expect(result).toMatchObject({ modelId: "claude-haiku-4-5", routedBy: "workload" });
  });

  it("keeps an already-low-cost selection in plan mode", () => {
    const result = selectModelForWorkload({
      agentMode: "plan",
      selectedModelId: "claude-haiku-4-5",
      catalogForProvider: catalog,
    });
    expect(result).toMatchObject({ modelId: "claude-haiku-4-5", routedBy: "selection" });
  });

  it("falls back to the smallest context window when no name matches", () => {
    const result = selectModelForWorkload({
      agentMode: "plan",
      selectedModelId: "qwen-max",
      catalogForProvider: [
        { id: "qwen-max", contextWindow: 128_000 },
        { id: "qwen-base", contextWindow: 32_000 },
      ],
    });
    expect(result).toMatchObject({ modelId: "qwen-base", routedBy: "workload" });
  });

  it("keeps the selection when the catalog has no alternative", () => {
    const result = selectModelForWorkload({
      agentMode: "plan",
      selectedModelId: "claude-opus-4-8",
      catalogForProvider: [{ id: "claude-opus-4-8", contextWindow: 200_000 }],
    });
    expect(result).toMatchObject({ modelId: "claude-opus-4-8", routedBy: "selection" });
  });
});

describe("isLowCostModelId", () => {
  it("matches the cost-tier name heuristics", () => {
    expect(isLowCostModelId("claude-haiku-4-5")).toBe(true);
    expect(isLowCostModelId("gpt-4o-mini")).toBe(true);
    expect(isLowCostModelId("gemini-flash")).toBe(true);
    expect(isLowCostModelId("claude-opus-4-8")).toBe(false);
  });
});
