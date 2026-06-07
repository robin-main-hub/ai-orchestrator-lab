import { describe, expect, it } from "vitest";
import type { CodingPacket, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import {
  createCodingPacketExecutionSlotBlock,
  isCodingPacketExecutionHandoff,
} from "./codingPacketExecutionLoop";

const createdAt = "2026-06-06T10:00:00.000Z";

const packet = {
  goal: "Implement the orchestration OS handoff loop",
  verificationPlan: ["pnpm --filter @ai-orchestrator/desktop test"],
  filesToInspect: ["apps/desktop/src/App.tsx"],
} as CodingPacket;

const workItem = {
  id: "work_item_packet_1",
  sessionId: "session_desktop_001",
  title: "패킷 실행 슬롯 준비",
  kind: "spec_doc",
  lane: "approve",
  surface: "coding_packet",
  status: "waiting_approval",
  summary: "1 implementation step",
  sourceRefs: [],
  evidenceRefs: [
    {
      id: "evidence_packet_1",
      kind: "artifact",
      reference: "coding_packet://session_desktop_001",
      summary: "CodingPacket",
      observedAt: createdAt,
    },
  ],
  missingInfo: [],
  priority: "normal",
  createdAt,
} satisfies WorkItem;

const handoff = {
  id: "handoff_packet_1",
  workItemId: workItem.id,
  targetSurface: "execution_slot",
  summary: "Coding Packet is ready to route into execution slots after approval.",
  payloadRef: "coding_packet://session_desktop_001",
  evidenceRefs: workItem.evidenceRefs,
  missingInfo: [],
  approvalState: "required",
  createdAt,
} satisfies WorkItemHandoff;

describe("coding packet execution loop", () => {
  it("recognizes only coding packet handoffs targeting execution slots", () => {
    expect(isCodingPacketExecutionHandoff(handoff)).toBe(true);
    expect(isCodingPacketExecutionHandoff({ ...handoff, targetSurface: "conversation" })).toBe(false);
    expect(isCodingPacketExecutionHandoff({ ...handoff, payloadRef: "permission://terminal" })).toBe(false);
  });

  it("creates a redacted tmux execution-slot timeline block after packet handoff approval", () => {
    const block = createCodingPacketExecutionSlotBlock({
      createdAt,
      handoff: { ...handoff, approvalState: "approved" },
      packet,
      sessionId: "session_desktop_001",
      workItem,
    });

    expect(block).toMatchObject({
      createdAt,
      host: "dgx_02",
      kind: "handoff",
      paneId: "role:code",
      redactionApplied: true,
      relatedEventIds: [handoff.id, workItem.id],
      role: "code",
      sessionId: "session_desktop_001",
      status: "completed",
      terminalSessionId: "terminal_session_ai_swarm",
      title: "실행 슬롯 준비됨",
    });
    expect(block.summary).toContain("Implement the orchestration OS handoff loop");
    expect(block.summary).toContain("검증 1개");
    expect(block.summary).toContain("파일 1개");
  });
});
