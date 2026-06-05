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

  it("should hide all panels in tmux or cockpit mode regardless of other states", () => {
    const tmuxResult = getConversationShellVisibility({
      configLibraryActive: false,
      mode: "tmux",
    });

    const cockpitResult = getConversationShellVisibility({
      configLibraryActive: false,
      mode: "cockpit",
    });

    const expected = {
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: false,
      showTerminalDock: false,
      showToolbarActions: false,
      showWorkItemHandoffPanel: false,
    };

    expect(tmuxResult).toEqual(expected);
    expect(cockpitResult).toEqual(expected);
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
