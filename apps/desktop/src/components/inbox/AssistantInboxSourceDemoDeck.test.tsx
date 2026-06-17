// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import type { WorkItemLiteProviderResult } from "../../lib/plugins/pluginWorkItemSource";

afterEach(() => cleanup());

// Batch 15 LINE C — PREVIEW-only demo deck. A radio-group (NOT buttons) scenario
// switch over generic external-source health states (mixed/healthy/stale/error/
// disabled). Fixture/demo only — must never leak into the LIVE seat.

const FORBIDDEN = [
  "erp",
  "gio",
  "example-domain",
  "customer",
  "sales",
  "quotation",
  "sample request",
  "buyer",
  "factory",
  "domestic",
];

const liveSource: WorkItemLiteProviderResult = {
  pluginId: "source-001",
  status: "active",
  health: "connected",
  rows: [
    {
      id: "source-001:wi-1",
      title: "live external row",
      category: "runner",
      status: "observed",
      source: "source-001",
      createdAt: "2026-06-18T08:45:00.000Z",
      observed: true,
      pluginId: "source-001",
      sourceRef: "entity-001",
    },
  ],
};

describe("Batch 15 LINE C — PREVIEW demo deck", () => {
  it("renders a 5-option radio deck in PREVIEW with zero buttons", () => {
    render(<AssistantInboxContainer />); // PREVIEW
    const deck = screen.getByTestId("source-demo-deck");
    expect(deck).toBeTruthy();
    for (const k of ["mixed", "healthy", "stale", "error", "disabled"]) {
      expect(screen.getByTestId(`source-demo-option-${k}`)).toBeTruthy();
    }
    // it is a radio group, not buttons
    assertNoSideEffectActionControls(deck);
    expect(deck.querySelectorAll('input[type="radio"]').length).toBe(5);
  });

  it("defaults to 'mixed' (the Batch 14 fixture) so existing PREVIEW stays intact", () => {
    render(<AssistantInboxContainer />);
    expect(screen.getByTestId("source-demo-option-mixed").getAttribute("data-active")).toBe("true");
    // mixed = example-plugin + external-source + disabled-plugin
    expect(screen.getByTestId("plugin-source-example-plugin")).toBeTruthy();
    expect(screen.getByTestId("plugin-source-disabled-plugin")).toBeTruthy();
  });

  it("selecting 'error' renders a source in error health", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("source-demo-option-error").querySelector("input")!);
    const errored = screen.getByTestId("plugin-source-external-source");
    expect(errored.getAttribute("data-health")).toBe("error");
    // error status is not active → no rows projected (honest)
    expect(screen.getByTestId("source-health-count-error").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("source-health-total-rows").getAttribute("data-count")).toBe("0");
  });

  it("selecting 'disabled' shows a disabled source with no rows", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("source-demo-option-disabled").querySelector("input")!);
    const disabled = screen.getByTestId("plugin-source-disabled-plugin");
    expect(disabled.getAttribute("data-status")).toBe("disabled");
    expect(screen.getByTestId("plugin-source-inactive-disabled-plugin")).toBeTruthy();
    expect(screen.queryByTestId("plugin-row-disabled-plugin-0")).toBeNull();
  });

  it("selecting 'healthy' shows two connected sources with rows", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("source-demo-option-healthy").querySelector("input")!);
    expect(screen.getByTestId("source-health-count-connected").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("source-health-total-rows").getAttribute("data-count")).toBe("3");
  });

  it("deck text carries no domain terms", () => {
    render(<AssistantInboxContainer />);
    const text = (screen.getByTestId("source-demo-deck").textContent ?? "").toLowerCase();
    for (const term of FORBIDDEN) {
      expect(text.includes(term)).toBe(false);
    }
  });
});

describe("Batch 15 LINE C — no preview→LIVE leak", () => {
  it("LIVE never renders the demo deck", () => {
    render(<AssistantInboxContainer live={{ pluginSources: [liveSource] }} />);
    expect(screen.queryByTestId("source-demo-deck")).toBeNull();
  });

  it("LIVE shows only real input, never scenario fixtures", () => {
    render(<AssistantInboxContainer live={{ pluginSources: [liveSource] }} />);
    expect(screen.getByTestId("plugin-source-source-001")).toBeTruthy();
    // example/scenario fixtures must not appear in a live seat
    expect(screen.queryByTestId("plugin-source-example-plugin")).toBeNull();
    expect(screen.queryByTestId("plugin-source-external-source")).toBeNull();
    expect(screen.queryByTestId("plugin-source-disabled-plugin")).toBeNull();
  });
});
