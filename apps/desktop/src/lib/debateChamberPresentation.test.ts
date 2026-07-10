import { describe, expect, it } from "vitest";
import {
  annexTabPresentation,
  createAnnexTabCountSummary,
  debateChamberCopy,
  debateRoleTone,
  debateStanceTone,
  formatAnnexTabLabel,
  formatDebateFooterMeta,
  sanitizeDebateAnnexText,
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

  it("Annex 탭은 보조정보를 한국어 라벨로 분리한다", () => {
    expect(annexTabPresentation.status.label).toBe("상태");
    expect(annexTabPresentation.agents.label).toBe("에이전트 흐름");
    expect(annexTabPresentation.memory.label).toBe("기억");
    expect(annexTabPresentation.queue.label).toBe("대기열");
  });

  it("Annex 탭은 메인 토론을 어지럽히지 않고 보조자료 개수를 요약한다", () => {
    expect(formatAnnexTabLabel("근거", 3)).toBe("근거 3");
    expect(formatAnnexTabLabel("로그", 0)).toBe("로그");
    expect(
      createAnnexTabCountSummary({
        agents: 2,
        evidence: 4,
        logs: 0,
        memory: 1,
        queue: 0,
        status: 3,
      }),
    ).toBe("보조자료 상태 3 · 근거 4 · 에이전트 흐름 2 · 기억 1");
  });

  it("Annex 보조자료 문자열에서 원문 실행/비밀/경로를 마스킹한다", () => {
    const text = [
      "raw prompt: hidden",
      "tool input: curl https://token-plan-sgp.xiaomimimo.com/v1",
      "Bearer abc.secret",
      "API_KEY=sk-1234567890abcdef",
      "/Users/robin/Documents/private.txt",
    ].join("\n");

    const sanitized = sanitizeDebateAnnexText(text);

    expect(sanitized).toContain("[redacted:internal]");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).not.toContain("hidden");
    expect(sanitized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(sanitized).not.toContain("/Users/robin/Documents/private.txt");
    expect(sanitized).not.toContain("sk-1234567890abcdef");
  });
});
