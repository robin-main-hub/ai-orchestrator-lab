import { z } from "zod";

export const memoryEvalCaseSchema = z.object({
  id: z.string(),
  query: z.string(),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  expectedRecordIds: z.array(z.string()).default([]),
  forbiddenRecordIds: z.array(z.string()).default([]),
  topK: z.number().int().positive().default(5),
  severity: z.enum(["info", "warning", "critical"]).default("critical"),
});
export type MemoryEvalCase = z.infer<typeof memoryEvalCaseSchema>;

export const memoryEvalMetricSummarySchema = z.object({
  totalCases: z.number(),
  passedCases: z.number(),
  failedCases: z.number(),
  recallAtK: z.number(),
  forbiddenHitRate: z.number(),
  staleHitRate: z.number(),
  contradictionHitRate: z.number(),
  warnings: z.array(z.string()).default([]),
});
export type MemoryEvalMetricSummary = z.infer<typeof memoryEvalMetricSummarySchema>;

export type RecallResultSubset = {
  record: {
    id: string;
    activationState?: string;
    trustLevel?: string;
    tombstonedAt?: string | null;
    tags?: string[];
  };
  score: number;
};

export function evaluateMemoryRecall(
  cases: MemoryEvalCase[],
  recallResultsByCase: Record<string, RecallResultSubset[]>,
): MemoryEvalMetricSummary {
  let passedCases = 0;
  let failedCases = 0;
  let totalRecallSum = 0;
  let forbiddenHits = 0;
  let staleHits = 0;
  let contradictionHits = 0;
  const warnings: string[] = [];

  for (const evalCase of cases) {
    const results = recallResultsByCase[evalCase.id] ?? [];
    // Sort by score descending and limit to topK
    const topKResults = [...results]
      .sort((a, b) => b.score - a.score)
      .slice(0, evalCase.topK);

    const recalledIds = topKResults.map((r) => r.record.id);

    // Check forbidden hit (hard fail)
    const forbiddenHit = evalCase.forbiddenRecordIds.some((id) =>
      recalledIds.includes(id)
    );
    if (forbiddenHit) {
      forbiddenHits++;
    }

    // Check expected recall
    let caseRecall = 0;
    if (evalCase.expectedRecordIds.length > 0) {
      const foundCount = evalCase.expectedRecordIds.filter((id) =>
        recalledIds.includes(id)
      ).length;
      caseRecall = foundCount / evalCase.expectedRecordIds.length;
    } else {
      // If no expected IDs, recall is 1.0 if we didn't fail on other criteria
      caseRecall = 1.0;
    }
    totalRecallSum += caseRecall;

    // Check stale hit (tombstoned, quarantined, superseded tags)
    const hasStale = topKResults.some(
      (r) =>
        r.record.tombstonedAt ||
        r.record.activationState === "quarantined" ||
        r.record.tags?.includes("stale") ||
        r.record.tags?.includes("superseded")
    );
    if (hasStale) {
      staleHits++;
    }

    // Check contradiction hit (e.g. expected retrieved, but also forbidden retrieved,
    // or tags containing contradiction/conflict)
    const hasContradiction =
      (forbiddenHit && caseRecall > 0) ||
      topKResults.some((r) => r.record.tags?.includes("contradiction") || r.record.tags?.includes("conflict"));
    if (hasContradiction) {
      contradictionHits++;
    }

    // Check pass/fail logic
    let passed = true;
    if (forbiddenHit) {
      passed = false;
      if (evalCase.severity === "critical") {
        warnings.push(`Case ${evalCase.id}: Hard fail due to forbidden record hit.`);
      }
    } else if (evalCase.expectedRecordIds.length > 0 && topKResults.length === 0) {
      passed = false;
      warnings.push(`Case ${evalCase.id}: Failed because recall result is empty for answerable case.`);
    } else if (evalCase.expectedRecordIds.length > 0 && caseRecall < 1.0) {
      // We require all expectedRecordIds to be recalled for a strict pass
      passed = false;
      warnings.push(`Case ${evalCase.id}: Partial recall (${Math.round(caseRecall * 100)}%).`);
    }

    if (passed) {
      passedCases++;
    } else {
      failedCases++;
    }
  }

  const totalCases = cases.length;
  return {
    totalCases,
    passedCases,
    failedCases,
    recallAtK: totalCases > 0 ? totalRecallSum / totalCases : 0,
    forbiddenHitRate: totalCases > 0 ? forbiddenHits / totalCases : 0,
    staleHitRate: totalCases > 0 ? staleHits / totalCases : 0,
    contradictionHitRate: totalCases > 0 ? contradictionHits / totalCases : 0,
    warnings,
  };
}
