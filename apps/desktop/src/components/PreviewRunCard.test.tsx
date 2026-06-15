// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewRunCard } from "./PreviewRunCard";

/**
 * PreviewRunCard — Mission Workspace의 한-클릭 Preview Run.
 *
 * 검증:
 *   1) scaffold files 있음 → CTA 활성. 클릭 시 1번 fetch + observed 응답이면 URL 링크 표시.
 *   2) scaffold files 없음 → CTA disabled, 클릭으로도 호출 X.
 *   3) preview_not_running 응답 → URL 안 보이고 status/detail 표시(가짜 running 금지).
 *   4) no_scaffold 응답 → 안내만, 에러 표시 없음.
 */

afterEach(() => cleanup());

function makeFetch(response: any) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    return new Response(JSON.stringify(response), { status: 200 });
  });
  return { fetchImpl, calls };
}

describe("PreviewRunCard", () => {
  it("(#1) scaffold 있음 + observed → URL 링크 표시 + trace event", async () => {
    const { fetchImpl, calls } = makeFetch({
      outcome: "observed",
      repoRoot: "/tmp/preview/mission_x",
      materializedFileCount: 6,
      workspaceId: "ws_mission_x_1",
      preview: { status: "running", port: 4567, url: "http://127.0.0.1:4567", truthStatus: "observed" },
    });
    const onContextEvent = vi.fn();
    render(
      <PreviewRunCard
        missionId="mission_x"
        hasScaffoldFiles
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );

    const cta = screen.getByTestId("mission-preview-run-cta-mission_x") as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    fireEvent.click(cta);

    await waitFor(() => {
      expect(calls.length).toBe(1);
      expect(calls[0]!.url).toContain("/missions/mission_x/preview/run-scaffold");
    });
    await waitFor(() => {
      const link = screen.getByTestId("mission-preview-run-link-mission_x") as HTMLAnchorElement;
      expect(link.href).toBe("http://127.0.0.1:4567/");
    });
    // trace observed
    const types = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(types).toContain("mission.preview.run-scaffold.requested");
    expect(types).toContain("mission.preview.run-scaffold.observed");
  });

  it("(#1b) observed + URL이면 부모 preview observed callback을 missionId/url/observedAt으로 호출", async () => {
    const { fetchImpl } = makeFetch({
      outcome: "observed",
      repoRoot: "/tmp/preview/mission_cb",
      materializedFileCount: 2,
      workspaceId: "ws_mission_cb_1",
      preview: { status: "running", port: 5050, url: "http://127.0.0.1:5050", truthStatus: "observed" },
    });
    const onPreviewObserved = vi.fn();
    render(
      <PreviewRunCard
        missionId="mission_cb"
        hasScaffoldFiles
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onPreviewObserved={onPreviewObserved}
      />,
    );

    fireEvent.click(screen.getByTestId("mission-preview-run-cta-mission_cb"));

    await waitFor(() => {
      expect(onPreviewObserved).toHaveBeenCalledTimes(1);
      expect(onPreviewObserved).toHaveBeenCalledWith({
        missionId: "mission_cb",
        url: "http://127.0.0.1:5050",
        observedAt: expect.any(String),
      });
    });
    expect(Number.isNaN(Date.parse(onPreviewObserved.mock.calls[0]![0].observedAt))).toBe(false);
  });

  it("(#2) scaffold 없음 → CTA disabled, 클릭으로도 호출 안 됨", () => {
    const { fetchImpl, calls } = makeFetch({ outcome: "no_scaffold" });
    render(
      <PreviewRunCard
        missionId="mission_y"
        hasScaffoldFiles={false}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    const cta = screen.getByTestId("mission-preview-run-cta-mission_y") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(calls.length).toBe(0);
  });

  it("(#3) preview_not_running → URL 미노출 + status/detail 표시", async () => {
    const { fetchImpl } = makeFetch({
      outcome: "preview_not_running",
      repoRoot: "/tmp/preview/mission_z",
      materializedFileCount: 6,
      workspaceId: "ws_z",
      preview: { status: "failed", port: 4567, command: "pnpm dev", detail: "spawn ENOENT", truthStatus: "configured" },
    });
    const onPreviewObserved = vi.fn();
    render(
      <PreviewRunCard
        missionId="mission_z"
        hasScaffoldFiles
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onPreviewObserved={onPreviewObserved}
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-mission_z"));
    await waitFor(() => {
      const err = screen.getByTestId("mission-preview-run-error-mission_z");
      expect(err.textContent).toContain("failed");
      expect(err.textContent).toContain("spawn ENOENT");
    });
    // 가짜 URL 노출 금지.
    expect(screen.queryByTestId("mission-preview-run-link-mission_z")).toBeNull();
    expect(onPreviewObserved).not.toHaveBeenCalled();
  });

  it("(#5 hint) preview_not_running + ENOENT → install_dependency 힌트 노출 + CTA trace", async () => {
    const { fetchImpl } = makeFetch({
      outcome: "preview_not_running",
      preview: { status: "failed", port: 4567, detail: "spawn pnpm ENOENT", truthStatus: "configured" },
    });
    const onContextEvent = vi.fn();
    render(
      <PreviewRunCard
        missionId="mission_hint_install"
        hasScaffoldFiles
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-mission_hint_install"));
    await waitFor(() => {
      const hint = screen.getByTestId("mission-preview-run-hint-mission_hint_install");
      expect(hint.getAttribute("data-hint-kind")).toBe("install_dependency");
      expect(screen.getByTestId("mission-preview-run-hint-kind-mission_hint_install").textContent).toContain("의존성");
    });
    // CTA 클릭 → trace만 발생. 자동 수정 X.
    fireEvent.click(screen.getByTestId("mission-preview-run-hint-cta-mission_hint_install"));
    const types = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(types).toContain("mission.preview.revision_hint.requested");
    const reqEvt = onContextEvent.mock.calls.find((c) => c[0] === "mission.preview.revision_hint.requested");
    expect((reqEvt?.[1] as any).kind).toBe("install_dependency");
    // CTA 한 번 누른 후 disabled.
    await waitFor(() => {
      const cta = screen.getByTestId("mission-preview-run-hint-cta-mission_hint_install") as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
      expect(cta.textContent).toContain("초안 생성 예정");
    });
  });

  it("(#6 hint) materialize_failed + EACCES → materialize 힌트", async () => {
    const { fetchImpl } = makeFetch({
      outcome: "materialize_failed",
      message: "writeFile failed: EACCES permission denied",
      repoRoot: "/tmp/preview/x",
    });
    render(
      <PreviewRunCard
        missionId="mission_mat_fail"
        hasScaffoldFiles
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-mission_mat_fail"));
    await waitFor(() => {
      const hint = screen.getByTestId("mission-preview-run-hint-mission_mat_fail");
      expect(hint.getAttribute("data-hint-kind")).toBe("materialize");
      expect(hint.textContent).toMatch(/권한|EACCES/);
    });
  });

  it("(#7 hint) no_scaffold는 hint 표시 안 함(상태 안내만)", async () => {
    const { fetchImpl } = makeFetch({ outcome: "no_scaffold", message: "scaffold 없음" });
    render(
      <PreviewRunCard
        missionId="mission_no_hint"
        hasScaffoldFiles
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-mission_no_hint"));
    await waitFor(() => screen.getByTestId("mission-preview-run-error-mission_no_hint"));
    expect(screen.queryByTestId("mission-preview-run-hint-mission_no_hint")).toBeNull();
  });

  it("(#4) no_scaffold 응답 → 안내만 표시(가짜 진행 X)", async () => {
    const { fetchImpl } = makeFetch({ outcome: "no_scaffold", message: "scaffold/latest에 안전한 파일이 없습니다" });
    render(
      <PreviewRunCard
        missionId="mission_w"
        hasScaffoldFiles // scaffold가 있는 줄 알고 눌렀지만 서버는 not_found 반환
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("mission-preview-run-cta-mission_w"));
    await waitFor(() => {
      expect(screen.getByTestId("mission-preview-run-error-mission_w").textContent).toContain("scaffold");
    });
    expect(screen.queryByTestId("mission-preview-run-link-mission_w")).toBeNull();
  });
});
