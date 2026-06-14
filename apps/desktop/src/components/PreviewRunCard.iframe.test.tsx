// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewRunCard } from "./PreviewRunCard";

afterEach(() => cleanup());

const OBSERVED_RES = {
  outcome: "observed" as const,
  repoRoot: "/tmp/mission-x",
  materializedFileCount: 5,
  workspaceId: "ws_x",
  preview: {
    status: "running" as const,
    port: 5050,
    url: "http://127.0.0.1:5050/",
    truthStatus: "observed" as const,
  },
};

function makeFetch(response: unknown) {
  return vi.fn(async () => {
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("PreviewRunCard — observed 후 inline iframe 토글 (OSS-H8 iframe)", () => {
  it("(I1) observed로 응답하면 iframe 토글 버튼 노출(기본 닫힘 — iframe 본체는 아직 마운트 X)", async () => {
    const fetchImpl = makeFetch(OBSERVED_RES);
    render(
      <PreviewRunCard
        missionId="m1"
        hasScaffoldFiles={true}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        serverBaseUrl="http://localhost"
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-m1"));
    await waitFor(() => {
      expect(screen.getByTestId("mission-preview-run-m1").getAttribute("data-state")).toBe("observed");
    });
    const toggle = screen.getByTestId("mission-preview-run-iframe-toggle-m1");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("preview-iframe-run-m1")).toBeNull();
  });

  it("(I2) 토글 클릭 → iframe 마운트, sandbox 속성 그대로", async () => {
    const fetchImpl = makeFetch(OBSERVED_RES);
    render(
      <PreviewRunCard
        missionId="m2"
        hasScaffoldFiles={true}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        serverBaseUrl="http://localhost"
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-m2"));
    await waitFor(() => {
      expect(screen.getByTestId("mission-preview-run-m2").getAttribute("data-state")).toBe("observed");
    });
    fireEvent.click(screen.getByTestId("mission-preview-run-iframe-toggle-m2"));
    expect(screen.getByTestId("preview-iframe-run-m2")).toBeTruthy();
    const frame = screen.getByTestId("preview-iframe-frame-run-m2") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
    expect(frame.getAttribute("src")).toBe("http://127.0.0.1:5050/");
  });

  it("(I3) idle/not_running 등 observed가 아닐 때는 iframe 토글 자체가 없다", () => {
    render(
      <PreviewRunCard
        missionId="m3"
        hasScaffoldFiles={false}
      />,
    );
    expect(screen.queryByTestId("mission-preview-run-iframe-toggle-m3")).toBeNull();
  });

  it("(I4) 토글 클릭 → onContextEvent로 트레이스 발생", async () => {
    const fetchImpl = makeFetch(OBSERVED_RES);
    const onContextEvent = vi.fn();
    render(
      <PreviewRunCard
        missionId="m4"
        hasScaffoldFiles={true}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        serverBaseUrl="http://localhost"
        onContextEvent={onContextEvent}
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-m4"));
    await waitFor(() => {
      expect(screen.getByTestId("mission-preview-run-m4").getAttribute("data-state")).toBe("observed");
    });
    fireEvent.click(screen.getByTestId("mission-preview-run-iframe-toggle-m4"));
    expect(onContextEvent).toHaveBeenCalledWith(
      "mission.preview.iframe_toggled",
      expect.objectContaining({ missionId: "m4", next: true }),
    );
  });
});
