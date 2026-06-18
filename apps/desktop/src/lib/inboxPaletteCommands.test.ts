import { describe, expect, it, vi } from "vitest";
import { buildInboxPaletteCommands } from "./inboxPaletteCommands";

describe("Batch 12 — LINE A: inbox Command Palette builder (view-only)", () => {
  const handlers = () => ({ goInbox: vi.fn(), dispatch: vi.fn(), applyView: vi.fn() });
  const sampleView = {
    id: "my-desk",
    name: "My Desk",
    mode: "preview" as const,
    focus: "today" as const,
    category: "runner" as const,
    search: "gate",
  };
  const byId = (cmds: ReturnType<typeof buildInboxPaletteCommands>, id: string) =>
    cmds.find((c) => c.id === id)!;

  it("each entry dispatches the right view command (no side effects)", () => {
    const h = handlers();
    const cmds = buildInboxPaletteCommands(h);

    byId(cmds, "inbox.goto").run();
    expect(h.goInbox).toHaveBeenCalledTimes(1);
    expect(h.dispatch).not.toHaveBeenCalled();

    byId(cmds, "inbox.live").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("mode", "live");
    byId(cmds, "inbox.preview").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("mode", "preview");
    byId(cmds, "inbox.replay").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("mode", "replay");
    byId(cmds, "inbox.blocked").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("focus", "blocked");
    byId(cmds, "inbox.runner").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("category", "runner");
    byId(cmds, "inbox.failures").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("category", "failure");
    byId(cmds, "inbox.clear").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("clear");

    // Batch 25 LINE J — new local-view jumps (focusSection / seat switch only)
    byId(cmds, "inbox.sourceDock").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("focusSection", "source-dock");
    byId(cmds, "inbox.patchCandidates").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("focusSection", "patch-candidates");
    byId(cmds, "inbox.workItemCandidates").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("focusSection", "work-item-candidates");
    byId(cmds, "inbox.operatorConsole").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("focusSection", "operator-console");
    byId(cmds, "inbox.evidenceDraft").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("focusSection", "evidence-draft");
    byId(cmds, "inbox.sandbox").run();
    expect(h.dispatch).toHaveBeenLastCalledWith("mode", "sandbox");
  });

  it("covers the required command set with stable ids", () => {
    const ids = buildInboxPaletteCommands(handlers()).map((c) => c.id);
    expect(ids).toEqual([
      "inbox.goto",
      "inbox.live",
      "inbox.preview",
      "inbox.replay",
      "inbox.blocked",
      "inbox.runner",
      "inbox.failures",
      "inbox.clear",
      "inbox.sourceDock",
      "inbox.patchCandidates",
      "inbox.workItemCandidates",
      "inbox.operatorConsole",
      "inbox.sandbox",
      "inbox.evidenceDraft",
    ]);
  });

  it("appends a view-only command per user saved view (Batch 12 LINE D)", () => {
    const h = handlers();
    const cmds = buildInboxPaletteCommands(h, [sampleView]);
    const entry = cmds.find((c) => c.id === "inbox.view.my-desk")!;
    expect(entry.label).toContain("My Desk");
    entry.run();
    expect(h.applyView).toHaveBeenCalledWith(sampleView);
    // no user views → only the base set
    expect(buildInboxPaletteCommands(h).some((c) => c.id.startsWith("inbox.view."))).toBe(false);
  });

  it("labels carry no side-effect action words (incl. the new Batch 25 jumps)", () => {
    const cmds = buildInboxPaletteCommands(handlers(), [sampleView]);
    const blob = JSON.stringify(cmds).toLowerCase();
    for (const banned of [
      "approve",
      "send",
      "dispatch",
      "run tool",
      "apply ",
      "write",
      "execute",
      "commit",
      "sync",
      "refresh",
    ]) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});
