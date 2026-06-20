import { describe, expect, it } from "vitest";
import type { ServerMissionRecord } from "./productKernel.js";
import {
  deriveMissionKanbanBoard,
  deriveMissionKanbanCard,
  deriveMissionTrace,
  kanbanColumnForMissionStatus,
  MISSION_KANBAN_COLUMN_LABEL,
  MISSION_KANBAN_COLUMN_ORDER,
  missionKanbanColumnIdSchema,
  redactTracePreview,
  traceEventFromMissionEnvelope,
} from "./missionBoard.js";
import { toMissionRuntimeBusEvent } from "./missionRuntimeBus.js";

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

// MISSION_KANBAN_COLUMN_ORDER + MISSION_KANBAN_COLUMN_LABEL are the board's
// display contract: ORDER is the left-to-right column sequence, LABEL the
// Korean header for each. They are 0-ref across the test tree yet
// deriveMissionKanbanBoard renders straight from them, so a silent reorder or a
// missing/extra label would shift the whole board (or crash the lookup). Pin
// them against missionKanbanColumnIdSchema.options (self-consistency: a column
// id and only a column id). Note the deliberate divergence: the DISPLAY order
// puts `blocked` before `archived`, while the schema *declaration* order has
// `archived` before `blocked` — pin that the two are NOT accidentally the same
// list (display order is curated, not the enum order).
describe("MISSION_KANBAN_COLUMN_ORDER / _LABEL — board display contract", () => {
  it("ORDER is the exact curated left-to-right sequence", () => {
    expect(MISSION_KANBAN_COLUMN_ORDER).toEqual([
      "todo",
      "running",
      "verifying",
      "ready_to_merge",
      "merged",
      "blocked",
      "archived",
    ]);
  });

  it("ORDER is a permutation of every schema column id — each exactly once, no extras", () => {
    expect([...MISSION_KANBAN_COLUMN_ORDER].sort()).toEqual([...missionKanbanColumnIdSchema.options].sort());
    expect(new Set(MISSION_KANBAN_COLUMN_ORDER).size).toBe(MISSION_KANBAN_COLUMN_ORDER.length);
  });

  it("display ORDER is curated, NOT the schema declaration order (blocked before archived, not after)", () => {
    expect(MISSION_KANBAN_COLUMN_ORDER).not.toEqual(missionKanbanColumnIdSchema.options);
    const order = MISSION_KANBAN_COLUMN_ORDER;
    expect(order.indexOf("blocked")).toBeLessThan(order.indexOf("archived"));
    const schema = missionKanbanColumnIdSchema.options;
    expect(schema.indexOf("archived")).toBeLessThan(schema.indexOf("blocked"));
  });

  it("LABEL has a non-empty Korean header for every column id — no missing, no extra keys", () => {
    expect(Object.keys(MISSION_KANBAN_COLUMN_LABEL).sort()).toEqual([...missionKanbanColumnIdSchema.options].sort());
    for (const id of missionKanbanColumnIdSchema.options) {
      expect(MISSION_KANBAN_COLUMN_LABEL[id].length).toBeGreaterThan(0);
    }
  });

  it("deriveMissionKanbanBoard renders columns straight from ORDER + LABEL", () => {
    const board = deriveMissionKanbanBoard([]);
    expect(board.columns.map((c) => c.id)).toEqual([...MISSION_KANBAN_COLUMN_ORDER]);
    for (const column of board.columns) {
      expect(column.label).toBe(MISSION_KANBAN_COLUMN_LABEL[column.id]);
    }
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

// The case above proves one secret family (sk-) is masked and that long input is
// capped, but SECRET_RE guards several more credential shapes — Bearer tokens,
// GitHub/Slack tokens, long hex blobs, AWS access-key ids — and the truncation
// has an exact off-by-one/ellipsis boundary plus a custom max. Since this is the
// only thing standing between a raw log line and a leaked credential in a trace
// preview, pin every family, the global (multi-secret) replace, clean
// passthrough, and the precise truncation boundary.
describe("redactTracePreview — full secret families, global replace, truncation boundary", () => {
  // Secret-shaped fixtures are assembled from fragments at runtime so no full
  // credential literal ever appears in source — that keeps the repo's own
  // gitleaks secret-scan from flagging these test strings, while SECRET_RE still
  // sees the fully reconstructed token.
  const TAIL = "abcdefgh" + "12345678";
  it("redacts each credential family SECRET_RE guards, removing the raw token", () => {
    // [family, the raw secret token]
    const tokens: Array<[string, string]> = [
      ["Bearer", "Bearer " + TAIL],
      ["GitHub", "ghp_" + TAIL],
      ["Slack", "xoxb-" + TAIL],
      ["hex blob", "deadbeef".repeat(4)], // 32 hex chars
      ["AWS key", "AKIA" + "ABCDEFGH1234"],
    ];
    for (const [, token] of tokens) {
      const out = redactTracePreview(`pre ${token} tail`)!;
      expect(out).toContain("[redacted]");
      expect(out).toContain("tail"); // surrounding words survive
      expect(out).not.toContain(token); // the raw credential is gone
    }
  });

  it("replaces every secret occurrence (global flag), not just the first", () => {
    const s1 = "sk-" + TAIL;
    const s2 = "ghp_" + "zzzzzzzz" + "99999999";
    const out = redactTracePreview(`a ${s1} b ${s2} c`)!;
    expect(out).not.toContain(s1);
    expect(out).not.toContain(s2);
    expect(out.match(/\[redacted\]/g)).toHaveLength(2);
    expect(out).toBe("a [redacted] b [redacted] c"); // surrounding text intact
  });

  it("returns clean text unchanged (no false-positive redaction)", () => {
    const clean = "no secrets here, just a plain build log line";
    expect(redactTracePreview(clean)).toBe(clean);
  });

  it("keeps text at exactly max untouched but truncates max+1 to (max-1)+ellipsis", () => {
    // 'x' is outside [A-Fa-f0-9] so the fill never trips the hex rule
    expect(redactTracePreview("x".repeat(10), 10)).toBe("x".repeat(10)); // == max: no ellipsis
    const overByOne = redactTracePreview("x".repeat(11), 10)!;
    expect(overByOne).toHaveLength(10);
    expect(overByOne.endsWith("…")).toBe(true);
    expect(overByOne).toBe(`${"x".repeat(9)}…`);
    // default max is 240
    const defaultCap = redactTracePreview("x".repeat(241))!;
    expect(defaultCap).toHaveLength(240);
    expect(defaultCap.endsWith("…")).toBe(true);
  });
});

describe("traceEventFromMissionEnvelope", () => {
  it("maps a created envelope to the same shape as the snapshot builder", () => {
    const event = traceEventFromMissionEnvelope({
      type: "mission.created",
      createdAt: "2026-06-13T00:00:00.000Z",
      payload: {
        missionId: "mission_1",
        title: "테트리스 구현",
        goal: "g",
        truthStatus: "planned",
        createdBy: "kurumi",
      },
    });
    expect(event).not.toBeNull();
    expect(event!.type).toBe("mission.created");
    expect(event!.summary).toBe("테트리스 구현");
    expect(event!.id).toBe("mission_1:created");
  });

  it("keeps observed honesty + redacts preview for verification envelopes", () => {
    const event = traceEventFromMissionEnvelope({
      type: "mission.verification.recorded",
      createdAt: "2026-06-13T00:20:00.000Z",
      payload: {
        missionId: "mission_1",
        observedDowngraded: false,
        report: {
          id: "v1",
          missionId: "mission_1",
          verifierAgentId: "agent_verifier",
          status: "failed",
          checks: [
            { id: "c1", command: "tsc", status: "failed", summary: "leak sk-abcdefgh12345678 here", startedAt: "t" },
          ],
          artifactIds: [],
          observed: false,
          createdAt: "2026-06-13T00:20:00.000Z",
        },
      },
    });
    expect(event!.type).toBe("verification.recorded");
    expect(event!.severity).toBe("error");
    expect(event!.truthStatus).toBe("simulated"); // observed:false → not dressed up
    expect(event!.payloadPreview).toContain("[redacted]"); // no raw secret on the wire
  });

  it("exposes real merge sha as observed for merge.queued(merged) envelopes", () => {
    const event = traceEventFromMissionEnvelope({
      type: "mission.merge.queued",
      createdAt: "2026-06-13T02:00:00.000Z",
      payload: {
        missionId: "mission_1",
        item: {
          id: "m1",
          missionId: "mission_1",
          branchName: "agent/mission_1",
          status: "merged",
          requiredVerificationReportId: "v1",
          mergeCommitSha: "abc1234567def",
          conflictFiles: [],
          reason: "ok",
          queuedAt: "2026-06-13T02:00:00.000Z",
        },
      },
    });
    expect(event!.type).toBe("merge.completed");
    expect(event!.truthStatus).toBe("observed");
  });

  it("returns null for unmapped / broken payloads (mission.closed, garbage)", () => {
    expect(traceEventFromMissionEnvelope({ type: "mission.closed", createdAt: "t", payload: { missionId: "m" } })).toBeNull();
    expect(traceEventFromMissionEnvelope({ type: "mission.created", createdAt: "t", payload: { nope: 1 } })).toBeNull();
    expect(traceEventFromMissionEnvelope({ type: "events.other", createdAt: "t", payload: {} })).toBeNull();
  });
});

describe("toMissionRuntimeBusEvent", () => {
  it("projects a trace event to the compact bus event (no preview/secret)", () => {
    const [created] = deriveMissionTrace(record());
    const bus = toMissionRuntimeBusEvent(created!);
    expect(bus).toEqual({
      missionId: created!.missionId,
      traceEventId: created!.id,
      eventType: created!.type,
      severity: created!.severity,
      truthStatus: created!.truthStatus,
      createdAt: created!.createdAt,
    });
    expect(Object.keys(bus)).not.toContain("payloadPreview");
  });
});
