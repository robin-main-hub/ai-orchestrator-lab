import { describe, expect, it } from "vitest";
import {
  COMPOSER_INPUT_DEFAULT_HEIGHT,
  COMPOSER_INPUT_MAX_HEIGHT,
  COMPOSER_INPUT_MIN_HEIGHT,
  clampComposerHeight,
  composerHeightAfterKey,
  composerHeightFromDrag,
  parseStoredComposerHeight,
} from "./composerResize";

describe("composerResize", () => {
  it("clamp는 min/max 범위로 묶고 반올림", () => {
    expect(clampComposerHeight(10)).toBe(COMPOSER_INPUT_MIN_HEIGHT);
    expect(clampComposerHeight(9999)).toBe(COMPOSER_INPUT_MAX_HEIGHT);
    expect(clampComposerHeight(120.6)).toBe(121);
    expect(clampComposerHeight(Number.NaN)).toBe(COMPOSER_INPUT_DEFAULT_HEIGHT);
  });

  it("저장값 파싱 — 없거나 잘못되면 기본값", () => {
    expect(parseStoredComposerHeight(null)).toBe(COMPOSER_INPUT_DEFAULT_HEIGHT);
    expect(parseStoredComposerHeight("abc")).toBe(COMPOSER_INPUT_DEFAULT_HEIGHT);
    expect(parseStoredComposerHeight("200")).toBe(200);
    expect(parseStoredComposerHeight("99999")).toBe(COMPOSER_INPUT_MAX_HEIGHT);
  });

  it("위로 드래그하면 입력창이 커지고, 아래로 드래그하면 작아진다", () => {
    // 시작 120px, 포인터를 40px 위로 → 160px
    expect(composerHeightFromDrag(120, 300, 260)).toBe(160);
    // 포인터를 30px 아래로 → 90px
    expect(composerHeightFromDrag(120, 300, 330)).toBe(90);
    // 범위 밖은 clamp
    expect(composerHeightFromDrag(60, 300, 600)).toBe(COMPOSER_INPUT_MIN_HEIGHT);
  });

  it("키보드 ↑ 키우고 ↓ 줄임, Shift면 더 크게, 무관 키는 undefined", () => {
    expect(composerHeightAfterKey(120, "ArrowUp", false)).toBe(136);
    expect(composerHeightAfterKey(120, "ArrowDown", false)).toBe(104);
    expect(composerHeightAfterKey(120, "ArrowUp", true)).toBe(168);
    expect(composerHeightAfterKey(120, "Enter", false)).toBeUndefined();
  });
});
