// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RunnerControlPanelCard } from "./RunnerControlPanelCard";

afterEach(() => cleanup());

describe("RunnerControlPanelCard", () => {
  it("renders with dgx execution OFF by default", () => {
    render(<RunnerControlPanelCard mode="dgx_disabled" />);
    const gate = screen.getByTestId("runner-control-gate-badge");
    expect(gate.getAttribute("data-gate")).toBe("off");
    expect(gate.textContent).toContain("OFF");
  });

  it("shows observed:false when gate off and surfaces a disabled notice", () => {
    render(<RunnerControlPanelCard mode="local_read_only" dgxExecutionEnabled={false} executorPresent={true} />);
    expect(screen.getByTestId("runner-control-observed-badge").getAttribute("data-observed")).toBe("false");
    const notice = screen.getByTestId("runner-control-disabled-notice");
    expect(notice.textContent).toMatch(/게이트/);
  });

  it("shows executor missing clearly when gate on but executor absent", () => {
    render(<RunnerControlPanelCard mode="opencode_read_only" dgxExecutionEnabled={true} executorPresent={false} />);
    expect(screen.getByTestId("runner-control-executor-badge").getAttribute("data-executor")).toBe("missing");
    expect(screen.getByTestId("runner-control-observed-badge").getAttribute("data-observed")).toBe("false");
    expect(screen.getByTestId("runner-control-disabled-notice").textContent).toMatch(/executor/);
  });

  it("mock mode renders observed:true with no approval required", () => {
    render(<RunnerControlPanelCard mode="mock" />);
    expect(screen.getByTestId("runner-control-observed-badge").getAttribute("data-observed")).toBe("true");
    expect(screen.getByTestId("runner-control-approval-badge").getAttribute("data-approval-required")).toBe("false");
    expect(screen.queryByTestId("runner-control-disabled-notice")).toBeNull();
  });

  it("read-only preset shows read-only badge and approval not required", () => {
    render(<RunnerControlPanelCard mode="opencode_read_only" dgxExecutionEnabled={true} executorPresent={true} />);
    expect(screen.getByTestId("runner-control-readonly-badge")).not.toBeNull();
    expect(screen.getByTestId("runner-control-approval-badge").getAttribute("data-approval-required")).toBe("false");
    expect(screen.getByTestId("runner-control-observed-badge").getAttribute("data-observed")).toBe("true");
  });

  it("mode toggle is display-only and never enables dgx execution", () => {
    const onModeSelect = vi.fn();
    render(<RunnerControlPanelCard mode="mock" onModeSelect={onModeSelect} />);
    fireEvent.click(screen.getByTestId("runner-control-mode-dgx_disabled"));
    expect(onModeSelect).toHaveBeenCalledWith("dgx_disabled");
    // selecting a mode does not flip the displayed gate (parent controls state)
    expect(screen.getByTestId("runner-control-gate-badge").getAttribute("data-gate")).toBe("off");
  });

  it("does not auto-trigger any enable action on render", () => {
    const onModeSelect = vi.fn();
    render(<RunnerControlPanelCard mode="local_read_only" onModeSelect={onModeSelect} />);
    expect(onModeSelect).not.toHaveBeenCalled();
  });

  it("never renders --dangerously-skip-permissions text", () => {
    const { container } = render(
      <RunnerControlPanelCard mode="opencode_read_only" dgxExecutionEnabled={true} executorPresent={true} />,
    );
    expect(container.textContent ?? "").not.toContain("dangerously-skip-permissions");
  });

  it("renders all four mode toggle buttons", () => {
    render(<RunnerControlPanelCard mode="mock" />);
    expect(screen.getByTestId("runner-control-mode-mock")).not.toBeNull();
    expect(screen.getByTestId("runner-control-mode-local_read_only")).not.toBeNull();
    expect(screen.getByTestId("runner-control-mode-opencode_read_only")).not.toBeNull();
    expect(screen.getByTestId("runner-control-mode-dgx_disabled")).not.toBeNull();
  });
});
