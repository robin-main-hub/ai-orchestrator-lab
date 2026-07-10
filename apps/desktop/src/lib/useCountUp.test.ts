// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { prefersReducedMotion, useCountUp } from "./useCountUp";

function setMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("returns the target on the initial render", () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useCountUp(42));
    expect(result.current).toBe(42);
  });

  it("snaps straight to the new target under reduced motion", () => {
    setMatchMedia(true);
    const { result, rerender } = renderHook(({ t }) => useCountUp(t), {
      initialProps: { t: 10 },
    });
    expect(result.current).toBe(10);
    act(() => {
      rerender({ t: 200 });
    });
    expect(result.current).toBe(200);
  });

  it("animates to the new target when motion is allowed", () => {
    setMatchMedia(false);
    // rAF runs synchronously with a timestamp far past the duration so the
    // eased tick lands exactly on the target.
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        cb(1e9);
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { result, rerender } = renderHook(({ t }) => useCountUp(t), {
      initialProps: { t: 0 },
    });
    expect(result.current).toBe(0);
    act(() => {
      rerender({ t: 500 });
    });
    expect(result.current).toBe(500);
  });

  it("prefersReducedMotion reflects matchMedia", () => {
    setMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    setMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});
