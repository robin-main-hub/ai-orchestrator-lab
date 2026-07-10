// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PersonaAvatarStack, PersonaChip } from "./PersonaChip";

afterEach(() => cleanup());

describe("PersonaChip", () => {
  it("renders the Korean name for a known persona", () => {
    const { container } = render(<PersonaChip personaName="orchestrator" />);
    expect(container.textContent).toContain("마키마");
  });

  it("falls back to 시스템 with initials and no image for an unknown persona", () => {
    const { container } = render(<PersonaChip personaName="unknown-xyz" />);
    expect(container.textContent).toContain("시스템");
    expect(container.querySelector("img")).toBeNull();
    const avatar = container.querySelector(".aol-persona-avatar");
    expect(avatar?.textContent).toBe("시");
  });

  it("exposes the status tone and an accessible label", () => {
    const { container } = render(<PersonaChip personaName="unknown-xyz" statusTone="live" />);
    expect(container.querySelector('[data-tone="live"]')).not.toBeNull();
    expect(container.textContent).toContain("진행 중");
  });

  it("reflects the size prop in the avatar dimensions", () => {
    const { container } = render(<PersonaChip personaName="unknown-xyz" size={32} />);
    const avatar = container.querySelector<HTMLElement>(".aol-persona-avatar");
    expect(avatar?.style.width).toBe("32px");
    expect(avatar?.style.height).toBe("32px");
  });
});

describe("PersonaAvatarStack", () => {
  it("shows up to max avatars and a +N overflow chip", () => {
    const members = Array.from({ length: 6 }, (_, index) => ({ name: `동료${index + 1}` }));
    const { container } = render(<PersonaAvatarStack members={members} max={4} />);
    expect(container.querySelectorAll(".aol-persona-avatar")).toHaveLength(4);
    expect(container.querySelector(".aol-persona-stack__more")?.textContent).toBe("+2");
  });
});
