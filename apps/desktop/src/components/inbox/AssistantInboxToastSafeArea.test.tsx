// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

describe("Batch 6 — LINE W: approval toast / inbox layout collision", () => {
  it("the command center page reserves a bottom safe-area so the fixed toast can't hide cards", () => {
    render(<AssistantInboxContainer live={{}} />);
    const page = document.querySelector('[data-page="command_center"]');
    expect(page).not.toBeNull();
    // bottom safe-area marker (the scoped CSS padding hangs off this attribute)
    expect(page?.getAttribute("data-safe-bottom")).toBe("true");
  });

  it("adds no approval action paths to the inbox (layout-only change)", () => {
    const { container } = render(<AssistantInboxContainer live={{}} />);
    expect(container.querySelectorAll("button").length).toBe(0);
    const text = (screen.getByTestId("assistant-inbox").textContent ?? "").toLowerCase();
    expect(/approve/.test(text)).toBe(false);
    expect(/enable/.test(text)).toBe(false);
  });
});
