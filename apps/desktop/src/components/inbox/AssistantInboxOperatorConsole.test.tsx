// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";
import type { WorkItemLiteProviderResult } from "../../lib/plugins/pluginWorkItemSource";

afterEach(() => cleanup());

// Batch 16 LINE A — Operator Console header: a 3-second read of the OS desk
// state. All derived from props already on screen — no server call, no write.

const liveSource = (over: Partial<WorkItemLiteProviderResult> = {}): WorkItemLiteProviderResult => ({
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
  ...over,
});

describe("Batch 16 LINE A — Operator Console header", () => {
  it("shows seat + active view + filter summary (PREVIEW default = My Desk / none)", () => {
    render(<AssistantInboxContainer />);
    const strip = screen.getByTestId("assistant-inbox-status-strip");
    expect(strip.getAttribute("data-mode")).toBe("preview");
    expect(screen.getByTestId("assistant-inbox-stat-view").textContent).toContain("My Desk");
    expect(screen.getByTestId("assistant-inbox-stat-filter").textContent).toContain("none");
  });

  it("shows source health counts when sources are present (PREVIEW mixed deck)", () => {
    render(<AssistantInboxContainer />);
    // mixed deck: 1 connected, 1 stale, 0 error
    expect(screen.getByTestId("assistant-inbox-stat-src-connected").textContent).toContain("1");
    expect(screen.getByTestId("assistant-inbox-stat-src-stale").textContent).toContain("1");
    expect(screen.getByTestId("assistant-inbox-stat-src-error").textContent).toContain("0");
  });

  it("reflects real LIVE source health + replay count", () => {
    render(
      <AssistantInboxContainer
        live={{ pluginSources: [liveSource()], recentEvents: [
          { id: "e1", type: "x", createdAt: "2026-06-18T09:00:00.000Z" },
          { id: "e2", type: "y", createdAt: "2026-06-18T09:01:00.000Z" },
        ], nowMs: 1750000000000 }}
      />,
    );
    expect(screen.getByTestId("assistant-inbox-stat-src-connected").textContent).toContain("1");
    expect(screen.getByTestId("assistant-inbox-stat-replay").textContent).toContain("2");
  });

  it("LIVE empty → no source-health chips (honest, nothing fabricated)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("assistant-inbox-stat-src-connected")).toBeNull();
    // seat + view chips still render
    expect(screen.getByTestId("assistant-inbox-status-strip").getAttribute("data-mode")).toBe("live");
  });

  it("the console header is display-only (no side-effect controls, no action text)", () => {
    render(<AssistantInboxContainer />);
    const strip = screen.getByTestId("assistant-inbox-status-strip");
    assertNoSideEffectActionControls(strip);
    assertNoForbiddenActionText(strip);
  });
});
