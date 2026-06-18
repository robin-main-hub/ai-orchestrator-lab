// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";
import type { RunnerSessionInput } from "../../lib/runnerTheater";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

afterEach(() => cleanup());

// Engine E5 — WorkItem Candidates: the read-only central axis. Candidate-only;
// derived from existing signals + explicit inputs. Never committed work.

// a real attention runner → should derive a "now" runner candidate in LIVE
const attentionRunner: RunnerSessionInput = {
  id: "ms-blk",
  title: "blocked live runner",
  role: "QA/Verifier",
  agent: "qa-verifier",
  model: "m",
  status: "blocked",
  heartbeat: "2026-06-18T11:00:00.000Z",
  events: [],
  artifacts: [],
  worktree: { branch: "agent/blk" },
};

describe("E5 — WorkItem Candidates card", () => {
  it("PREVIEW derives candidates from the example signals", () => {
    render(<AssistantInboxContainer />); // PREVIEW
    const card = screen.getByTestId("work-item-candidates-card");
    expect(card).toBeTruthy();
    expect(Number(card.getAttribute("data-total"))).toBeGreaterThan(0);
    expect(screen.getByTestId("wic-lane-now")).toBeTruthy();
  });

  it("LIVE derives a candidate from a real attention runner (central axis)", () => {
    render(
      <AssistantInboxContainer
        live={{ runnerSessions: [attentionRunner], nowMs: Date.parse("2026-06-18T12:00:00.000Z") }}
      />,
    );
    const row = screen.getByTestId("wic-row-wic-runner-ms-blk");
    expect(row.getAttribute("data-kind")).toBe("runner");
    expect(row.getAttribute("data-lane")).toBe("now");
  });

  it("LIVE merges explicitly-passed candidate inputs (read-only)", () => {
    const extra: WorkItemCandidateInput[] = [
      { id: "wic-manual-1", title: "manual candidate", kind: "patch", lane: "soon", status: "candidate", risk: "medium" },
    ];
    render(<AssistantInboxContainer live={{ workItemCandidates: extra }} />);
    expect(screen.getByTestId("wic-row-wic-manual-1").getAttribute("data-risk")).toBe("medium");
  });

  it("LIVE with no signals shows an honest empty state (no fixture leak)", () => {
    render(<AssistantInboxContainer live={{}} />);
    const card = screen.getByTestId("work-item-candidates-card");
    expect(card.getAttribute("data-total")).toBe("0");
    expect(screen.getByTestId("work-item-candidates-empty")).toBeTruthy();
    // PREVIEW example candidates never leak into LIVE
    expect(screen.queryByTestId("wic-row-wic-runner-example-1")).toBeNull();
  });

  it("is candidate-only and read-only: no buttons, no side-effect/domain text", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("work-item-candidates-card");
    expect(card.querySelectorAll("button").length).toBe(0);
    expect(card.textContent).toContain("not committed");
    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
