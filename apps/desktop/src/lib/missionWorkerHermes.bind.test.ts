import { describe, expect, it } from "vitest";
import type { PersonaContinuitySpec } from "@ai-orchestrator/protocol";
import { bindContinuityToHermesSlot } from "./missionWorkerHermes";
import type { HermesSlot } from "./hermesSlotPool";

// Characterization tests (no behavior change) for bindContinuityToHermesSlot, the
// only export in missionWorkerHermes.ts the existing missionWorkerHermes.test.ts
// leaves unasserted (that suite drives createPersonaContinuityFromHermesSlot and
// reserveHermesSlotForMissionWorker — both of which compose this binder — but never
// pins the binder head-on: it only ever exercises a BOUND slot, so the spare→sticky
// false arm, the needsReset=false restore-policy PASSTHROUGH arm, and the
// outside-`hermes` immutability are all uncovered).
//
// bindContinuityToHermesSlot is the bridge that re-points the product-kernel
// continuity contract (static "hermes:<slug>" slotId) at a concrete runtime pool
// slot. The load-bearing mapping: slotId ← slot.id; sticky ← (slot.status ===
// "bound"); restorePolicy ← needsReset ? "summary_only" : <input policy>; and
// EVERYTHING ELSE — every field outside `hermes`, plus the non-overridden hermes
// fields (memoryScope, promotionPolicy) — passes through unchanged, with the input
// spec left unmutated (the function returns a fresh, spread copy).

function continuity(): PersonaContinuitySpec {
  return {
    agentId: "agent_kurumi",
    personaSlug: "kurumi",
    displayName: "Kurumi",
    role: "builder",
    soulMode: "full",
    configSource: "markdown",
    identityFiles: [{ kind: "SOUL", path: "agents/kurumi/SOUL.md", required: true, truthStatus: "configured" }],
    hermes: {
      slotId: "hermes:kurumi", // the static contract id, to be re-pointed
      sticky: false,
      memoryScope: "persona:kurumi",
      restorePolicy: "always_restore",
      promotionPolicy: "curator_required",
    },
    voice: {
      preserveCharacterVoice: true,
      allowSpeechQuirks: true,
      allowEmotionalColor: true,
      forbiddenSuppressionReasons: [],
      safetyOverrideNote: "",
    },
  };
}

describe("bindContinuityToHermesSlot", () => {
  it("re-points the static slotId at a bound slot, marks it sticky, and PRESERVES restorePolicy when no reset is needed", () => {
    const slot: HermesSlot = { id: "hermes-07", status: "bound", persona: "kurumi", needsReset: false };
    const bound = bindContinuityToHermesSlot(continuity(), slot);

    expect(bound.hermes.slotId).toBe("hermes-07"); // not "hermes:kurumi"
    expect(bound.hermes.sticky).toBe(true);
    // needsReset === false → the input continuity's own restore policy survives
    expect(bound.hermes.restorePolicy).toBe("always_restore");
  });

  it("marks a spare slot as NOT sticky", () => {
    const slot: HermesSlot = { id: "hermes-11", status: "spare", needsReset: false };
    const bound = bindContinuityToHermesSlot(continuity(), slot);
    expect(bound.hermes.slotId).toBe("hermes-11");
    expect(bound.hermes.sticky).toBe(false);
  });

  it("downgrades restorePolicy to summary_only for a recycled (needsReset) slot, overriding the input policy", () => {
    const slot: HermesSlot = { id: "hermes-05", status: "bound", persona: "kurumi", needsReset: true };
    const bound = bindContinuityToHermesSlot(continuity(), slot);
    // even though the input asked for "always_restore", a recycled slot inherits nothing
    expect(bound.hermes.restorePolicy).toBe("summary_only");
  });

  it("passes through every field outside the three overridden hermes keys, and does not mutate the input", () => {
    const input = continuity();
    const snapshot = structuredClone(input);
    const slot: HermesSlot = { id: "hermes-09", status: "bound", persona: "kurumi", needsReset: false };
    const bound = bindContinuityToHermesSlot(input, slot);

    // non-hermes fields preserved verbatim
    expect(bound.agentId).toBe(input.agentId);
    expect(bound.personaSlug).toBe(input.personaSlug);
    expect(bound.displayName).toBe(input.displayName);
    expect(bound.role).toBe(input.role);
    expect(bound.soulMode).toBe(input.soulMode);
    expect(bound.configSource).toBe(input.configSource);
    expect(bound.identityFiles).toEqual(input.identityFiles);
    expect(bound.voice).toEqual(input.voice);
    // non-overridden hermes fields preserved
    expect(bound.hermes.memoryScope).toBe(input.hermes.memoryScope);
    expect(bound.hermes.promotionPolicy).toBe(input.hermes.promotionPolicy);
    // the binder returns a fresh copy — the source spec is untouched
    expect(input).toEqual(snapshot);
    expect(bound).not.toBe(input);
    expect(bound.hermes).not.toBe(input.hermes);
  });
});
