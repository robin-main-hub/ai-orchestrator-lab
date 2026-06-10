import { describe, expect, it } from "vitest";
import type { RecallResult } from "@ai-orchestrator/protocol";
import { detectEntityAmbiguity } from "./ambiguityGuard";

function result(id: string, opts: { person?: string; tags?: string[]; score: number }): RecallResult {
  return {
    record: {
      id,
      title: id,
      content: "c",
      layer: "episode",
      scope: "session",
      persons: opts.person ? [opts.person] : undefined,
      tags: opts.tags,
    } as never,
    score: opts.score,
    usedInDecision: true,
    reason: "test",
  };
}

describe("patch P3 — 불충분명세 후보 헤지", () => {
  it("비슷한 점수의 서로 다른 엔티티 둘 → 모호 + 헤지 지시", () => {
    const results = [
      result("a", { person: "아스카", tags: ["tenant:eva"], score: 0.6 }),
      result("b", { person: "레이", tags: ["tenant:eva"], score: 0.55 }),
    ];
    const verdict = detectEntityAmbiguity(results);
    expect(verdict.ambiguous).toBe(true);
    expect(verdict.directive).toContain("모호한 참조");
    expect(verdict.directive).toContain("아스카");
    expect(verdict.directive).toContain("레이");
    expect(verdict.candidates.length).toBe(2);
  });

  it("점수 차가 크면(임계 미만) 모호 아님 — 명확한 1위", () => {
    const results = [
      result("a", { person: "마키마", score: 0.9 }),
      result("b", { person: "유노", score: 0.3 }),
    ];
    expect(detectEntityAmbiguity(results).ambiguous).toBe(false);
  });

  it("엔티티 하나면 모호 아님", () => {
    const results = [
      result("a", { person: "쿠루미", score: 0.7 }),
      result("b", { person: "쿠루미", score: 0.65 }),
    ];
    expect(detectEntityAmbiguity(results).ambiguous).toBe(false);
  });

  it("엔티티 정보 없으면 모호 아님", () => {
    const results = [result("a", { score: 0.7 }), result("b", { score: 0.68 })];
    expect(detectEntityAmbiguity(results).ambiguous).toBe(false);
  });
});
