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
    configSource: "internal",
    enabled: true,
  },
  {
    id: "agent_reviewer",
    name: "Reviewer",
    kind: "virtual",
    role: "reviewer",
    soulMode: "retrieved",
    configSource: "internal",
    enabled: true,
  },
  {
    id: "agent_executor",
    name: "Executor",
    kind: "real",
    role: "executor",
    soulMode: "off",
    configSource: "off",
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

// Characterization tests for previously-uncovered stage4 agent-runtime branches
// (no behavior change, no network, no secret). These pin the authority-adjacent
// run-assembly seam's pure projections: the createSoulSummary mode branches and
// no-agent fallback, the primary-agent selection chain (orchestrator → first →
// "agent_unassigned"), run-step role fallbacks, the verifier warning status, the
// recall-trace usedInDecision flag feeding reflection risks, the reflection
// decisions cap, and the replay eventIds slice(0,8) cap. Only the crypto.randomUUID
// ids are non-deterministic and are not asserted.
const createdAt = "2026-05-24T00:00:00.000Z";

function makeAgent(overrides: Partial<AgentProfile> & Pick<AgentProfile, "id" | "role">): AgentProfile {
  return {
    name: overrides.id,
    kind: "virtual",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    ...overrides,
  } as AgentProfile;
}

describe("stage4 agent runtime — run-assembly projection characterization", () => {
  it("summarizes each soul mode and falls back to soul:off without an agent", () => {
    const base = { packet, agents, messages, events, createdAt };

    expect(
      createStage4AgentRun({ ...base, primaryAgent: makeAgent({ id: "a_off", role: "executor", soulMode: "off" }) })
        .soulSummary,
    ).toContain("soul:off");
    expect(
      createStage4AgentRun({
        ...base,
        primaryAgent: makeAgent({ id: "a_full", name: "Full Agent", role: "orchestrator", soulMode: "full" }),
      }).soulSummary,
    ).toBe("Full Agent full soul - 장기 정체성 파일 전체를 주입 대상으로 표시한다.");
    expect(
      createStage4AgentRun({
        ...base,
        primaryAgent: makeAgent({ id: "a_ret", name: "Ret Agent", role: "orchestrator", soulMode: "retrieved" }),
      }).soulSummary,
    ).toBe("Ret Agent retrieved soul - 현재 작업과 관련된 soul 섹션만 검색해 주입한다.");
    expect(createStage4AgentRun({ ...base, agents: [] }).soulSummary).toContain("soul:off");
  });

  it("selects the orchestrator when no primary agent is given", () => {
    const run = createStage4AgentRun({ packet, agents, messages, events, createdAt });
    expect(run.primaryAgentId).toBe("agent_orchestrator");
  });

  it("falls back to the first agent, then to agent_unassigned", () => {
    const noOrchestrator = [makeAgent({ id: "a_first", role: "reviewer" }), makeAgent({ id: "a_second", role: "executor" })];
    expect(createStage4AgentRun({ packet, agents: noOrchestrator, messages, events, createdAt }).primaryAgentId).toBe(
      "a_first",
    );
    expect(createStage4AgentRun({ packet, agents: [], messages, events, createdAt }).primaryAgentId).toBe(
      "agent_unassigned",
    );
  });

  it("routes run steps to the owner when reviewer/verifier/executor roles are absent", () => {
    const only = [makeAgent({ id: "agent_solo", role: "orchestrator" })];
    const run = createStage4AgentRun({ packet, agents: only, messages, events, createdAt });
    for (const step of run.steps) {
      expect(step.ownerAgentId).toBe("agent_solo");
    }
  });

  it("falls the verifier step back to the reviewer when no verifier role exists", () => {
    const run = createStage4AgentRun({ packet, agents, messages, events, createdAt });
    const executorStep = run.steps.find((step) => step.id === "step_coding_handoff");
    const verifierStep = run.steps.find((step) => step.id === "step_verifier");
    expect(executorStep?.ownerAgentId).toBe("agent_executor");
    expect(verifierStep?.ownerAgentId).toBe("agent_reviewer");
  });

  it("warns when the verification plan and rejected options are empty", () => {
    const run = createStage4AgentRun({
      packet: { ...packet, verificationPlan: [], rejectedOptions: [] },
      agents,
      messages,
      events,
      createdAt,
    });
    expect(run.verifier.status).toBe("warning");
    expect(run.verifier.checks.find((check) => check.label === "verification plan")?.status).toBe("warn");
    expect(run.verifier.checks.find((check) => check.label === "rejected options preserved")?.status).toBe("warn");
  });

  it("flags the user-preference recall as unused and surfaces it as a reflection risk when there are no constraints or messages", () => {
    const run = createStage4AgentRun({
      packet: { ...packet, constraints: [] },
      agents,
      messages: [],
      events,
      createdAt,
    });
    expect(run.recallTrace[1]?.usedInDecision).toBe(false);
    expect(run.reflection.risks).toEqual(["user environment preference"]);
  });

  it("caps reflection decisions at four and replay event ids at eight", () => {
    const run = createStage4AgentRun({
      packet: { ...packet, decisions: ["d1", "d2", "d3", "d4", "d5", "d6"] },
      agents,
      messages,
      events: Array.from({ length: 12 }, (_unused, index) => ({ ...events[0]!, id: `event_${index + 1}` })),
      createdAt,
    });
    expect(run.reflection.decisions).toEqual(["d1", "d2", "d3", "d4"]);
    expect(run.replay.eventIds).toHaveLength(8);
    expect(run.replay.eventIds[7]).toBe("event_8");
  });
});
