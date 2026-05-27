import { describe, expect, it } from "vitest";
import { getConversationShellVisibility } from "./conversationShellVisibility";

describe("getConversationShellVisibility", () => {
  it("hides non-v0 shell surfaces by default in conversation mode", () => {
    expect(
      getConversationShellVisibility({
        configLibraryActive: false,
        mode: "conversation",
      }),
    ).toEqual({
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: false,
      showTerminalDock: false,
      showToolbarActions: false,
      showWorkItemHandoffPanel: false,
    });
  });

  it("keeps supporting shell surfaces available outside the focused conversation screen", () => {
    expect(
      getConversationShellVisibility({
        configLibraryActive: false,
        mode: "debate",
      }),
    ).toMatchObject({
      showCodingPacketPanel: true,
      showEvolveMementoPanel: true,
      showLeftRail: true,
      showTerminalDock: true,
      showToolbarActions: true,
      showWorkItemHandoffPanel: true,
    });
  });

  it("keeps tmux focused on the swarm board and terminal semantics", () => {
    expect(
      getConversationShellVisibility({
        configLibraryActive: false,
        mode: "tmux",
      }),
    ).toMatchObject({
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: true,
      showTerminalDock: true,
      showToolbarActions: false,
      showWorkItemHandoffPanel: false,
    });
  });

  it("keeps config library focused on the library surface", () => {
    expect(
      getConversationShellVisibility({
        configLibraryActive: true,
        mode: "conversation",
      }),
    ).toMatchObject({
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: true,
      showTerminalDock: true,
      showToolbarActions: true,
      showWorkItemHandoffPanel: false,
    });
  });
});
