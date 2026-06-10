import { describe, expect, it } from "vitest";
import {
  averageAssistantOverlap,
  condense,
  contentOverlap,
  DEFAULT_CONDENSER_CONFIG,
  estimateTokens,
  extractCriticalInfo,
  renderCondensate,
  shouldWithholdCondensation,
  type CondenserTurn,
} from "./conversationCondenser";

function u(text: string): CondenserTurn {
  return { role: "user", text };
}
function a(text: string): CondenserTurn {
  return { role: "assistant", text };
}

describe("정규화/중복도 (한국어 조사 포함)", () => {
  it("조사를 벗긴 내용어로 중복도 계산", () => {
    // "마키마가" ↔ "마키마는" → 같은 어간
    expect(contentOverlap("마키마가 토론을 시작했다", "마키마는 토론에 참여한다")).toBeGreaterThan(0.4);
  });
  it("무관한 문장은 낮은 중복도", () => {
    expect(contentOverlap("파일 경로 수정", "날씨가 좋네요")).toBeLessThan(0.2);
  });
  it("인접 어시스턴트 발언 평균 중복도", () => {
    expect(averageAssistantOverlap(["같은 버그 수정 중", "같은 버그 수정 계속"])).toBeGreaterThan(0.4);
    expect(averageAssistantOverlap(["하나만"])).toBe(0);
  });
});

describe("Decider — 정보 밀집 대화 보류", () => {
  it("중복도 높고 사용자 토큰 많으면 보류", () => {
    const longUser = "x".repeat(4500); // ~1125 토큰
    const turns = [u(longUser), a("같은 버그를 수정합니다"), u(longUser), a("같은 버그를 계속 수정합니다")];
    expect(shouldWithholdCondensation(turns)).toBe(true);
  });
  it("짧은 대화는 응축 진행(보류 안 함)", () => {
    const turns = [u("안녕"), a("안녕하세요"), u("고마워"), a("천만에요")];
    expect(shouldWithholdCondensation(turns)).toBe(false);
  });
});

describe("핵심 정보 추출", () => {
  it("파일경로/에러/결정/정정 클래스 인식", () => {
    const r1 = extractCriticalInfo("apps/desktop/src/App.tsx 를 수정하겠다");
    expect(r1.classes).toContain("path");
    expect(r1.classes).toContain("decision");
    expect(r1.facts.join(" ")).toContain("App.tsx");

    const r2 = extractCriticalInfo("TypeError: cannot read property of undefined");
    expect(r2.classes).toContain("error");

    const r3 = extractCriticalInfo("그게 아니라 다른 파일이야");
    expect(r3.classes).toContain("correction");
  });
});

describe("condense — 추출형 + 순차 + 예산 bound", () => {
  it("사용자는 verbatim, 어시스턴트는 핵심만", () => {
    const c = condense({
      window: [u("App.tsx의 버그 고쳐줘"), a("네, apps/desktop/src/App.tsx의 null 체크를 추가하겠습니다. 그리고 어쩌고 저쩌고 긴 설명...")],
    });
    expect(c.pairs[0]!.humanInput).toBe("App.tsx의 버그 고쳐줘");
    expect(c.pairs[0]!.assistant).toContain("App.tsx");
    expect(c.pairs[0]!.reasoning).toContain("보존");
  });

  it("순차 응축 — 이전 응축본에 새 턴 누적", () => {
    const c1 = condense({ window: [u("첫 요청"), a("첫 응답")] });
    const c2 = condense({ prior: c1, window: [u("둘째 요청"), a("둘째 응답")] });
    expect(c2.pairs.length).toBe(2);
    expect(c2.version).toBe(2);
  });

  it("심은 핵심 정보(파일경로)가 응축 후에도 보존 — idempotence", () => {
    let c = condense({ window: [u("SIGNATURE_PATH apps/x/y.ts 봐줘"), a("apps/x/y.ts 확인했습니다")] });
    for (let i = 0; i < 5; i += 1) {
      c = condense({ prior: c, window: [u(`추가 ${i}`), a(`응답 ${i}`)] });
    }
    expect(JSON.stringify(c.pairs)).toContain("y.ts");
  });

  it("50 윈도 순차 후에도 예산 내로 bound", () => {
    let c = condense({ window: [u("시작"), a("시작 응답")] });
    for (let i = 0; i < 50; i += 1) {
      c = condense({ prior: c, window: [u(`사용자 메시지 ${i} 어쩌고저쩌고`), a(`어시스턴트 응답 ${i} 길게 설명하는 내용`)] });
    }
    expect(c.tokenEstimate).toBeLessThanOrEqual(DEFAULT_CONDENSER_CONFIG.condensateBudgetTokens);
  });

  it("renderCondensate — 빈 응축본은 빈 문자열", () => {
    expect(renderCondensate(null)).toBe("");
    const c = condense({ window: [u("질문"), a("답변")] });
    expect(renderCondensate(c)).toContain("이전 대화 압축 기록");
  });

  it("estimateTokens ~ chars/4", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });
});
