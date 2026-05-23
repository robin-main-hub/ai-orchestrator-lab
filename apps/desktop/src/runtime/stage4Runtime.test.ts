import { describe, expect, it } from "vitest";
import type { AgentProfile, CodingPacket, ConversationMessage, EventEnvelope } from "@ai-orchestrator/protocol";
import { createStage4AgentRun } from "./stage4Runtime";

const packet: CodingPacket = {
  goal: "Wire agent runtime",
  context: ["Conversation -> Debate -> Coding Packet"],
  decisions: ["Use Event Store as the source of truth"],
  rejectedOptions: ["Run terminal commands without approval"],
  constraints: ["No raw secret persistence"],
  filesToInspect: ["apps/desktop/src/App.tsx"],
  implementationPlan: ["Create runtime plan", "Attach verifier"],
  verificationPlan: ["typecheck", "test"],
  reviewerNotes: ["Keep executor blocked"],
};

const agents: AgentProfile[] = [
  {
    id: "agent_orchestrator",
    name: "Orchestrator",
    kind: "virtual",
    role: "orchestrator",
    soulMode: "summary",
    enabled: true,
  },
  {
    id: "agent_reviewer",
    name: "Reviewer",
    kind: "virtual",
    role: "reviewer",
    soulMode: "retrieved",
    enabled: true,
  },
  {
    id: "agent_executor",
    name: "Executor",
    kind: "real",
    role: "executor",
    soulMode: "off",
    enabled: true,
  },
];

const messages: ConversationMessage[] = [
  {
    id: "message_1",
    sessionId: "session_desktop_001",
    role: "user",
    content: "Run this through the orchestrator",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

const events: EventEnvelope[] = [
  {
    id: "event_1",
    sessionId: "session_desktop_001",
    type: "coding_packet.created",
    payload: {},
    createdAt: "2026-05-24T00:00:00.000Z",
    source: "desktop",
    sourceTrust: "trusted",
    redacted: false,
  },
];

describe("stage4 agent runtime", () => {
  it("turns a coding packet into an approval-gated agent run", () => {
    const run = createStage4AgentRun({
      packet,
      primaryAgent: agents[0],
      agents,
      messages,
      events,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(run.status).toBe("ready_for_approval");
    expect(run.soulSummary).toContain("summary soul");
    expect(run.recallTrace).toHaveLength(3);
    expect(run.steps.some((step) => step.permissionState === "required")).toBe(true);
    expect(run.verifier.status).toBe("passed");
    expect(run.replay.eventIds).toEqual(["event_1"]);
  });
});
