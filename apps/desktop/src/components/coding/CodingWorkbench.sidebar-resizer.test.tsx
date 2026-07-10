// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CodingWorkbench } from "./CodingWorkbench";
import { CODING_SESSIONS_STORAGE_KEY } from "../../lib/codingChatStore";
import { SIDEBAR_WIDTH_STORAGE_KEY } from "../../lib/sidebarResize";

afterEach(cleanup);
beforeEach(() => {
  localStorage.removeItem(CODING_SESSIONS_STORAGE_KEY);
  localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
});

describe("CodingWorkbench 사이드바 좌우 리사이저 (jsdom)", () => {
  it("세로 separator 핸들이 있고, →/← 키로 폭이 조절된다", () => {
    const { container } = render(<CodingWorkbench />);
    const handle = screen.getByRole("separator", { name: "사이드바 폭 조절" });
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    const workbench = container.querySelector(".coding-workbench") as HTMLElement;
    expect(workbench.style.getPropertyValue("--coding-rail-w")).toBe("252px"); // 기본 252

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(workbench.style.getPropertyValue("--coding-rail-w")).toBe("268px"); // +16

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(workbench.style.getPropertyValue("--coding-rail-w")).toBe("252px"); // -16
  });

  it("조절한 폭은 localStorage에 저장된다", () => {
    render(<CodingWorkbench />);
    const handle = screen.getByRole("separator", { name: "사이드바 폭 조절" });
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true }); // +48 → 300
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("300");
  });
});
