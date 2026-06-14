// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BlueprintDebateReview, BlueprintRevisionDraft } from "@ai-orchestrator/protocol";
import { BlueprintReviewCard } from "./Stage3DebateTable";

afterEach(() => cleanup());

const REVIEW: BlueprintDebateReview = {
  blueprintTitle: "건강 신호 보드",
  adopted: ["상단 신호 1개", "카드는 도감 위로"],
  rejected: ["탭 4개로 분리"],
  risks: ["모바일 레이아웃은?"],
  blueprintDelta: ["카드는 도감 위로"],
  recommendedNextAction: "revise_blueprint",
  truthStatus: "generated",
};

describe("BlueprintReviewCard — Revision Draft UI", () => {
  it("(#1) onApplyRevision 미배선 → 수정안 영역 자체가 없음(기존 동작 회귀)", () => {
    render(<BlueprintReviewCard review={REVIEW} />);
    expect(screen.queryByTestId("blueprint-revision-area")).toBeNull();
    expect(screen.queryByTestId("blueprint-revision-apply")).toBeNull();
  });

  it("(#2) onApplyRevision 배선 → 수정안 보기/적용 버튼 노출, 기본 접힘", () => {
    render(<BlueprintReviewCard review={REVIEW} onApplyRevision={vi.fn()} />);
    expect(screen.getByTestId("blueprint-revision-area")).toBeTruthy();
    expect(screen.getByTestId("blueprint-revision-toggle")).toHaveProperty("ariaExpanded", "false");
    expect(screen.queryByTestId("blueprint-revision-detail")).toBeNull();
    // truthStatus 정직 표시(observed 아님)
    expect(screen.getByTestId("blueprint-revision-truthstatus").textContent).toContain("planned");
  });

  it("(#3) '수정안 보기' 클릭 → 펼침 + addedCriteria/riskNotes 표시", () => {
    render(<BlueprintReviewCard review={REVIEW} onApplyRevision={vi.fn()} />);
    fireEvent.click(screen.getByTestId("blueprint-revision-toggle"));
    const detail = screen.getByTestId("blueprint-revision-detail");
    expect(detail.textContent).toContain("새 결정 1");
    expect(detail.textContent).toContain("카드는 도감 위로"); // baseline 없이 review.blueprintDelta가 그대로 added
    expect(detail.textContent).toContain("위험 노트 1");
    expect(detail.textContent).toContain("미해결: 모바일 레이아웃은?");
  });

  it("(#4) 적용 클릭 → onApplyRevision(draft) 호출, draft.noop=false + truthStatus=planned", () => {
    const onApply = vi.fn();
    render(<BlueprintReviewCard review={REVIEW} onApplyRevision={onApply} />);
    fireEvent.click(screen.getByTestId("blueprint-revision-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const draft = onApply.mock.calls[0]![0] as BlueprintRevisionDraft;
    expect(draft.noop).toBe(false);
    expect(draft.truthStatus).toBe("planned");
    expect(draft.addedCriteria).toContain("카드는 도감 위로");
  });

  it("(#5) noop=true(변경 없음) → 적용 버튼 disabled, 클릭해도 onApplyRevision 호출 안 됨", () => {
    const reviewEmpty: BlueprintDebateReview = { ...REVIEW, blueprintDelta: [], risks: [] };
    const onApply = vi.fn();
    render(<BlueprintReviewCard review={reviewEmpty} onApplyRevision={onApply} />);
    const applyBtn = screen.getByTestId("blueprint-revision-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    fireEvent.click(applyBtn);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("(#6 회귀) Mission 생성/GitHub write 버튼은 노출되지 않음 — 수정안은 draft only", () => {
    render(<BlueprintReviewCard review={REVIEW} onApplyRevision={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /mission/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^merge$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^review submit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^label/i })).toBeNull();
  });

  it("(#7 applied notice) appliedNotice 전달되면 emerald 라벨로 표시(부모 투명성)", () => {
    render(
      <BlueprintReviewCard
        review={REVIEW}
        onApplyRevision={vi.fn()}
        appliedNotice="초안에 적용됨 · Mission 자동 생성 없음 · 2026-06-14 12:00"
      />,
    );
    const notice = screen.getByTestId("blueprint-revision-applied-notice");
    expect(notice.textContent).toContain("초안에 적용됨");
    expect(notice.textContent).toContain("Mission 자동 생성 없음");
  });

  it("(#8 scaffold refresh CTA) onScaffoldRefresh 배선되면 CTA 노출, 클릭 시 콜백 호출", () => {
    const onRefresh = vi.fn();
    render(<BlueprintReviewCard review={REVIEW} onApplyRevision={vi.fn()} onScaffoldRefresh={onRefresh} />);
    const cta = screen.getByTestId("blueprint-scaffold-refresh");
    expect(cta.textContent).toContain("수정안으로 스캐폴드 다시 생성");
    fireEvent.click(cta);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("(#9 scaffold refresh 미배선) onScaffoldRefresh 없으면 CTA 자체 부재", () => {
    render(<BlueprintReviewCard review={REVIEW} onApplyRevision={vi.fn()} />);
    expect(screen.queryByTestId("blueprint-scaffold-refresh")).toBeNull();
  });

  it("(#11 scaffold refresh round-trip) onScaffoldRefresh가 missionId 기반 refresh 호출을 부모로 전달(App.tsx 실제 wiring 시뮬레이션)", () => {
    // 부모의 refreshScaffold 함수 — Container에서 받은 ref.current
    const refreshScaffold = vi.fn();
    const KNOWN_MISSION_ID = "mission_linked_1";
    function Harness() {
      // App.tsx 패턴: missionId가 있을 때만 onScaffoldRefresh를 전달
      const handleScaffoldRefresh = () => {
        refreshScaffold(KNOWN_MISSION_ID);
      };
      return (
        <BlueprintReviewCard
          review={REVIEW}
          onApplyRevision={vi.fn()}
          onScaffoldRefresh={handleScaffoldRefresh}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByTestId("blueprint-scaffold-refresh"));
    expect(refreshScaffold).toHaveBeenCalledTimes(1);
    expect(refreshScaffold).toHaveBeenCalledWith(KNOWN_MISSION_ID);
  });

  it("(#10 round-trip) 부모 state controller로 적용 → appliedNotice 표시(App.tsx 실제 wiring 시뮬레이션)", () => {
    function Harness() {
      const [notice, setNotice] = useState<string | undefined>();
      const handleApply = (draft: BlueprintRevisionDraft) => {
        // App.tsx의 handleApplyBlueprintRevision과 동일 형태로 notice 구성
        setNotice(
          `초안에 적용됨 · Mission 자동 생성 없음 · 새 결정 ${draft.addedCriteria.length}, 위험 ${draft.riskNotes.length}`,
        );
      };
      return (
        <BlueprintReviewCard
          review={REVIEW}
          onApplyRevision={handleApply}
          appliedNotice={notice}
        />
      );
    }
    render(<Harness />);
    // 클릭 전 노티 없음
    expect(screen.queryByTestId("blueprint-revision-applied-notice")).toBeNull();
    // 적용 클릭 → 부모 state 업데이트 → 노티 표시
    fireEvent.click(screen.getByTestId("blueprint-revision-apply"));
    const notice = screen.getByTestId("blueprint-revision-applied-notice");
    expect(notice.textContent).toContain("초안에 적용됨");
    expect(notice.textContent).toContain("Mission 자동 생성 없음");
  });
});
