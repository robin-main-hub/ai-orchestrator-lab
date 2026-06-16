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
