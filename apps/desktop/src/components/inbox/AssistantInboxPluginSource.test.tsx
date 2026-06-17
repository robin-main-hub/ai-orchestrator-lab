// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import type { WorkItemLiteProviderResult } from "../../lib/plugins/pluginWorkItemSource";
import type { PluginEvidence } from "../../lib/plugins/pluginEvidenceSource";

afterEach(() => cleanup());

// Batch 14 LINE D/E — the VISIBLE vertical slice: generic plugin sources actually
// SHOW in the Assistant Inbox (a "Plugin Sources" card with health, plugin
// WorkItemLite rows, and approved plugin evidence). Display-only, generic-only,
// no execution / import / network, and PREVIEW(example) never leaks into LIVE.

// Generic forbidden domain vocabulary — must appear in ZERO rendered text.
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

describe("Batch 14 — Plugin Sources visible slice (PREVIEW example fixtures)", () => {
  it("renders a Plugin Sources card with the example plugin sources + health", () => {
    render(<AssistantInboxContainer />); // no live → PREVIEW seat
    expect(screen.getByTestId("plugin-sources")).toBeTruthy();

    // an active+connected source shows, with its health badge.
    const connected = screen.getByTestId("plugin-source-example-plugin");
    expect(connected.getAttribute("data-status")).toBe("active");
    expect(connected.getAttribute("data-health")).toBe("connected");
    expect(
      screen.getByTestId("plugin-health-example-plugin").getAttribute("data-health"),
    ).toBe("connected");

    // an active-but-stale source still shows (health ≠ gate; status gates rows).
    const stale = screen.getByTestId("plugin-source-external-source");
    expect(stale.getAttribute("data-health")).toBe("stale");
  });

  it("shows plugin WorkItemLite rows carrying the plugin id + sourceRef + category", () => {
    render(<AssistantInboxContainer />);
    const row = screen.getByTestId("plugin-row-example-plugin-0");
    // row badge + sourceRef are visible, category projected.
    expect(row.textContent).toContain("plugin");
    expect(row.textContent).toContain("source-001");
    expect(row.querySelector("[data-category]")?.getAttribute("data-category")).toBe("project");
    // a second row from the same source renders too.
    expect(screen.getByTestId("plugin-row-example-plugin-1")).toBeTruthy();
  });

  it("a disabled provider is shown but contributes NO rows (honest, never executed)", () => {
    render(<AssistantInboxContainer />);
    const disabled = screen.getByTestId("plugin-source-disabled-plugin");
    expect(disabled.getAttribute("data-status")).toBe("disabled");
    // marked inactive, and none of its rows leak in.
    expect(screen.getByTestId("plugin-source-inactive-disabled-plugin")).toBeTruthy();
    expect(screen.queryByTestId("plugin-row-disabled-plugin-0")).toBeNull();
    expect(screen.queryByText("should not appear")).toBeNull();
  });

  it("only approved/published plugin evidence becomes a candidate; draft is dropped", () => {
    render(<AssistantInboxContainer />);
    expect(screen.getByTestId("plugin-evidence")).toBeTruthy();
    // exactly one candidate (approved) — the draft is not promoted.
    expect(screen.getByTestId("plugin-evidence-0")).toBeTruthy();
    expect(screen.queryByTestId("plugin-evidence-1")).toBeNull();
    // never auto-trusted: untrusted-source clamps to limited, never "trusted".
    const text = (screen.getByTestId("plugin-evidence").textContent ?? "").toLowerCase();
    expect(text.includes("trusted")).toBe(false);
    expect(screen.queryByText("draft evidence (not promoted)")).toBeNull();
  });

  it("the plugin surface is display-only: no buttons, no domain terms", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("plugin-sources");
    expect(card.querySelectorAll("button").length).toBe(0);
    // scan only the plugin card text — the rest of the inbox is guarded elsewhere
    // and a whole-container scan trips on innocent substrings (e.g. "gio" ⊂ "region").
    const text = (card.textContent ?? "").toLowerCase();
    for (const term of FORBIDDEN) {
      expect(text.includes(term)).toBe(false);
    }
  });
});

describe("Batch 14 — Plugin Sources LIVE seat (honest, no fixture leak)", () => {
  it("LIVE with no plugin input → NO plugin section (honest empty, never fixtures)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("plugin-sources")).toBeNull();
    // the PREVIEW example sources must NOT leak into a live seat.
    expect(screen.queryByTestId("plugin-source-example-plugin")).toBeNull();
  });

  it("LIVE renders ONLY the real plugin input that was provided", () => {
    const liveSource: WorkItemLiteProviderResult = {
      pluginId: "source-001",
      status: "active",
      health: "connected",
      generatedAt: "2026-06-17T11:00:00.000Z",
      rows: [
        {
          id: "source-001:wi-1",
          title: "live external row",
          category: "runner",
          status: "observed",
          source: "source-001",
          createdAt: "2026-06-17T10:45:00.000Z",
          observed: true,
          pluginId: "source-001",
          sourceRef: "entity-001",
        },
      ],
    };
    const liveEvidence: PluginEvidence = {
      pluginId: "source-001",
      sourceRef: "ev-live-1",
      title: "live verified evidence",
      trustHint: "limited",
      approvalState: "approved",
    };

    render(
      <AssistantInboxContainer
        live={{ pluginSources: [liveSource], pluginEvidence: [liveEvidence] }}
      />,
    );
    // the live source shows...
    expect(screen.getByTestId("plugin-source-source-001")).toBeTruthy();
    expect(screen.getByTestId("plugin-row-source-001-0").textContent).toContain("entity-001");
    // ...and the PREVIEW example fixtures do NOT.
    expect(screen.queryByTestId("plugin-source-example-plugin")).toBeNull();
    expect(screen.queryByTestId("plugin-source-external-source")).toBeNull();
    // live evidence candidate present.
    expect(screen.getByTestId("plugin-evidence-0")).toBeTruthy();
  });

  it("is read-only in live mode: no button, no callback fired on mount", () => {
    const spy = vi.fn();
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
          createdAt: "2026-06-17T10:45:00.000Z",
          observed: true,
          pluginId: "source-001",
          sourceRef: "entity-001",
        },
      ],
    };
    const { container } = render(
      <div onClick={spy}>
        <AssistantInboxContainer live={{ pluginSources: [liveSource] }} />
      </div>,
    );
    expect(screen.getByTestId("plugin-sources").querySelectorAll("button").length).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
