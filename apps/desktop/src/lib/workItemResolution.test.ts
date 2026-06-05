import { describe, expect, it } from "vitest";
import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import { approveWorkItemHandoffState, markAssistantDraftSentState } from "./workItemResolution";

const createdAt = "2026-06-05T00:00:00.000Z";
const updatedAt = "2026-06-05T00:05:00.000Z";

function workItem(patch: Partial<WorkItem> = {}): WorkItem {
  return {
    id: patch.id ?? "work_item_1",
    sessionId: "session_main",
    title: patch.title ?? "초안 확인",
    kind: patch.kind ?? "internal_coord",
    lane: patch.lane ?? "check",
    surface: patch.surface ?? "conversation",
    status: patch.status ?? "drafted",
    summary: patch.summary ?? "초안 전송 확인 필요",
    sourceRefs: [],
    evidenceRefs: [],
    missingInfo: [],
    priority: patch.priority ?? "normal",
    createdAt: patch.createdAt ?? createdAt,
    updatedAt: patch.updatedAt,
  };
}

function draft(patch: Partial<AssistantDraft> = {}): AssistantDraft {
  return {
    id: patch.id ?? "draft_1",
    workItemId: patch.workItemId ?? "work_item_1",
    sessionId: "session_main",
    title: patch.title ?? "대화 답변 초안",
    body: patch.body ?? "초안 본문",
    targetSurface: patch.targetSurface ?? "conversation",
    status: patch.status ?? "draft",
    confidence: patch.confidence ?? "medium",
    evidenceRefs: [],
    missingInfo: [],
    createdAt: patch.createdAt ?? createdAt,
    updatedAt: patch.updatedAt,
  };
}

function handoff(patch: Partial<WorkItemHandoff> = {}): WorkItemHandoff {
  return {
    id: patch.id ?? "handoff_1",
    workItemId: patch.workItemId ?? "work_item_1",
    targetSurface: patch.targetSurface ?? "execution_slot",
    summary: patch.summary ?? "실행 슬롯 위임",
    payloadRef: patch.payloadRef ?? "permission://terminal",
    evidenceRefs: [],
    missingInfo: [],
    approvalState: patch.approvalState ?? "required",
    createdAt: patch.createdAt ?? createdAt,
  };
}

describe("work item resolution helpers", () => {
  it("marks a draft as sent and closes its linked work item", () => {
    const result = markAssistantDraftSentState({
      draftId: "draft_1",
      drafts: [draft()],
      items: [workItem()],
      updatedAt,
    });

    expect(result.updated).toBe(true);
    expect(result.drafts[0]).toMatchObject({
      id: "draft_1",
      status: "sent",
      updatedAt,
    });
    expect(result.items[0]).toMatchObject({
      id: "work_item_1",
      status: "done",
      updatedAt,
    });
  });

  it("approves a handoff and closes its linked work item", () => {
    const result = approveWorkItemHandoffState({
      handoffId: "handoff_1",
      handoffs: [handoff()],
      items: [workItem({ lane: "approve", status: "waiting_approval" })],
      updatedAt,
    });

    expect(result.updated).toBe(true);
    expect(result.handoffs[0]).toMatchObject({
      id: "handoff_1",
      approvalState: "approved",
    });
    expect(result.items[0]).toMatchObject({
      id: "work_item_1",
      status: "done",
      updatedAt,
    });
  });
});
