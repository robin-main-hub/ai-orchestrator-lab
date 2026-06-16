import { describe, expect, it } from "vitest";
import type { MemoryInput } from "@ai-orchestrator/protocol";
import {
  createBatchRememberAdapter,
  DEFAULT_BATCH_REMEMBER_CONFIG,
  deriveBatchCandidateId,
  planBatchRemember,
  type BatchRememberCandidate,
} from "./batchRemember.js";

function input(over: Partial<MemoryInput> = {}): MemoryInput {
  return {
    layer: "reflection",
    title: "lesson",
    content: "always guard nullable results before use",
    sourceChannel: "agent",
    trustLevel: "trusted",
    ...over,
  };
}

function candidate(over: Partial<BatchRememberCandidate> = {}): BatchRememberCandidate {
  return {
    input: input(),
    sourceEventIds: ["evt_1"],
    initialTrust: "suggested",
    origin: "learning_loop",
    ...over,
  };
}

describe("deriveBatchCandidateId — deterministic", () => {
  it("(B1-1) same candidate → same id; different content → different id", () => {
    const a = candidate();
    expect(deriveBatchCandidateId(a)).toBe(deriveBatchCandidateId(a));
    const b = candidate({ input: input({ content: "different lesson" }) });
    expect(deriveBatchCandidateId(a)).not.toBe(deriveBatchCandidateId(b));
  });

  it("(B1-2) source ref order does not change id (sorted)", () => {
    const a = candidate({ sourceEventIds: ["e1", "e2"] });
    const b = candidate({ sourceEventIds: ["e2", "e1"] });
    expect(deriveBatchCandidateId(a)).toBe(deriveBatchCandidateId(b));
  });
});

describe("planBatchRemember — validation", () => {
  it("(B1-3) valid candidate → accepted", () => {
    const { results } = planBatchRemember([candidate()]);
    expect(results[0]!.outcome).toBe("accepted");
    expect(results[0]!.recordId).toBe(results[0]!.derivedId);
  });

  it("(B1-4) empty content → rejected", () => {
    const { results } = planBatchRemember([candidate({ input: input({ content: "   " }) })]);
    expect(results[0]!.outcome).toBe("rejected");
    expect(results[0]!.reason).toBe("empty_content");
  });

  it("(B1-5) no source refs → rejected", () => {
    const { results } = planBatchRemember([
      candidate({ sourceEventIds: [], evidenceRefs: [] }),
    ]);
    expect(results[0]!.outcome).toBe("rejected");
    expect(results[0]!.reason).toBe("no_source_refs");
  });

  it("(B1-6) evidenceRefs alone is enough", () => {
    const { results } = planBatchRemember([
      candidate({ sourceEventIds: [], evidenceRefs: ["ev_1"] }),
    ]);
    expect(results[0]!.outcome).toBe("accepted");
  });

  it("(B1-7) maxBatchSize (scan cap) enforced → overflow skipped + warning", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      candidate({ clientRef: `c${i}`, input: input({ content: `lesson ${i}` }) }),
    );
    const { results, warnings } = planBatchRemember(many, { maxBatchSize: 3 });
    expect(results.filter((r) => r.outcome === "accepted")).toHaveLength(3);
    expect(results.filter((r) => r.outcome === "skipped" && r.reason === "max_batch_size_exceeded")).toHaveLength(2);
    expect(warnings.some((w) => w.includes("scan cap"))).toBe(true);
  });

  it("(B1-8) order preserved + deterministic for same input", () => {
    const cs = [
      candidate({ clientRef: "a", input: input({ content: "a" }) }),
      candidate({ clientRef: "b", input: input({ content: "b" }) }),
    ];
    expect(planBatchRemember(cs)).toEqual(planBatchRemember(cs));
    const plan = planBatchRemember(cs);
    expect(plan.results.map((r) => r.clientRef)).toEqual(["a", "b"]);
  });
});

