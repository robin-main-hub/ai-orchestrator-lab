import { DistilledLearningCandidate, MemoryInput } from "@ai-orchestrator/protocol";
import { MemoryAdapterContext, MemoryAdapter } from "@ai-orchestrator/simplememo";

/**
 * Maps a DistilledLearningCandidate to a MemoryInput payload.
 */
export function candidateToMemoryInput(candidate: DistilledLearningCandidate): MemoryInput {
  return {
    title: candidate.title,
    content: `Lesson: ${candidate.lesson}`,
    layer: "reflection",
    scope: "global",
    kind: "learning",
    // distilled candidates are always born "suggested" (never auto-trusted)
    trustLevel: candidate.trustStatus === "suggested" ? "untrusted" : "trusted",
    sourceChannel: "desktop",
    tags: ["learning_loop"],
  };
}

/**
 * Publisher for DistilledLearningCandidates.
 * Triggers batchRemember with source: "mission_learning"
 */
export async function ingestLearningCandidates(
  candidates: DistilledLearningCandidate[],
  adapter: MemoryAdapter,
  ctx: MemoryAdapterContext
): Promise<{ jobId?: string; status: string; written: number }> {
  if (!adapter.batchRemember) {
    throw new Error("Memory adapter does not support batchRemember");
  }

  const inputs = candidates.map(candidateToMemoryInput);

  const result = await adapter.batchRemember(inputs, ctx, {
    async: true,
    source: "mission_learning",
  });

  if (result.async === true) {
    return {
      jobId: result.job.jobId,
      status: result.job.status,
      written: result.job.written ?? 0,
    };
  }

  return {
    jobId: undefined,
    status: "completed",
    written: result.records.length,
  };
}
