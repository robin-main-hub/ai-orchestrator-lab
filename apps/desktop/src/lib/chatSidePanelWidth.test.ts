import { describe, expect, it } from "vitest";
import {
  CHAT_SIDE_PANEL_DEFAULT_WIDTH_PX,
  CHAT_SIDE_PANEL_MAX_WIDTH_PX,
  CHAT_SIDE_PANEL_MIN_WIDTH_PX,
  clampPanelWidth,
  panelWidthAfterKey,
  panelWidthFromPointerX,
  parseStoredPanelWidth,
} from "./chatSidePanelWidth";

describe("chatSidePanelWidth", () => {
  it("clamp는 min/max 안으로 반올림", () => {
    expect(clampPanelWidth(100)).toBe(CHAT_SIDE_PANEL_MIN_WIDTH_PX);
    expect(clampPanelWidth(9999)).toBe(CHAT_SIDE_PANEL_MAX_WIDTH_PX);
    expect(clampPanelWidth(360.6)).toBe(361);
  });

  it("저장값 파싱 — 숫자 문자열 허용, 쓰레기는 기본값", () => {
    expect(parseStoredPanelWidth("420")).toBe(420);
    expect(parseStoredPanelWidth(300)).toBe(300);
    expect(parseStoredPanelWidth("NaN")).toBe(CHAT_SIDE_PANEL_DEFAULT_WIDTH_PX);
    expect(parseStoredPanelWidth(null)).toBe(CHAT_SIDE_PANEL_DEFAULT_WIDTH_PX);
    expect(parseStoredPanelWidth(undefined)).toBe(CHAT_SIDE_PANEL_DEFAULT_WIDTH_PX);
    expect(parseStoredPanelWidth(50)).toBe(CHAT_SIDE_PANEL_MIN_WIDTH_PX);
  });

  it("포인터 드래그 — 패널 우측 변 기준, 왼쪽으로 끌수록 넓어짐", () => {
    expect(panelWidthFromPointerX(1400, 1040)).toBe(360);
    expect(panelWidthFromPointerX(1400, 900)).toBe(500);
    expect(panelWidthFromPointerX(1400, 1395)).toBe(CHAT_SIDE_PANEL_MIN_WIDTH_PX);
    expect(panelWidthFromPointerX(1400, 0)).toBe(CHAT_SIDE_PANEL_MAX_WIDTH_PX);
  });

  it("키보드 — ArrowLeft 넓게 / ArrowRight 좁게 / Shift 큰 걸음 / Home·End", () => {
    expect(panelWidthAfterKey(360, "ArrowLeft", false)).toBe(384);
    expect(panelWidthAfterKey(360, "ArrowLeft", true)).toBe(408);
    expect(panelWidthAfterKey(360, "ArrowRight", false)).toBe(336);
    expect(panelWidthAfterKey(360, "Home", false)).toBe(CHAT_SIDE_PANEL_MIN_WIDTH_PX);
    expect(panelWidthAfterKey(360, "End", false)).toBe(CHAT_SIDE_PANEL_MAX_WIDTH_PX);
    expect(panelWidthAfterKey(360, "Enter", false)).toBeUndefined();
  });
});
