import { describe, expect, it } from "vitest";
import {
  backupStatusSchema,
  contextPackTierSchema,
  handoffTargetSurfaceSchema,
  reviewModeSchema,
  workModeSchema,
} from "./index.js";

// These are the OPERATOR-FACING MODE / TIER SELECTORS — the closed vocabularies
// that pick one operating point for a behavior switch (which workspace mode a
// session runs in, how deep a review is, how much context a pack carries, where a
// backup stands) and the handoff target surface. None were pinned. The FRESH
// authority angle here is SELECTOR INTEGRITY WITH NO IMPLICIT DEFAULT: each of
// these is a BARE z.enum (no `.default()`), so a caller cannot omit the choice and
// silently fall into some default mode — the selection is REQUIRED, and parsing
// `undefined` fails. (1) CLOSED VOCABS — workMode {conversation, debate, tmux},
// reviewMode {quick, deep}, contextPackTier {lite, standard, full}, backupStatus
// {pending, synced, failed}; an unknown member is rejected, so a switch can never
// land on an unmodelled mode. (2) NO SILENT DEFAULT — none resolve a value for a
// missing field; an absent selector is an error, not a fallback. (3) HANDOFF TARGET
// REUSES THE FULL WORK-SURFACE VOCAB — handoffTargetSurface is an alias of the
// eight-member work-surface vocabulary with NO narrowing, so a handoff may target
// any surface the OS knows (conversation … mobile), not a restricted subset. Enum
// members read back via `.options`.

describe("operator mode/tier selectors — closed vocabularies", () => {
  it("workMode admits exactly {conversation, debate, tmux}", () => {
    expect(workModeSchema.options).toEqual(["conversation", "debate", "tmux"]);
    expect(workModeSchema.safeParse("headless").success).toBe(false);
  });

  it("reviewMode admits exactly {quick, deep}", () => {
    expect(reviewModeSchema.options).toEqual(["quick", "deep"]);
    expect(reviewModeSchema.safeParse("thorough").success).toBe(false);
  });

  it("contextPackTier admits exactly {lite, standard, full}", () => {
    expect(contextPackTierSchema.options).toEqual(["lite", "standard", "full"]);
    expect(contextPackTierSchema.safeParse("max").success).toBe(false);
  });

  it("backupStatus admits exactly {pending, synced, failed}", () => {
    expect(backupStatusSchema.options).toEqual(["pending", "synced", "failed"]);
    expect(backupStatusSchema.safeParse("stale").success).toBe(false);
  });
});

describe("operator mode/tier selectors — no implicit default", () => {
  it("an absent selector is an error, not a silent fallback", () => {
    for (const schema of [workModeSchema, reviewModeSchema, contextPackTierSchema, backupStatusSchema]) {
      expect(schema.safeParse(undefined).success).toBe(false);
    }
  });
});

describe("handoffTargetSurface — reuses the full work-surface vocab with no narrowing", () => {
  it("targets any of the eight known surfaces", () => {
    expect(handoffTargetSurfaceSchema.options).toEqual([
      "conversation",
      "debate",
      "coding_packet",
      "execution_slot",
      "tmux",
      "obsidian",
      "notion",
      "mobile",
    ]);
    expect(handoffTargetSurfaceSchema.safeParse("email").success).toBe(false);
  });
});
