// @vitest-environment jsdom
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
});
