import { describe, expect, it } from "vitest";
import { evidenceKindSchema, missingInfoSlotSchema } from "./index.js";

// evidenceKindSchema is the closed taxonomy of WHAT KIND of provenance backs an
// OS claim, and missingInfoSlotSchema is the OS's explicit KNOWN-UNKNOWN LEDGER —
// one row per gap the assistant is still missing before it can act. Neither is
// pinned for what THIS test pins: index.test.ts only exercises evidenceRef's
// `.strict()` raw-body rejection and uses just 2 of the 8 evidence kinds, and only
// ever builds a missingInfo slot at status "missing"/required:true. The FRESH
// authority angle here is PROVENANCE TAXONOMY + GAP-LEDGER LIFECYCLE. (1) TYPED
// EVIDENCE — evidenceKind is exactly the eight provenance kinds (event / memory /
// ssot_reference / file_reference / url_reference / message / artifact /
// routine_reference); an unknown kind is rejected, so a claim can never cite a
// provenance type outside the declared taxonomy. (2) A GAP IS AN EXPLICIT ROW, NOT
// AN OMISSION — a missingInfoSlot carries id/label/reason/required + a tri-state
// status {missing, provided, waived}; `required` is a real boolean so both blocking
// and non-blocking gaps are modelled, and a REQUIRED gap can be deliberately
// `waived` (set aside on the record) rather than silently dropped. (3) RESOLUTION
// IS A BACK-POINTER — resolvedByRef is optional; a `provided` slot can name the
// evidence ref that filled it, while an unresolved slot simply omits it (absent,
// not nulled). (4) PLAIN-OBJECT STRIP — being a plain z.object (unlike the
// `.strict()` evidenceRef), the slot strips an unknown key rather than rejecting.
// Enum members read back via `.options`.

const slot = {
  id: "missing_lead_time",
  label: "Lead time",
  reason: "Required before external send",
  required: true,
  status: "missing",
};

describe("evidenceKind — closed provenance taxonomy", () => {
  it("admits exactly the eight provenance kinds", () => {
    expect(evidenceKindSchema.options).toEqual([
      "event",
      "memory",
      "ssot_reference",
      "file_reference",
      "url_reference",
      "message",
      "artifact",
      "routine_reference",
    ]);
    expect(evidenceKindSchema.safeParse("screenshot").success).toBe(false);
  });
});

describe("missingInfoSlot — explicit known-unknown ledger row", () => {
  it("accepts a minimal blocking gap", () => {
    expect(missingInfoSlotSchema.safeParse(slot).success).toBe(true);
  });

  it("requires the core fields — a missing reason fails", () => {
    const { reason: _omit, ...without } = slot;
    expect(missingInfoSlotSchema.safeParse(without).success).toBe(false);
  });

  it("models both blocking and non-blocking gaps (required is a real boolean)", () => {
    expect(missingInfoSlotSchema.safeParse({ ...slot, required: true }).success).toBe(true);
    expect(missingInfoSlotSchema.safeParse({ ...slot, required: false }).success).toBe(true);
  });
});

describe("missingInfoSlot — tri-state lifecycle with back-pointer resolution", () => {
  it("status is exactly {missing, provided, waived}", () => {
    for (const status of ["missing", "provided", "waived"]) {
      expect(missingInfoSlotSchema.safeParse({ ...slot, status }).success).toBe(true);
    }
    expect(missingInfoSlotSchema.safeParse({ ...slot, status: "skipped" }).success).toBe(false);
  });

  it("lets a REQUIRED gap be deliberately waived (set aside on the record, not silently dropped)", () => {
    expect(missingInfoSlotSchema.safeParse({ ...slot, required: true, status: "waived" }).success).toBe(true);
  });

  it("a provided slot can back-point to the evidence that filled it; an unresolved slot omits it", () => {
    const provided = missingInfoSlotSchema.parse({
      ...slot,
      status: "provided",
      resolvedByRef: "evidence_event_1",
    });
    expect(provided.resolvedByRef).toBe("evidence_event_1");
    const unresolved = missingInfoSlotSchema.parse(slot);
    expect("resolvedByRef" in unresolved).toBe(false); // absent, not nulled
  });
});

describe("missingInfoSlot — plain-object strip (unlike the strict evidenceRef)", () => {
  it("strips an unknown key rather than rejecting it", () => {
    const parsed = missingInfoSlotSchema.parse({ ...slot, forgedPriority: 99 });
    expect("forgedPriority" in parsed).toBe(false);
  });
});
