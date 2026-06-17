// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "../CommandPalette";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import type { InboxCommand } from "./AssistantInbox";
import { buildInboxPaletteCommands } from "../../lib/inboxPaletteCommands";
import { applyUserSavedInboxView, type UserSavedView } from "../../lib/userSavedViews";

// cmdk/Radix need a couple of browser APIs jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;
(Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView ??= () => {};

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [{ id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }];
const userView: UserSavedView = {
  id: "my-desk",
  name: "My Desk",
  mode: "preview",
  focus: "today",
  category: "runner",
  search: "gate",
  schemaVersion: 1,
};

/** Mimics App: builder → command-bus state → AssistantInboxContainer. */
function Harness({ userViews = [] as UserSavedView[] }) {
  const [cmd, setCmd] = useState<InboxCommand | undefined>(undefined);
  const cmds = buildInboxPaletteCommands(
    {
      goInbox: () => {},
      dispatch: (kind, value) => setCmd((p) => ({ kind, value, nonce: (p?.nonce ?? 0) + 1 })),
      applyView: (v) => setCmd((p) => ({ ...applyUserSavedInboxView(v), nonce: (p?.nonce ?? 0) + 1 })),
    },
    userViews,
  );
  return (
    <div>
      {cmds.map((c) => (
        <button key={c.id} data-testid={`run-${c.id}`} onClick={c.run}>
          {c.label}
        </button>
      ))}
      <AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} command={cmd} />
    </div>
  );
}

const viewMode = () => screen.getByTestId("assistant-inbox").getAttribute("data-view-mode");
const q = (id: string) => screen.queryByTestId(id);

describe("Batch 13 — LINE A: Command Palette ↔ inbox E2E (jsdom)", () => {
  it("the real Command Palette renders inbox preset + user-view entries", () => {
    render(
      <CommandPalette
        open
        onClose={() => {}}
        commands={buildInboxPaletteCommands(
          { goInbox: vi.fn(), dispatch: vi.fn(), applyView: vi.fn() },
          [userView],
        )}
      />,
    );
    expect(screen.getByText("Assistant Inbox 열기")).toBeTruthy();
    expect(screen.getByText("LIVE 좌석")).toBeTruthy();
    expect(screen.getByText(/My Desk/)).toBeTruthy();
  });

  it("running a palette command flows through the command-bus into the inbox view", () => {
    render(<Harness />);
    // focus command → only blocked lane, cards hidden
    fireEvent.click(screen.getByTestId("run-inbox.blocked"));
    expect(q("work-lane-today")).toBeNull();
    expect(q("work-lane-blocked")).toBeTruthy();
    // mode command → REPLAY seat
    fireEvent.click(screen.getByTestId("run-inbox.replay"));
    expect(viewMode()).toBe("replay");
  });

  it("running a user saved-view command applies the whole view", () => {
    render(<Harness userViews={[userView]} />);
    fireEvent.click(screen.getByTestId("run-inbox.view.my-desk"));
    expect(viewMode()).toBe("preview"); // mode applied by container
    expect((screen.getByTestId("inbox-category-runner") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("inbox-search") as HTMLInputElement).value).toBe("gate");
  });

  it("re-running the same palette command re-applies (nonce)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("run-inbox.blocked"));
    expect(q("work-lane-today")).toBeNull();
    fireEvent.click(screen.getByTestId("inbox-focus-all")); // manual reset
    expect(q("work-lane-today")).toBeTruthy();
    fireEvent.click(screen.getByTestId("run-inbox.blocked")); // same command again
    expect(q("work-lane-today")).toBeNull();
  });
});
