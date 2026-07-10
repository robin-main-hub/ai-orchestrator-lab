// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useDialogFocus } from "./useDialogFocus";

// jsdom does not compute layout, so `offsetParent` is always null and the
// focus-trap's visibility filter would drop every element. Shim it to the
// parent node so attached focusables count as visible.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentNode;
    },
  });
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return null;
    },
  });
});

let rafSpy: { mockRestore: () => void } | undefined;

function stubRaf() {
  rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  }) as typeof window.requestAnimationFrame);
}

afterEach(() => {
  cleanup();
  rafSpy?.mockRestore();
  rafSpy = undefined;
});

function Harness({ open, onClose }: { open: boolean; onClose?: () => void }) {
  const { containerRef } = useDialogFocus<HTMLDivElement>({ open, onClose });
  return (
    <div>
      <button data-testid="trigger" type="button">
        열기
      </button>
      {open ? (
        <div ref={containerRef} data-testid="dialog" tabIndex={-1}>
          <button data-testid="first" type="button">
            첫
          </button>
          <button data-testid="mid" type="button">
            중
          </button>
          <button data-testid="last" type="button">
            끝
          </button>
        </div>
      ) : null}
    </div>
  );
}

describe("useDialogFocus", () => {
  it("moves focus to the first focusable element on open", () => {
    stubRaf();
    const { getByTestId, rerender } = render(<Harness open={false} />);
    act(() => getByTestId("trigger").focus());
    expect(document.activeElement).toBe(getByTestId("trigger"));
    act(() => rerender(<Harness open />));
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("calls onClose on Escape", () => {
    stubRaf();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab from the last element back to the first", () => {
    stubRaf();
    const { getByTestId } = render(<Harness open />);
    act(() => getByTestId("last").focus());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("wraps Shift+Tab from the first element back to the last", () => {
    stubRaf();
    const { getByTestId } = render(<Harness open />);
    act(() => getByTestId("first").focus());
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(getByTestId("last"));
  });

  it("restores focus to the trigger on close", () => {
    stubRaf();
    const { getByTestId, rerender } = render(<Harness open={false} />);
    const trigger = getByTestId("trigger");
    act(() => trigger.focus());
    act(() => rerender(<Harness open />));
    act(() => rerender(<Harness open={false} />));
    expect(document.activeElement).toBe(trigger);
  });
});
