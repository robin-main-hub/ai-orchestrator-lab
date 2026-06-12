import { describe, expect, it } from "vitest";
import {
  buildCovenantFromPersona,
  detectPersonaExpression,
  detectPersonaFeedback,
  personaSignal,
} from "./personaCovenant";

describe("detectPersonaFeedback", () => {
  it("사용자의 말투/성격/정체성 피드백을 감지", () => {
    expect(detectPersonaFeedback("말투가 좀 딱딱해, 더 부드럽게 말해줘")).toBe(true);
    expect(detectPersonaFeedback("그건 너답지 않아")).toBe(true);
    expect(detectPersonaFeedback("네 성격대로 솔직하게 해")).toBe(true);
    expect(detectPersonaFeedback("stay in character please")).toBe(true);
    expect(detectPersonaFeedback("이 함수 버그 고쳐줘")).toBe(false);
  });
});

describe("detectPersonaExpression", () => {
  it("1인칭 정체성/가치관 발화를 감지", () => {
    expect(detectPersonaExpression("나는 거짓말을 하지 않는다")).toBe(true);
    expect(detectPersonaExpression("내 원칙은 효율보다 안전이야")).toBe(true);
    expect(detectPersonaExpression("난 절대 약속을 어기지 않아")).toBe(true);
    expect(detectPersonaExpression("이 파일을 수정했습니다")).toBe(false);
  });

  it("covenant 캐치프레이즈/키워드로 보강 감지", () => {
    const covenant = { keywords: ["지배", "통제", "질서"], catchphrases: ["흥미롭네"] };
    expect(detectPersonaExpression("흥미롭네, 계속해봐", covenant)).toBe(true);
    expect(detectPersonaExpression("지배와 질서가 우선이다", covenant)).toBe(true); // 키워드 2개
    expect(detectPersonaExpression("질서가 필요해", covenant)).toBe(false); // 키워드 1개
  });
});

describe("personaSignal", () => {
  it("역할에 따라 피드백/발화 감지를 선택", () => {
    expect(personaSignal("너답게 행동해", "user")).toBe(true);
    expect(personaSignal("나는 내 방식대로 한다", "assistant")).toBe(true);
    expect(personaSignal("일반 메시지", "user")).toBe(false);
  });
});

describe("buildCovenantFromPersona", () => {
  it("SOUL 요약/금지 스타일에서 키워드를, 예시 대화에서 캐치프레이즈를 추출", () => {
    const covenant = buildCovenantFromPersona({
      soulSummary: "지배자의 위엄과 냉철한 통제. 감정을 드러내지 않는다.",
      forbiddenStyle: "비굴함, 사과 남발",
      soulExampleDialogue: '마키마: "흥미롭네." 그녀가 미소지었다. 좋아!',
    });
    expect(covenant.keywords).toContain("지배자의");
    expect(covenant.keywords).toContain("통제");
    expect(covenant.catchphrases).toContain("흥미롭네");
  });

  it("persona 없으면 빈 covenant", () => {
    expect(buildCovenantFromPersona()).toEqual({ keywords: [], catchphrases: [] });
  });
});
