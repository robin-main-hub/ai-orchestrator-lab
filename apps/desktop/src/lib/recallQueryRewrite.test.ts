import { describe, expect, it } from "vitest";
import {
  contentWords,
  isNonStandalone,
  keywordsFromTurns,
  rewriteRecallQuery,
  stripScopeTokens,
} from "./recallQueryRewrite";

describe("patch P1 — recall 쿼리 재작성", () => {
  it("scope 토큰 제거 (lexical 오염 방지)", () => {
    const query = "마키마 토론 결과\nagent:agent_orchestrator\nsession:session_001\nprovider:provider_mock";
    expect(stripScopeTokens(query)).toBe("마키마 토론 결과");
  });

  it("scope 토큰 없으면 그대로", () => {
    expect(stripScopeTokens("코딩 패킷 검토")).toBe("코딩 패킷 검토");
  });

  it("대명사 follow-up은 비독립으로 탐지", () => {
    expect(isNonStandalone("걔가 그거 언제 한댔지?")).toBe(true);
    expect(isNonStandalone("그건 어떻게 됐어?")).toBe(true);
    expect(isNonStandalone("응")).toBe(true);
  });

  it("엔티티 있는 완결 질문은 독립으로 판단", () => {
    expect(isNonStandalone("마키마가 작성한 코딩 패킷의 검증 단계를 보여줘")).toBe(false);
    expect(isNonStandalone("App.tsx 리팩터링 계획")).toBe(false);
  });

  it("최근 턴에서 빈도순 키워드 추출", () => {
    const kw = keywordsFromTurns(["마키마 토론 시작", "마키마 토론 결과 정리"]);
    expect(kw).toContain("마키마");
    expect(kw).toContain("토론");
  });

  it("비독립 질문 + 맥락 → 키워드 보강", () => {
    const result = rewriteRecallQuery({
      rawQuery: "그거 언제 한댔지?",
      recentTurns: ["마키마가 리팩터링 계획을 세웠어", "유이가 테스트를 추가했고", "그거 언제 한댔지?"],
    });
    expect(result.augmented).toBe(true);
    expect(result.addedKeywords.length).toBeGreaterThan(0);
    expect(result.query).toContain("그거 언제 한댔지?");
    // 맥락 키워드가 쿼리에 들어감
    expect(result.query.length).toBeGreaterThan("그거 언제 한댔지?".length);
  });

  it("독립 질문은 보강 안 함 + scope만 정화", () => {
    const result = rewriteRecallQuery({
      rawQuery: "App.tsx 리팩터링 계획\nagent:x\nsession:y",
      recentTurns: ["이전 맥락", "App.tsx 리팩터링 계획"],
    });
    expect(result.augmented).toBe(false);
    expect(result.query).toBe("App.tsx 리팩터링 계획");
  });

  it("조사 제거된 내용어", () => {
    expect(contentWords("마키마가 토론을 시작했다")).toContain("마키마");
    expect(contentWords("마키마가 토론을 시작했다")).toContain("토론");
  });
});
