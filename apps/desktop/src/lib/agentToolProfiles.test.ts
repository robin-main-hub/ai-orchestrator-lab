import { describe, expect, it } from "vitest";
import {
  createAgentToolRuntimeSummary,
  getAgentToolBadgeLabels,
  getAgentToolProfile,
  getAgentToolProfileSummary,
  getRoleToolDefinitionGaps,
} from "./agentToolProfiles";

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
    expect(getAgentToolProfileSummary("executor")).toMatchObject({
      label: "실행 도구",
      visibleBadges: ["Tmux 전달", "승인 확인", "실행 기록"],
    });
  });
});

describe("agent tool profile runtime boundaries", () => {
  it("summarizes approval-gated tools before they can be rendered as callable actions", () => {
    expect(createAgentToolRuntimeSummary(["memory.recall", "tmux.dispatch", "test.run"])).toEqual({
      approvalRequiredCount: 2,
      boundaryLabel: "승인 필요 2개",
      readOnlyCount: 1,
      writeCapableCount: 0,
    });
  });

  it("keeps role tool summaries compact for the status bar", () => {
    const summary = getAgentToolProfileSummary("orchestrator");

    expect(summary.label).toBe("지휘 도구");
    expect(summary.visibleBadges).toEqual(["작업 대기열", "승인 확인", "Tmux 계획"]);
    expect(summary.runtime.boundaryLabel).toBe("승인 필요 1개");
  });

  it("requires every role tool to have an explicit label and boundary", () => {
    expect(getRoleToolDefinitionGaps()).toEqual([]);
  });

  it("treats unknown tools as approval-gated instead of silently read-only", () => {
    expect(createAgentToolRuntimeSummary(["unknown.future.tool"])).toEqual({
      approvalRequiredCount: 1,
      boundaryLabel: "승인 필요 1개",
      readOnlyCount: 0,
      writeCapableCount: 0,
    });
  });
});
