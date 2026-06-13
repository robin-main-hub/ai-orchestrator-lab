import { describe, expect, it } from "vitest";
import type { ServerMissionRecord } from "./productKernel.js";
import {
  deriveMissionKanbanBoard,
  deriveMissionKanbanCard,
  deriveMissionTrace,
  kanbanColumnForMissionStatus,
  redactTracePreview,
} from "./missionBoard.js";

function record(overrides: Partial<ServerMissionRecord> = {}): ServerMissionRecord {
  return {
    mission: {
      missionId: "mission_1",
      title: "테트리스 구현",
      goal: "테트리스를 만든다",
      truthStatus: "planned",
      createdBy: "kurumi",
      createdAt: "2026-06-13T00:00:00.000Z",
    },
    status: "planned",
    truthStatus: "planned",
    workers: [],
    artifacts: [],
    verificationReports: [],
    mergeQueueItems: [],
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  } as unknown as ServerMissionRecord;
}

describe("kanbanColumnForMissionStatus", () => {
  it("maps mission statuses to the right columns", () => {
    expect(kanbanColumnForMissionStatus("draft")).toBe("todo");
    expect(kanbanColumnForMissionStatus("running")).toBe("running");
    expect(kanbanColumnForMissionStatus("waiting_approval")).toBe("running");
    expect(kanbanColumnForMissionStatus("verifying")).toBe("verifying");
    expect(kanbanColumnForMissionStatus("ready_to_merge")).toBe("ready_to_merge");
    expect(kanbanColumnForMissionStatus("merged")).toBe("merged");
    expect(kanbanColumnForMissionStatus("failed")).toBe("blocked");
    expect(kanbanColumnForMissionStatus("cancelled")).toBe("archived");
  });
});

describe("deriveMissionKanbanCard", () => {
  it("surfaces observed verification + real merge sha honestly", () => {
    const card = deriveMissionKanbanCard(
      record({
        status: "merged",
        workers: [{ id: "w1", agentId: "agent_builder", role: "builder" }] as never,
        verificationReports: [
          { id: "v1", status: "passed", observed: true, checks: [], createdAt: "2026-06-13T01:00:00.000Z" },
        ] as never,
        mergeQueueItems: [
          { id: "m1", branchName: "agent/mission_1", status: "merged", mergeCommitSha: "abc1234567def", conflictFiles: [], reason: "ok", queuedAt: "2026-06-13T02:00:00.000Z" },
        ] as never,
      }),
    );
    expect(card.column).toBe("merged");
    expect(card.primaryAgentRole).toBe("builder");
    expect(card.latestVerificationStatus).toBe("passed");
    expect(card.latestVerificationObserved).toBe(true);
    expect(card.mergeState).toBe("merged");
    expect(card.mergeCommitSha).toBe("abc1234567def");
  });

  it("reports dry_run / conflict merge states without faking", () => {
    const dry = deriveMissionKanbanCard(
      record({ mergeQueueItems: [{ id: "m", branchName: "b", status: "dry_run", conflictFiles: [], reason: "no allowlist", queuedAt: "t" }] as never }),
    );
    expect(dry.mergeState).toBe("dry_run");
    expect(dry.mergeCommitSha).toBeUndefined();
  });
});

describe("deriveMissionKanbanBoard", () => {
  it("groups missions into ordered columns", () => {
    const board = deriveMissionKanbanBoard([
      record({ status: "merged" }),
      record({ status: "verifying" }),
      record({ status: "failed" }),
    ]);
    expect(board.total).toBe(3);
    expect(board.columns.find((c) => c.id === "merged")?.cards).toHaveLength(1);
    expect(board.columns.find((c) => c.id === "verifying")?.cards).toHaveLength(1);
    expect(board.columns.find((c) => c.id === "blocked")?.cards).toHaveLength(1);
  });
});

describe("deriveMissionTrace", () => {
  it("reconstructs the lifecycle and marks verification observed vs simulated", () => {
    const trace = deriveMissionTrace(
      record({
        workers: [{ id: "w1", agentId: "agent_builder", role: "builder", branchName: "agent/m1", assignedAt: "2026-06-13T00:10:00.000Z" }] as never,
        verificationReports: [
          { id: "v1", verifierAgentId: "agent_verifier", status: "failed", observed: false, checks: [{ status: "failed", summary: "tsc error" }], createdAt: "2026-06-13T00:20:00.000Z" },
        ] as never,
      }),
    );
    const types = trace.map((event) => event.type);
    expect(types).toEqual(["mission.created", "worker.assigned", "verification.recorded"]);
    const verify = trace.find((event) => event.type === "verification.recorded")!;
    expect(verify.severity).toBe("error");
    expect(verify.truthStatus).toBe("simulated"); // observed:false → not dressed up
  });

  it("orders events by time", () => {
    const trace = deriveMissionTrace(
      record({
        mergeQueueItems: [{ id: "m", branchName: "b", status: "queued", conflictFiles: [], reason: "q", queuedAt: "2026-06-13T05:00:00.000Z" }] as never,
      }),
    );
    expect(trace[0]!.createdAt <= trace[trace.length - 1]!.createdAt).toBe(true);
  });
});

describe("redactTracePreview", () => {
  it("masks secret-like tokens and truncates", () => {
    expect(redactTracePreview("token sk-abcdefgh12345678 end")).toContain("[redacted]");
    expect(redactTracePreview("x".repeat(500))!.length).toBeLessThanOrEqual(240);
    expect(redactTracePreview(undefined)).toBeUndefined();
  });
});
