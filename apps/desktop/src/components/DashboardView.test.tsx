import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView";

const runtime = {
  runtimeNodes: [
    { id: "n1", label: "macmini", role: "exec", status: "online", isPrimary: true },
    { id: "n2", label: "dgx-02", role: "exec", status: "offline", isPrimary: false },
  ],
} as unknown as RuntimeSnapshot;

describe("DashboardView", () => {
  it("renders hero pulse, persona party, mission tiles, and recent runs", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[
          { personaName: "kurumi", displayName: "토키사키 쿠루미", role: "companion", tagline: "「오빠는 명령만♡」" },
          { personaName: "yuno", displayName: "가사이 유노", role: "auditor", tagline: "「다 보고 있을게♡」" },
        ]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 2, spare: 10 }}
        pendingApprovals={3}
        history={[
          { runId: "r1", personaName: "kurumi", goal: "위젯 구현", stepCount: 4, status: "completed" },
        ]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).toContain("REFLECORE ORCHESTRATOR");
    expect(html).toContain("1/2 온라인"); // runtime pulse
    expect(html).toContain("사용 2 · 여유 10"); // hermes slots
    expect(html).toContain("3건"); // pending approvals
    expect(html).toContain("토키사키 쿠루미");
    expect(html).toContain("가사이 유노");
    expect(html).toContain("병렬실행"); // mission tile
    expect(html).toContain("토론 무대");
    expect(html).toContain("위젯 구현"); // recent run
  });

  it("omits the recent-runs section when there is no history", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        pendingApprovals={0}
        history={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).not.toContain("최근 작전 기록");
  });
});
