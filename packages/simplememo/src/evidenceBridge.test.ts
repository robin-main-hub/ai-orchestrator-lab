import { describe, expect, it } from "vitest";
import {
  buildBatchRememberCandidatesFromEvidence,
  evidenceToMemoryInput,
  executeEvidenceBatchRemember,
  type ApprovedEvidence,
} from "./evidenceBridge.js";
import type { LocalSimpleMemoWriter, LocalSimpleMemoWriteResult } from "./batchRemember.js";

function evidence(over: Partial<ApprovedEvidence> = {}): ApprovedEvidence {
  return {
    id: "ev_1",
    status: "approved",
    evidenceRefs: ["ssot_quote_42"],
    sourceEventIds: ["evt_7"],
    title: "Quote 42 approved for ACME",
    summary: "approved quote covering Q3 reorder",
    aiReason: "matches prior ACME pricing and approved by 본부장",
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

describe("evidenceToMemoryInput", () => {
  it("(D-1) maps evidence to context memory, trustLevel limited (NEVER trusted)", () => {
    const input = evidenceToMemoryInput(evidence());
    expect(input.kind).toBe("context");
    expect(input.trustLevel).toBe("limited");
    expect(input.content).toContain("matches prior ACME pricing"); // aiReason preserved
    expect(["episode", "reflection"]).toContain(input.layer);
  });

  it("(D-2) falls back to summary when no aiReason, layer episode", () => {
    const input = evidenceToMemoryInput(evidence({ aiReason: undefined }));
    expect(input.content).toBe("approved quote covering Q3 reorder");
    expect(input.layer).toBe("episode");
  });
});

describe("buildBatchRememberCandidatesFromEvidence — status gate", () => {
  it("(D-3) approved → candidate with evidence_bridge origin + suggested trust", () => {
    const cs = buildBatchRememberCandidatesFromEvidence([evidence({ status: "approved" })]);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.origin).toBe("evidence_bridge");
    expect(cs[0]!.initialTrust).toBe("suggested");
    expect(cs[0]!.clientRef).toBe("ev_1");
    expect(cs[0]!.evidenceRefs).toEqual(["ssot_quote_42"]);
    expect(cs[0]!.sourceEventIds).toEqual(["evt_7"]);
  });

  it("(D-4) published → candidate", () => {
    const cs = buildBatchRememberCandidatesFromEvidence([evidence({ status: "published" })]);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.origin).toBe("evidence_bridge");
  });

  it("(D-5) draft and candidate statuses are ignored (not written)", () => {
    const cs = buildBatchRememberCandidatesFromEvidence([
      evidence({ id: "d1", status: "draft" }),
      evidence({ id: "c1", status: "candidate" }),
    ]);
    expect(cs).toEqual([]);
  });

  it("(D-6) approved item with no source refs is dropped", () => {
    const cs = buildBatchRememberCandidatesFromEvidence([
      evidence({ status: "approved", evidenceRefs: [], sourceEventIds: [] }),
    ]);
    expect(cs).toEqual([]);
  });

  it("(D-7) initialTrust never escalates to trusted/active", () => {
    const cs = buildBatchRememberCandidatesFromEvidence([evidence()]);
    for (const c of cs) {
      expect(["suggested", "candidate", "unverified"]).toContain(c.initialTrust);
      expect(c.input.trustLevel).toBe("limited");
    }
  });
});

describe("executeEvidenceBatchRemember — writer injection", () => {
  it("(D-8) writer missing → observed:false, no fake success", async () => {
    const res = await executeEvidenceBatchRemember({ items: [evidence()] });
    expect(res.observed).toBe(false);
    expect(res.writtenCount).toBe(0);
    expect(res.results[0]!.reason).toBe("local_writer_missing");
  });

  it("(D-9) writer present → real local write observed:true", async () => {
    const writer = makeWriter();
    const res = await executeEvidenceBatchRemember({ items: [evidence()], writer });
    expect(res.observed).toBe(true);
    expect(res.writtenCount).toBe(1);
    expect(writer.calls).toHaveLength(1);
    expect(res.results[0]!.writeStatus).toBe("written");
    expect(res.results[0]!.origin).toBe("evidence_bridge");
  });

  it("(D-10) draft items never reach the writer", async () => {
    const writer = makeWriter();
    const res = await executeEvidenceBatchRemember({
      items: [evidence({ id: "d1", status: "draft" })],
      writer,
    });
    expect(writer.calls).toHaveLength(0);
    expect(res.writtenCount).toBe(0);
  });

  it("(D-11) missing source refs → rejected, writer not called", async () => {
    const writer = makeWriter();
    const res = await executeEvidenceBatchRemember({
      items: [evidence({ evidenceRefs: [], sourceEventIds: [] })],
      writer,
    });
    expect(writer.calls).toHaveLength(0);
    // candidate dropped before batchRemember → nothing planned, no write
    expect(res.writtenCount).toBe(0);
    expect(res.observed).toBe(false);
  });

  it("(D-12) result carries NO trust/activation fields (no auto activation)", async () => {
    const writer = makeWriter();
    const res = await executeEvidenceBatchRemember({ items: [evidence()], writer });
    const r = res.results[0]! as Record<string, unknown>;
    expect(r.activationState).toBeUndefined();
    expect(r.trustLevel).toBeUndefined();
    expect(r.trustStatus).toBeUndefined();
    expect((res as Record<string, unknown>).activationState).toBeUndefined();
    expect((res as Record<string, unknown>).trustLevel).toBeUndefined();
  });

  it("(D-13) deterministic: same input → same derived ids and shape", async () => {
    const a = await executeEvidenceBatchRemember({ items: [evidence(), evidence({ id: "ev_2" })] });
    const b = await executeEvidenceBatchRemember({ items: [evidence(), evidence({ id: "ev_2" })] });
    expect(a.results.map((r) => r.derivedId)).toEqual(b.results.map((r) => r.derivedId));
    expect(a.results.map((r) => r.clientRef)).toEqual(b.results.map((r) => r.clientRef));
  });
});
