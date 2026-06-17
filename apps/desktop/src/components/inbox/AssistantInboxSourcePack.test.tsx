// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";

afterEach(() => cleanup());

// Batch 23 — Generic Source Pack demo: a bundled pack (manifest + provider rows +
// evidence) visible in PREVIEW, demonstrating intake without OS domain dependency.

describe("Batch 23 — Source Pack demo card", () => {
  it("PREVIEW shows the pack manifest (name / version / kind / capabilities)", () => {
    render(<AssistantInboxContainer />); // PREVIEW
    const card = screen.getByTestId("source-pack-card");
    expect(card).toBeTruthy();
    expect(screen.getByTestId("source-pack-manifest").textContent).toContain("Example Source Pack");
    expect(screen.getByTestId("source-pack-kind").getAttribute("data-kind")).toBe("static");
    expect(screen.getByTestId("source-pack-cap-inbox_source_provider")).toBeTruthy();
    expect(screen.getByTestId("source-pack-cap-workitem_lite_provider")).toBeTruthy();
  });

  it("renders the pack's projected WorkItemLite rows + an evidence candidate", () => {
    render(<AssistantInboxContainer />);
    expect(screen.getByTestId("source-pack-row-0").textContent).toContain("source-001");
    expect(screen.getByTestId("source-pack-row-1")).toBeTruthy();
    expect(screen.getByTestId("source-pack-evidence-0").textContent).toContain("trust:");
  });

  it("is PREVIEW-only — never appears in LIVE (no fixture leak)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("source-pack-card")).toBeNull();
  });

  it("is read-only: no buttons, no side-effect/domain text", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("source-pack-card");
    expect(card.querySelectorAll("button").length).toBe(0);
    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
