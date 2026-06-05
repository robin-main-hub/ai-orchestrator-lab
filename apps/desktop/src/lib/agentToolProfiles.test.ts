import { describe, expect, it } from "vitest";
import { getAgentToolBadgeLabels, getAgentToolProfile, getAgentToolProfileSummary } from "./agentToolProfiles";

describe("getAgentToolProfile", () => {
  it("returns concise orchestrator tool badges", () => {
    expect(getAgentToolProfile("orchestrator")).toEqual({
      label: "지휘 도구",
      tools: ["work.queue", "approval", "tmux.plan"],
    });
  });

  it("returns memory curator tools without pretending direct execution", () => {
    expect(getAgentToolProfile("memory_curator")).toEqual({
      label: "기억 도구",
      tools: ["memory.recall", "memory.rank", "forget.request"],
    });
  });

  it("falls back to safe assistant tools for external roles", () => {
    expect(getAgentToolProfile("external")).toEqual({
      label: "보조 도구",
      tools: ["memory.recall", "question.ask", "handoff"],
    });
  });

  it("renders human-readable badge labels instead of raw tool ids", () => {
    expect(getAgentToolBadgeLabels("memory_curator")).toEqual([
      "기억 조회",
      "기억 순위",
      "기억 정리 요청",
    ]);
  });

  it("creates a compact sidebar summary for visible agent cards", () => {
    expect(getAgentToolProfileSummary("executor")).toEqual({
      label: "실행 도구",
      visibleBadges: ["Tmux 전달", "승인 확인", "실행 기록"],
    });
  });
});
