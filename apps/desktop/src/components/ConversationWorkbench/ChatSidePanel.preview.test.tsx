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

describe("ChatSidePanel preview wiring (Conversation 통합 smoke)", () => {
  it("(W1) previewUrl 있을 때만 PreviewIframe 마운트, 없으면 stub 안내", async () => {
    const { ChatSidePanel } = await import("./ChatSidePanel");
    const { PreviewIframe } = await import("../PreviewIframe");
    function Harness({ url }: { url?: string }) {
      return (
        <ChatSidePanel mode="preview" onClose={() => {}}>
          {url ? (
            <div data-testid="chat-side-panel-preview-iframe-wrap">
              <PreviewIframe url={url} testIdPrefix="chat-side" />
            </div>
          ) : (
            <ChatSidePanelStub mode="preview" />
          )}
        </ChatSidePanel>
      );
    }
    const { rerender } = render(<Harness />);
    expect(screen.queryByTestId("chat-side-panel-preview-iframe-wrap")).toBeNull();
    expect(document.body.textContent ?? "").toContain("Mission Workspace");
    rerender(<Harness url="http://127.0.0.1:5050/" />);
    expect(screen.getByTestId("chat-side-panel-preview-iframe-wrap")).toBeTruthy();
    const frame = screen.getByTestId("preview-iframe-frame-chat-side") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("http://127.0.0.1:5050/");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
  });
});
