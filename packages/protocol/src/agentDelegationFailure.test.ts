import { describe, expect, it } from "vitest";
import {
  agentDelegationFailedPayloadSchema,
  agentDelegationFollowupFailedPayloadSchema,
  agentDelegationFollowupStatusSchema,
  agentDelegationTimelineStatusSchema,
} from "./index.js";

// The agent-delegation cluster is heavily pinned in index.test.ts — but only its
// HAPPY PATH: map totality, base-strict, and the detected/dispatched/blocked/
// self_blocked variants, plus a timeline projection whose fixture has failed:0.
// The FAILURE PATH was never pinned. The FRESH authority angle here is DELEGATION
// FAILURE-PATH INTEGRITY: when a delegation fails, the record must still say
// exactly WHO failed and WHY, within bounds. (1) A FAILURE STILL NAMES ITS TARGET —
// agentDelegationFailedPayload requires the full target provenance (targetAgentId /
// targetAgentName / targetRole / providerProfileId / modelId), so a failure can
// never be an anonymous "something broke"; it inherits the base sourceAgentId
// (min 1) too. (2) THE ERROR IS A BOUNDED, NON-EMPTY STRING — `error` is
// z.string().min(1).max(20_000): a failure cannot record an empty reason, nor dump
// an unbounded blob into the event log. (3) FOLLOWUP-FAILURE COUNTS ARE NON-NEGATIVE
// INTS — agentDelegationFollowupFailedPayload requires sourceAgentName + an
// outcomeCount (int ≥ 0) + the same bounded error. (4) BOTH ARE .strict() — a
// smuggled key is rejected, not stripped. (5) THE STATUS VOCABS ARE CLOSED — the
// timeline status enumerates every delegation outcome (pending/in_flight/succeeded/
// failed/blocked/unknown_target/self_blocked) and the followup status is exactly
// {completed, failed}. Enum members read back via `.options`.

const failed = {
  sourceAgentId: "agent_orchestrator",
  targetAgentId: "agent_builder",
  targetAgentName: "Builder",
  targetRole: "builder",
  providerProfileId: "provider_1",
  modelId: "model_1",
  error: "provider request timed out",
};

const followupFailed = {
  sourceAgentId: "agent_orchestrator",
  sourceAgentName: "Orchestrator",
  outcomeCount: 3,
  error: "aggregation of delegate outcomes failed",
};

describe("agentDelegationFailedPayload — a failure still names its target, within bounds", () => {
  it("accepts a well-formed failure payload", () => {
    expect(agentDelegationFailedPayloadSchema.safeParse(failed).success).toBe(true);
  });

  it("requires the full target provenance — a failure is never anonymous", () => {
    const { targetAgentId: _omit, ...without } = failed;
    expect(agentDelegationFailedPayloadSchema.safeParse(without).success).toBe(false);
  });

  it("requires the inherited base sourceAgentId (min 1)", () => {
    expect(agentDelegationFailedPayloadSchema.safeParse({ ...failed, sourceAgentId: "" }).success).toBe(false);
  });

  it("bounds the error: non-empty and capped at 20_000 chars", () => {
    expect(agentDelegationFailedPayloadSchema.safeParse({ ...failed, error: "" }).success).toBe(false);
    expect(agentDelegationFailedPayloadSchema.safeParse({ ...failed, error: "x".repeat(20_000) }).success).toBe(true);
    expect(agentDelegationFailedPayloadSchema.safeParse({ ...failed, error: "x".repeat(20_001) }).success).toBe(false);
  });

  it("is strict — a smuggled key is rejected, not stripped", () => {
    expect(agentDelegationFailedPayloadSchema.safeParse({ ...failed, forged: "x" }).success).toBe(false);
  });
});

describe("agentDelegationFollowupFailedPayload — non-negative counts + bounded error", () => {
  it("accepts a well-formed followup-failure", () => {
    expect(agentDelegationFollowupFailedPayloadSchema.safeParse(followupFailed).success).toBe(true);
  });

  it("requires outcomeCount to be a non-negative integer", () => {
    expect(agentDelegationFollowupFailedPayloadSchema.safeParse({ ...followupFailed, outcomeCount: -1 }).success).toBe(false);
    expect(agentDelegationFollowupFailedPayloadSchema.safeParse({ ...followupFailed, outcomeCount: 1.5 }).success).toBe(false);
  });

  it("bounds the error the same way and stays strict", () => {
    expect(agentDelegationFollowupFailedPayloadSchema.safeParse({ ...followupFailed, error: "" }).success).toBe(false);
    expect(agentDelegationFollowupFailedPayloadSchema.safeParse({ ...followupFailed, forged: "x" }).success).toBe(false);
  });
});

describe("agentDelegation status vocabularies — closed", () => {
  it("timeline status enumerates every delegation outcome", () => {
    expect(agentDelegationTimelineStatusSchema.options).toEqual([
      "pending",
      "in_flight",
      "succeeded",
      "failed",
      "blocked",
      "unknown_target",
      "self_blocked",
    ]);
    expect(agentDelegationTimelineStatusSchema.safeParse("retrying").success).toBe(false);
  });

  it("followup status is exactly {completed, failed}", () => {
    expect(agentDelegationFollowupStatusSchema.options).toEqual(["completed", "failed"]);
    expect(agentDelegationFollowupStatusSchema.safeParse("partial").success).toBe(false);
  });
});
