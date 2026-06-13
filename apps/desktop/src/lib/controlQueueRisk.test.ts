import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { isRiskyApprovalItem } from "./controlQueueRisk";

describe("isRiskyApprovalItem", () => {
  it("flags untrusted-source items as risky", () => {
    expect(isRiskyApprovalItem({ sourceTrust: "untrusted" } as ApprovalQueueItem)).toBe(true);
  });
  it("treats trusted and limited sources as not risky", () => {
    expect(isRiskyApprovalItem({ sourceTrust: "trusted" } as ApprovalQueueItem)).toBe(false);
    expect(isRiskyApprovalItem({ sourceTrust: "limited" } as ApprovalQueueItem)).toBe(false);
  });
});
