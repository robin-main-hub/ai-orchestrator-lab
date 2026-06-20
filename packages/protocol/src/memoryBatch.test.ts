import { describe, it, expect } from "vitest";
import {
  memoryBatchAcceptedPayloadSchema,
  memoryBatchCompletedPayloadSchema,
  memoryBatchItemResultSchema,
  memoryBatchItemStatusSchema,
  memoryBatchJobSchema,
  memoryBatchJobStatusSchema,
  memoryBatchRememberOptionsSchema,
  memoryBatchEventTypeSchema,
} from "./memoryBatch.js";

describe("memoryBatch schema validation", () => {
  it("successfully parses a valid MemoryBatchJob", () => {
    const job = {
      jobId: "job_123",
      idempotencyKey: "idemp_456",
      source: "erp_evidence",
      status: "completed",
      accepted: 2,
      rejected: 0,
      written: 2,
      failed: 0,
      itemResults: [
        { status: "written", recordId: "dgx_1" },
        { status: "written", recordId: "dgx_2" },
      ],
      async: true,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const parsed = memoryBatchJobSchema.parse(job);
    expect(parsed.jobId).toBe("job_123");
    expect(parsed.status).toBe("completed");
    expect(parsed.itemResults).toHaveLength(2);
  });

  it("successfully parses MemoryBatchRememberOptions with defaults", () => {
    const options = {};
    const parsed = memoryBatchRememberOptionsSchema.parse(options);
    expect(parsed.async).toBe(false);
    expect(parsed.source).toBe("manual");
    expect(parsed.maxItems).toBe(500);
  });

  it("validates event types", () => {
    expect(memoryBatchEventTypeSchema.parse("memory.batch.accepted")).toBe("memory.batch.accepted");
    expect(memoryBatchEventTypeSchema.parse("memory.batch.completed")).toBe("memory.batch.completed");
    expect(() => memoryBatchEventTypeSchema.parse("invalid.event")).toThrow();
  });
});

// The cases above only ever parse a job with EVERY numeric/array field supplied,
// check three option defaults, and two event strings. The schema's actual
// contract — honest zero/empty defaults, the nonnegative-int and positive guards,
// the REQUIRED `async` flag (the one count-like field with no default), the full
// enum memberships, and the two payload schemas (never touched) — stays unpinned.
// A job that silently accepted a negative `accepted`, or a completed payload that
// defaulted `itemResults` to [] like the job does, would pass today. Pin the
// contract, self-consistent (derived from the schema's own declared shape).
describe("memoryBatch schema — defaults, numeric guards, required async, enum totality, payloads", () => {
  const minimalJob = {
    jobId: "job_1",
    idempotencyKey: "idem_1",
    source: "manual" as const,
    status: "queued" as const,
    accepted: 0,
    rejected: 0,
    async: false,
    createdAt: "2026-06-21T00:00:00.000Z",
  };

  it("fills written/failed→0 and itemResults→[] when omitted (honest zero defaults)", () => {
    const parsed = memoryBatchJobSchema.parse(minimalJob);
    expect(parsed.written).toBe(0);
    expect(parsed.failed).toBe(0);
    expect(parsed.itemResults).toEqual([]);
    // the optional timestamps/error stay undefined, not fabricated
    expect(parsed.startedAt).toBeUndefined();
    expect(parsed.completedAt).toBeUndefined();
    expect(parsed.error).toBeUndefined();
  });

  it("requires `async` explicitly — it is the one count-like field with no default", () => {
    const { async: _omit, ...withoutAsync } = minimalJob;
    expect(memoryBatchJobSchema.safeParse(withoutAsync).success).toBe(false);
  });

  it("rejects negative or fractional counts (nonnegative integers only)", () => {
    expect(memoryBatchJobSchema.safeParse({ ...minimalJob, accepted: -1 }).success).toBe(false);
    expect(memoryBatchJobSchema.safeParse({ ...minimalJob, rejected: 1.5 }).success).toBe(false);
    expect(memoryBatchJobSchema.safeParse({ ...minimalJob, written: -2 }).success).toBe(false);
    expect(memoryBatchJobSchema.safeParse({ ...minimalJob, accepted: 0, rejected: 0 }).success).toBe(true); // zero is allowed
  });

  it("RememberOptions defaults the WHOLE object and enforces positive bounds", () => {
    const parsed = memoryBatchRememberOptionsSchema.parse({});
    expect(parsed).toEqual({ async: false, source: "manual", maxItems: 500, maxBytes: 256_000 });
    expect(parsed.idempotencyKey).toBeUndefined(); // optional, never fabricated
    // positive(): 0 and negative are rejected for both bounds
    expect(memoryBatchRememberOptionsSchema.safeParse({ maxItems: 0 }).success).toBe(false);
    expect(memoryBatchRememberOptionsSchema.safeParse({ maxBytes: -1 }).success).toBe(false);
  });

  it("pins the job/item status enum memberships and the 6 namespaced event types", () => {
    expect(memoryBatchJobStatusSchema.options).toEqual([
      "queued",
      "running",
      "completed",
      "failed",
      "partial",
      "cancelled",
    ]);
    expect(memoryBatchItemStatusSchema.options).toEqual(["accepted", "rejected", "written", "failed", "skipped"]);
    const events = memoryBatchEventTypeSchema.options;
    expect(events).toEqual([
      "memory.batch.accepted",
      "memory.batch.started",
      "memory.batch.completed",
      "memory.batch.failed",
      "memory.batch.partial",
      "memory.batch.cancelled",
    ]);
    expect(events.every((e) => e.startsWith("memory.batch."))).toBe(true);
  });

  it("the job and remember-options share the same 6 source values", () => {
    const sources = ["erp_evidence", "mission_learning", "skill_archive", "autonomy_run", "conversation", "manual"];
    for (const source of sources) {
      expect(memoryBatchJobSchema.safeParse({ ...minimalJob, source }).success).toBe(true);
      expect(memoryBatchRememberOptionsSchema.safeParse({ source }).success).toBe(true);
    }
    // a source outside the shared vocabulary is rejected by both
    expect(memoryBatchJobSchema.safeParse({ ...minimalJob, source: "slack" }).success).toBe(false);
    expect(memoryBatchRememberOptionsSchema.safeParse({ source: "slack" }).success).toBe(false);
  });

  it("an item result needs only `status`; inputId/recordId/reason are optional", () => {
    expect(memoryBatchItemResultSchema.safeParse({ status: "written" }).success).toBe(true);
    expect(memoryBatchItemResultSchema.safeParse({ recordId: "r1" }).success).toBe(false); // status missing
    const full = memoryBatchItemResultSchema.parse({ status: "rejected", inputId: "i1", reason: "dup" });
    expect(full).toEqual({ status: "rejected", inputId: "i1", reason: "dup" });
  });

  it("the completed payload requires itemResults (no default, unlike the job) and the accepted payload wraps a full job", () => {
    // completed payload: written/failed/itemResults are all REQUIRED — omitting itemResults fails
    expect(
      memoryBatchCompletedPayloadSchema.safeParse({ jobId: "j", status: "completed", written: 1, failed: 0 }).success,
    ).toBe(false);
    const ok = memoryBatchCompletedPayloadSchema.parse({
      jobId: "j",
      status: "partial",
      written: 1,
      failed: 1,
      itemResults: [{ status: "written", recordId: "r1" }],
    });
    expect(ok.itemResults).toHaveLength(1);
    // accepted payload simply wraps a (defaulted) job
    const accepted = memoryBatchAcceptedPayloadSchema.parse({ job: minimalJob });
    expect(accepted.job.written).toBe(0); // job defaults still apply inside the envelope
  });
});
