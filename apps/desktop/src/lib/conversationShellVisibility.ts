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

export function isFocusedV0Surface(mode: CenterMode): boolean {
  return (
    mode === "conversation" ||
    mode === "agents" ||
    mode === "debate" ||
    mode === "tmux" ||
    mode === "cockpit" ||
    mode === "annex"
  );
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

  if (isFocusedV0Surface(mode)) {
    return {
      showCodingPacketPanel: false,
      showEvolveMementoPanel: false,
      showLeftRail: false,
      showTerminalDock: false,
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
