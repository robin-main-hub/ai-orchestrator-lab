import type { EvidenceRef, MemoryRecord } from "@ai-orchestrator/protocol";

export type MemoryCuratorCandidateStatus = "pending" | "approved" | "rejected";

export type MemoryCuratorCandidate = {
  agentId: string;
  createdAt: string;
  evidenceRefs: EvidenceRef[];
  id: string;
  reason: string;
  record: MemoryRecord;
  status: MemoryCuratorCandidateStatus;
  targetActivationState: "active" | "quarantined";
};

export type MemoryCuratorResolution = {
  decidedAt: string;
  recordPatch: Pick<MemoryRecord, "activationState" | "pinned">;
  status: Extract<MemoryCuratorCandidateStatus, "approved" | "rejected">;
};

export function createMemoryCuratorCandidate({
  agentId,
  createdAt,
  reason,
  record,
}: {
  agentId: string;
  createdAt: string;
  reason: string;
  record: MemoryRecord;
}): MemoryCuratorCandidate {
  return {
    agentId,
    createdAt,
    evidenceRefs: [
      {
        id: `evidence_memory_${stableId(record.id)}`,
        kind: "artifact",
        reference: `memory://${record.id}`,
        title: "기억 후보",
        summary: record.title,
        observedAt: record.createdAt,
      },
    ],
    id: `memory_curator_${stableId(`${agentId}:${record.id}:${createdAt}`)}`,
    reason,
    record,
    status: "pending",
    targetActivationState: "active",
  };
}

export function resolveMemoryCuratorCandidate(
  candidate: MemoryCuratorCandidate,
  decision: "approve" | "reject",
  decidedAt: string,
): MemoryCuratorResolution {
  if (decision === "approve") {
    return {
      decidedAt,
      recordPatch: {
        activationState: "active",
        pinned: true,
      },
      status: "approved",
    };
  }

  return {
    decidedAt,
    recordPatch: {
      activationState: "quarantined",
      pinned: false,
    },
    status: "rejected",
  };
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
