import { describe, expect, it } from "vitest";
import { mapOutcomeToStatus } from "./GithubPublishPanel";

// Characterization tests for mapOutcomeToStatus (no behavior change). It is a
// pure exported helper that folds a plan/execute response `outcome` string into
// the unified GithubPublishStepStatus union. No React render, no DOM, no
// network — importing the module only evaluates its top-level definitions.
// We pin every switch arm, including the subtle shared-case ternary where
// "planned" and "approval_required" land in the same `case` block but are split
// back apart by the inner `outcome === "approval_required" ? ... : ...`, the
// three-way collapse to "blocked" (blocked/not_configured/permission_denied),
// and the explicit + default collapse to "failed" (connection_failed/
// github_error/anything unrecognized).

describe("mapOutcomeToStatus", () => {
  it("splits the shared planned/approval_required case back apart via the ternary", () => {
    expect(mapOutcomeToStatus("planned")).toBe("planned");
    expect(mapOutcomeToStatus("approval_required")).toBe("approval_required");
  });

  it("maps the one-to-one outcomes verbatim", () => {
    expect(mapOutcomeToStatus("observed")).toBe("observed");
    expect(mapOutcomeToStatus("already_exists")).toBe("already_exists");
  });

  it("collapses blocked / not_configured / permission_denied to blocked", () => {
    expect(mapOutcomeToStatus("blocked")).toBe("blocked");
    expect(mapOutcomeToStatus("not_configured")).toBe("blocked");
    expect(mapOutcomeToStatus("permission_denied")).toBe("blocked");
  });

  it("collapses connection_failed / github_error / anything unrecognized to failed", () => {
    expect(mapOutcomeToStatus("connection_failed")).toBe("failed");
    expect(mapOutcomeToStatus("github_error")).toBe("failed");
    expect(mapOutcomeToStatus("totally_unknown")).toBe("failed");
    expect(mapOutcomeToStatus("")).toBe("failed");
  });
});
