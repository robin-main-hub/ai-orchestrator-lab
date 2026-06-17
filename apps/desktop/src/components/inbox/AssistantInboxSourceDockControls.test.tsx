// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

// Batch 16 LINE C — Source Dock quick controls: local-view filters over the dock.

describe("Batch 16 LINE C — Source Dock quick controls", () => {
  it("renders local-view controls when the dock has data", () => {
    render(<AssistantInboxContainer />); // PREVIEW mixed deck
    const ctl = screen.getByTestId("source-dock-controls");
    assertNoSideEffectActionControls(ctl);
    assertNoForbiddenActionText(ctl);
    for (const id of ["jump", "alerts", "sources", "evidence", "all"]) {
      expect(screen.getByTestId(`dock-ctl-${id}`).getAttribute("data-action-scope")).toBe(
        "local-view",
      );
    }
  });

  it("'alerts' hides connected sources, keeps stale/error", () => {
    render(<AssistantInboxContainer />); // mixed: example-plugin=connected, external-source=stale
    expect(screen.getByTestId("plugin-source-example-plugin")).toBeTruthy();
    fireEvent.click(screen.getByTestId("dock-ctl-alerts"));
    expect(screen.queryByTestId("plugin-source-example-plugin")).toBeNull(); // connected hidden
    expect(screen.getByTestId("plugin-source-external-source")).toBeTruthy(); // stale kept
  });

  it("'evidence' hides source rows; 'sources' hides evidence; 'all' restores", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("dock-ctl-evidence"));
    expect(screen.queryByTestId("plugin-source-example-plugin")).toBeNull();
    expect(screen.getByTestId("plugin-evidence")).toBeTruthy();

    fireEvent.click(screen.getByTestId("dock-ctl-sources"));
    expect(screen.getByTestId("plugin-source-example-plugin")).toBeTruthy();
    expect(screen.queryByTestId("plugin-evidence")).toBeNull();

    fireEvent.click(screen.getByTestId("dock-ctl-all"));
    expect(screen.getByTestId("plugin-source-example-plugin")).toBeTruthy();
    expect(screen.getByTestId("plugin-evidence")).toBeTruthy();
  });

  it("'jump' scrolls the dock and changes nothing else (view-only)", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("dock-ctl-jump"));
    expect(spy).toHaveBeenCalled();
    // still all sources visible (jump did not filter)
    expect(screen.getByTestId("plugin-source-example-plugin")).toBeTruthy();
  });

  it("the health strip still reflects the FULL set even when filtered (overview)", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("dock-ctl-alerts"));
    // overview counts unchanged: mixed has 1 connected even though it is now hidden from the list
    expect(screen.getByTestId("source-health-count-connected").getAttribute("data-count")).toBe("1");
  });

  it("no quick controls when the LIVE dock is empty", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("source-dock-controls")).toBeNull();
    expect(screen.queryByTestId("plugin-sources")).toBeNull();
  });
});
