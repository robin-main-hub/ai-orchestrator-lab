import type { InsightCategory, ReviewMode } from "@ai-orchestrator/protocol";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";

export function reviewModeLabel(mode: ReviewMode) {
  const labels: Record<ReviewMode, string> = {
    deep: "Deep",
    quick: "Quick",
  };

  return labels[mode];
}

export function insightCategoryLabel(category: InsightCategory) {
  const labels: Record<InsightCategory, string> = {
    architecture: "Architecture",
    performance: "Performance",
    security: "Security",
    stability: "Stability",
    tech_debt: "Tech Debt",
    testing: "Testing",
  };

  return labels[category];
}

export function statusTone(status: RuntimeSnapshot["status"]) {
  if (status === "online") {
    return "ok";
  }
  if (status === "offline") {
    return "danger";
  }
  return "warn";
}

export function guardStepLabel(step: Stage8IngressSnapshot["result"]["guardSteps"][number]["name"]) {
  const labels: Record<Stage8IngressSnapshot["result"]["guardSteps"][number]["name"], string> = {
    shape_unification: "Shape",
    noise_filter: "Noise",
    self_response_prevention: "Self-loop",
    debounce: "Debounce",
    pii_secret_block: "PII/Secret",
    guard_logging: "Logging",
    checklist_injection: "Checklist",
  };

  return labels[step];
}
