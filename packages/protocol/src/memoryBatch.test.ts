import { describe, it, expect } from "vitest";
import {
  memoryBatchJobSchema,
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
