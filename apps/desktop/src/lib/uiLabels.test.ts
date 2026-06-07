import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import {
  contextPackTierLabel,
  branchAgentNameLabel,
  guardStepLabel,
  insightCategoryLabel,
  messageLabel,
  reviewModeLabel,
  soulModeLabel,
} from "./uiLabels";

const orchestrator = {
  id: "agent_orchestrator",
  name: "Orchestrator",
  kind: "virtual",
  role: "orchestrator",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
  permissionLevel: "read_only",
} as WorkbenchAgent;

function assistantMessage(metadata?: ConversationMessage["metadata"]): ConversationMessage {
  return {
    id: "message_assistant",
    role: "assistant",
    content: "응답",
    createdAt: "2026-06-06T00:00:00.000Z",
    sessionId: "session_test",
    metadata,
  };
}

describe("messageLabel", () => {
  it("uses selected agent Korean character name instead of raw role name", () => {
    expect(messageLabel(assistantMessage(), orchestrator)).toBe("마키마");
  });

  it("resolves metadata agent ids to Korean character names", () => {
    expect(
      messageLabel(
        assistantMessage({ agentId: "agent_orchestrator", agentName: "Orchestrator" }),
        undefined,
        [orchestrator],
      ),
    ).toBe("마키마");
  });

  it("maps raw metadata role names to Korean character names when the agent list is absent", () => {
    expect(messageLabel(assistantMessage({ agentName: "orchestrator" }))).toBe("마키마");
  });
});

describe("Korean UI labels", () => {
  it("localizes review and insight labels that appear in review controls", () => {
    expect(reviewModeLabel("deep")).toBe("정밀");
    expect(reviewModeLabel("quick")).toBe("빠른 검토");
    expect(insightCategoryLabel("architecture")).toBe("아키텍처");
    expect(insightCategoryLabel("tech_debt")).toBe("기술 부채");
  });

  it("localizes guard, soul, and context pack labels", () => {
    expect(guardStepLabel("self_response_prevention")).toBe("자기 응답 차단");
    expect(guardStepLabel("pii_secret_block")).toBe("개인정보/비밀");
    expect(soulModeLabel("retrieved")).toBe("검색된 기억");
    expect(contextPackTierLabel("standard")).toBe("표준");
  });

  it("maps branch experiment agent labels to character names", () => {
    expect(branchAgentNameLabel("Architect")).toBe("오시노 시노부");
    expect(branchAgentNameLabel("Reviewer")).toBe("시노미야 카구야");
    expect(branchAgentNameLabel("Orchestrator")).toBe("마키마");
  });
});
