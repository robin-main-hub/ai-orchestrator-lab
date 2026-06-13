// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CodingWorkbench } from "./CodingWorkbench";
import { CODING_SESSIONS_STORAGE_KEY } from "../../lib/codingChatStore";
import { COMPOSER_INPUT_HEIGHT_STORAGE_KEY } from "../../lib/composerResize";

afterEach(cleanup);
beforeEach(() => {
  localStorage.removeItem(CODING_SESSIONS_STORAGE_KEY);
  localStorage.removeItem(COMPOSER_INPUT_HEIGHT_STORAGE_KEY);
});

describe("CodingWorkbench 입력창 상하 리사이저 (jsdom)", () => {
  it("경계 핸들이 있고, ↑ 키로 입력창이 커진다(↓로 작아짐)", () => {
    render(<CodingWorkbench />);
    const handle = screen.getByRole("separator", { name: "입력창 크기 조절" });
    const textarea = screen.getByLabelText("코딩 지시 입력") as HTMLTextAreaElement;
    expect(textarea.style.height).toBe("72px"); // 기본

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(textarea.style.height).toBe("88px"); // +16

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(textarea.style.height).toBe("72px"); // -16
  });

  it("조절한 높이는 localStorage에 저장된다", () => {
    render(<CodingWorkbench />);
    const handle = screen.getByRole("separator", { name: "입력창 크기 조절" });
    fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true }); // +48 → 120
    expect(localStorage.getItem(COMPOSER_INPUT_HEIGHT_STORAGE_KEY)).toBe("120");
  });
});
