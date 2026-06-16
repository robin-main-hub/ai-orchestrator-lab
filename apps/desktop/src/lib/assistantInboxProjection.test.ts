import { describe, expect, it } from "vitest";
import {
  EVIDENCE_FIXTURE,
  buildAssistantInboxProps,
  projectEvidenceItems,
  projectLearningLoopItems,
  projectManifestEntries,
  projectMemoryCandidateItems,
  projectRunnerGateEvidence,
  projectRunnerGateStatus,
} from "./assistantInboxProjection";

describe("assistantInboxProjection — evidence", () => {
  it("projects only committed evidence (drops draft) with visible refs", () => {
    const items = projectEvidenceItems();
    // fixture has 2 committed (approved/published) + 1 draft → 2 projected.
    expect(items.length).toBe(2);
    expect(items.map((i) => i.id).sort()).toEqual(["evidence-001", "evidence-002"]);
    const e1 = items.find((i) => i.id === "evidence-001")!;
    expect(e1.observed).toBe(true);
    expect((e1.refs ?? []).length).toBeGreaterThan(0);
    expect(e1.verdict).toBe("pass");
    // published item surfaces as warning, not a fabricated pass.
    expect(items.find((i) => i.id === "evidence-002")!.verdict).toBe("warning");
  });

  it("uses neutral identifiers only (no domain terms)", () => {
    const blob = JSON.stringify(buildAssistantInboxProps()).toLowerCase();
    for (const banned of ["erp", "gio", "customer", "sales", "giolite", "서흥"]) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});

describe("assistantInboxProjection — learning loops", () => {
  it("derives verified and rejected (terminal) loops from the event fixture", () => {
    const loops = projectLearningLoopItems();
    const byId = new Map(loops.map((l) => [l.id, l]));
    expect(byId.get("loop-001")!.stage).toBe("verified");
    expect(byId.get("loop-002")!.stage).toBe("rejected");
  });
});

describe("assistantInboxProjection — memory candidates", () => {
  it("projects suggested/evidence_bridge candidates, observed:false (no writer)", () => {
    const memory = projectMemoryCandidateItems();
    expect(memory.length).toBe(2);
    for (const m of memory) {
      expect(m.status).toBe("suggested");
      expect(m.origin).toBe("evidence_bridge");
      expect(m.observed).toBe(false);
    }
  });
});

describe("assistantInboxProjection — runtime manifest", () => {
  it("splits loadable/blocked with honest reasons and an eval-warned entry", () => {
    const entries = projectManifestEntries();
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get("skill-001")!.loadable).toBe(true);
    expect(byId.get("skill-002")!.loadable).toBe(true);
    expect(byId.get("skill-002")!.evalWarned).toBe(true);
    expect(byId.get("skill-003")!.loadable).toBe(false);
    expect(byId.get("skill-003")!.reason).toBe("eval_failed");
    expect(byId.get("skill-004")!.loadable).toBe(false);
    expect(byId.get("skill-004")!.reason).toBe("quarantined");
  });
});

describe("assistantInboxProjection — runner gate (dgx disabled default)", () => {
  it("defaults dgx disabled → observed:false, no approve/enable, blocked read", () => {
    const status = projectRunnerGateStatus();
    expect(status.mode).toBe("dgx_disabled");
    expect(status.dgxExecutionEnabled).toBe(false);
    expect(status.observed).toBe(false);
    const ev = projectRunnerGateEvidence();
    // unobserved gate → blocked-style, never a fake pass.
    expect(ev.verdict).toBe("blocked");
    expect(ev.observed).toBe(false);
  });
});

describe("assistantInboxProjection — compose", () => {
  it("builds full inbox props with every card populated", () => {
    const props = buildAssistantInboxProps();
    expect(props.evidence.length).toBeGreaterThan(0);
    expect(props.learningLoops.length).toBe(2);
    expect(props.memoryCandidates.length).toBe(2);
    expect(props.manifestEntries.length).toBe(4);
    // runner gate fact is the first evidence row.
    expect(props.evidence[0]!.id.startsWith("runner-gate-")).toBe(true);
  });

  it("is pure across calls (deterministic) and EVIDENCE_FIXTURE is well-formed", () => {
    expect(JSON.stringify(buildAssistantInboxProps())).toBe(
      JSON.stringify(buildAssistantInboxProps()),
    );
    expect(EVIDENCE_FIXTURE.length).toBe(3);
  });
});
