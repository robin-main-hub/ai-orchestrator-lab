import { describe, expect, it } from "vitest";
import type { ServerMissionRecord } from "./productKernel.js";
import { orchestrationMissionStatusSchema } from "./productKernel.js";
import {
  deriveMissionKanbanBoard,
  deriveMissionKanbanCard,
  deriveMissionTrace,
  kanbanColumnForMissionStatus,
  MISSION_KANBAN_COLUMN_LABEL,
  MISSION_KANBAN_COLUMN_ORDER,
  missionKanbanColumnIdSchema,
  missionTraceEventTypeSchema,
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

  it("redacts fine-grained PAT (github_pat_) — base62 body evades classic gh_ and hex rules", () => {
    // 회귀: classic gh[pousr]_ 규칙은 github_pat_를 못 잡고, body가 base62(비-hex)면
    // [A-Fa-f0-9]{32,} 규칙도 회피 → 평문 PAT가 trace preview에 그대로 노출됐다.
    // 토큰을 조각조합으로 만들어 repo gitleaks 오탐을 피하면서 SECRET_RE는 전체를 본다.
    const body = "wWxXyYzZgGhHiIjJkKlLmM"; // 22 non-hex letters
    const tail = "nNoOpPqQrRsStTuUvVwWxXyYzZgGhHiIjJ"; // non-hex letters, no 32-hex run
    const pat = "github_" + "pat_" + body + "_" + tail;
    const out = redactTracePreview(`leaked ${pat} here`)!;
    expect(out).toContain("[redacted]");
    expect(out).toContain("here");
    expect(out).not.toContain(pat);
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

// mergeStateFromItems (the private mapper behind card.mergeState/mergeCommitSha)
// has five arms: merged / conflict / dry_run / default→queued / no-items→none.
// The card suite above only exercises merged + dry_run — yet the comment on the
// "dry_run / conflict" test OVERPROMISES conflict (it never asserts it). The
// uncovered arms encode a single honesty rule: only a `merged` item with a real
// mergeCommitSha may surface a sha; every other state is a neutral non-merged
// label that NEVER resurfaces or mints a commit sha (합성값 금지). It also reads
// the LAST queue item only, so a later state supersedes an earlier merge. Pin
// the four uncovered arms + latest-wins + the no-synthetic-sha boundary, all
// derived from the switch under test (no magic).
describe("deriveMissionKanbanCard — uncovered merge-state arms (neutral, latest-wins, no synthetic sha)", () => {
  it("no merge queue items → mergeState 'none', no sha invented", () => {
    const card = deriveMissionKanbanCard(record());
    expect(card.mergeState).toBe("none");
    expect(card.mergeCommitSha).toBeUndefined();
  });

  it("conflict surfaces as 'conflict' and never carries a sha, even if a stray one is present", () => {
    const card = deriveMissionKanbanCard(
      record({
        mergeQueueItems: [
          { id: "m", branchName: "b", status: "conflict", mergeCommitSha: "deadbeef", conflictFiles: ["a.ts"], reason: "merge conflict", queuedAt: "t" },
        ] as never,
      }),
    );
    expect(card.mergeState).toBe("conflict");
    expect(card.mergeCommitSha).toBeUndefined(); // conflict arm drops the sha — not a merge
  });

  it("every non-terminal status collapses to the neutral 'queued' bucket, never faking merged/conflict/dry_run", () => {
    for (const status of ["queued", "waiting_approval", "merging", "blocked", "rejected", "failed"]) {
      const card = deriveMissionKanbanCard(
        record({
          mergeQueueItems: [
            { id: "m", branchName: "b", status, mergeCommitSha: "abc123", conflictFiles: [], reason: status, queuedAt: "t" },
          ] as never,
        }),
      );
      expect(card.mergeState).toBe("queued");
      expect(card.mergeCommitSha).toBeUndefined();
    }
  });

  it("reads the LAST queue item only — a later conflict supersedes an earlier merge, dropping its sha", () => {
    const card = deriveMissionKanbanCard(
      record({
        mergeQueueItems: [
          { id: "m1", branchName: "b", status: "merged", mergeCommitSha: "abc1234567def", conflictFiles: [], reason: "ok", queuedAt: "2026-06-13T01:00:00.000Z" },
          { id: "m2", branchName: "b", status: "conflict", conflictFiles: ["x.ts"], reason: "re-conflict", queuedAt: "2026-06-13T02:00:00.000Z" },
        ] as never,
      }),
    );
    expect(card.mergeState).toBe("conflict"); // latest wins
    expect(card.mergeCommitSha).toBeUndefined(); // the superseded merge sha is NOT resurfaced
  });

  it("merged without a real mergeCommitSha stays 'merged' but mints no synthetic sha", () => {
    const card = deriveMissionKanbanCard(
      record({
        mergeQueueItems: [
          { id: "m", branchName: "b", status: "merged", conflictFiles: [], reason: "ok", queuedAt: "t" },
        ] as never,
      }),
    );
    expect(card.mergeState).toBe("merged");
    expect(card.mergeCommitSha).toBeUndefined(); // sha comes from the item only — never fabricated
  });
});

// deriveMissionKanbanBoard sorts cards WITHIN each column by updatedAt
// descending (missionBoard.ts:211) — newest activity on top. The board suite
// above only ever puts ONE card in a column, so the comparator is 0-ref: a flip
// to ascending would silently bury the latest mission at the bottom and nothing
// would catch it. Pin the strict descending order with ≥2 cards per column, and
// that the sort is per-column (a newer card in another column does not perturb
// this column's order). updatedAt values are the oracle (sort key under test).
describe("deriveMissionKanbanBoard — within-column newest-first ordering (0-ref descending sort)", () => {
  const at = (missionId: string, status: string, updatedAt: string): ServerMissionRecord =>
    record({
      mission: {
        missionId,
        title: missionId,
        goal: "g",
        truthStatus: "planned",
        createdBy: "x",
        createdAt: "2026-06-13T00:00:00.000Z",
      },
      status,
      updatedAt,
    } as never);

  it("orders cards in a column strictly by updatedAt descending — latest on top", () => {
    const board = deriveMissionKanbanBoard([
      at("m_old", "running", "2026-06-13T01:00:00.000Z"),
      at("m_new", "running", "2026-06-13T03:00:00.000Z"),
      at("m_mid", "running", "2026-06-13T02:00:00.000Z"),
    ]);
    const running = board.columns.find((c) => c.id === "running")!;
    expect(running.cards.map((c) => c.missionId)).toEqual(["m_new", "m_mid", "m_old"]);
  });

  it("sorts each column independently — a newer card elsewhere does not perturb this column", () => {
    const board = deriveMissionKanbanBoard([
      at("r1", "running", "2026-06-13T01:00:00.000Z"),
      at("v_latest", "verifying", "2026-06-13T09:00:00.000Z"),
      at("r2", "running", "2026-06-13T05:00:00.000Z"),
    ]);
    expect(board.columns.find((c) => c.id === "running")!.cards.map((c) => c.missionId)).toEqual(["r2", "r1"]);
    expect(board.columns.find((c) => c.id === "verifying")!.cards.map((c) => c.missionId)).toEqual(["v_latest"]);
  });
});

// kanbanColumnForMissionStatus must be TOTAL over orchestrationMissionStatusSchema:
// the column suite at the top tests 8 of the 9 declared statuses but omits
// `planned`, which the switch deliberately aliases to the same `todo` column as
// `draft` (a draft/planned pair share the backlog column). Pin that alias, and
// that EVERY declared status maps into the column-id set with no status landing
// outside it (self-consistency over the two schemas — no magic literals).
describe("kanbanColumnForMissionStatus — total over every declared status (planned alias, no unmapped status)", () => {
  it("aliases planned to the same todo backlog column as draft", () => {
    expect(kanbanColumnForMissionStatus("planned")).toBe("todo");
    expect(kanbanColumnForMissionStatus("planned")).toBe(kanbanColumnForMissionStatus("draft"));
  });

  it("maps every declared mission status to a valid kanban column id", () => {
    const columns = new Set(missionKanbanColumnIdSchema.options);
    for (const status of orchestrationMissionStatusSchema.options) {
      expect(columns.has(kanbanColumnForMissionStatus(status))).toBe(true);
    }
  });
});

// mergeTraceEvent (missionBoard.ts:459-487, reached via the merge.queued
// envelope and deriveMissionTrace) is the richest honesty mapper, yet the suite
// only exercises ONE path: merged WITH a real sha → observed. Its other arms are
// unpinned and carry the load-bearing rule: a trace event is `observed` ONLY
// when status==merged AND a real mergeCommitSha is present. A "merged" claim with
// NO commit sha must NOT dress up as observed — it downgrades to `planned`.
// conflict and plain queued are `planned`; dry_run alone is `configured`. The
// type collapses everything non-merged/conflict to merge.queued, but the TITLE
// still distinguishes dry_run from the queue. Pin each arm (values derived from
// the source switch — branch/sha/reason are the oracle, no magic).
describe("mergeTraceEvent — observed needs a real sha (merged-without-sha downgrades, never faked)", () => {
  const mergeEvent = (item: Record<string, unknown>) =>
    traceEventFromMissionEnvelope({
      type: "mission.merge.queued",
      createdAt: "2026-06-13T02:00:00.000Z",
      payload: {
        missionId: "mission_1",
        item: {
          id: "m1",
          missionId: "mission_1",
          branchName: "agent/mission_1",
          requiredVerificationReportId: "v1",
          conflictFiles: [],
          reason: "queued reason",
          queuedAt: "2026-06-13T02:00:00.000Z",
          ...item,
        },
      },
    })!;

  it("merged WITH a real sha → merge.completed, observed, summary slices the sha to 10", () => {
    const e = mergeEvent({ status: "merged", mergeCommitSha: "abcdef1234567890" });
    expect(e.type).toBe("merge.completed");
    expect(e.truthStatus).toBe("observed");
    expect(e.summary).toBe("agent/mission_1 → abcdef1234"); // sha sliced to first 10
  });

  it("merged WITHOUT a sha → still merge.completed but downgraded to planned, summary falls back to reason", () => {
    const e = mergeEvent({ status: "merged" });
    expect(e.type).toBe("merge.completed");
    expect(e.truthStatus).not.toBe("observed"); // no real commit → cannot claim observed
    expect(e.truthStatus).toBe("planned");
    expect(e.summary).toBe("queued reason"); // no synthetic sha line invented
  });

  it("conflict → merge.conflict, error severity, planned, summary counts conflict files", () => {
    const e = mergeEvent({ status: "conflict", conflictFiles: ["a.ts", "b.ts"] });
    expect(e.type).toBe("merge.conflict");
    expect(e.severity).toBe("error");
    expect(e.truthStatus).toBe("planned");
    expect(e.summary).toBe("2개 충돌 파일");
  });

  it("dry_run → merge.queued type but its own title, configured (a real dry-run was observed as not-applied)", () => {
    const e = mergeEvent({ status: "dry_run" });
    expect(e.type).toBe("merge.queued");
    expect(e.title).toBe("머지 드라이런");
    expect(e.truthStatus).toBe("configured");
    expect(e.summary).toBe("queued reason");
  });

  it("plain queued → merge.queued, info severity, planned, queue title", () => {
    const e = mergeEvent({ status: "queued" });
    expect(e.type).toBe("merge.queued");
    expect(e.title).toBe("머지 대기열");
    expect(e.severity).toBe("info");
    expect(e.truthStatus).toBe("planned");
  });
});

// Every test above reaches a trace event's `.type` by string literal, but the
// enum that DEFINES the closed vocabulary of trace types —
// missionTraceEventTypeSchema — is never asserted. It is the single source of
// truth for "what a trace event can be", and it carries two authority facts:
// (1) totality — it is a closed 24-member set, and every type the live-trace
// builders actually emit (deriveMissionTrace snapshot + traceEventFromMissionEnvelope
// stream) is a member, so no builder can smuggle a type outside the declared
// vocabulary; (2) the trace-type surface is DISTINCT from the bus-envelope input
// surface — the dotted envelope names the stream consumes ("mission.created" is a
// shared spelling, but "mission.worker.assigned", "mission.workspace.preview.recorded",
// "mission.merge.queued", "mission.closed" are bus names, NOT trace types) are
// rejected by the enum. Pin both, self-consistent (emitted types come from real
// builder runs; the closed set is the enum's own declared options).
describe("missionTraceEventTypeSchema — closed trace-type totality + bus/trace surface divergence", () => {
  it("is a closed 24-member set and accepts every type the live-trace builders actually emit", () => {
    const CLOSED = [
      "mission.created",
      "worker.assigned",
      "worker.started",
      "checkpoint.created",
      "workspace.attached",
      "preview.recorded",
      "design.blueprint.recorded",
      "visual_qa.recorded",
      "design.issue.recorded",
      "scaffold.planned",
      "scaffold.applied",
      "sandbox.preflight",
      "sandbox.exec.started",
      "sandbox.exec.completed",
      "sandbox.exec.failed",
      "verification.recorded",
      "error_card.recorded",
      "self_correction.started",
      "self_correction.stopped",
      "approval.required",
      "merge.queued",
      "merge.completed",
      "merge.conflict",
      "zombie.detected",
    ];
    expect(missionTraceEventTypeSchema.options).toEqual(CLOSED); // closed totality, exact + ordered

    // every type emitted by the snapshot builder over a richly-populated record is a member
    const snapshot = deriveMissionTrace(
      record({
        workers: [{ id: "w1", agentId: "agent_builder", role: "builder", branchName: "agent/m1", assignedAt: "2026-06-13T00:10:00.000Z" }] as never,
        verificationReports: [
          { id: "v1", verifierAgentId: "agent_verifier", status: "failed", observed: false, checks: [{ status: "failed", summary: "tsc error" }], createdAt: "2026-06-13T00:20:00.000Z" },
        ] as never,
        mergeQueueItems: [{ id: "m", branchName: "b", status: "queued", conflictFiles: [], reason: "q", queuedAt: "2026-06-13T05:00:00.000Z" }] as never,
      }),
    );
    // plus a couple of stream events from the envelope mapper
    const streamed = [
      traceEventFromMissionEnvelope({
        type: "mission.merge.queued",
        createdAt: "2026-06-13T02:00:00.000Z",
        payload: { missionId: "mission_1", item: { id: "m1", missionId: "mission_1", branchName: "agent/mission_1", status: "merged", requiredVerificationReportId: "v1", mergeCommitSha: "abc1234567def", conflictFiles: [], reason: "ok", queuedAt: "2026-06-13T02:00:00.000Z" } },
      })!,
    ];
    for (const event of [...snapshot, ...streamed]) {
      expect(missionTraceEventTypeSchema.safeParse(event.type).success).toBe(true); // never outside the vocabulary
    }
  });

  it("rejects bus-envelope input names — the trace-type surface is distinct from what the stream consumes", () => {
    // these are accepted (or null-rejected) bus spellings, but they are NOT trace event types
    for (const busName of [
      "mission.worker.assigned",
      "mission.workspace.preview.recorded",
      "mission.merge.queued",
      "mission.verification.recorded",
      "mission.closed",
      "events.other",
    ]) {
      expect(missionTraceEventTypeSchema.safeParse(busName).success).toBe(false);
    }
    // "mission.created" is the one shared spelling across both surfaces
    expect(missionTraceEventTypeSchema.safeParse("mission.created").success).toBe(true);
  });
});
