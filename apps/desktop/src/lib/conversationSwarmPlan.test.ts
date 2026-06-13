import { describe, expect, it } from "vitest";
import { planConversationSwarm, recommendSwarmSize } from "./conversationSwarmPlan";

describe("recommendSwarmSize", () => {
  it("scales with topic weight, clamped to 4..16", () => {
    expect(recommendSwarmSize("")).toBe(4);
    expect(recommendSwarmSize("짧은 주제")).toBe(4);
    // many comparison/design signals → more agents
    const big = recommendSwarmSize("멀티에이전트 아키텍처 보안 성능 비교 설계 전략 트레이드오프 대안 평가 사례");
    expect(big).toBeGreaterThan(4);
    expect(big).toBeLessThanOrEqual(16);
  });
  it("never exceeds the max", () => {
    expect(recommendSwarmSize("비교 ".repeat(200))).toBe(16);
  });
});

describe("planConversationSwarm", () => {
  it("produces N drafts (4..16) each with a distinct role facet from the topic", () => {
    const plan = planConversationSwarm({ topic: "RAG 파이프라인 설계와 보안 트레이드오프 비교" });
    expect(plan.count).toBe(plan.drafts.length);
    expect(plan.count).toBeGreaterThanOrEqual(4);
    expect(plan.count).toBeLessThanOrEqual(16);
    // facets reference the topic and differ across agents
    expect(plan.drafts.every((d) => d.task.includes("RAG 파이프라인"))).toBe(true);
    expect(new Set(plan.drafts.map((d) => d.task)).size).toBe(plan.drafts.length);
  });
  it("assigns real codex personas to known research roles", () => {
    const plan = planConversationSwarm({ topic: "주제", minAgents: 4, maxAgents: 4 });
    expect(plan.drafts[0]).toMatchObject({ role: "researcher", personaName: "researcher" });
    expect(plan.drafts.every((d) => d.displayName.length > 0)).toBe(true);
  });
  it("respects an explicit min/max", () => {
    expect(planConversationSwarm({ topic: "x", minAgents: 8, maxAgents: 8 }).count).toBe(8);
  });
});
