import { describe, expect, it } from "vitest";
import { truthStatusSchema, type TruthStatus } from "./truthStatus.js";
import { truthStatusSchema as reExportedTruthStatusSchema } from "./productKernel.js";

// truthStatusSchema is the honesty-core enum of this project: a state may only
// be stamped "observed" when it was actually observed; "configured" is a
// derived/constructed value, "planned" is intended-but-not-yet-run, and
// "simulated" is theater that must never masquerade as observed. It is 0-ref
// across the whole test tree yet is the field type of 6+ schemas (productKernel
// cards, appWorkspace preview, scaffold/learningLoop/visualQa/...). A silent
// add/remove/rename of a member would shift the honesty model everywhere at
// once, so pin the exact membership and ordering as a tripwire. Expected values
// are read off the schema's own .options where possible (self-consistency), and
// the literal list is the documented contract, not magic.
describe("truthStatusSchema — honesty-core enum membership", () => {
  it("has exactly these four members in this order (observed, configured, planned, simulated)", () => {
    expect(truthStatusSchema.options).toEqual([
      "observed",
      "configured",
      "planned",
      "simulated",
    ]);
  });

  it("accepts every declared member and round-trips it unchanged", () => {
    for (const status of truthStatusSchema.options) {
      const parsed = truthStatusSchema.parse(status);
      expect(parsed).toBe(status);
    }
  });

  it("rejects junk, empty string, and wrong casing (no silent coercion to a real status)", () => {
    for (const junk of ["", "Observed", "OBSERVED", "running", "real", " observed", "observed "]) {
      expect(truthStatusSchema.safeParse(junk).success).toBe(false);
    }
    // non-string inputs are rejected too
    for (const junk of [null, undefined, 0, {}, ["observed"]]) {
      expect(truthStatusSchema.safeParse(junk).success).toBe(false);
    }
  });

  it("keeps 'simulated' and 'observed' as distinct members — simulation is never observation", () => {
    // both are valid members, but they are different literals: the schema can
    // never collapse theater into a real observation
    expect(truthStatusSchema.options).toContain("simulated");
    expect(truthStatusSchema.options).toContain("observed");
    const simulated: TruthStatus = "simulated";
    const observed: TruthStatus = "observed";
    expect(simulated).not.toBe(observed);
  });
});

// truthStatus.ts was split out of productKernel.ts to break an import cycle
// (sandboxErrorCard/confidenceSignal need only this enum; productKernel
// re-exports it for backward compatibility). Pin that the re-exported schema is
// the SAME schema object — a future refactor that accidentally forks it into a
// second, drifting copy would silently break the cycle-break contract.
describe("truthStatusSchema — productKernel backward-compat re-export", () => {
  it("productKernel re-exports the identical schema instance (not a forked copy)", () => {
    expect(reExportedTruthStatusSchema).toBe(truthStatusSchema);
  });

  it("the re-export accepts the same members and rejects the same junk", () => {
    expect(reExportedTruthStatusSchema.options).toEqual(truthStatusSchema.options);
    expect(reExportedTruthStatusSchema.safeParse("observed").success).toBe(true);
    expect(reExportedTruthStatusSchema.safeParse("simulated_observed").success).toBe(false);
  });
});
