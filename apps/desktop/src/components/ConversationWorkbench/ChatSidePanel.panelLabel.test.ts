import { describe, expect, it } from "vitest";
import { panelLabel } from "./ChatSidePanel";

// Characterization tests for panelLabel (no behavior change). It is a pure
// exported helper that looks a ChatSidePanelMode up in the PANEL_ITEMS table
// and returns its Korean label, falling back to "" when the mode is not in the
// table. No React render, no DOM, no network — importing the module only
// evaluates its top-level definitions. We pin each of the seven tabled modes
// plus the `"none"` mode, which is a valid ChatSidePanelMode but is absent from
// PANEL_ITEMS, so it exercises the `?? ""` fallback.

describe("panelLabel", () => {
  it("returns the tabled Korean label for each panel mode", () => {
    expect(panelLabel("preview")).toBe("미리보기");
    expect(panelLabel("diff")).toBe("Diff");
    expect(panelLabel("terminal")).toBe("터미널");
    expect(panelLabel("files")).toBe("파일");
    expect(panelLabel("background")).toBe("백그라운드 작업");
    expect(panelLabel("plan")).toBe("계획");
    expect(panelLabel("agents")).toBe("에이전트");
  });

  it("falls back to an empty string for the untabled 'none' mode", () => {
    expect(panelLabel("none")).toBe("");
  });
});
