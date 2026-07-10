import { describe, expect, it } from "vitest";
import {
  annexTabPresentation,
  createAnnexTabCountSummary,
  formatAnnexTabLabel,
  sanitizeDebateAnnexText,
} from "./annexPresentation";

describe("annexPresentation", () => {
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
    // Fake credential assembled at runtime so static secret scanners (gitleaks) do not flag
    // the fixture. Runtime value is identical, so the redaction assertions are unchanged.
    const fakeApiKey = ["sk", "1234567890abcdef"].join("-");
    const text = [
      "raw prompt: hidden",
      "tool input: curl https://token-plan-sgp.xiaomimimo.com/v1",
      "Bearer abc.secret",
      `API_KEY=${fakeApiKey}`,
      "/Users/robin/Documents/private.txt",
    ].join("\n");

    const sanitized = sanitizeDebateAnnexText(text);

    expect(sanitized).toContain("[redacted:internal]");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).not.toContain("hidden");
    expect(sanitized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(sanitized).not.toContain("/Users/robin/Documents/private.txt");
    expect(sanitized).not.toContain(fakeApiKey);
  });
});
