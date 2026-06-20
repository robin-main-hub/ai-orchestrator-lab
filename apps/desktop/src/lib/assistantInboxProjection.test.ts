import { describe, expect, it } from "vitest";
import {
  EVIDENCE_FIXTURE,
  LEARNING_EVENT_FIXTURE,
  SKILL_CANDIDATE_FIXTURE,
  SKILL_ACTIVATION_FIXTURE,
  EVAL_REPORTS_FIXTURE,
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

// Characterization tests (no behavior change) for the three previously-unimported
// skill-runtime fixtures — SKILL_CANDIDATE_FIXTURE / SKILL_ACTIVATION_FIXTURE /
// EVAL_REPORTS_FIXTURE — that are the DEFAULT inputs to projectManifestEntries. The
// "runtime manifest" suite above pins projectManifestEntries()'s four OUTPUT rows, but
// it calls the function with no args and treats the fixtures as an opaque source: it
// never proves the fixtures form the self-consistent 3-way scaffolding those outcomes
// depend on. That scaffolding is load-bearing — the honest skill-loading gate only
// produces "loadable / eval-warned / blocked-eval_failed / quarantined" because each
// candidate is linked candidateId → activation → evalRunId → eval report, and each
// report's verdict matches. If a fixture drifted (an activation pointing at a missing
// run id, an orphan eval report, a verdict flipped pass↔fail) the default-args output
// test could still pass on a now-meaningless example or fail with a confusing message.
// We pin the wiring itself: 1:1 candidate↔activation, active activations resolve to a
// present report (and the report keyset is EXACTLY those run ids — no orphans), the lone
// quarantined activation carries a reason instead of an eval basis, each report's verdict
// is internally self-describing, and feeding the fixtures EXPLICITLY reproduces the
// default-args manifest (proving the defaults really are these fixtures, and the
// verdict→outcome mapping the gate encodes).
describe("skill runtime fixtures — manifest scaffolding self-consistency", () => {
  it("every candidate has exactly one activation, keyed 1:1 by candidateId", () => {
    const candidateIds = SKILL_CANDIDATE_FIXTURE.map((c) => c.id);
    const activationIds = SKILL_ACTIVATION_FIXTURE.map((a) => a.candidateId);
    expect(SKILL_ACTIVATION_FIXTURE.length).toBe(SKILL_CANDIDATE_FIXTURE.length);
    // no candidate left unactivated, no activation dangling to a missing candidate
    expect(activationIds.slice().sort()).toEqual(candidateIds.slice().sort());
    // 1:1 — each candidate activated at most once
    expect(new Set(activationIds).size).toBe(activationIds.length);
  });

  it("active activations resolve to a present eval report; the quarantined one carries a reason instead", () => {
    const active = SKILL_ACTIVATION_FIXTURE.filter((a) => a.activationStatus === "active");
    const quarantined = SKILL_ACTIVATION_FIXTURE.filter(
      (a) => a.activationStatus === "quarantined",
    );
    for (const a of active) {
      expect(a.evalRunId, a.candidateId).toBeTruthy();
      expect(EVAL_REPORTS_FIXTURE[a.evalRunId!], a.evalRunId).toBeTruthy();
    }
    // the report keyset is EXACTLY the active run ids — no orphan reports, no missing basis
    expect(Object.keys(EVAL_REPORTS_FIXTURE).slice().sort()).toEqual(
      active.map((a) => a.evalRunId!).slice().sort(),
    );
    // the single quarantined activation has no eval basis but an explicit reason
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]!.evalRunId).toBeUndefined();
    expect(quarantined[0]!.quarantinedReason).toBeTruthy();
  });

  it("each eval report is internally self-describing (verdict ⇄ recall/blockers/warnings)", () => {
    for (const [runId, report] of Object.entries(EVAL_REPORTS_FIXTURE)) {
      expect(report.evalCaseId).toBe(runId);
      if (report.verdict === "pass") {
        expect(report.recallAtK).toBe(1);
        expect(report.blockers).toEqual([]);
        expect(report.warnings).toEqual([]);
      } else if (report.verdict === "warning") {
        expect(report.warnings.length).toBeGreaterThan(0);
        expect(report.blockers).toEqual([]);
      } else {
        expect(report.verdict).toBe("fail");
        expect(report.blockers.length).toBeGreaterThan(0);
      }
    }
  });

  it("feeding the fixtures explicitly reproduces the default manifest (defaults ARE these fixtures)", () => {
    const explicit = projectManifestEntries({
      candidates: SKILL_CANDIDATE_FIXTURE,
      activations: SKILL_ACTIVATION_FIXTURE,
      evalReportsByRunId: EVAL_REPORTS_FIXTURE,
    });
    expect(explicit).toEqual(projectManifestEntries());
    // the verdict → outcome mapping the gate scaffolding encodes:
    const byId = new Map(explicit.map((e) => [e.id, e]));
    expect(byId.get("skill-001")).toMatchObject({ loadable: true, evalWarned: false }); // pass
    expect(byId.get("skill-002")).toMatchObject({ loadable: true, evalWarned: true }); // warning
    expect(byId.get("skill-003")).toMatchObject({ loadable: false, reason: "eval_failed" }); // fail
    expect(byId.get("skill-004")).toMatchObject({ loadable: false, reason: "quarantined" }); // quarantined
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
