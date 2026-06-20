import { describe, expect, it } from "vitest";
import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import {
  classifyWorkItemLane,
  deriveWorkQueueBoard,
  formatWorkItemAge,
  WORK_QUEUE_LANES,
} from "./workItemBoard";

const createdAt = "2026-06-05T08:00:00.000Z";

function createWorkItem(patch: Partial<WorkItem> & Pick<WorkItem, "id" | "lane" | "status" | "title">): WorkItem {
  return {
    id: patch.id,
    sessionId: "session_main",
    title: patch.title,
    kind: "internal_coord",
    lane: patch.lane,
    surface: patch.surface ?? "conversation",
    status: patch.status,
    summary: patch.summary ?? `${patch.title} summary`,
    sourceRefs: [],
    evidenceRefs: [],
    missingInfo: patch.missingInfo ?? [],
    priority: patch.priority ?? "normal",
    createdAt: patch.createdAt ?? createdAt,
    updatedAt: patch.updatedAt,
  };
}

describe("workItemBoard", () => {
  it("운영 queue lane을 상태와 누락 정보 기준으로 분류한다", () => {
    expect(classifyWorkItemLane(createWorkItem({ id: "w1", lane: "auto", status: "captured", title: "auto" }))).toBe("auto");
    expect(classifyWorkItemLane(createWorkItem({ id: "w2", lane: "check", status: "drafted", title: "check" }))).toBe("check");
    expect(
      classifyWorkItemLane(
        createWorkItem({
          id: "w3",
          lane: "check",
          status: "waiting_input",
          title: "ask",
          missingInfo: [
            {
              id: "missing_1",
              label: "질문",
              reason: "운영자 확인 필요",
              required: true,
              status: "missing",
            },
          ],
        }),
      ),
    ).toBe("ask");
    expect(classifyWorkItemLane(createWorkItem({ id: "w4", lane: "approve", status: "waiting_approval", title: "approve" }))).toBe("approve");
    expect(classifyWorkItemLane(createWorkItem({ id: "w5", lane: "check", status: "blocked", title: "blocked" }))).toBe("blocked");
  });

  it("우선순위와 age/SLA 신호를 가진 보드를 만든다", () => {
    const draft: AssistantDraft = {
      id: "draft_1",
      workItemId: "w_check",
      sessionId: "session_main",
      title: "수정 초안",
      body: "승인 전에 문구 보정",
      targetSurface: "conversation",
      status: "draft",
      confidence: "medium",
      evidenceRefs: [],
      missingInfo: [],
      createdAt,
    };
    const handoff: WorkItemHandoff = {
      id: "handoff_1",
      workItemId: "w_approve",
      targetSurface: "execution_slot",
      summary: "실행 슬롯 위임",
      evidenceRefs: [],
      missingInfo: [],
      approvalState: "required",
      createdAt,
    };
    const board = deriveWorkQueueBoard({
      drafts: [draft],
      handoffs: [handoff],
      items: [
        createWorkItem({
          id: "w_old_normal",
          lane: "check",
          status: "captured",
          title: "오래된 일반 검토",
          createdAt: "2026-06-05T03:00:00.000Z",
          priority: "normal",
        }),
        createWorkItem({
          id: "w_high",
          lane: "check",
          status: "captured",
          title: "긴급 검토",
          createdAt: "2026-06-05T07:59:00.000Z",
          priority: "high",
        }),
      ],
      now: new Date("2026-06-05T08:10:00.000Z"),
    });

    const checkLane = board.lanes.find((lane) => lane.id === "check");

    expect(board.activeCount).toBe(2);
    expect(board.pendingDrafts).toHaveLength(1);
    expect(board.pendingHandoffCount).toBe(1);
    expect(board.staleCount).toBe(1);
    expect(checkLane?.items.map((item) => item.id)).toEqual(["w_high", "w_old_normal"]);
    expect(checkLane?.urgentCount).toBe(1);
    expect(checkLane?.staleCount).toBe(1);
    expect(checkLane?.items[1]?.ageLabel).toBe("5시간");
  });

  it("age label은 깨진 날짜를 안전하게 처리한다", () => {
    expect(formatWorkItemAge("not-a-date").ageLabel).toBe("시간 미상");
  });
});

