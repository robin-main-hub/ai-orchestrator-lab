// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

// Batch 15 LINE E — clicking a Source Dock row opens a LOCAL, read-only detail
// drawer. Zero-button decision in force: rows + close are role="button" divs
// (not <button>), Esc closes, focus restores. View-only — no action, no write.

const FORBIDDEN = [
  "erp",
  "gio",
  "example-domain",
  "customer",
  "sales",
  "quotation",
  "sample request",
  "buyer",
  "factory",
  "domestic",
];

describe("Batch 15 LINE E — source detail drawer (zero-button, view-only)", () => {
  it("is closed at mount and adds no <button> (preserves button-free scans)", () => {
    const { container } = render(<AssistantInboxContainer />);
    expect(screen.queryByTestId("source-detail-drawer")).toBeNull();
    assertNoSideEffectActionControls(container);
  });

  it("clicking a source row opens the drawer with read-only typed fields", () => {
    render(<AssistantInboxContainer />); // PREVIEW, mixed deck
    fireEvent.click(screen.getByTestId("plugin-row-example-plugin-0"));
    const drawer = screen.getByTestId("source-detail-drawer");
    expect(drawer.getAttribute("data-kind")).toBe("source");
    expect(screen.getByTestId("source-detail-field-pluginId").textContent).toContain("example-plugin");
    expect(screen.getByTestId("source-detail-field-sourceRef").textContent).toContain("source-001");
    expect(screen.getByTestId("source-detail-field-category").textContent).toContain("project");
    expect(screen.getByTestId("source-detail-field-health").textContent).toContain("connected");
    expect(screen.getByTestId("source-detail-field-observed")).toBeTruthy();
    // open drawer has NO <button> and no action words
    assertNoSideEffectActionControls(drawer);
    const text = (drawer.textContent ?? "").toLowerCase();
    for (const w of ["approve", "enable", "run ", "send", "sync", "dispatch", "apply"]) {
      expect(text.includes(w)).toBe(false);
    }
    for (const term of FORBIDDEN) {
      expect(text.includes(term)).toBe(false);
    }
  });

  it("Escape closes the drawer", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("plugin-row-example-plugin-0"));
    expect(screen.getByTestId("source-detail-drawer")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("source-detail-drawer")).toBeNull();
  });

  it("the role=button close affordance closes on click and on Enter", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("plugin-row-example-plugin-0"));
    const close = screen.getByTestId("source-detail-close");
    expect(close.getAttribute("role")).toBe("button");
    expect(close.tagName.toLowerCase()).not.toBe("button");
    fireEvent.click(close);
    expect(screen.queryByTestId("source-detail-drawer")).toBeNull();
    // reopen + Enter on a focused row
    fireEvent.keyDown(screen.getByTestId("plugin-row-example-plugin-1"), { key: "Enter" });
    expect(screen.getByTestId("source-detail-drawer")).toBeTruthy();
  });

  it("clicking an evidence row opens an evidence drawer (suggested, never trusted)", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("plugin-evidence-0"));
    const drawer = screen.getByTestId("source-detail-drawer");
    expect(drawer.getAttribute("data-kind")).toBe("evidence");
    expect(screen.getByTestId("source-detail-field-status").textContent).toContain("suggested");
    expect(screen.getByTestId("source-detail-field-observed").textContent).toContain("false");
    const trust = (screen.getByTestId("source-detail-field-trust").textContent ?? "").toLowerCase();
    expect(trust.includes("trusted")).toBe(false);
  });

  it("source rows are role=button (not <button>) and keyboard-activatable", () => {
    render(<AssistantInboxContainer />);
    const row = screen.getByTestId("plugin-row-example-plugin-0");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.tagName.toLowerCase()).not.toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");
  });

  it("drawer state is local: switching demo scenario does not auto-open it", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("source-demo-option-healthy").querySelector("input")!);
    expect(screen.queryByTestId("source-detail-drawer")).toBeNull();
  });
});
