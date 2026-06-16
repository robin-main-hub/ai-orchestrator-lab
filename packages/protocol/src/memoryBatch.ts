import { z } from "zod";

export const memoryBatchJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "partial",
  "cancelled",
]);
export type MemoryBatchJobStatus = z.infer<typeof memoryBatchJobStatusSchema>;

export const memoryBatchItemStatusSchema = z.enum([
  "accepted",
  "rejected",
  "written",
  "failed",
  "skipped",
]);
export type MemoryBatchItemStatus = z.infer<typeof memoryBatchItemStatusSchema>;

export const memoryBatchItemResultSchema = z.object({
  inputId: z.string().optional(),
  recordId: z.string().optional(),
  status: memoryBatchItemStatusSchema,
  reason: z.string().optional(),
});
export type MemoryBatchItemResult = z.infer<typeof memoryBatchItemResultSchema>;

export const memoryBatchJobSchema = z.object({
  jobId: z.string(),
  idempotencyKey: z.string(),
  source: z.enum([
    "erp_evidence",
    "mission_learning",
    "skill_archive",
    "autonomy_run",
    "conversation",
    "manual",
  ]),
  status: memoryBatchJobStatusSchema,
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  written: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  itemResults: z.array(memoryBatchItemResultSchema).default([]),
  async: z.boolean(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});
export type MemoryBatchJob = z.infer<typeof memoryBatchJobSchema>;

export const memoryBatchRememberOptionsSchema = z.object({
  async: z.boolean().default(false),
  idempotencyKey: z.string().optional(),
  source: z.enum([
    "erp_evidence",
    "mission_learning",
    "skill_archive",
    "autonomy_run",
    "conversation",
    "manual",
  ]).default("manual"),
  maxItems: z.number().int().positive().default(500),
  maxBytes: z.number().int().positive().default(256_000),
});
export type MemoryBatchRememberOptions = z.input<typeof memoryBatchRememberOptionsSchema>;

export const memoryBatchEventTypeSchema = z.enum([
  "memory.batch.accepted",
  "memory.batch.started",
  "memory.batch.completed",
  "memory.batch.failed",
  "memory.batch.partial",
  "memory.batch.cancelled",
]);
export type MemoryBatchEventType = z.infer<typeof memoryBatchEventTypeSchema>;

export const memoryBatchAcceptedPayloadSchema = z.object({
  job: memoryBatchJobSchema,
});
export type MemoryBatchAcceptedPayload = z.infer<typeof memoryBatchAcceptedPayloadSchema>;

export const memoryBatchCompletedPayloadSchema = z.object({
  jobId: z.string(),
  status: memoryBatchJobStatusSchema,
  written: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  itemResults: z.array(memoryBatchItemResultSchema),
});
export type MemoryBatchCompletedPayload = z.infer<typeof memoryBatchCompletedPayloadSchema>;