// Characterization tests (no behavior change) for board invariants the block above
// leaves unpinned: the WORK_QUEUE_LANES constant itself (ordering + labels), the
// PRECEDENCE inside classifyWorkItemLane when several conditions hold at once (the
// existing cases each trip exactly one branch, never the overlap), and the stale
// boundaries / clamping of formatWorkItemAge (only the invalid-date and one "5시간"
// value were asserted before). Load-bearing contract: the board always renders all
// five lanes in the documented fixed order even when empty, lane classification is
// a strict first-match cascade blocked → ask → approve → auto → check, and age
// staleness flips at exactly 30분 / 4시간 / 1일 with future timestamps clamped to 0.
describe("workItemBoard invariants", () => {
  it("WORK_QUEUE_LANES is the fixed operator ordering with Korean labels", () => {
    expect(WORK_QUEUE_LANES.map((lane) => lane.id)).toEqual([
      "auto",
      "check",
      "ask",
      "approve",
      "blocked",
    ]);
    expect(WORK_QUEUE_LANES.map((lane) => lane.label)).toEqual(["자동", "검토", "질문", "승인", "차단"]);
  });

  it("deriveWorkQueueBoard always emits all five lanes in WORK_QUEUE_LANES order, even empty", () => {
    const board = deriveWorkQueueBoard({ drafts: [], handoffs: [], items: [] });
    // derived straight from the constant so the board can never silently drop/reorder a lane
    expect(board.lanes.map((lane) => ({ id: lane.id, label: lane.label }))).toEqual(
      WORK_QUEUE_LANES.map((lane) => ({ id: lane.id, label: lane.label })),
    );
    expect(board.lanes.every((lane) => lane.count === 0 && lane.items.length === 0)).toBe(true);
    expect(board.activeCount).toBe(0);
    expect(board.waitingInputCount).toBe(0);
  });

  it("classifyWorkItemLane is a strict first-match cascade (blocked > ask > approve)", () => {
    const requiredMissing = [
      { id: "m1", label: "q", reason: "r", required: true, status: "missing" as const },
    ];
    // blocked wins even though the required-missing-info (ask) condition is also true
    expect(
      classifyWorkItemLane(
        createWorkItem({ id: "p1", lane: "ask", status: "blocked", title: "p1", missingInfo: requiredMissing }),
      ),
    ).toBe("blocked");
    // ask wins over a simultaneously-true waiting_approval (ask is checked before approve)
    expect(
      classifyWorkItemLane(
        createWorkItem({ id: "p2", lane: "check", status: "waiting_approval", title: "p2", missingInfo: requiredMissing }),
      ),
    ).toBe("ask");
  });

  it("classifyWorkItemLane honors the explicit lane override branches", () => {
    // lane override with no corresponding status signal still routes to that lane
    expect(classifyWorkItemLane(createWorkItem({ id: "o1", lane: "ask", status: "captured", title: "o1" }))).toBe("ask");
    expect(classifyWorkItemLane(createWorkItem({ id: "o2", lane: "approve", status: "captured", title: "o2" }))).toBe("approve");
    expect(classifyWorkItemLane(createWorkItem({ id: "o3", lane: "auto", status: "captured", title: "o3" }))).toBe("auto");
  });

  it("non-required missing info does NOT force the ask lane", () => {
    expect(
      classifyWorkItemLane(
        createWorkItem({
          id: "n1",
          lane: "check",
          status: "captured",
          title: "n1",
          missingInfo: [{ id: "m", label: "opt", reason: "r", required: false, status: "missing" }],
        }),
      ),
    ).toBe("check");
  });

  it("formatWorkItemAge stale flips at exactly 30분 / 4시간 / 1일 and clamps future", () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const MIN = 60_000;
    const HOUR = 60 * MIN;

    expect(formatWorkItemAge(ago(30_000), now)).toEqual({ ageLabel: "방금", isStale: false });
    expect(formatWorkItemAge(ago(29 * MIN), now)).toEqual({ ageLabel: "29분", isStale: false });
    expect(formatWorkItemAge(ago(30 * MIN), now)).toEqual({ ageLabel: "30분", isStale: true });
    expect(formatWorkItemAge(ago(3 * HOUR + 59 * MIN), now)).toEqual({ ageLabel: "3시간", isStale: false });
    expect(formatWorkItemAge(ago(4 * HOUR), now)).toEqual({ ageLabel: "4시간", isStale: true });
    expect(formatWorkItemAge(ago(24 * HOUR), now)).toEqual({ ageLabel: "1일", isStale: true });
    // a future createdAt clamps the delta to 0 → "방금", never negative
    expect(formatWorkItemAge(ago(-5 * MIN), now)).toEqual({ ageLabel: "방금", isStale: false });
  });
});
