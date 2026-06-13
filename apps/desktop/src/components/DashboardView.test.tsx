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
    // 캐릭터 도감: 전원 18인이 카드로 렌더된다
    expect(html).toContain("캐릭터 도감 — 전원 18인");
    for (const name of ["마키마", "마키세 크리스", "아스카 랑그레이", "렘", "프리렌", "카츠라기 미사토"]) {
      expect(html).toContain(name);
    }
    expect(html).toContain("실행"); // unified run tile (자율 1 / 병렬 N)
    expect(html).toContain("토론 무대");
    expect(html).toContain("위젯 구현"); // recent run
  });

  it('renders the "다음 할 일" block from healthRollup with status + headline + CTA', () => {
    const onActivate = vi.fn();
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        pendingApprovals={2}
        healthRollup={{
          level: "red",
          headline: "워커 1건 차단 — 즉시 확인",
          signalSummary: "차단 1 · 승인 2",
          pendingCount: 3,
          topAction: {
            id: "worker_blocked_1",
            label: "차단된 워커 확인",
            ctaLabel: "차단 원인 보기",
            priority: "high",
            source: "worker",
            targetSurface: "fleet",
          },
        }}
        onActivateNextAction={onActivate}
        history={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).toContain("다음 할 일"); // aria-label
    expect(html).toContain("주의 필요"); // COCKPIT_HEALTH_LABEL.red
    expect(html).toContain("차단 1 · 승인 2"); // signal summary
    expect(html).toContain("워커 1건 차단 — 즉시 확인"); // headline
    expect(html).toContain("차단 원인 보기"); // CTA label
    expect(html).toContain("dashboard__next--red"); // level-colored accent
  });

  it("omits the 다음 할 일 block when no healthRollup is provided", () => {
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
    expect(html).not.toContain("dashboard__next");
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
