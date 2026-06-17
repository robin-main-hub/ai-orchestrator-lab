// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import type { WorkItemLiteProviderResult } from "../../lib/plugins/pluginWorkItemSource";

afterEach(() => cleanup());

// Batch 15 LINE A/B — Source Dock visual upgrade + at-a-glance health strip.
// The rename is visible-text + colour-tone only: every Batch 14 data-testid is
// preserved (verified by AssistantInboxPluginSource.test.tsx). Here we assert the
// new Source Dock language, per-health tone, row-count chips, and the honest
// health-count strip — all display-only (zero <button>, no domain terms).

const FORBIDDEN = [
  "erp",
  "gio",
  "giolite",
  "customer",
  "sales",
  "quotation",
  "sample request",
  "buyer",
  "factory",
  "domestic",
];

const liveSource = (over: Partial<WorkItemLiteProviderResult> = {}): WorkItemLiteProviderResult => ({
  pluginId: "source-001",
  status: "active",
  health: "connected",
  generatedAt: "2026-06-18T09:00:00.000Z",
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
  ...over,
});

describe("Batch 15 LINE A — Source Dock visual upgrade (PREVIEW)", () => {
  it("renders Source Dock / External Source Deck language (still generic)", () => {
    render(<AssistantInboxContainer />); // no live → PREVIEW
    const card = screen.getByTestId("plugin-sources");
    expect(card.textContent).toContain("Source Dock");
    expect(card.textContent).toContain("External Source Deck");
    // evidence block relabeled but testid kept
    expect(screen.getByTestId("plugin-evidence").textContent).toContain("Source Evidence");
  });

  it("gives each health state a distinct tone class without touching data-health", () => {
    render(<AssistantInboxContainer />);
    const connected = screen.getByTestId("plugin-health-example-plugin");
    const stale = screen.getByTestId("plugin-health-external-source");
    const disabled = screen.getByTestId("plugin-health-disabled-plugin");
    // data-health attribute is unchanged (tests downstream read it)
    expect(connected.getAttribute("data-health")).toBe("connected");
    expect(stale.getAttribute("data-health")).toBe("stale");
    expect(disabled.getAttribute("data-health")).toBe("disabled");
    // each carries a non-empty tone className, and tones differ by state
    expect(connected.className).not.toBe("");
    expect(connected.className).not.toBe(stale.className);
    expect(stale.className).not.toBe(disabled.className);
  });

  it("shows a per-source row-count chip equal to the projected active rows", () => {
    render(<AssistantInboxContainer />);
    // example-plugin (connected) projects 2 rows; disabled-plugin projects 0
    expect(
      screen.getByTestId("plugin-source-rowcount-example-plugin").getAttribute("data-count"),
    ).toBe("2");
    expect(
      screen.getByTestId("plugin-source-rowcount-disabled-plugin").getAttribute("data-count"),
    ).toBe("0");
  });
});

describe("Batch 15 LINE B — Source health at-a-glance strip", () => {
  it("PREVIEW shows honest example health counts (active-only row total)", () => {
    render(<AssistantInboxContainer />);
    expect(screen.getByTestId("source-health-strip")).toBeTruthy();
    expect(screen.getByTestId("source-health-count-connected").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("source-health-count-stale").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("source-health-count-disabled").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("source-health-count-error").getAttribute("data-count")).toBe("0");
    // example-plugin(2) + external-source(1) active rows; disabled-plugin excluded
    expect(screen.getByTestId("source-health-total-rows").getAttribute("data-count")).toBe("3");
    expect(
      screen.getByTestId("source-health-evidence-count").getAttribute("data-count"),
    ).toBe("1");
  });

  it("LIVE reflects only real input counts", () => {
    render(<AssistantInboxContainer live={{ pluginSources: [liveSource()] }} />);
    expect(screen.getByTestId("source-health-count-connected").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("source-health-count-stale").getAttribute("data-count")).toBe("0");
    expect(screen.getByTestId("source-health-total-rows").getAttribute("data-count")).toBe("1");
  });

  it("LIVE empty → no dock and no fabricated all-zero strip (honest empty)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("plugin-sources")).toBeNull();
    expect(screen.queryByTestId("source-health-strip")).toBeNull();
  });
});

describe("Batch 15 LINE A/B — still display-only + generic", () => {
  it("the Source Dock card has no buttons and no domain terms", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("plugin-sources");
    expect(card.querySelectorAll("button").length).toBe(0);
    const text = (card.textContent ?? "").toLowerCase();
    for (const term of FORBIDDEN) {
      expect(text.includes(term)).toBe(false);
    }
  });
});
