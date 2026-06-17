// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { AssistantInbox } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { LEARNING_EVENT_FIXTURE } from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

const radio = (mode: string) =>
  screen.getByTestId(`inbox-mode-option-${mode}`) as HTMLInputElement;

describe("Batch 6 — LINE U: LIVE command-center status strip", () => {
  it("renders an honest status strip in LIVE-sparse state", () => {
    render(<AssistantInboxContainer live={{}} />);
    const strip = screen.getByTestId("assistant-inbox-status-strip");
    expect(strip.getAttribute("data-mode")).toBe("live");
    expect(strip.getAttribute("data-total")).toBe("1"); // only the runner gate
    expect(strip.getAttribute("data-live-sections")).toBe("1");
    expect(strip.getAttribute("data-empty-sections")).toBe("3");
    expect(strip.getAttribute("data-gate")).toBe("blocked");
  });

  it("shows the polished 'No live data yet' hero only when LIVE is sparse", () => {
    render(<AssistantInboxContainer live={{}} />);
    const hero = screen.getByTestId("assistant-inbox-live-empty-hero");
    expect(hero.textContent).toContain("No live data yet");
    // it must not be faked as broken/error
    expect(hero.textContent).toContain("runner gate");
  });

  it("hides the empty hero once LIVE has real data", () => {
    render(<AssistantInboxContainer live={{ learningEvents: LEARNING_EVENT_FIXTURE }} />);
    expect(screen.queryByTestId("assistant-inbox-live-empty-hero")).toBeNull();
    expect(
      screen.getByTestId("assistant-inbox-status-strip").getAttribute("data-live-sections"),
    ).toBe("2"); // gate (evidence) + learning
  });

  it("shows a generated/updated chip only when passed in (never fabricated)", () => {
    const { rerender } = render(<AssistantInbox sources={{ evidence: "live" }} />);
    expect(screen.queryByTestId("assistant-inbox-generated-at")).toBeNull();
    rerender(<AssistantInbox sources={{ evidence: "live" }} generatedAt="2026-06-16 10:00 KST" />);
    expect(screen.getByTestId("assistant-inbox-generated-at").textContent).toContain(
      "2026-06-16 10:00 KST",
    );
  });

  it("status strip / hero add no buttons (read-only invariant holds)", () => {
    const { container } = render(<AssistantInboxContainer live={{}} />);
    assertNoSideEffectActionControls(container);
  });
});

describe("Batch 6 — LINE V: intentional empty states (no fake, no leak)", () => {
  it("empty sections explain what will populate them, with no fixture text", () => {
    render(<AssistantInboxContainer live={{}} />);
    const learning = screen.getByTestId("assistant-inbox-section-empty-learning");
    expect(learning.getAttribute("data-empty")).toBe("true");
    expect(learning.textContent).toContain("learning loop 이벤트가 들어오면");
    // never reuse PREVIEW fixture copy in an empty live section
    expect(learning.textContent).not.toContain("example-system");

    const memory = screen.getByTestId("assistant-inbox-section-empty-memory");
    expect(memory.textContent).toContain("memory candidate");
    const manifest = screen.getByTestId("assistant-inbox-section-empty-manifest");
    expect(manifest.textContent).toContain("eval");
  });

  it("empty sections keep source=empty and never leak preview fixtures into LIVE", () => {
    render(<AssistantInboxContainer live={{}} />);
    for (const id of ["learning", "memory", "manifest"]) {
      expect(
        screen.getByTestId(`assistant-inbox-section-${id}`).getAttribute("data-source"),
      ).toBe("empty");
    }
    expect(screen.queryByTestId("evidence-card-evidence-001")).toBeNull();
  });
});

describe("Batch 6 — LINE X: PREVIEW polish stays honest", () => {
  it("PREVIEW shows the watermark banner; LIVE hero is absent in preview", () => {
    render(<AssistantInboxContainer live={{}} />);
    fireEvent.click(radio("preview"));

    const banner = screen.getByTestId("assistant-inbox-preview-banner");
    expect(banner.textContent).toContain("PREVIEW MODE");
    expect(banner.textContent).toContain("예시(fixture)");
    expect(screen.queryByTestId("assistant-inbox-live-empty-hero")).toBeNull();

    const strip = screen.getByTestId("assistant-inbox-status-strip");
    expect(strip.getAttribute("data-mode")).toBe("preview");
    expect(strip.getAttribute("data-empty-sections")).toBe("0"); // all example, none empty
  });
});
