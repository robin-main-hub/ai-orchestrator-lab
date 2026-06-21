import { describe, expect, it } from "vitest";
import { compactPublicText, inspectPublicText, sanitizePublicText } from "./publicRedaction";

describe("publicRedaction", () => {
  it("렌더 직전 공개 문자열에서 비밀값, 원시 입력, 로컬 경로를 제거한다", () => {
    const sanitized = sanitizePublicText(
      [
        "raw prompt: hidden system prompt",
        "tool input: curl https://token-plan-sgp.xiaomimimo.com/v1",
        "Bearer sk-1234567890abcdef",
        "TOKEN=tp-1234567890abcdef",
        "/Users/robin/Documents/private.txt",
      ].join("\n"),
    );

    expect(sanitized).toContain("[redacted:internal]");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).toContain("[redacted:path]");
    expect(sanitized).not.toContain("hidden system prompt");
    expect(sanitized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(sanitized).not.toContain("sk-1234567890abcdef");
    expect(sanitized).not.toContain("tp-1234567890abcdef");
    expect(sanitized).not.toContain("/Users/robin/Documents/private.txt");
  });

  it("상태 요약을 마스킹 후 짧게 압축한다", () => {
    expect(
      compactPublicText("checkpoint /Users/robin/Documents/private.txt with a very long detail", 32),
    ).toBe("checkpoint [redacted:path] with…");
  });

  it("GitLab PAT(glpat-)도 공개 표면에서 마스킹·차단한다 — 형제 redaction 게이트와 parity", () => {
    // glpat-(GitLab PAT)는 W1 githubCommentWriteGuards·errors.ts redactor엔 있는데 이 공개-텍스트
    // redactor만 빠져 mask·gate 둘 다 통과했다(parity 회귀). gitleaks 회피로 토큰은 런타임 조합.
    const glpat = "gl" + "pat-" + "Ab3xZ9kLmNpQ7rSt2UvW";
    const text = `agent note ${glpat} done`;
    expect(sanitizePublicText(text)).not.toContain(glpat);
    expect(inspectPublicText(text).isSafe).toBe(false);
    // 산문에 'glpat' 단어만 있고 토큰 형태(- + 20자)가 아니면 오탐 아님.
    expect(inspectPublicText("the glpat prefix denotes a GitLab token").isSafe).toBe(true);
  });

  it("공개 렌더에 위험한 원문이 남아 있으면 보고한다", () => {
    expect(inspectPublicText("tool input: hidden").isSafe).toBe(false);
    expect(inspectPublicText("API_KEY=secret-value").isSafe).toBe(false);
    expect(inspectPublicText("COOKIE=session-value").isSafe).toBe(false);
    expect(inspectPublicText("PASSWORD=hunter2").isSafe).toBe(false);
    expect(inspectPublicText("요약 단계만 표시").isSafe).toBe(true);
  });
});
