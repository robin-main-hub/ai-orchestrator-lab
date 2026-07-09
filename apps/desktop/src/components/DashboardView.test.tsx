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
  dgxStatus: "online",
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

describe("DashboardView (mission-control home)", () => {
  it("renders the ambient background layer and the status strip with mono numbers", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 2, spare: 10 }}
        onNavigate={vi.fn()}
      />,
    );
    // 앰비언트 배경 — 홈 최하층 아트 + 스크림
    expect(html).toContain("home__ambient");
    expect(html).toContain("brand/aol-ambient-bg.jpg");
    expect(html).toContain("home__ambient-scrim");
    // 상태 스트립 — 런타임 / Hermes 슬롯 / DGX
    expect(html).toContain("1/2"); // 런타임 온라인 노드
    expect(html).toContain("온라인");
    expect(html).toContain("Hermes 슬롯");
    expect(html).toContain("DGX");
    expect(html).toContain("aol-mono"); // 텔레메트리 숫자 = mono
    // 런타임 일부만 온라인이면 degraded 점, DGX online이면 라이브 맥동 점
    expect(html).toContain("is-degraded");
    expect(html).toContain("is-live");
  });

  it("does not render any cosplay elements on the home", () => {
    const html = renderToStaticMarkup(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).not.toContain("REFLECORE ORCHESTRATOR");
    expect(html).not.toContain("오늘도 무대는");
    expect(html).not.toContain("소환진");
    expect(html).not.toContain("오늘의 파티");
    expect(html).not.toContain("캐릭터 도감");
    expect(html).not.toContain("작전 개시");
    // 다음 할 일 / 확인 권장 카드도 홈에서 제거됐다
    expect(html).not.toContain("dashboard__next");
  });

  it('renders "해온 업무" summary and the "현재 작업" empty state on the home', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        onNavigate={vi.fn()}
        workTraceItems={[receiptItem]}
      />,
    );
    // 해온 업무 요약 — WorkReceiptLedgerCard 압축 모드 재사용
    expect(html).toContain("해온 업무");
    expect(html).toContain("토론 공개 영수증 · 최종 결정");
    expect(html).not.toContain("작업 영수증 검색");
    // 현재 작업 — 진행 중인 게 없으면 오빗 링 빈 상태 + CTA
    expect(html).toContain("현재 작업");
    expect(html).toContain("현재 작업 없음");
    expect(html).toContain("목표 루프에서 시작");
    expect(html).toContain("brand/aol-empty-state.jpg");
  });

  it("navigates to the 목표 루프 view from the empty-state CTA", () => {
    const onNavigate = vi.fn();
    const { getByText } = render(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(getByText("목표 루프에서 시작"));
    expect(onNavigate).toHaveBeenCalledWith({ nav: "rmas" });
  });

  it("renders the 빠른 시작 row with 목표 루프 / 토론 / 코딩", () => {
    const onNavigate = vi.fn();
    const { getByText } = render(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        onNavigate={onNavigate}
      />,
    );
    expect(getByText("빠른 시작")).toBeTruthy();
    fireEvent.click(getByText("목표 루프"));
    expect(onNavigate).toHaveBeenCalledWith({ nav: "rmas" });
    fireEvent.click(getByText("토론"));
    expect(onNavigate).toHaveBeenCalledWith({ nav: "none", mode: "debate" });
    fireEvent.click(getByText("코딩"));
    expect(onNavigate).toHaveBeenCalledWith({ nav: "coding" });
  });

  it("renders running work items with a 중지 button and calls onStopWork", () => {
    const onStop = vi.fn();
    const runningWork: RunningWorkItem[] = [
      { id: "run_42", label: "결제 리팩터링 목표 루프", status: "running", kind: "rmas" },
    ];
    const { getByTitle, getByText, queryByText } = render(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
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

  it("shows live telemetry (tokens/iterations) for a running item", () => {
    const { getByText } = render(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        onNavigate={vi.fn()}
        runningWork={[
          {
            id: "run_1",
            label: "run_1",
            goal: "위젯 구현 목표 루프",
            status: "running",
            kind: "rmas",
            tokensTotal: 12500,
            iterations: 3,
          },
        ]}
        onStopWork={vi.fn()}
      />,
    );
    expect(getByText("위젯 구현 목표 루프")).toBeTruthy();
    expect(getByText("토큰")).toBeTruthy();
    expect(getByText("반복")).toBeTruthy();
  });

  it("disables the 중지 button while a stop is in flight", () => {
    const { getByTitle, getByText } = render(
      <DashboardView
        runtime={runtime}
        hermesPool={{ total: 12, bound: 0, spare: 12 }}
        onNavigate={vi.fn()}
        runningWork={[{ id: "run_9", label: "실행 9", status: "queued", kind: "rmas" }]}
        onStopWork={vi.fn()}
        stoppingWorkIds={["run_9"]}
      />,
    );
    expect((getByTitle("이 작업 중지") as HTMLButtonElement).disabled).toBe(true);
    expect(getByText("중지 중")).toBeTruthy();
  });
});
