import { describe, expect, it } from "vitest";
import {
  annexCopy,
  roundStatusLabel,
  type DebateRoundStatus,
} from "./debateChamberPresentation";

// Characterization tests (no behavior change) for the two exports the existing
// debateChamberPresentation.test.ts leaves uncovered. formatDebateFooterMeta
// already calls roundStatusLabel internally, but the status→label fold is never
// asserted head-on, and annexCopy is not pinned at all. roundStatusLabel is
// pure: it maps the 5-literal DebateRoundStatus union onto 4 Korean labels,
// collapsing "complete" and "completed" onto the same "완료" and routing the
// remaining "pending" through the default arm. We pin every literal incl. the
// complete/completed collapse and the default fallthrough.

const ALL_STATUSES: DebateRoundStatus[] = ["blocked", "complete", "completed", "pending", "running"];

describe("roundStatusLabel", () => {
  it("collapses both complete spellings onto the same 완료 label", () => {
    expect(roundStatusLabel("complete")).toBe("완료");
    expect(roundStatusLabel("completed")).toBe("완료");
  });

  it("maps running and blocked to their distinct labels", () => {
    expect(roundStatusLabel("running")).toBe("진행 중");
    expect(roundStatusLabel("blocked")).toBe("차단");
  });

  it("routes pending through the default 대기 arm", () => {
    expect(roundStatusLabel("pending")).toBe("대기");
  });

  it("returns a non-empty label for every status literal", () => {
    for (const status of ALL_STATUSES) {
      expect(roundStatusLabel(status), status).toBeTruthy();
    }
  });
});

describe("annexCopy", () => {
  it("pins the annex kicker copy", () => {
    expect(annexCopy).toEqual({ kicker: "토론 보조자료" });
  });
});
