import { describe, expect, it } from "vitest";
import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import { classifyWorkItemLane, deriveWorkQueueBoard, formatWorkItemAge } from "./workItemBoard";

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
