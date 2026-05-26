import { describe, expect, it } from "vitest";
import { approvalBadgeVariant, runtimeBadgeVariant } from "./statusBadgeMapping";

describe("desktop status badge mapping", () => {
  it("maps runtime states to shared StatusBadge variants", () => {
    expect(runtimeBadgeVariant("online")).toBe("success");
    expect(runtimeBadgeVariant("syncing")).toBe("primary");
    expect(runtimeBadgeVariant("degraded")).toBe("warning");
    expect(runtimeBadgeVariant("offline")).toBe("danger");
    expect(runtimeBadgeVariant("idle")).toBe("muted");
  });

  it("maps approval-like states to shared StatusBadge variants", () => {
    expect(approvalBadgeVariant("approved")).toBe("success");
    expect(approvalBadgeVariant("required")).toBe("warning");
    expect(approvalBadgeVariant("rejected")).toBe("danger");
    expect(approvalBadgeVariant("not_required")).toBe("muted");
  });
});
