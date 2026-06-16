import { describe, expect, it } from "vitest";
import type { DistilledLearningCandidate } from "@ai-orchestrator/protocol";
import {
  buildBatchRememberCandidatesFromLearning,
  distilledCandidateToMemoryInput,
  executeLearningBatchRemember,
} from "./learningBatchRemember.js";
import type { LocalSimpleMemoWriter, LocalSimpleMemoWriteResult } from "./batchRemember.js";

function distilled(over: Partial<DistilledLearningCandidate> = {}): DistilledLearningCandidate {
  return {
    id: "distill_1",
    loopId: "loop_1",
    hypothesisId: "hyp_1",
    title: "guard nullable foo()",
    lesson: "always guard nullable results before use",
    evidenceRefs: ["artifact_rerun_1"],
    trustStatus: "suggested",
    createdAt: "2026-06-16T00:00:00.000Z",
    ...over,
  };
}

function makeWriter(
  behavior: (memoryId: string) => LocalSimpleMemoWriteResult = (id) => ({ ok: true, memoryId: `stored_${id}` }),
): LocalSimpleMemoWriter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async remember(_input, candidateId) {
      calls.push(candidateId);
      return behavior(candidateId);
    },
  };
}

describe("distilledCandidateToMemoryInput", () => {
  it("(C2-1) maps lesson to reflection/learning memory, trustLevel limited (not trusted)", () => {
    const input = distilledCandidateToMemoryInput(distilled());
    expect(input.layer).toBe("reflection");
    expect(input.kind).toBe("learning");
    expect(input.content).toContain("guard nullable");
    expect(input.trustLevel).toBe("limited"); // 검증됐어도 trusted 아님
  });
});

describe("buildBatchRememberCandidatesFromLearning — suggested gate", () => {
  it("(C2-2) suggested candidate → batchRemember candidate with evidenceRefs + learning_loop origin", () => {
    const cs = buildBatchRememberCandidatesFromLearning([distilled()]);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.origin).toBe("learning_loop");
    expect(cs[0]!.initialTrust).toBe("suggested");
    expect(cs[0]!.evidenceRefs).toEqual(["artifact_rerun_1"]);
    expect(cs[0]!.clientRef).toBe("distill_1");
  });

  it("(C2-3) non-suggested trustStatus is excluded (defensive gate)", () => {
    // @ts-expect-error — DistilledLearningCandidate.trustStatus is literal "suggested";
    // we force a wrong value to prove the runtime gate also drops it.
    const bad: DistilledLearningCandidate = distilled({ trustStatus: "curator_approved" });
    expect(buildBatchRememberCandidatesFromLearning([bad])).toEqual([]);
  });
});

describe("executeLearningBatchRemember — writer injection", () => {
  it("(C2-4) writer missing → observed:false, no fake success", async () => {
    const res = await executeLearningBatchRemember({ candidates: [distilled()] });
    expect(res.observed).toBe(false);
    expect(res.writtenCount).toBe(0);
    expect(res.results[0]!.reason).toBe("local_writer_missing");
  });

  it("(C2-5) writer present → actual local write observed:true", async () => {
    const writer = makeWriter();
    const res = await executeLearningBatchRemember({ candidates: [distilled()], writer });
    expect(res.observed).toBe(true);
    expect(res.writtenCount).toBe(1);
    expect(writer.calls).toHaveLength(1);
    expect(res.results[0]!.writeStatus).toBe("written");
  });

  it("(C2-6) candidate without evidence refs never reaches the writer", async () => {
    const writer = makeWriter();
    // evidenceRefs empty would fail protocol schema in real flow; here we simulate the
    // batchRemember-level guard via an already-built candidate with empty refs.
    const noRefs = distilled({ evidenceRefs: [] as unknown as [string, ...string[]] });
    const res = await executeLearningBatchRemember({ candidates: [noRefs], writer });
    expect(writer.calls).toHaveLength(0);
    expect(res.rejectedCount).toBe(1);
    expect(res.results[0]!.reason).toBe("no_source_refs");
  });

  it("(C2-7) writer failure surfaces as failed, observed:false", async () => {
    const writer = makeWriter(() => ({ ok: false, errorCode: "backend_down" }));
    const res = await executeLearningBatchRemember({ candidates: [distilled()], writer });
    expect(res.observed).toBe(false);
    expect(res.failedCount).toBe(1);
    expect(res.results[0]!.errorCode).toBe("backend_down");
  });

  it("(C2-8) no trust/activation promotion fields in result", async () => {
    const res = await executeLearningBatchRemember({ candidates: [distilled()], writer: makeWriter() });
    const r = res.results[0]! as Record<string, unknown>;
    expect(r).not.toHaveProperty("trustStatus");
    expect(r).not.toHaveProperty("activationStatus");
  });

  it("(C2-9) multiple candidates: only suggested ones written, deterministic", async () => {
    const writer = makeWriter();
    const cs = [
      distilled({ id: "d1", lesson: "lesson one" }),
      distilled({ id: "d2", lesson: "lesson two" }),
    ];
    const res = await executeLearningBatchRemember({ candidates: cs, writer });
    expect(res.writtenCount).toBe(2);
    expect(writer.calls).toHaveLength(2);
    const again = await executeLearningBatchRemember({ candidates: cs, writer: makeWriter() });
    expect(again.results.map((r) => r.derivedId)).toEqual(res.results.map((r) => r.derivedId));
  });

  it("(C2-10) empty candidate list → observed:false, no writer calls", async () => {
    const writer = makeWriter();
    const res = await executeLearningBatchRemember({ candidates: [], writer });
    expect(res.observed).toBe(false);
    expect(res.results).toEqual([]);
    expect(writer.calls).toHaveLength(0);
  });
});