describe("config defaults — safe", () => {
  it("(B1-9) HNSW defaults off", () => {
    expect(DEFAULT_BATCH_REMEMBER_CONFIG.forceHnsw).toBe(false);
    const { effectiveConfig } = planBatchRemember([candidate()]);
    expect(effectiveConfig.forceHnsw).toBe(false);
  });

  it("(B1-10) soft RRF cutoff default is safe (low + soft mode)", () => {
    expect(DEFAULT_BATCH_REMEMBER_CONFIG.rrfCutoffMode).toBe("soft");
    expect(DEFAULT_BATCH_REMEMBER_CONFIG.rrfImportanceCutoff).toBeLessThanOrEqual(0.1);
  });

  it("(B1-11) forceHnsw=true is accepted but warns (no real index in B1)", () => {
    const { warnings } = planBatchRemember([candidate()], { forceHnsw: true });
    expect(warnings.some((w) => w.toLowerCase().includes("hnsw"))).toBe(true);
  });
});

describe("adapter modes", () => {
  it("(B1-12) default adapter mode is mock, observed:false (no fake success)", () => {
    const adapter = createBatchRememberAdapter();
    expect(adapter.mode).toBe("mock");
    const res = adapter.batchRemember([candidate()]);
    expect(res.observed).toBe(false);
    expect(res.acceptedCount).toBe(1);
  });

  it("(B1-13) disabled adapter → observed:false, accepted downgraded to skipped(adapter_disabled)", () => {
    const adapter = createBatchRememberAdapter({ mode: "disabled" });
    const res = adapter.batchRemember([candidate()]);
    expect(res.observed).toBe(false);
    expect(res.acceptedCount).toBe(0);
    expect(res.skippedCount).toBe(1);
    expect(res.results[0]!.reason).toBe("adapter_disabled");
    expect(res.blockers).toContain("adapter_disabled");
  });

  it("(B1-14) local_simplememo / dgx placeholder → observed:false + not_implemented blocker", () => {
    for (const mode of ["local_simplememo", "dgx_simplememo_placeholder"] as const) {
      const adapter = createBatchRememberAdapter({ mode });
      const res = adapter.batchRemember([candidate()]);
      expect(adapter.mode).toBe(mode);
      expect(res.observed).toBe(false);
      expect(res.acceptedCount).toBe(0);
      expect(res.blockers).toContain("write_path_not_implemented_b1");
    }
  });

  it("(B1-15) rejected candidates stay rejected even in disabled/placeholder (honest)", () => {
    const bad = candidate({ sourceEventIds: [], evidenceRefs: [] });
    for (const mode of ["disabled", "local_simplememo", "mock"] as const) {
      const res = createBatchRememberAdapter({ mode }).batchRemember([bad]);
      expect(res.rejectedCount).toBe(1);
      expect(res.results[0]!.reason).toBe("no_source_refs");
    }
  });

  it("(B1-16) no candidate is promoted to trusted/active (result has no trust/activation field)", () => {
    const res = createBatchRememberAdapter({ mode: "mock" }).batchRemember([candidate()]);
    const r = res.results[0]! as Record<string, unknown>;
    expect(r).not.toHaveProperty("trustStatus");
    expect(r).not.toHaveProperty("activationStatus");
    expect(r).not.toHaveProperty("trusted");
    expect(r).not.toHaveProperty("active");
  });

  it("(B1-17) adapter output deterministic for same input", () => {
    const adapter = createBatchRememberAdapter({ mode: "mock" });
    const cs = [candidate({ clientRef: "x" }), candidate({ clientRef: "y", input: input({ content: "y" }) })];
    expect(adapter.batchRemember(cs)).toEqual(adapter.batchRemember(cs));
  });

  it("(B1-18) empty batch → zero counts, no crash", () => {
    const res = createBatchRememberAdapter({ mode: "mock" }).batchRemember([]);
    expect(res.acceptedCount).toBe(0);
    expect(res.rejectedCount).toBe(0);
    expect(res.skippedCount).toBe(0);
    expect(res.results).toEqual([]);
  });

  it("(B1-19) effectiveConfig is reported honestly", () => {
    const res = createBatchRememberAdapter({ mode: "mock", maxBatchSize: 10 }).batchRemember([candidate()]);
    expect(res.effectiveConfig.maxBatchSize).toBe(10);
    expect(res.effectiveConfig.mode).toBe("mock");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B2 — local SimpleMemo batch write tests
// ─────────────────────────────────────────────────────────────────────────────

import {
  executeLocalBatchWrite,
  type LocalSimpleMemoWriter,
  type LocalSimpleMemoWriteResult,
} from "./batchRemember.js";

/** 호출 추적 + 결정론적 결과를 주는 mock writer. */
function makeWriter(
  behavior: (input: MemoryInput, candidateId: string) => LocalSimpleMemoWriteResult,
): LocalSimpleMemoWriter & { calls: Array<{ candidateId: string }> } {
  const calls: Array<{ candidateId: string }> = [];
  return {
    calls,
    async remember(input, candidateId) {
      calls.push({ candidateId });
      return behavior(input, candidateId);
    },
  };
}

const okWriter = () =>
  makeWriter((_input, candidateId) => ({ ok: true, memoryId: `stored_${candidateId}` }));

describe("executeLocalBatchWrite — writer injection safety", () => {
  it("(B2-1) no writer → observed:false, accepted downgraded to skipped(local_writer_missing)", async () => {
    const res = await executeLocalBatchWrite({ candidates: [candidate()] });
    expect(res.observed).toBe(false);
    expect(res.writtenCount).toBe(0);
    expect(res.skippedCount).toBe(1);
    expect(res.results[0]!.writeStatus).toBe("skipped");
    expect(res.results[0]!.reason).toBe("local_writer_missing");
    expect(res.blockers).toContain("local_writer_missing");
  });

  it("(B2-2) with writer → only accepted candidate written, observed:true", async () => {
    const writer = okWriter();
    const res = await executeLocalBatchWrite({ candidates: [candidate()], writer });
    expect(res.observed).toBe(true);
    expect(res.writtenCount).toBe(1);
    expect(res.results[0]!.writeStatus).toBe("written");
    expect(res.results[0]!.writeObserved).toBe(true);
    expect(res.results[0]!.writtenId).toBe(`stored_${res.results[0]!.derivedId}`);
    expect(writer.calls).toHaveLength(1);
  });
});

describe("executeLocalBatchWrite — rejected/skipped never call writer", () => {
  it("(B2-3) rejected candidate (no source refs) does not call writer", async () => {
    const writer = okWriter();
    const res = await executeLocalBatchWrite({
      candidates: [candidate({ sourceEventIds: [], evidenceRefs: [] })],
      writer,
    });
    expect(writer.calls).toHaveLength(0);
    expect(res.rejectedCount).toBe(1);
    expect(res.results[0]!.writeStatus).toBe("rejected");
    expect(res.results[0]!.reason).toBe("no_source_refs");
  });

  it("(B2-4) empty content rejected, writer not called", async () => {
    const writer = okWriter();
    const res = await executeLocalBatchWrite({
      candidates: [candidate({ input: input({ content: "   " }) })],
      writer,
    });
    expect(writer.calls).toHaveLength(0);
    expect(res.results[0]!.writeStatus).toBe("rejected");
    expect(res.results[0]!.reason).toBe("empty_content");
  });

  it("(B2-5) candidates over maxBatchSize are skipped, writer not called for them", async () => {
    const writer = okWriter();
    const many = Array.from({ length: 4 }, (_, i) =>
      candidate({ clientRef: `c${i}`, input: input({ content: `lesson ${i}` }) }),
    );
    const res = await executeLocalBatchWrite({ candidates: many, writer, config: { maxBatchSize: 2 } });
    expect(writer.calls).toHaveLength(2); // only the first 2 accepted
    expect(res.writtenCount).toBe(2);
    expect(res.skippedCount).toBe(2);
    expect(res.results.filter((r) => r.writeStatus === "skipped" && r.reason === "max_batch_size_exceeded")).toHaveLength(2);
  });
});

describe("executeLocalBatchWrite — partial failure honesty", () => {
  it("(B2-6) one writer failure does not mark whole batch successful", async () => {
    const writer = makeWriter((_input, candidateId) =>
      candidateId.includes("fail")
        ? { ok: false, errorCode: "disk_full", reason: "no space" }
        : { ok: true, memoryId: `stored_${candidateId}` },
    );
    // craft two candidates: one whose derived id contains a marker is hard; instead use content
    const good = candidate({ clientRef: "good", input: input({ content: "good lesson" }) });
    const bad = candidate({ clientRef: "bad", input: input({ content: "bad lesson" }) });
    // make the writer fail for the bad one by content match
    const writer2 = makeWriter((inp) =>
      inp.content.includes("bad")
        ? { ok: false, errorCode: "disk_full", reason: "no space" }
        : { ok: true, memoryId: "stored_ok" },
    );
    const res = await executeLocalBatchWrite({ candidates: [good, bad], writer: writer2 });
    expect(res.writtenCount).toBe(1);
    expect(res.failedCount).toBe(1);
    // observed true because at least one real write succeeded, but failure surfaced
    expect(res.observed).toBe(true);
    const failed = res.results.find((r) => r.writeStatus === "failed");
    expect(failed?.errorCode).toBe("disk_full");
    expect(failed?.writeObserved).toBe(false);
    void writer;
    void good;
    void bad;
  });

  it("(B2-7) writer that throws is isolated to that candidate (batch does not crash)", async () => {
    const writer = makeWriter((inp) => {
      if (inp.content.includes("boom")) throw new Error("ConnectionError");
      return { ok: true, memoryId: "ok" };
    });
    const res = await executeLocalBatchWrite({
      candidates: [
        candidate({ input: input({ content: "fine" }) }),
        candidate({ input: input({ content: "boom" }) }),
      ],
      writer,
    });
    expect(res.writtenCount).toBe(1);
    expect(res.failedCount).toBe(1);
    const failed = res.results.find((r) => r.writeStatus === "failed");
    expect(failed?.errorCode).toBe("writer_threw");
  });

  it("(B2-8) all writers fail → observed:false, writtenCount 0", async () => {
    const writer = makeWriter(() => ({ ok: false, errorCode: "rejected_by_backend" }));
    const res = await executeLocalBatchWrite({ candidates: [candidate()], writer });
    expect(res.observed).toBe(false);
    expect(res.writtenCount).toBe(0);
    expect(res.failedCount).toBe(1);
  });
});

describe("executeLocalBatchWrite — determinism + no promotion + safety", () => {
  it("(B2-9) deterministic ids stable across runs", async () => {
    const writer1 = okWriter();
    const writer2 = okWriter();
    const cs = [candidate({ clientRef: "a" }), candidate({ clientRef: "b", input: input({ content: "b" }) })];
    const r1 = await executeLocalBatchWrite({ candidates: cs, writer: writer1 });
    const r2 = await executeLocalBatchWrite({ candidates: cs, writer: writer2 });
    expect(r1.results.map((r) => r.derivedId)).toEqual(r2.results.map((r) => r.derivedId));
  });

  it("(B2-10) result has no trust/activation promotion fields", async () => {
    const res = await executeLocalBatchWrite({ candidates: [candidate()], writer: okWriter() });
    const r = res.results[0]! as Record<string, unknown>;
    expect(r).not.toHaveProperty("trustStatus");
    expect(r).not.toHaveProperty("activationStatus");
    expect(r).not.toHaveProperty("trusted");
    expect(r).not.toHaveProperty("active");
  });

  it("(B2-11) HNSW stays off by default; forceHnsw warns but never enables index", async () => {
    const res = await executeLocalBatchWrite({
      candidates: [candidate()],
      writer: okWriter(),
      config: { forceHnsw: true },
    });
    expect(res.effectiveConfig.forceHnsw).toBe(true); // honestly reported
    expect(res.warnings.some((w) => w.toLowerCase().includes("hnsw"))).toBe(true);
    // no field claims an index was built
    expect(res as Record<string, unknown>).not.toHaveProperty("indexBuilt");
  });

  it("(B2-12) writer receives the deterministic candidateId as idempotency key", async () => {
    const seen: string[] = [];
    const writer: LocalSimpleMemoWriter = {
      async remember(_input, candidateId) {
        seen.push(candidateId);
        return { ok: true, memoryId: candidateId };
      },
    };
    const res = await executeLocalBatchWrite({ candidates: [candidate()], writer });
    expect(seen[0]).toBe(res.results[0]!.derivedId);
  });

  it("(B2-13) empty batch → zero counts, observed:false, no writer calls", async () => {
    const writer = okWriter();
    const res = await executeLocalBatchWrite({ candidates: [], writer });
    expect(res.observed).toBe(false);
    expect(res.writtenCount).toBe(0);
    expect(res.results).toEqual([]);
    expect(writer.calls).toHaveLength(0);
  });
});
