import type { CenterMode } from "../types";

export interface ConversationShellVisibilityInput {
  configLibraryActive: boolean;
  mode: CenterMode;
}

export interface ConversationShellVisibility {
  showCodingPacketPanel: boolean;
  showEvolveMementoPanel: boolean;
  showLeftRail: boolean;
  showTerminalDock: boolean;
  showToolbarActions: boolean;
  showWorkItemHandoffPanel: boolean;
}

export function getConversationShellVisibility({
  configLibraryActive,
  mode,
}: ConversationShellVisibilityInput): ConversationShellVisibility {
  if (configLibraryActive) {
    return {
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: true,
      showTerminalDock: true,
      showToolbarActions: true,
      showWorkItemHandoffPanel: false,
    };
  }

  if (mode === "conversation") {
    return {
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: false,
      showTerminalDock: false,
      showToolbarActions: false,
      showWorkItemHandoffPanel: false,
    };
  }

  if (mode === "tmux") {
    return {
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: true,
      showTerminalDock: true,
      showToolbarActions: false,
      showWorkItemHandoffPanel: false,
    };
  }

  return {
    showCodingPacketPanel: true,
    showEvolveMementoPanel: true,
    showLeftRail: true,
    showTerminalDock: true,
    showToolbarActions: true,
    showWorkItemHandoffPanel: true,
  };
}
