import { describe, expect, it } from "vitest";
import {
  projectPluginEvidenceCandidates,
  type PluginEvidence,
} from "./pluginEvidenceSource";

// projectPluginEvidenceCandidates is the generic-OS evidence-ingress seam: a
// plugin may DECLARE evidence, but this is explicitly NOT trusted memory — nothing
// becomes trusted/active automatically and nothing is written. It was never
// characterized. Four authority facts keep it honest: (1) VALIDATION GATE — an
// item is dropped unless it names a non-blank pluginId+sourceRef+title AND a
// trustHint inside the closed {untrusted,limited,suggested} set (a bad trust
// label can't sneak through). (2) APPROVAL GATE — only `approved`/`published`
// evidence becomes a candidate; `draft` or an absent approvalState yields nothing
// (unreviewed evidence never surfaces). (3) NEVER-AUTO-TRUSTED clamp — output is
// always status "suggested" + observed:false, and trust is clamped: "untrusted"
// is lifted to "limited" while limited/suggested pass through, but trust is NEVER
// escalated to a trusted/active tier the schema doesn't even name. (4) WRITE
// HONESTY — observed is always literally false and the note states "not written",
// so a candidate can never masquerade as written memory. Pure: no I/O / Date.now;
// fixtures self-consistent (id derived from each item's own pluginId/sourceRef).

function evidence(over: Partial<PluginEvidence> & { pluginId: string; sourceRef: string }): PluginEvidence {
  return {
    title: "a finding",
    trustHint: "limited",
    approvalState: "approved",
    ...over,
  };
}

describe("projectPluginEvidenceCandidates — validation + approval gates (untrusted ingress)", () => {
  it("drops items missing a non-blank pluginId/sourceRef/title or a known trustHint", () => {
    const items = [
      evidence({ pluginId: "p1", sourceRef: "ok" }), // kept
      evidence({ pluginId: "  ", sourceRef: "r" }), // blank pluginId → dropped
      evidence({ pluginId: "p1", sourceRef: "" }), // empty sourceRef → dropped
      evidence({ pluginId: "p1", sourceRef: "r2", title: "  " }), // blank title → dropped
      evidence({ pluginId: "p1", sourceRef: "r3", trustHint: "trusted" as unknown as PluginEvidence["trustHint"] }), // bad trust label → dropped
    ];
    const out = projectPluginEvidenceCandidates(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.sourceRef).toBe("ok");
  });

  it("only approved/published evidence qualifies — draft and absent approvalState yield nothing", () => {
    const items = [
      evidence({ pluginId: "p", sourceRef: "a", approvalState: "approved" }), // kept
      evidence({ pluginId: "p", sourceRef: "b", approvalState: "published" }), // kept
      evidence({ pluginId: "p", sourceRef: "c", approvalState: "draft" }), // dropped
      evidence({ pluginId: "p", sourceRef: "d", approvalState: undefined }), // dropped
    ];
    const out = projectPluginEvidenceCandidates(items);
    expect(out.map((c) => c.sourceRef)).toEqual(["a", "b"]);
  });

  it("defaults to [] when no items are passed (no fabricated evidence)", () => {
    expect(projectPluginEvidenceCandidates()).toEqual([]);
  });
});

describe("projectPluginEvidenceCandidates — never-auto-trusted clamp + write honesty", () => {
  it("clamps untrusted up to limited, passes limited/suggested through, never escalates", () => {
    const items = [
      evidence({ pluginId: "p", sourceRef: "u", trustHint: "untrusted" }),
      evidence({ pluginId: "p", sourceRef: "l", trustHint: "limited" }),
      evidence({ pluginId: "p", sourceRef: "s", trustHint: "suggested" }),
    ];
    const out = projectPluginEvidenceCandidates(items);
    expect(out.map((c) => c.trust)).toEqual(["limited", "limited", "suggested"]); // untrusted lifted, nothing reaches a trusted tier
  });

  it("every candidate is status 'suggested', observed:false, and marked not-written", () => {
    const [c] = projectPluginEvidenceCandidates([
      evidence({ pluginId: "px", sourceRef: "ref7", title: "T", summary: "s", trustHint: "suggested" }),
    ]);
    expect(c).toEqual({
      id: "px:ref7", // id derived from pluginId:sourceRef
      pluginId: "px",
      sourceRef: "ref7",
      title: "T",
      summary: "s",
      status: "suggested",
      observed: false, // honest: nothing is written
      trust: "suggested",
      note: "plugin evidence · suggested · not written (generic bridge only)",
    });
  });

  it("leaves summary undefined when the evidence omits it (no fabrication)", () => {
    const [c] = projectPluginEvidenceCandidates([evidence({ pluginId: "p", sourceRef: "r" })]);
    expect(c!.summary).toBeUndefined();
  });
});
