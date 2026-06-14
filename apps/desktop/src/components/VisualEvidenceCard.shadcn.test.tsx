// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VisualQaReport } from "@ai-orchestrator/protocol";
import { VisualEvidenceCard } from "./VisualEvidenceCard";

afterEach(() => cleanup());

function report(over: Partial<VisualQaReport> = {}): VisualQaReport {
  return {
    id: "r", missionId: "m", workspaceId: "w", previewUrl: "http://x",
    checks: [], issues: [], status: "passed", truthStatus: "observed",
    createdAt: "t",
    ...over,
  };
}

describe("VisualEvidenceCard — shadcn/ui primitive swap (OSS-H1)", () => {
  it("(C1) shadcn Card/Badge/Button slot이 DOM에 노출된다 — primitive 교체 확인", () => {
    const { container } = render(
      <VisualEvidenceCard
        missionId="m1"
        previewUrl="http://localhost:5050"
        latestReport={report({ status: "passed", issues: [] })}
      />,
    );
    // shadcn 컴포넌트는 data-slot="card|card-header|card-content|card-footer|badge|button"을 단다
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-header"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-content"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="card-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="badge"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="button"]')).toBeTruthy();
  });

  it("(C2) 기존 data-testid·동작 보존: readiness=ready → publish CTA 클릭이 onNavigate('publish')를 부른다", () => {
    const onNavigate = vi.fn();
    const onContextEvent = vi.fn();
    render(
      <VisualEvidenceCard
        missionId="m2"
        previewUrl="http://x"
        latestReport={report({ status: "passed", issues: [] })}
        onNavigate={onNavigate}
        onContextEvent={onContextEvent}
      />,
    );
    expect(screen.getByTestId("visual-evidence-m2").getAttribute("data-readiness")).toBe("ready");
    fireEvent.click(screen.getByTestId("visual-evidence-publish-ready-cta-m2"));
    expect(onNavigate).toHaveBeenCalledWith("publish");
    expect(onContextEvent).toHaveBeenCalledWith(
      "mission.visual_evidence.publish_ready_clicked",
      expect.objectContaining({ missionId: "m2", readiness: "ready" }),
    );
  });

  it("(C3) preview URL 없음 → 가짜 URL 표시 0(정직성 회귀)", () => {
    render(
      <VisualEvidenceCard
        missionId="m3"
        previewUrl={undefined}
        latestReport={undefined}
      />,
    );
    expect(screen.getByTestId("visual-evidence-preview-none-m3")).toBeTruthy();
    expect(screen.queryByTestId("visual-evidence-preview-link-m3")).toBeNull();
  });

  it("(C4) verifyFailedStep=qa, blocked → blocked CTA가 onNavigate('qa')로 라우팅", () => {
    const onNavigate = vi.fn();
    render(
      <VisualEvidenceCard
        missionId="m4"
        previewUrl="http://x"
        latestReport={report({ status: "failed", issues: [{ id: "a" } as any] })}
        verifyFailedStep="qa"
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByTestId("visual-evidence-m4").getAttribute("data-readiness")).toBe("blocked");
    fireEvent.click(screen.getByTestId("visual-evidence-blocked-cta-m4"));
    expect(onNavigate).toHaveBeenCalledWith("qa");
  });

  it("(C5) Badge variant이 readiness에 매핑된다(ready=default / needs_fix=secondary / blocked=destructive)", () => {
    const { rerender, container } = render(
      <VisualEvidenceCard
        missionId="m5"
        previewUrl="http://x"
        latestReport={report({ status: "passed", issues: [] })}
      />,
    );
    let badgeClass = container.querySelector('[data-slot="badge"]')?.className ?? "";
    expect(badgeClass).toContain("bg-primary");

    rerender(
      <VisualEvidenceCard
        missionId="m5"
        previewUrl="http://x"
        latestReport={report({ status: "failed", issues: [{ id: "a" } as any] })}
      />,
    );
    badgeClass = container.querySelector('[data-slot="badge"]')?.className ?? "";
    expect(badgeClass).toContain("bg-secondary");

    rerender(
      <VisualEvidenceCard
        missionId="m5"
        previewUrl="http://x"
        latestReport={report({ status: "failed", issues: [{ id: "a" } as any] })}
        verifyFailedStep="preview"
      />,
    );
    badgeClass = container.querySelector('[data-slot="badge"]')?.className ?? "";
    expect(badgeClass).toContain("bg-destructive");
  });
});
