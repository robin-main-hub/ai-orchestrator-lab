import { describe, expect, it } from "vitest";
import {
  missionCheckpointCreateRequestSchema,
  missionCheckpointReasonSchema,
  missionCheckpointSchema,
  missionRollbackRequestSchema,
} from "./missionCheckpoint.js";

// missionCheckpoint has no test today, yet its schemas encode three authority-
// relevant boundaries that must not silently drift: (1) deny-by-default rollback —
// missionRollbackRequest REQUIRES a non-empty approvalId (a grant), so a rollback
// can never be parsed without an explicit human approval; (2) honest provenance —
// a MissionCheckpoint's truthStatus is the literal "observed" (the headSha is a
// real git rev-parse, never configured/simulated), so a fabricated checkpoint is
// rejected at the schema; (3) safe defaults — a create request defaults to the
// least-surprising values (gitRef "HEAD", reason "manual") rather than guessing a
// destructive target. Expected values are read straight off the schema (self-
// consistent), never hardcoded magic.

describe("missionRollbackRequestSchema — deny-by-default (grant required)", () => {
  it("rejects a rollback with no approvalId — auto-rollback can't be smuggled through", () => {
    const r = missionRollbackRequestSchema.safeParse({
      repoRoot: "/repo",
      targetSha: "abc1234",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty-string approvalId (min(1)) — a blank grant is not a grant", () => {
    const r = missionRollbackRequestSchema.safeParse({
      repoRoot: "/repo",
      targetSha: "abc1234",
      approvalId: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a rollback only once a non-empty approvalId grant is present", () => {
    const r = missionRollbackRequestSchema.safeParse({
      repoRoot: "/repo",
      targetSha: "abc1234",
      approvalId: "approval_9",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.approvalId).toBe("approval_9");
  });

  it("bounds targetSha to a sha-shaped 7..40 chars (too short / too long rejected)", () => {
    const base = { repoRoot: "/repo", approvalId: "a1" };
    expect(missionRollbackRequestSchema.safeParse({ ...base, targetSha: "abc12" }).success).toBe(false); // 5 < 7
    expect(missionRollbackRequestSchema.safeParse({ ...base, targetSha: "a".repeat(41) }).success).toBe(false); // 41 > 40
    expect(missionRollbackRequestSchema.safeParse({ ...base, targetSha: "a".repeat(40) }).success).toBe(true); // full sha ok
  });
});

describe("missionCheckpointSchema — honest observed provenance", () => {
  const base = {
    id: "cp1",
    missionId: "m1",
    repoRootRef: "ref/repo",
    gitRef: "HEAD",
    headSha: "deadbeefcafe",
    reason: "before_write" as const,
    createdAt: "2026-06-21T00:00:00.000Z",
  };

  it("requires truthStatus to be the literal \"observed\" — a checkpoint can't claim any other truth", () => {
    expect(missionCheckpointSchema.safeParse({ ...base, truthStatus: "observed" }).success).toBe(true);
    // any non-observed truthStatus is rejected by the literal
    for (const bad of ["configured", "simulated", "planned", "observed "]) {
      expect(missionCheckpointSchema.safeParse({ ...base, truthStatus: bad }).success).toBe(false);
    }
  });

  it("treats workerId as optional (system-initiated checkpoints have no worker)", () => {
    const withTruth = { ...base, truthStatus: "observed" as const };
    expect(missionCheckpointSchema.safeParse(withTruth).success).toBe(true); // omitted
    const parsed = missionCheckpointSchema.parse({ ...withTruth, workerId: "w7" });
    expect(parsed.workerId).toBe("w7"); // threaded when present
  });
});

describe("missionCheckpointCreateRequestSchema — safe least-surprising defaults", () => {
  it("defaults gitRef to HEAD and reason to manual when omitted", () => {
    const parsed = missionCheckpointCreateRequestSchema.parse({ repoRoot: "/repo" });
    expect(parsed.gitRef).toBe("HEAD");
    expect(parsed.reason).toBe("manual");
    expect(parsed.workerId).toBeUndefined();
  });

  it("requires a non-empty repoRoot (min(1)) — there is no implicit repo", () => {
    expect(missionCheckpointCreateRequestSchema.safeParse({ repoRoot: "" }).success).toBe(false);
  });

  it("accepts exactly the five enumerated reasons and nothing else", () => {
    expect(missionCheckpointReasonSchema.options).toEqual([
      "before_write",
      "before_verification",
      "before_merge",
      "manual",
      "auto_recovery",
    ]);
    expect(missionCheckpointReasonSchema.safeParse("before_push").success).toBe(false);
  });
});
