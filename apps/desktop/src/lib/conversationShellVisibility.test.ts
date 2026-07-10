import { describe, expect, it } from "vitest";
import { getConversationShellVisibility, isFocusedV0Surface } from "./conversationShellVisibility";

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

  it("keeps debate focused on the v0 Debate Chamber surface", () => {
    expect(
      getConversationShellVisibility({
        configLibraryActive: false,
        mode: "debate",
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

  it("keeps config library focused on the minimal library surface", () => {
    // config_files v2 (§0-B): terminal dock + board toolbar are removed; only
    // the left icon rail remains so the settings-file view stays minimal.
    expect(
      getConversationShellVisibility({
        configLibraryActive: true,
        mode: "conversation",
      }),
    ).toMatchObject({
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: true,
      showTerminalDock: false,
      showToolbarActions: false,
      showWorkItemHandoffPanel: false,
    });
  });

  it("identifies the black v0 focus surfaces that must not show management rails", () => {
    expect(isFocusedV0Surface("conversation")).toBe(true);
    expect(isFocusedV0Surface("debate")).toBe(true);
    expect(isFocusedV0Surface("tmux")).toBe(true);
    expect(isFocusedV0Surface("cockpit")).toBe(true);
    expect(isFocusedV0Surface("annex")).toBe(true);
  });

  it("nav-center views (대시보드/작전 탭) keep the sidebar and own a clean center", () => {
    const visibility = getConversationShellVisibility({
      configLibraryActive: false,
      mode: "conversation",
      navCenterActive: true,
    });
    expect(visibility.showLeftRail).toBe(true);
    expect(visibility.showToolbarActions).toBe(false);
    expect(visibility.showTerminalDock).toBe(false);
    expect(visibility.showCodingPacketPanel).toBe(false);
    expect(visibility.showWorkItemHandoffPanel).toBe(false);
  });
});
