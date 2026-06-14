// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreviewIframe } from "./PreviewIframe";

afterEach(() => cleanup());

describe("PreviewIframe — sandbox + 정직성", () => {
  it("(F1) iframe에 sandbox=allow-scripts allow-same-origin allow-forms 부착", () => {
    render(<PreviewIframe url="http://localhost:5050/" testIdPrefix="m1" />);
    const frame = screen.getByTestId("preview-iframe-frame-m1") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("src")).toBe("http://localhost:5050/");
  });

  it("(F2) 초기 상태=loading + URL/새 탭/reload 컨트롤 노출", () => {
    render(<PreviewIframe url="http://x/" testIdPrefix="m2" />);
    expect(screen.getByTestId("preview-iframe-m2").getAttribute("data-state")).toBe("loading");
    expect(screen.getByTestId("preview-iframe-url-m2").textContent).toBe("http://x/");
    expect(screen.getByTestId("preview-iframe-open-m2").getAttribute("href")).toBe("http://x/");
    expect(screen.getByTestId("preview-iframe-reload-m2")).toBeTruthy();
  });

  it("(F3) onLoad → data-state=loaded, blocked 라벨 없음", () => {
    render(<PreviewIframe url="http://x/" testIdPrefix="m3" />);
    fireEvent.load(screen.getByTestId("preview-iframe-frame-m3"));
    expect(screen.getByTestId("preview-iframe-m3").getAttribute("data-state")).toBe("loaded");
    expect(screen.queryByTestId("preview-iframe-blocked-m3")).toBeNull();
  });

  it("(F4) loadTimeoutMs 안에 load가 안 오면 timed_out + blocked 라벨(정직 표시)", () => {
    vi.useFakeTimers();
    try {
      render(<PreviewIframe url="http://blocked/" testIdPrefix="m4" loadTimeoutMs={500} />);
      expect(screen.getByTestId("preview-iframe-m4").getAttribute("data-state")).toBe("loading");
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByTestId("preview-iframe-m4").getAttribute("data-state")).toBe("timed_out");
      expect(screen.getByTestId("preview-iframe-blocked-m4")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("(F5) 다시 로드 클릭 → 키 변경으로 iframe 재마운트 + 상태 loading 초기화", () => {
    render(<PreviewIframe url="http://x/" testIdPrefix="m5" />);
    fireEvent.load(screen.getByTestId("preview-iframe-frame-m5"));
    expect(screen.getByTestId("preview-iframe-m5").getAttribute("data-state")).toBe("loaded");
    fireEvent.click(screen.getByTestId("preview-iframe-reload-m5"));
    expect(screen.getByTestId("preview-iframe-m5").getAttribute("data-state")).toBe("loading");
  });
});
