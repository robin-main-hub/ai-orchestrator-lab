import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyMissionBranch,
  applyMissionResults,
  applyMissionStep,
  applyMissionUpdate,
  createParallelBoard,
  type ParallelMissionDraft,
} from "../lib/parallelMissionBoard";
import { ParallelMissionBoard } from "./ParallelMissionBoard";

const draft = (id: string, personaName: string): ParallelMissionDraft => ({
  id,
  personaName,
  role: "code",
  goal: `goal ${id}`,
  verificationStepsText: "pnpm test",
});

describe("ParallelMissionBoard", () => {
  it("renders the empty hint when there are no missions", () => {
    const html = renderToStaticMarkup(<ParallelMissionBoard board={{ cards: [] }} />);
    expect(html).toContain("자기 터미널");
  });

  it("renders one terminal per mission with persona, role, status and live step feed", () => {
    let board = createParallelBoard([draft("m1", "kurumi"), draft("m2", "yuno")]);
    board = applyMissionBranch(board, "m1", "agent/par_1_m1");
    board = applyMissionUpdate(board, { missionId: "m1", phase: "running" });
    board = applyMissionStep(board, "m1", { step: 1, outcome: "progressing", action: "dispatch_next", reason: "다음" });
    board = applyMissionResults(board, [
      { missionId: "m1", ok: true, loopStatus: "completed", session: { paneId: "%par0" } as never },
      { missionId: "m2", ok: false, reason: "no_free_pane" },
    ]);

    const html = renderToStaticMarkup(<ParallelMissionBoard board={board} />);
    expect(html).toContain("kurumi");
    expect(html).toContain("yuno");
    expect(html).toContain("%par0"); // pane binding shown
    expect(html).toContain("agent/par_1_m1"); // worktree branch shown
    expect(html).toContain("완료"); // m1 completed badge
    expect(html).toContain("빈 pane 없음"); // m2 rejection
    expect(html).toContain("다음"); // step reason in the feed
    expect(html).toContain("2개 미션");
  });
});
