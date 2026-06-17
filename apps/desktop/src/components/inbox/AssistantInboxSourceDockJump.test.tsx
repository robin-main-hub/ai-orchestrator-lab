// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { buildInboxPaletteCommands } from "../../lib/inboxPaletteCommands";
import type { WorkItemLiteProviderResult } from "../../lib/plugins/pluginWorkItemSource";

// jsdom has no scrollIntoView — stub it so the LINE D jump effect can run.
beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

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

describe("Batch 15 LINE D — Command Palette → Source Dock jump (builder)", () => {
  it("exposes a view-only 'Source Dock 열기' entry that dispatches focusSection", () => {
    const dispatch = vi.fn();
    const cmds = buildInboxPaletteCommands({ goInbox: vi.fn(), dispatch, applyView: vi.fn() });
    const entry = cmds.find((c) => c.id === "inbox.sourceDock");
    expect(entry).toBeTruthy();
    expect(entry!.label).toBe("Source Dock 열기");
    expect(entry!.hint).toContain("화면 이동만");
    entry!.run();
    expect(dispatch).toHaveBeenCalledWith("focusSection", "source-dock");
  });
});

describe("Batch 15 LINE D — jump scrolls/focuses the dock (view-only)", () => {
  it("scrolls the Source Dock into view on a focusSection command", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer command={{ kind: "focusSection", value: "source-dock", nonce: 1 }} />,
    );
    expect(spy).toHaveBeenCalled();
    // it stays in PREVIEW (jump never changes the seat): demo deck only shows in preview
    expect(screen.getByTestId("source-demo-deck")).toBeTruthy();
    // no new buttons introduced by the jump
    expect(screen.getByTestId("assistant-inbox").querySelectorAll("button").length).toBe(0);
  });

  it("is an honest no-op when the LIVE dock is empty (no dock, no scroll, no throw)", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer
        live={{}}
        command={{ kind: "focusSection", value: "source-dock", nonce: 1 }}
      />,
    );
    expect(screen.queryByTestId("plugin-sources")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("jumps to a real LIVE dock without changing mode or data", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer
        live={{ pluginSources: [liveSource] }}
        command={{ kind: "focusSection", value: "source-dock", nonce: 1 }}
      />,
    );
    expect(screen.getByTestId("plugin-source-source-001")).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    // LIVE seat: no demo deck, no fixture leak
    expect(screen.queryByTestId("source-demo-deck")).toBeNull();
    expect(screen.queryByTestId("plugin-source-example-plugin")).toBeNull();
  });
});
