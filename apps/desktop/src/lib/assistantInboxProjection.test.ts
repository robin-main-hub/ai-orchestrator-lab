import { describe, expect, it } from "vitest";
import {
  EVIDENCE_FIXTURE,
  LEARNING_EVENT_FIXTURE,
  buildAssistantInboxProps,
  buildAssistantInboxLiveProps,
  filterLearningEvents,
  projectEvidenceItems,
  projectLearningLoopItems,
  projectManifestEntries,
  projectMemoryCandidateItems,
  projectMemoryCandidatesFromProjectRecords,
  projectRunnerGateEvidence,
  projectRunnerGateStatus,
  summarizeLearningLive,
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

// Characterization tests (no behavior change) for the previously-unasserted projection
// summarizeLearningLive — the one-line live signal for the learning section. The learning
// loops block above pins projectLearningLoopItems' per-loop stage, but the count summary
// that buckets those same records was never asserted. Load-bearing contract:
//   - total === number of derived loop records;
//   - a record counts as "verified" when its stage is verified|distilled|consulted (the
//     three success terminals), "rejected" only for the rejected terminal, else "active";
//   - it runs filterLearningEvents internally, so non-learning noise never inflates total.
// Expected buckets are derived from projectLearningLoopItems over the SAME events so the
// summary stays self-consistent with the stages the card projection actually surfaces.
describe("summarizeLearningLive", () => {
  const bucketOf = (stage: string): "verified" | "rejected" | "active" =>
    stage === "rejected"
      ? "rejected"
      : stage === "verified" || stage === "distilled" || stage === "consulted"
        ? "verified"
        : "active";

  it("returns all-zero on empty input", () => {
    expect(summarizeLearningLive([])).toEqual({ total: 0, verified: 0, rejected: 0, active: 0 });
  });

  it("buckets each derived loop by stage, self-consistent with projectLearningLoopItems", () => {
    const loops = projectLearningLoopItems(LEARNING_EVENT_FIXTURE);
    const expected = { total: loops.length, verified: 0, rejected: 0, active: 0 };
    for (const loop of loops) expected[bucketOf(loop.stage)] += 1;

    expect(summarizeLearningLive(LEARNING_EVENT_FIXTURE)).toEqual(expected);
    // fixture sanity: one success terminal + one rejected terminal, none still active
    expect(summarizeLearningLive(LEARNING_EVENT_FIXTURE)).toEqual({
      total: 2,
      verified: 1,
      rejected: 1,
      active: 0,
    });
  });

  it("filters non-learning noise before counting (total tracks only learning loops)", () => {
    const noisy = [
      { type: "unrelated.event", payload: { foo: 1 } },
      ...LEARNING_EVENT_FIXTURE,
      { type: "another.noise", payload: null },
    ];
    expect(summarizeLearningLive(noisy)).toEqual(summarizeLearningLive(LEARNING_EVENT_FIXTURE));
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


describe("assistantInboxProjection — LINE H honest live vs empty", () => {
  it("fixture compose labels every section as example", () => {
    const props = buildAssistantInboxProps();
    expect(props.sources.evidence).toBe("example");
    expect(props.sources.learning).toBe("example");
    expect(props.sources.memory).toBe("example");
    expect(props.sources.manifest).toBe("example");
  });

  it("live compose with empty input → honest empty states (only runner gate live)", () => {
    const props = buildAssistantInboxLiveProps({});
    // runner gate is the single live evidence row.
    expect(props.evidence.length).toBe(1);
    expect(props.evidence[0]!.id.startsWith("runner-gate-")).toBe(true);
    expect(props.evidence[0]!.observed).toBe(false);
    expect(props.sources.evidence).toBe("live");
    // no live data for the rest → empty + honest source.
    expect(props.learningLoops.length).toBe(0);
    expect(props.memoryCandidates.length).toBe(0);
    expect(props.manifestEntries.length).toBe(0);
    expect(props.sources.learning).toBe("empty");
    expect(props.sources.memory).toBe("empty");
    expect(props.sources.manifest).toBe("empty");
  });

  it("live compose projects real learning events + project records as live", () => {
    const props = buildAssistantInboxLiveProps({
      learningEvents: LEARNING_EVENT_FIXTURE,
      projectRecords: [
        { missionId: "m-1", title: "real one" },
        { missionId: "m-2", title: "real two" },
      ],
    });
    expect(props.learningLoops.length).toBe(2);
    expect(props.sources.learning).toBe("live");
    expect(props.memoryCandidates.length).toBe(2);
    expect(props.sources.memory).toBe("live");
    // honest: project-record memory candidates are never auto-written.
    for (const m of props.memoryCandidates) {
      expect(m.status).toBe("suggested");
      expect(m.observed).toBe(false);
    }
  });

  it("filterLearningEvents drops non-learning events", () => {
    const mixed = [
      ...LEARNING_EVENT_FIXTURE,
      { type: "conversation.message.created", payload: {} },
      { type: "provider.completion.requested", payload: {} },
    ];
    const filtered = filterLearningEvents(mixed);
    expect(filtered.length).toBe(LEARNING_EVENT_FIXTURE.length);
  });

  it("includeEvidenceExample labels evidence section example (never live)", () => {
    const props = buildAssistantInboxLiveProps({ includeEvidenceExample: true });
    expect(props.sources.evidence).toBe("example");
    // example evidence rows are prefixed and distinct from the live gate row.
    expect(props.evidence.some((e) => e.id.startsWith("example-"))).toBe(true);
  });

  it("projectMemoryCandidatesFromProjectRecords is honest (suggested, not observed)", () => {
    const items = projectMemoryCandidatesFromProjectRecords([
      { missionId: "x", title: "t" },
    ]);
    expect(items.length).toBe(1);
    expect(items[0]!.status).toBe("suggested");
    expect(items[0]!.observed).toBe(false);
    expect(items[0]!.id).toBe("project-x");
  });
});
