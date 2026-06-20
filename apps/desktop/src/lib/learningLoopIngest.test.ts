import { describe, expect, it } from "vitest";
import type { DistilledLearningCandidate, MemoryInput, MemoryRecord } from "@ai-orchestrator/protocol";
import type { MemoryAdapter, MemoryAdapterContext } from "@ai-orchestrator/simplememo";
import { candidateToMemoryInput, ingestLearningCandidates } from "./learningLoopIngest";

// Derived from the adapter interface (the batch option/result types are not
// re-exported from the package barrel).
type BatchRememberFn = NonNullable<MemoryAdapter["batchRemember"]>;
type MemoryBatchRememberOptions = Parameters<BatchRememberFn>[2];
type MemoryBatchRememberResult = Awaited<ReturnType<BatchRememberFn>>;

function candidate(over: Partial<DistilledLearningCandidate> = {}): DistilledLearningCandidate {
  return {
    id: "cand_1",
    loopId: "loop_1",
    hypothesisId: "hyp_1",
    title: "retry on 503",
    lesson: "transient upstream 503s clear on a single retry",
    evidenceRefs: ["evidence_1"],
    trustStatus: "suggested",
    createdAt: "2026-06-20T00:00:00.000Z",
    ...over,
  };
}

const ctx: MemoryAdapterContext = {
  permissionDecision: "allow",
  callerTrustLevel: "trusted",
};

// Build a minimal fake adapter exposing only the surface ingestLearningCandidates
// touches (batchRemember). The full MemoryAdapter interface is large and unused
// here, so the other members are intentionally absent and the value is cast.
function fakeAdapter(batchRemember?: BatchRememberFn): MemoryAdapter {
  const base: Record<string, unknown> = { profileId: "fake", kind: "local_heuristic" };
  if (batchRemember) {
    base.batchRemember = batchRemember;
  }
  return base as unknown as MemoryAdapter;
}

// Characterization tests for the learning-loop → memory ingest seam (no behavior
// change). candidateToMemoryInput is a pure projection that stamps every distilled
// candidate as an untrusted, global reflection tagged "learning_loop"; the lesson
// is wrapped as `Lesson: <lesson>`. ingestLearningCandidates guards a missing
// batchRemember capability, maps each candidate through the projection, always
// requests async:true with source "mission_learning", and normalizes both the
// async job-handle and the synchronous records result shapes. All deterministic,
// injected fake adapter, no real network.
describe("candidateToMemoryInput", () => {
  it("projects a distilled candidate into an untrusted global reflection", () => {
    const input = candidateToMemoryInput(candidate());
    expect(input).toEqual<MemoryInput>({
      title: "retry on 503",
      content: "Lesson: transient upstream 503s clear on a single retry",
      layer: "reflection",
      scope: "global",
      kind: "learning",
      trustLevel: "untrusted",
      sourceChannel: "desktop",
      tags: ["learning_loop"],
    });
  });

  it("passes the title through verbatim and wraps only the lesson", () => {
    const input = candidateToMemoryInput(candidate({ title: "다른 제목", lesson: "another lesson" }));
    expect(input.title).toBe("다른 제목");
    expect(input.content).toBe("Lesson: another lesson");
  });

  it("always marks a suggested candidate untrusted (never auto-trusts)", () => {
    expect(candidateToMemoryInput(candidate()).trustLevel).toBe("untrusted");
  });
});

describe("ingestLearningCandidates", () => {
  it("throws when the adapter cannot batch-remember", async () => {
    await expect(ingestLearningCandidates([candidate()], fakeAdapter(), ctx)).rejects.toThrow(
      "Memory adapter does not support batchRemember",
    );
  });

  it("maps every candidate through the projection and requests an async mission_learning write", async () => {
    let seenInputs: MemoryInput[] | undefined;
    let seenOptions: MemoryBatchRememberOptions | undefined;
    const adapter = fakeAdapter(async (inputs, _ctx, options) => {
      seenInputs = inputs;
      seenOptions = options;
      return { async: true, job: { jobId: "job_1", status: "queued", written: 2 } };
    });

    await ingestLearningCandidates([candidate({ id: "a" }), candidate({ id: "b", lesson: "second" })], adapter, ctx);

    expect(seenOptions).toEqual({ async: true, source: "mission_learning" });
    expect(seenInputs).toHaveLength(2);
    expect(seenInputs?.[0]).toEqual(candidateToMemoryInput(candidate({ id: "a" })));
    expect(seenInputs?.[1]!.content).toBe("Lesson: second");
  });

  it("surfaces the async job handle (jobId, status, written)", async () => {
    const adapter = fakeAdapter(async () => ({
      async: true,
      job: { jobId: "job_42", status: "running", written: 5 },
    }));
    const result = await ingestLearningCandidates([candidate()], adapter, ctx);
    expect(result).toEqual({ jobId: "job_42", status: "running", written: 5 });
  });

  it("defaults written to 0 when the async job omits it", async () => {
    const adapter = fakeAdapter(async () => ({
      async: true,
      job: { jobId: "job_43", status: "queued" },
    }));
    const result = await ingestLearningCandidates([candidate()], adapter, ctx);
    expect(result).toEqual({ jobId: "job_43", status: "queued", written: 0 });
  });

  it("normalizes a synchronous records result to completed with the record count", async () => {
    const records = [{}, {}, {}] as unknown as MemoryRecord[];
    const adapter = fakeAdapter(async () => ({ async: false, records }));
    const result = await ingestLearningCandidates([candidate()], adapter, ctx);
    expect(result).toEqual({ jobId: undefined, status: "completed", written: 3 });
  });
});
