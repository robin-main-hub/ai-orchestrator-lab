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

  it("(F6 — H7) onAnnotate 미제공 → 주석 모드 토글 자체 노출 X", () => {
    render(<PreviewIframe url="http://x/" testIdPrefix="m6anno" />);
    expect(screen.queryByTestId("preview-iframe-annotate-toggle-m6anno")).toBeNull();
  });

  it("(F7 — H7) onAnnotate 제공 → 토글 노출, 기본 비활성(overlay 없음)", () => {
    render(<PreviewIframe url="http://x/" testIdPrefix="m7anno" onAnnotate={vi.fn()} />);
    const toggle = screen.getByTestId("preview-iframe-annotate-toggle-m7anno");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("preview-iframe-annotate-overlay-m7anno")).toBeNull();
  });

  it("(F8 — H7) 토글 켬 → overlay 마운트, 클릭 → onAnnotate(xPct,yPct) + 모드 자동 해제", () => {
    const onAnnotate = vi.fn();
    render(<PreviewIframe url="http://x/" testIdPrefix="m8anno" onAnnotate={onAnnotate} />);
    fireEvent.click(screen.getByTestId("preview-iframe-annotate-toggle-m8anno"));
    const overlay = screen.getByTestId("preview-iframe-annotate-overlay-m8anno");
    expect(overlay).toBeTruthy();
    // bounding rect stub: jsdom은 0×0 — 직접 mock해 비율 계산 검증.
    overlay.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.click(overlay, { clientX: 234, clientY: 70 });
    expect(onAnnotate).toHaveBeenCalledTimes(1);
    expect(onAnnotate).toHaveBeenCalledWith({ xPct: 23.4, yPct: 14 });
    // 모드 자동 해제 → overlay 제거
    expect(screen.queryByTestId("preview-iframe-annotate-overlay-m8anno")).toBeNull();
  });

  it("(F9) 선택 모드 off에서는 iframe 위 클릭을 좌표 annotation으로 캡처하지 않는다", () => {
    const onViewportClick = vi.fn();
    render(<PreviewIframe url="http://x/" testIdPrefix="m9view" onViewportClick={onViewportClick} />);
    const layer = screen.getByTestId("preview-iframe-selection-layer-m9view");
    Object.defineProperty(layer, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
    });

    fireEvent.click(layer, { clientX: 53, clientY: 82 });

    expect(onViewportClick).not.toHaveBeenCalled();
  });

  it("(F10) 선택 모드 on에서는 iframe viewport 기준 좌표와 percent를 캡처한다", () => {
    const onViewportClick = vi.fn();
    render(<PreviewIframe url="http://x/" testIdPrefix="m10view" onViewportClick={onViewportClick} />);
    fireEvent.click(screen.getByTestId("preview-iframe-selection-toggle-m10view"));
    const layer = screen.getByTestId("preview-iframe-selection-layer-m10view");
    Object.defineProperty(layer, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
    });

    fireEvent.click(layer, { clientX: 53, clientY: 82 });

    expect(onViewportClick).toHaveBeenCalledWith({
      url: "http://x/",
      x: 43,
      y: 62,
      percentX: 43,
      percentY: 62,
      viewportWidth: 100,
      viewportHeight: 100,
      capturedAt: expect.any(String),
    });
  });
});
