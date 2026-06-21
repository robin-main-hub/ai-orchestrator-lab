import { describe, expect, it } from "vitest";
import {
  adapterErrorCategorySchema,
  providerCompletionChunkEventSchema,
  providerCompletionMessageSchema,
  providerCompletionUsageSchema,
} from "./index.js";

// providerCompletionChunkEventSchema is the streaming wire protocol a completion
// adapter emits chunk-by-chunk (delta → … → done | error). It is the first
// DISCRIMINATED UNION pinned in this audit, and that is the FRESH authority
// angle: TYPE-ROUTED VARIANT INTEGRITY. (1) THE DISCRIMINANT ROUTES — the `type`
// literal (delta/usage/done/error) selects exactly one variant shape; a chunk
// with an unknown type matches no variant and is rejected, so a stream can never
// carry an unmodelled frame. (2) EACH VARIANT IS STRUCTURALLY ITS OWN — a delta
// requires a non-negative `sequence` + `delta`; a done requires finalContent +
// endpoint + createdAt + completedAt; an error requires the nested {category,
// message} object. A frame bearing the right type but the wrong shape for that
// type is rejected — the union is not a loose bag keyed only by `type`. (3) THE
// DONE FRAME'S stopReason IS A CLOSED VOCAB — end_turn/max_tokens/stop_sequence/
// tool_use/cancelled, and it is optional. The supporting leaves are pinned too:
// the message role vocab {user,assistant,system,tool} with a 200_000-char DoS
// cap on content; the usage counters as all-optional non-negative ints; and the
// nine-member adapterErrorCategory vocab. Enum members read back via `.options`.

const delta = { type: "delta", requestId: "r-1", sequence: 0, delta: "hi" };
const usage = { type: "usage", requestId: "r-1", usage: { inputTokens: 10 } };
const done = {
  type: "done",
  requestId: "r-1",
  finalContent: "all done",
  endpoint: "https://api.example/v1",
  createdAt: "2026-06-21T00:00:00.000Z",
  completedAt: "2026-06-21T00:00:01.000Z",
};
const errorChunk = { type: "error", requestId: "r-1", error: { category: "rate_limit", message: "slow down" } };

describe("providerCompletionChunkEvent — discriminant routes to exactly one variant", () => {
  it("accepts each well-formed variant", () => {
    for (const frame of [delta, usage, done, errorChunk]) {
      expect(providerCompletionChunkEventSchema.safeParse(frame).success).toBe(true);
    }
  });

  it("rejects an unknown frame type (no matching variant)", () => {
    expect(providerCompletionChunkEventSchema.safeParse({ ...delta, type: "heartbeat" }).success).toBe(false);
  });
});

describe("providerCompletionChunkEvent — each variant is structurally its own", () => {
  it("delta requires a sequence and delta body", () => {
    const { sequence: _omit, ...without } = delta;
    expect(providerCompletionChunkEventSchema.safeParse(without).success).toBe(false);
  });

  it("done requires finalContent + endpoint + timestamps (not a loose type-only bag)", () => {
    const { finalContent: _omit, ...without } = done;
    expect(providerCompletionChunkEventSchema.safeParse(without).success).toBe(false);
  });

  it("error requires a nested {category, message} with a known category", () => {
    expect(
      providerCompletionChunkEventSchema.safeParse({ ...errorChunk, error: { category: "bogus", message: "x" } })
        .success,
    ).toBe(false);
  });

  it("the done frame's stopReason is a closed vocab", () => {
    expect(providerCompletionChunkEventSchema.safeParse({ ...done, stopReason: "max_tokens" }).success).toBe(true);
    expect(providerCompletionChunkEventSchema.safeParse({ ...done, stopReason: "ran_out" }).success).toBe(false);
  });
});

describe("providerCompletion supporting leaves — role/cap, usage, error category", () => {
  it("message role is closed and content is capped at 200_000 chars", () => {
    expect(providerCompletionMessageSchema.safeParse({ role: "tool", content: "ok" }).success).toBe(true);
    expect(providerCompletionMessageSchema.safeParse({ role: "narrator", content: "x" }).success).toBe(false);
    expect(providerCompletionMessageSchema.safeParse({ role: "user", content: "x".repeat(200_000) }).success).toBe(true);
    expect(providerCompletionMessageSchema.safeParse({ role: "user", content: "x".repeat(200_001) }).success).toBe(false);
  });

  it("usage counters are all-optional non-negative ints (empty usage is legal)", () => {
    expect(providerCompletionUsageSchema.safeParse({}).success).toBe(true);
    expect(providerCompletionUsageSchema.safeParse({ inputTokens: 0 }).success).toBe(true);
    expect(providerCompletionUsageSchema.safeParse({ inputTokens: -1 }).success).toBe(false);
  });

  it("adapterErrorCategory admits exactly the nine declared categories", () => {
    expect(adapterErrorCategorySchema.options).toEqual([
      "network",
      "auth",
      "credential_expired",
      "refresh_required",
      "rate_limit",
      "bad_request",
      "provider",
      "blocked",
      "unknown",
    ]);
  });
});
