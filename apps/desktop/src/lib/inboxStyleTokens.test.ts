import { describe, expect, it } from "vitest";
import {
  TONE,
  STYLE_TONES,
  toneClass,
  chipClass,
  pillClass,
  CHIP_BASE,
  PILL_BASE,
  EMPTY_STATE,
  SECTION_CARD,
  SECTION_HEADER,
} from "./inboxStyleTokens";

const FORBIDDEN = ["example-domain", "erp", "customer", "sales", "quotation", "buyer", "factory"];

describe("Batch 26 — shared inbox style tokens", () => {
  it("exposes the stable semantic tone scale", () => {
    expect(STYLE_TONES).toEqual(["good", "warn", "bad", "info", "neutral", "muted"]);
    for (const t of STYLE_TONES) {
      expect(typeof TONE[t]).toBe("string");
      expect(TONE[t].length).toBeGreaterThan(0);
      expect(toneClass(t)).toBe(TONE[t]);
    }
  });

  it("maps the three status tones to the emerald / amber / rose palette", () => {
    expect(TONE.good).toContain("emerald");
    expect(TONE.warn).toContain("amber");
    expect(TONE.bad).toContain("rose");
  });

  it("composes chip / pill classes from layout + tone", () => {
    expect(chipClass()).toBe(`${CHIP_BASE} ${TONE.neutral}`); // default neutral
    expect(chipClass("good")).toBe(`${CHIP_BASE} ${TONE.good}`);
    expect(pillClass()).toBe(`${PILL_BASE} ${TONE.muted}`); // default muted
    expect(pillClass("bad")).toBe(`${PILL_BASE} ${TONE.bad}`);
  });

  it("provides layout tokens for chips, empty states, and section shells", () => {
    for (const tok of [CHIP_BASE, PILL_BASE, EMPTY_STATE, SECTION_CARD, SECTION_HEADER]) {
      expect(typeof tok).toBe("string");
      expect(tok.length).toBeGreaterThan(0);
    }
    expect(EMPTY_STATE).toContain("border-dashed"); // ghost, not a card
  });

  it("carries no domain vocabulary (pure presentation)", () => {
    const blob = JSON.stringify({ TONE, CHIP_BASE, PILL_BASE, EMPTY_STATE, SECTION_CARD, SECTION_HEADER })
      .toLowerCase();
    for (const term of FORBIDDEN) expect(blob.includes(term)).toBe(false);
  });
});
