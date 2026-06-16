import { describe, expect, it } from "vitest";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  parseStoredSidebarWidth,
  sidebarWidthAfterKey,
  sidebarWidthFromPointerX,
} from "./sidebarResize";

describe("sidebarResize", () => {
  it("clamp는 min/max 범위로 묶고 반올림", () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(300.6)).toBe(301);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("저장값 파싱 — 없거나 잘못되면 기본값(252)", () => {
    expect(parseStoredSidebarWidth(null)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(parseStoredSidebarWidth(undefined)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(parseStoredSidebarWidth("abc")).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(parseStoredSidebarWidth("300")).toBe(300);
    expect(parseStoredSidebarWidth("99999")).toBe(SIDEBAR_MAX_WIDTH);
    expect(parseStoredSidebarWidth("10")).toBe(SIDEBAR_MIN_WIDTH);
  });

  it("포인터 X → 폭 = clientX − containerLeft, 범위 clamp", () => {
    expect(sidebarWidthFromPointerX(100, 400)).toBe(300);
    expect(sidebarWidthFromPointerX(100, 150)).toBe(SIDEBAR_MIN_WIDTH); // 50 → min
    expect(sidebarWidthFromPointerX(100, 9999)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("키보드 → 키우고 ← 줄임, Shift면 더 크게, 무관 키는 undefined", () => {
    expect(sidebarWidthAfterKey(252, "ArrowRight", false)).toBe(268);
    expect(sidebarWidthAfterKey(252, "ArrowLeft", false)).toBe(236);
    expect(sidebarWidthAfterKey(252, "ArrowRight", true)).toBe(300);
    expect(sidebarWidthAfterKey(252, "ArrowLeft", true)).toBe(204);
    expect(sidebarWidthAfterKey(252, "Enter", false)).toBeUndefined();
  });
});
