import { describe, expect, it } from "vitest";
import { getConversationRailLayout } from "./conversationRailLayout";

describe("getConversationRailLayout", () => {
  it("uses a wider agents rail for the v0 conversation shell", () => {
    expect(getConversationRailLayout({ mode: "conversation", configLibraryActive: false })).toEqual({
      rightRailWidthPx: 390,
      rightRailMinWidthPx: 360,
      rightRailMaxWidthPx: 420,
    });
  });

  it("keeps the legacy rail width outside the focused conversation shell", () => {
    expect(getConversationRailLayout({ mode: "debate", configLibraryActive: false })).toEqual({
      rightRailWidthPx: 280,
      rightRailMinWidthPx: 280,
      rightRailMaxWidthPx: 320,
    });
  });
});
