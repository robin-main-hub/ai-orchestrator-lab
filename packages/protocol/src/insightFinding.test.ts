import { describe, expect, it } from "vitest";
import {
  insightCategorySchema,
  insightFindingSchema,
  insightFindingStatusSchema,
} from "./index.js";

// insightFinding is the generic-OS "observation/finding" record an insight pass
// emits (a code-health/architecture/security note the operator triages). The
// composite and its two closed vocabularies were never directly pinned. Three
// authority facts protect it: (1) CATEGORY CLOSED VOCABULARY — exactly the six
// declared kinds, in order; an unknown category is rejected, so a finding can
// never be filed under an unspecced bucket. (2) STATUS CLOSED VOCABULARY —
// exactly {ok, watch, quick_win}; the triage state can never drift to an
// unenumerated value. (3) COMPOSITE INTEGRITY — insightFindingSchema requires
// all five fields, TRANSITIVELY rejects a finding whose nested category/status
// is bad (the embed is by-value, not a loose string), and being a plain
// z.object it STRIPS unknown keys (no smuggling extra fields through a finding).
// All expected values derive from each schema's own declared shape (no magic
// literals): the enum members are read back via `.options`.

const validFinding = {
  id: "find-1",
  category: "security",
  status: "watch",
  label: "secret in log",
  summary: "redact before shipping",
};

describe("insightCategory / insightFindingStatus — closed vocabularies", () => {
  it("category admits exactly the six declared kinds in order", () => {
    expect(insightCategorySchema.options).toEqual([
      "stability",
      "testing",
      "architecture",
      "performance",
      "security",
      "tech_debt",
    ]);
  });

  it("status admits exactly {ok, watch, quick_win} and rejects anything else", () => {
    expect(insightFindingStatusSchema.options).toEqual(["ok", "watch", "quick_win"]);
    expect(insightFindingStatusSchema.safeParse("blocked").success).toBe(false);
  });

  it("an unknown category is rejected (no unspecced bucket)", () => {
    expect(insightCategorySchema.safeParse("ux").success).toBe(false);
  });
});

describe("insightFindingSchema — composite integrity", () => {
  it("accepts a fully-formed finding", () => {
    expect(insightFindingSchema.safeParse(validFinding).success).toBe(true);
  });

  it("requires every field — a missing summary fails", () => {
    const { summary: _omit, ...withoutSummary } = validFinding;
    expect(insightFindingSchema.safeParse(withoutSummary).success).toBe(false);
  });

  it("transitively rejects a bad nested category or status (embed is by-value)", () => {
    expect(insightFindingSchema.safeParse({ ...validFinding, category: "bogus" }).success).toBe(false);
    expect(insightFindingSchema.safeParse({ ...validFinding, status: "done" }).success).toBe(false);
  });

  it("strips unknown keys — extra fields cannot be smuggled through a finding", () => {
    const parsed = insightFindingSchema.parse({ ...validFinding, severity: 9, internalFlag: true });
    expect(parsed).toEqual(validFinding); // no severity / internalFlag survived
  });
});
