import { describe, expect, it } from "vitest";
import {
  debateChamberCopy,
  debateRoleTone,
  debateStanceTone,
  formatDebateFooterMeta,
} from "./debateChamberPresentation";

describe("debateChamberPresentation", () => {
  it("토론 메인 문구를 한국어 중심으로 제공한다", () => {
    expect(debateChamberCopy.kicker).toBe("토론실");
    expect(debateChamberCopy.annexButton).toBe("보조자료");
    expect(formatDebateFooterMeta({ participantCount: 6, roundStatus: "running", readiness: "결정 준비" })).toBe(
      "참여자 6명 · 진행 중 · 결정 준비",
    );
  });

  it("메인 토론 톤은 청록/초록 지배 색을 쓰지 않는다", () => {
    const tones = [
      debateStanceTone("agree"),
      debateStanceTone("evidence"),
      debateStanceTone("decision"),
      debateRoleTone("orchestrator"),
      debateRoleTone("verifier"),
    ];

    for (const tone of tones) {
      const serialized = JSON.stringify(tone);
      expect(serialized).not.toContain("cyan");
      expect(serialized).not.toContain("green");
      expect(serialized).not.toContain("emerald");
    }
  });

  it("본 서피스 톤 맵은 v2 시맨틱 토큰만 쓰고 레거시 리터럴 색을 남기지 않는다", () => {
    const stances = ["agree", "disagree", "risk", "evidence", "decision", "neutral"] as const;
    const roles = [
      "architect",
      "builder",
      "executor",
      "memory_curator",
      "orchestrator",
      "reviewer",
      "skeptic",
      "verifier",
    ] as const;
    const bannedLiterals = ["violet", "purple", "zinc", "rose", "amber", "blue", "cyan", "sky", "teal", "fuchsia", "indigo"];
    const tones = [
      ...stances.map((stance) => debateStanceTone(stance)),
      ...roles.map((role) => debateRoleTone(role)),
      debateRoleTone("unknown-role" as never),
    ];

    for (const tone of tones) {
      const serialized = JSON.stringify(tone);
      for (const literal of bannedLiterals) {
        expect(serialized).not.toContain(literal);
      }
      expect(serialized).toMatch(/primary|warning|destructive|muted|border/);
    }
  });
});
