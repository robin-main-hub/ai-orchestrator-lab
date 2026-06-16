import { EvidenceRef, MemoryInput } from "@ai-orchestrator/protocol";
import { MemoryAdapterContext, MemoryAdapter } from "@ai-orchestrator/simplememo";

/**
 * Maps an EvidenceRef (from the Domain Evidence Hub) to a MemoryInput payload.
 */
export function evidenceToMemoryInput(evidence: EvidenceRef): MemoryInput {
  return {
    title: evidence.title || `Evidence: ${evidence.reference}`,
    content: evidence.summary + (evidence.reference ? `\nReference: ${evidence.reference}` : ""),
    layer: "project_memory",
    scope: "project",
    kind: "context",
    trustLevel: "trusted",
    sourceChannel: "api",
    tags: ["evidence", evidence.kind],
  };
}

/**
 * Publisher for approved EvidenceLinks.
 * When an EvidenceLink is approved in the source system, we trigger an async batchRemember job.
 */
export async function publishApprovedEvidence(
  evidenceList: EvidenceRef[],
  adapter: MemoryAdapter,
  ctx: MemoryAdapterContext
): Promise<{ jobId?: string; status: string; written: number }> {
  if (!adapter.batchRemember) {
    throw new Error("Memory adapter does not support batchRemember");
  }

  const inputs = evidenceList.map(evidenceToMemoryInput);

  const result = await adapter.batchRemember(inputs, ctx, {
    async: true,
    source: "generic_evidence",
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
