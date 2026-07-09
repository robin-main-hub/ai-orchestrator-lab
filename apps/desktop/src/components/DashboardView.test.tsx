// @vitest-environment jsdom
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView";
import type { RunningWorkItem } from "./RunningWorkCard";
import type { WorkTraceSearchItem } from "../lib/workTraceSearch";

afterEach(() => cleanup());

const runtime = {
  runtimeNodes: [
    { id: "n1", label: "macmini", role: "exec", status: "online", isPrimary: true },
    { id: "n2", label: "dgx-02", role: "exec", status: "offline", isPrimary: false },
  ],
} as unknown as RuntimeSnapshot;

const receiptItem: WorkTraceSearchItem = {
  createdAt: "2026-06-05T08:00:00.000Z",
  id: "utterance_1",
  kind: "debate",
  title: "토론 공개 영수증 · 최종 결정",
  receiptStatus: "checkpointed",
  safetyLabel: "검색 가능",
  searchable: true,
  searchText: "토론 공개 영수증 최종 결정",
  trace: {
    receipt: {
      label: "토론 실행 영수증",
      status: "checkpointed",
      items: [{ label: "마스킹", value: "적용됨" }],
    },
    groups: [],
  },
};

describe("DashboardView", () => {
  it("renders hero pulse, persona party, mission tiles, and recent runs — no approval count", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[
          { personaName: "kurumi", displayName: "토키사키 쿠루미", role: "companion", tagline: "「오빠는 명령만♡」" },
          { personaName: "yuno", displayName: "가사이 유노", role: "auditor", tagline: "「다 보고 있을게♡」" },
        ]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 2, spare: 10 }}
        history={[
          { runId: "r1", personaName: "kurumi", goal: "위젯 구현", stepCount: 4, status: "completed" },
        ]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).toContain("REFLECORE ORCHESTRATOR");
    expect(html).toContain("1/2 온라인"); // runtime pulse
    expect(html).toContain("사용 2 · 여유 10"); // hermes slots
    // 승인 attention은 홈에서 완전히 제거됐다 — 대기 펄스도, 승인 큐 라벨도 없다.
    expect(html).not.toContain("승인 대기");
    expect(html).not.toContain("dashboard__pulse-button");
    expect(html).toContain("토키사키 쿠루미");
    expect(html).toContain("가사이 유노");
    expect(html).toContain("캐릭터 도감 — 전원 18인");
    for (const name of ["마키마", "마키세 크리스", "아스카 랑그레이", "렘", "프리렌", "카츠라기 미사토"]) {
      expect(html).toContain(name);
    }
    expect(html).toContain("실행");
    expect(html).toContain("토론 무대");
    expect(html).toContain("위젯 구현"); // recent run
  });

  it('renders "해온 업무" summary and the "현재 작업" control on the home', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        history={[]}
        onNavigate={vi.fn()}
        workTraceItems={[receiptItem]}
      />,
    );
    // 해온 업무 요약 — WorkReceiptLedgerCard 압축 모드 재사용
    expect(html).toContain("해온 업무");
    expect(html).toContain("토론 공개 영수증 · 최종 결정");
    // 압축 모드: 검색/요약/푸터는 접힌다
    expect(html).not.toContain("GitHub #251");
    expect(html).not.toContain("작업 영수증 검색");
    // 현재 작업 — 진행 중인 게 없으면 "현재 작업 없음"
    expect(html).toContain("현재 작업");
    expect(html).toContain("현재 작업 없음");
  });

  it("renders running work items with a 중지 button and calls onStopWork", () => {
    const onStop = vi.fn();
    const runningWork: RunningWorkItem[] = [
      { id: "run_42", label: "결제 리팩터링 목표 루프", status: "running", kind: "rmas" },
    ];
    const { getByTitle, getByText, queryByText } = render(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        history={[]}
        onNavigate={vi.fn()}
        runningWork={runningWork}
        onStopWork={onStop}
      />,
    );
    expect(getByText("결제 리팩터링 목표 루프")).toBeTruthy();
    expect(queryByText("현재 작업 없음")).toBeNull();
    fireEvent.click(getByTitle("이 작업 중지"));
    expect(onStop).toHaveBeenCalledWith("run_42");
  });

  it("disables the 중지 button while a stop is in flight", () => {
    const { getByTitle, getByText } = render(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        history={[]}
        onNavigate={vi.fn()}
        runningWork={[{ id: "run_9", label: "실행 9", status: "queued", kind: "rmas" }]}
        onStopWork={vi.fn()}
        stoppingWorkIds={["run_9"]}
      />,
    );
    expect((getByTitle("이 작업 중지") as HTMLButtonElement).disabled).toBe(true);
    expect(getByText("중지 중")).toBeTruthy();
  });

  it('renders the "다음 할 일" block only for a non-approval next action', () => {
    const onActivate = vi.fn();
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        healthRollup={{
          level: "red",
          headline: "워커 1건 차단 — 즉시 확인",
          signalSummary: "차단 1 · 폴백 활성",
          pendingCount: 2,
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
    expect(html).toContain("차단된 워커 확인"); // headline = homeAction.label
    expect(html).toContain("차단 원인 보기"); // CTA label
    expect(html).toContain("dashboard__next--red");
    // 승인 카운트/신호 요약은 홈에서 노출하지 않는다
    expect(html).not.toContain("dashboard__next-signal");
  });

  it("suppresses an approval-typed next action on the home", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        healthRollup={{
          level: "yellow",
          headline: "승인 2건 대기",
          signalSummary: "승인 2",
          pendingCount: 2,
          topAction: {
            id: "approval_1",
            label: "승인 대기 처리",
            ctaLabel: "승인 큐 열기",
            priority: "warning",
            source: "approval",
            targetSurface: "approvals",
          },
        }}
        history={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).not.toContain("dashboard__next"); // card suppressed
    expect(html).not.toContain("승인 큐 열기");
    expect(html).not.toContain("승인 2건 대기");
  });

  it("places the action tiles above the codex and ships the codex as a collapsed carousel", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        history={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html.indexOf("작전 개시")).toBeLessThan(html.indexOf("캐릭터 도감"));
    expect(html).toContain("is-carousel");
    expect(html).toContain("전체 보기");
    expect(html).toContain("dashboard__top");
  });

  it("omits the 다음 할 일 block when no healthRollup is provided", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        history={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).not.toContain("dashboard__next");
  });

  it("renders party cards as clickable buttons with a why-today reason badge", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[
          { personaName: "kurumi", displayName: "토키사키 쿠루미", role: "companion", tagline: "본체", reason: "오늘 활성" },
        ]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 1, spare: 11 }}
        history={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).toContain("dashboard__party-card");
    expect(html).toContain("dashboard__party-reason");
    expect(html).toContain("오늘 활성");
    expect(html).toContain("토키사키 쿠루미 상세 보기");
  });

  it("omits the recent-runs section when there is no history", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        personas={[]}
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        history={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).not.toContain("최근 작전 기록");
  });
});
