import type { ModelDescriptor } from "@ai-orchestrator/protocol";

/**
 * Workload-based model routing (item 5): plan-mode turns are mostly
 * read/analyze loops, so they route to a low-cost sibling model on the SAME
 * provider; build mode always keeps the user's explicit selection. Routing
 * never crosses providers — credentials and approval flows are per-provider.
 */

const LOW_COST_MODEL_PATTERN = /haiku|mini|small|flash|lite|nano|tiny/i;

export type WorkloadRoutingResult = {
  modelId: string;
  /** "workload" when rerouted by this module; "selection" when the user's pick was kept */
  routedBy: "workload" | "selection";
  reason: string;
};

export function isLowCostModelId(modelId: string): boolean {
  return LOW_COST_MODEL_PATTERN.test(modelId);
}

export function selectModelForWorkload(input: {
  agentMode: "build" | "plan";
  selectedModelId: string;
  /** models of the currently selected provider only */
  catalogForProvider: ReadonlyArray<Pick<ModelDescriptor, "id" | "contextWindow">>;
}): WorkloadRoutingResult {
  const keep: WorkloadRoutingResult = {
    modelId: input.selectedModelId,
    routedBy: "selection",
    reason: input.agentMode === "build" ? "build 모드 — 선택 모델 유지" : "대체 후보 없음 — 선택 모델 유지",
  };

  if (input.agentMode === "build") return keep;
  if (isLowCostModelId(input.selectedModelId)) {
    return { ...keep, reason: "이미 저비용 모델 — 유지" };
  }

  const candidates = input.catalogForProvider.filter((model) => model.id !== input.selectedModelId);
  if (candidates.length === 0) return keep;

  const lowCost = candidates.find((model) => isLowCostModelId(model.id));
  if (lowCost) {
    return {
      modelId: lowCost.id,
      routedBy: "workload",
      reason: `plan 모드 — 저비용 모델(${lowCost.id})로 라우팅`,
    };
  }

  // no name-pattern match: fall back to the smallest context window as a cost proxy,
  // but only when the catalog actually differentiates (otherwise keep the selection)
  const sized = candidates.filter((model) => typeof model.contextWindow === "number");
  if (sized.length === 0) return keep;
  const smallest = sized.reduce((min, model) =>
    (model.contextWindow ?? Infinity) < (min.contextWindow ?? Infinity) ? model : min,
  );
  return {
    modelId: smallest.id,
    routedBy: "workload",
    reason: `plan 모드 — 최소 컨텍스트 모델(${smallest.id})로 라우팅`,
  };
}
