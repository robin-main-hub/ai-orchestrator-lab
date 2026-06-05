import { describe, expect, it } from "vitest";
import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import { createControlQueueContinuitySummary } from "./controlQueueContinuity";

const createdAt = "2026-06-05T00:00:00.000Z";

function workItem(patch: Partial<WorkItem> = {}): WorkItem {
  return {
    id: patch.id ?? "work_item_1",
    sessionId: "session_main",
    title: patch.title ?? "질문 필요: 승인 판단",
    kind: patch.kind ?? "internal_coord",
    lane: patch.lane ?? "ask",
    surface: patch.surface ?? "conversation",
    status: patch.status ?? "waiting_input",
    summary: patch.summary ?? "운영자 보충 답변 필요",
    sourceRefs: [],
    evidenceRefs: [],
    missingInfo: [],
    priority: patch.priority ?? "normal",
    createdAt: patch.createdAt ?? createdAt,
  };
}

function draft(patch: Partial<AssistantDraft> = {}): AssistantDraft {
  return {
    id: patch.id ?? "draft_1",
    workItemId: patch.workItemId ?? "work_item_2",
    sessionId: "session_main",
    title: patch.title ?? "Control Queue 수정 초안",
    body: "초안",
    targetSurface: "conversation",
    status: patch.status ?? "draft",
    confidence: "medium",
    evidenceRefs: [],
    missingInfo: [],
    createdAt,
  };
}

function handoff(patch: Partial<WorkItemHandoff> = {}): WorkItemHandoff {
  return {
    id: patch.id ?? "handoff_1",
    workItemId: patch.workItemId ?? "work_item_3",
    targetSurface: patch.targetSurface ?? "execution_slot",
    summary: patch.summary ?? "실행 슬롯으로 위임",
    payloadRef: "permission://terminal",
    evidenceRefs: [],
    missingInfo: [],
    approvalState: patch.approvalState ?? "required",
    createdAt,
  };
}

describe("control queue continuity summary", () => {
  it("summarizes ask/edit/delegate follow-up items for the conversation header", () => {
    const summary = createControlQueueContinuitySummary({
      assistantDrafts: [draft()],
      handoffs: [handoff()],
      workItems: [
        workItem({ id: "work_item_ask", lane: "ask", status: "waiting_input" }),
        workItem({
          id: "work_item_check",
          lane: "check",
          status: "drafted",
          title: "수정 초안: 실행 조건",
          createdAt: "2026-06-05T00:01:00.000Z",
        }),
        workItem({ id: "work_item_done", lane: "check", status: "done" }),
      ],
    });

    expect(summary).toEqual({
      hasItems: true,
      label: "큐 이어받기: 질문 1 · 초안 1 · 위임 1",
      latestTitle: "수정 초안: 실행 조건",
      tone: "loading",
    });
  });

  it("returns an empty ready summary when there is no active follow-up", () => {
    const summary = createControlQueueContinuitySummary({
      assistantDrafts: [draft({ status: "sent" })],
      handoffs: [handoff({ approvalState: "not_required" })],
      workItems: [workItem({ status: "done" })],
    });

    expect(summary).toEqual({
      hasItems: false,
      label: "큐 이어받기 없음",
      tone: "ready",
    });
  });
});
