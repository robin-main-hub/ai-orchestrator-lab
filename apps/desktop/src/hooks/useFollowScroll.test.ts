// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { computeFollowState, useFollowScroll } from "./useFollowScroll";

afterEach(() => cleanup());

describe("computeFollowState", () => {
  it("is at bottom when the distance is zero", () => {
    expect(computeFollowState({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 })).toEqual({
      distanceFromBottom: 0,
      isAtBottom: true,
    });
  });

  it("is not at bottom beyond the default threshold", () => {
    const state = computeFollowState({ scrollTop: 600, scrollHeight: 1000, clientHeight: 300 });
    expect(state.distanceFromBottom).toBe(100);
    expect(state.isAtBottom).toBe(false);
  });

  it("is at bottom within the default threshold (distance 50)", () => {
    const state = computeFollowState({ scrollTop: 650, scrollHeight: 1000, clientHeight: 300 });
    expect(state.distanceFromBottom).toBe(50);
    expect(state.isAtBottom).toBe(true);
  });

  it("honors a custom threshold", () => {
    const state = computeFollowState({
      scrollTop: 600,
      scrollHeight: 1000,
      clientHeight: 300,
      threshold: 120,
    });
    expect(state.isAtBottom).toBe(true);
  });
});

describe("useFollowScroll", () => {
  it("starts pinned, unpins on scroll-up, and re-pins on jumpToLatest", () => {
    const { result } = renderHook(() => useFollowScroll<HTMLDivElement>([0]));
    expect(result.current.isPinned).toBe(true);
    expect(result.current.showJumpToLatest).toBe(false);

    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
    el.scrollTop = 0; // distance 700 -> not at bottom
    result.current.scrollRef.current = el;

    act(() => {
      result.current.handleScroll();
    });
    expect(result.current.isPinned).toBe(false);
    expect(result.current.showJumpToLatest).toBe(true);

    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as unknown as typeof el.scrollTo;
    act(() => {
      result.current.jumpToLatest();
    });
    expect(scrollTo).toHaveBeenCalled();
    expect(result.current.isPinned).toBe(true);
    expect(result.current.showJumpToLatest).toBe(false);
  });
});
