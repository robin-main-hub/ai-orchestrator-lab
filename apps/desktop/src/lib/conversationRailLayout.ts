import type { CenterMode } from "../types";

export interface ConversationRailLayoutInput {
  configLibraryActive: boolean;
  mode: CenterMode;
}

export interface ConversationRailLayout {
  rightRailMaxWidthPx: number;
  rightRailMinWidthPx: number;
  rightRailWidthPx: number;
}

export function getConversationRailLayout({
  configLibraryActive,
  mode,
}: ConversationRailLayoutInput): ConversationRailLayout {
  if ((mode === "conversation" || mode === "agents") && !configLibraryActive) {
    return {
      rightRailMaxWidthPx: 420,
      rightRailMinWidthPx: 360,
      rightRailWidthPx: 390,
    };
  }

  return {
    rightRailMaxWidthPx: 320,
    rightRailMinWidthPx: 280,
    rightRailWidthPx: 280,
  };
}
