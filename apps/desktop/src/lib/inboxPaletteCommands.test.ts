import { describe, expect, it, vi } from "vitest";
import { buildInboxPaletteCommands } from "./inboxPaletteCommands";

describe("Batch 12 — LINE A: inbox Command Palette builder (view-only)", () => {
  const handlers = () => ({ goInbox: vi.fn(), dispatch: vi.fn() });
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
    ]);
  });

  it("labels carry no side-effect action words", () => {
    const blob = JSON.stringify(buildInboxPaletteCommands(handlers())).toLowerCase();
    for (const banned of ["approve", "send", "dispatch", "run tool", "apply ", "write"]) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});
