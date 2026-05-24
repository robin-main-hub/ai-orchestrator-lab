import type { InsightCategory, ReviewMode } from "@ai-orchestrator/protocol";

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
