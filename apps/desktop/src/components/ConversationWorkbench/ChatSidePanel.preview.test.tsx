// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatSidePanelMenu, ChatSidePanelStub, type ChatSidePanelMode } from "./ChatSidePanel";

afterEach(() => cleanup());

describe("ChatSidePanel — 미리보기(preview) 탭 살리기", () => {
  it("(C1) ChatSidePanelMenu 펼치면 '미리보기' 항목이 노출되고 클릭하면 onChangeMode('preview') 호출", () => {
    const onChangeMode = vi.fn<(mode: ChatSidePanelMode) => void>();
    render(<ChatSidePanelMenu mode="none" onChangeMode={onChangeMode} />);
    // 메뉴 트리거 클릭
    fireEvent.click(screen.getByRole("button", { name: "확장 패널 메뉴" }));
    // PopoverContent가 마운트되면 '미리보기' 텍스트가 보인다
    const preview = screen.getByText("미리보기");
    expect(preview).toBeTruthy();
    fireEvent.click(preview);
    expect(onChangeMode).toHaveBeenCalledWith("preview");
  });

  it("(C2) Stub은 mode='preview'에서 임베드/차단 가능성을 정직하게 안내", () => {
    render(<ChatSidePanelStub mode="preview" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Mission Workspace");
    expect(text).toContain("X-Frame-Options");
  });
});
