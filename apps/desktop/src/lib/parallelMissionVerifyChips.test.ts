import { describe, expect, it } from "vitest";
import { parseVerificationSteps } from "./autonomyRunForm";
import { emptyDraft } from "./parallelMissionBoard";
import {
  addCustom,
  customCommands,
  isPresetActive,
  parseVerificationChips,
  removeCommand,
  serializeVerificationChips,
  togglePreset,
} from "./autonomyVerificationChips";

/**
 * Locks the chip <-> field round-trip for the parallel-mission editor. Pure lib
 * (no DOM): the chip helpers only ever read/rewrite the canonical newline
 * `verificationStepsText`, so the mission payload shape stays unchanged.
 */

const roundTrips = (value: string): void => {
  expect(parseVerificationSteps(serializeVerificationChips(parseVerificationChips(value)))).toEqual(
    parseVerificationSteps(value),
  );
};

describe("parallel-mission verification chips", () => {
  it("seeds the same 3 presets the autonomy form uses", () => {
    const seed = emptyDraft().verificationStepsText;
    expect(isPresetActive(seed, "typecheck")).toBe(true);
    expect(isPresetActive(seed, "test")).toBe(true);
    expect(isPresetActive(seed, "build")).toBe(true);
    expect(isPresetActive(seed, "lint")).toBe(false);
    expect(customCommands(seed)).toEqual([]);
  });

  it("round-trips the seed and mixed preset/custom values losslessly", () => {
    roundTrips(emptyDraft().verificationStepsText);
    roundTrips("pnpm typecheck\npnpm lint\nnode scripts/smoke.mjs");
  });

  it("extracts only the custom (non-preset) commands", () => {
    const value = "pnpm typecheck\npnpm lint\nnode scripts/smoke.mjs";
    expect(customCommands(value)).toEqual(["node scripts/smoke.mjs"]);
  });

  it("togglePreset off-then-on returns to the same parsed set", () => {
    const seed = emptyDraft().verificationStepsText;
    const off = togglePreset(seed, "test");
    expect(isPresetActive(off, "test")).toBe(false);
    const back = togglePreset(off, "test");
    // togglePreset re-appends at the end, so compare as sets (order-independent).
    expect([...parseVerificationSteps(back)].sort()).toEqual([...parseVerificationSteps(seed)].sort());
    expect(isPresetActive(back, "test")).toBe(true);
  });

  it("addCustom then removeCommand returns to the original", () => {
    const seed = emptyDraft().verificationStepsText;
    const added = addCustom(seed, "node scripts/smoke.mjs");
    expect(customCommands(added)).toEqual(["node scripts/smoke.mjs"]);
    const removed = removeCommand(added, "node scripts/smoke.mjs");
    expect(parseVerificationSteps(removed)).toEqual(parseVerificationSteps(seed));
  });

  it("addCustom ignores duplicate and empty inputs", () => {
    const seed = emptyDraft().verificationStepsText;
    expect(parseVerificationSteps(addCustom(seed, "pnpm test"))).toEqual(parseVerificationSteps(seed));
    expect(parseVerificationSteps(addCustom(seed, "   "))).toEqual(parseVerificationSteps(seed));
    expect(parseVerificationSteps(addCustom(seed, ""))).toEqual(parseVerificationSteps(seed));
  });
});
