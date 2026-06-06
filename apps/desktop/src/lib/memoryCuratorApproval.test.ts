import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import {
  createMemoryCuratorCandidate,
  resolveMemoryCuratorCandidate,
} from "./memoryCuratorApproval";

const record: MemoryRecord = {
  id: "memory_candidate_1",
  activationState: "quarantined",
  content: "마키마는 운영자 관제판의 지휘자다.",
  createdAt: "2026-06-06T12:00:00.000Z",
  kind: "decision",
  layer: "project_memory",
  pinned: false,
  scope: "project",
  sourceChannel: "desktop",
  title: "에이전트 정체성",
  trustLevel: "limited",
};

describe("memoryCuratorApproval", () => {
  it("기억 후보를 curator 승인 카드로 만든다", () => {
    const candidate = createMemoryCuratorCandidate({
      agentId: "agent_memory_curator",
      createdAt: "2026-06-06T12:01:00.000Z",
      reason: "대화 정체성 유지에 필요",
      record,
    });

    expect(candidate.status).toBe("pending");
    expect(candidate.targetActivationState).toBe("active");
    expect(candidate.evidenceRefs[0]).toEqual(
      expect.objectContaining({
        reference: "memory://memory_candidate_1",
        title: "기억 후보",
      }),
    );
  });

  it("승인하면 active/pinned로 승격하고 거절하면 quarantined로 남긴다", () => {
    const candidate = createMemoryCuratorCandidate({
      agentId: "agent_memory_curator",
      createdAt: "2026-06-06T12:01:00.000Z",
      reason: "대화 정체성 유지에 필요",
      record,
    });

    expect(resolveMemoryCuratorCandidate(candidate, "approve", "2026-06-06T12:02:00.000Z")).toMatchObject({
      status: "approved",
      recordPatch: {
        activationState: "active",
        pinned: true,
      },
    });
    expect(resolveMemoryCuratorCandidate(candidate, "reject", "2026-06-06T12:03:00.000Z")).toMatchObject({
      status: "rejected",
      recordPatch: {
        activationState: "quarantined",
        pinned: false,
      },
    });
  });
});
