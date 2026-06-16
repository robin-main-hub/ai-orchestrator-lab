// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AssistantInbox, INBOX_VIEW_MODES } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { LEARNING_EVENT_FIXTURE } from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

const radio = (mode: string) =>
  screen.getByTestId(`inbox-mode-option-${mode}`) as HTMLInputElement;

describe("Batch 5 — Command Center view mode (LIVE / PREVIEW / REPLAY / SANDBOX)", () => {
  it("defaults to LIVE when real app state is wired", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(radio("live").checked).toBe(true);
    expect(radio("preview").checked).toBe(false);
    expect(screen.getByTestId("assistant-inbox").getAttribute("data-view-mode")).toBe("live");
    // no preview watermark while LIVE
    expect(screen.queryByTestId("assistant-inbox-preview-banner")).toBeNull();
  });

  it("renders all four seats; REPLAY and SANDBOX are disabled placeholders", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(INBOX_VIEW_MODES.map((m) => m.value)).toEqual([
      "live",
      "preview",
      "replay",
      "sandbox",
    ]);
    expect(radio("live").disabled).toBe(false);
    expect(radio("preview").disabled).toBe(false);
    expect(radio("replay").disabled).toBe(true);
    expect(radio("sandbox").disabled).toBe(true);
  });

  it("PREVIEW is an explicit opt-in and shows a persistent watermark banner", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("assistant-inbox-preview-banner")).toBeNull();

    fireEvent.click(radio("preview"));

    const banner = screen.getByTestId("assistant-inbox-preview-banner");
    expect(banner.textContent).toContain("PREVIEW MODE");
    expect(banner.textContent).toContain("예시(fixture)");
    expect(banner.textContent).toContain("실제 업무");
    expect(screen.getByTestId("assistant-inbox").getAttribute("data-view-mode")).toBe("preview");
    expect(radio("preview").checked).toBe(true);
  });

  it("PREVIEW labels every section as 예시(fixture); LIVE does not", () => {
    render(<AssistantInboxContainer live={{ learningEvents: LEARNING_EVENT_FIXTURE }} />);
    // LIVE: learning is honest live because real events are present.
    expect(
      screen.getByTestId("assistant-inbox-section-learning").getAttribute("data-source"),
    ).toBe("live");

    fireEvent.click(radio("preview"));

    for (const id of ["evidence", "learning", "memory", "manifest"]) {
      expect(
        screen.getByTestId(`assistant-inbox-section-${id}`).getAttribute("data-source"),
      ).toBe("example");
    }
    expect(screen.getByTestId("assistant-inbox-example-notice")).toBeTruthy();
  });

  it("keeps LIVE and PREVIEW projections separate — back to LIVE removes preview fixtures (no leak)", () => {
    render(<AssistantInboxContainer live={{}} />);
    // LIVE (empty real state): no fixture evidence row, learning honestly empty.
    expect(screen.queryByTestId("evidence-card-evidence-001")).toBeNull();
    expect(
      screen.getByTestId("assistant-inbox-section-learning").getAttribute("data-count"),
    ).toBe("0");

    // PREVIEW: fixture cards appear.
    fireEvent.click(radio("preview"));
    expect(screen.getByTestId("evidence-card-evidence-001")).toBeTruthy();
    expect(
      screen.getByTestId("assistant-inbox-section-learning").getAttribute("data-count"),
    ).toBe("2");

    // Back to LIVE: the preview fixtures are gone — they never leak into live.
    fireEvent.click(radio("live"));
    expect(screen.queryByTestId("evidence-card-evidence-001")).toBeNull();
    expect(
      screen.getByTestId("assistant-inbox-section-learning").getAttribute("data-count"),
    ).toBe("0");
  });

  it("the seat switch carries no data action: zero buttons, fires nothing on mount", () => {
    const spy = vi.fn();
    const { container } = render(
      <div onClick={spy}>
        <AssistantInboxContainer live={{}} />
      </div>,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
    const text = (container.textContent ?? "").toLowerCase();
    expect(/approve/.test(text)).toBe(false);
    expect(/enable/.test(text)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("stays button-free in PREVIEW too (no action buttons in preview)", () => {
    const { container } = render(<AssistantInboxContainer live={{}} />);
    fireEvent.click(radio("preview"));
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("onModeChange reports the chosen seat (UI state only); disabled seats never fire", () => {
    const onModeChange = vi.fn();
    render(<AssistantInbox mode="live" onModeChange={onModeChange} sources={{ evidence: "live" }} />);

    fireEvent.click(screen.getByTestId("inbox-mode-option-preview"));
    expect(onModeChange).toHaveBeenCalledWith("preview");

    fireEvent.click(screen.getByTestId("inbox-mode-option-replay"));
    expect(onModeChange).not.toHaveBeenCalledWith("replay");
    fireEvent.click(screen.getByTestId("inbox-mode-option-sandbox"));
    expect(onModeChange).not.toHaveBeenCalledWith("sandbox");
  });

  it("opens in PREVIEW in isolation (no live state wired → fixture, nothing faked as live)", () => {
    render(<AssistantInboxContainer />);
    expect(screen.getByTestId("assistant-inbox").getAttribute("data-view-mode")).toBe("preview");
    expect(radio("preview").checked).toBe(true);
  });
});

describe("Batch 5 — projection purity (no preview→live data seam)", () => {
  it("the inbox projection imports no writer / runner / EventStorage / server / approval seam", () => {
    // Resolve from cwd robustly whether vitest runs from the desktop package
    // root or the repo root.
    const rel = "src/lib/assistantInboxProjection.ts";
    const path =
      [resolve(process.cwd(), rel), resolve(process.cwd(), "apps/desktop", rel)].find((p) =>
        existsSync(p),
      ) ?? resolve(process.cwd(), rel);
    const src = readFileSync(path, "utf8");
    for (const banned of [
      "executeLocalBatchWrite",
      "createLocalClientEventCache",
      "stage29LocalEventStore",
      "stage34ApprovalServer",
      "grantDgxApproval",
      "codingRunner",
      "routes/github",
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });
});
