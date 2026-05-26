import { describe, expect, it } from "vitest";
import { connectionHealthLabel, pendingApprovalLabel } from "./statusSummary";

describe("mobile status summary labels", () => {
  it("labels approval queue urgency without leaking implementation terms", () => {
    expect(pendingApprovalLabel(0, false)).toBe("clear");
    expect(pendingApprovalLabel(2, false)).toBe("2 pending");
    expect(pendingApprovalLabel(3, true)).toBe("checking");
  });

  it("maps connection health to short mobile copy", () => {
    expect(connectionHealthLabel("online")).toBe("online");
    expect(connectionHealthLabel("syncing")).toBe("syncing");
    expect(connectionHealthLabel("degraded")).toBe("fallback");
    expect(connectionHealthLabel("offline")).toBe("offline");
    expect(connectionHealthLabel("unknown")).toBe("unknown");
  });
});
