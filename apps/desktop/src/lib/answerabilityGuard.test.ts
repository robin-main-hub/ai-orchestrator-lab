import { describe, expect, it } from "vitest";
import type { RecallResult } from "@ai-orchestrator/protocol";
import { contentOnlyScore, evaluateAnswerability } from "./answerabilityGuard";

function result(id: string, opts: { lexical?: number; semantic?: number; fused: number }): RecallResult {
  const views: NonNullable<RecallResult["fusionDetail"]>["views"] = [];
  if (opts.lexical !== undefined) views.push({ view: "lexical", rank: 1, rawScore: opts.lexical });
  if (opts.semantic !== undefined) views.push({ view: "semantic", rank: 1, rawScore: opts.semantic });
  views.push({ view: "metadata", rank: 1, rawScore: 0.9 });
  return {
    record: { id, title: id, content: "내용", layer: "episode", scope: "session" } as never,
    score: opts.fused,
    fusionDetail: { views, fusionMode: "rrf" },
    usedInDecision: true,
    reason: "test",
  };
}

describe("patch P2 — 답변가능성 가드", () => {
  it("contentOnlyScore — lexical/semantic 최대, metadata 부스트 제외", () => {
    expect(contentOnlyScore(result("a", { lexical: 0.4, semantic: 0.2, fused: 0.9 }))).toBe(0.4);
  });

  it("내용 점수 없이 부스트만 높은 핀고정 기억 → 답변불가 + IDK", () => {
    // fused score는 높지만(핀/중요도 부스트) lexical/semantic 원점수는 0
    const results = [result("pinned-irrelevant", { lexical: 0.02, fused: 0.85 })];
    const verdict = evaluateAnswerability(results);
    expect(verdict.answerable).toBe(false);
    expect(verdict.idkDirective).toContain("지어내지 말");
    expect(verdict.boostOnlyCount).toBe(1);
    expect(verdict.groundedResults).toHaveLength(0);
  });

  it("내용 기반 매칭이 있으면 grounded 통과", () => {
    const results = [
      result("relevant", { lexical: 0.5, fused: 0.6 }),
      result("boost-only", { lexical: 0.01, fused: 0.8 }),
    ];
    const verdict = evaluateAnswerability(results);
    expect(verdict.answerable).toBe(true);
    expect(verdict.groundedResults.map((r) => r.record.id)).toEqual(["relevant"]);
    expect(verdict.boostOnlyCount).toBe(1);
  });

  it("뷰 정보 없는 경로는 fused score로 폴백 (false IDK 방지)", () => {
    const bare: RecallResult = {
      record: { id: "x", title: "x", content: "c", layer: "episode", scope: "session" } as never,
      score: 0.9,
      usedInDecision: true,
      reason: "no views",
    };
    expect(contentOnlyScore(bare)).toBe(0.9);
    expect(evaluateAnswerability([bare]).answerable).toBe(true);
  });

  it("빈 결과 → 답변불가 IDK", () => {
    expect(evaluateAnswerability([]).answerable).toBe(false);
  });
});
