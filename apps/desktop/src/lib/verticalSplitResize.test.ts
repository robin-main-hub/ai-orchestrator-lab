import { describe, expect, it } from "vitest";
import {
  fractionAfterKey,
  fractionFromPointerY,
  parseStoredSplitFraction,
  VERTICAL_SPLIT_DEFAULT_FRACTION,
  VERTICAL_SPLIT_MAX_TOP_FRACTION,
  VERTICAL_SPLIT_MIN_TOP_FRACTION,
} from "./verticalSplitResize";

describe("verticalSplitResize", () => {
  it("parseStoredSplitFraction: null/undefined/NaN → 기본값", () => {
    expect(parseStoredSplitFraction(null)).toBe(VERTICAL_SPLIT_DEFAULT_FRACTION);
    expect(parseStoredSplitFraction(undefined)).toBe(VERTICAL_SPLIT_DEFAULT_FRACTION);
    expect(parseStoredSplitFraction("abc")).toBe(VERTICAL_SPLIT_DEFAULT_FRACTION);
  });

  it("parseStoredSplitFraction: 범위로 클램프", () => {
    expect(parseStoredSplitFraction("0.01")).toBe(VERTICAL_SPLIT_MIN_TOP_FRACTION);
    expect(parseStoredSplitFraction("0.99")).toBe(VERTICAL_SPLIT_MAX_TOP_FRACTION);
    expect(parseStoredSplitFraction("0.5")).toBe(0.5);
  });

  it("fractionFromPointerY: offset/height", () => {
    expect(fractionFromPointerY(100, 800, 500)).toBe(0.5); // (500-100)/800
  });

  it("fractionFromPointerY: min/max 클램프 + 0높이 방어", () => {
    expect(fractionFromPointerY(0, 1000, 50)).toBe(VERTICAL_SPLIT_MIN_TOP_FRACTION);
    expect(fractionFromPointerY(0, 1000, 900)).toBe(VERTICAL_SPLIT_MAX_TOP_FRACTION);
    expect(fractionFromPointerY(0, 0, 100)).toBe(VERTICAL_SPLIT_DEFAULT_FRACTION);
  });

  it("fractionAfterKey: 5% 기본, Shift 10%", () => {
    expect(fractionAfterKey(0.5, "ArrowUp", false)).toBeCloseTo(0.45);
    expect(fractionAfterKey(0.5, "ArrowDown", false)).toBeCloseTo(0.55);
    expect(fractionAfterKey(0.5, "ArrowUp", true)).toBeCloseTo(0.4);
    expect(fractionAfterKey(0.5, "ArrowDown", true)).toBeCloseTo(0.6);
  });

  it("fractionAfterKey: 결과 클램프 + 무관 키 undefined", () => {
    expect(fractionAfterKey(VERTICAL_SPLIT_MIN_TOP_FRACTION, "ArrowUp", true)).toBe(VERTICAL_SPLIT_MIN_TOP_FRACTION);
    expect(fractionAfterKey(VERTICAL_SPLIT_MAX_TOP_FRACTION, "ArrowDown", true)).toBe(VERTICAL_SPLIT_MAX_TOP_FRACTION);
    expect(fractionAfterKey(0.5, "Enter", false)).toBeUndefined();
  });
});
