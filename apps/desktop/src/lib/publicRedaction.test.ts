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

  it("공개 렌더에 위험한 원문이 남아 있으면 보고한다", () => {
    expect(inspectPublicText("tool input: hidden").isSafe).toBe(false);
    expect(inspectPublicText("API_KEY=secret-value").isSafe).toBe(false);
    expect(inspectPublicText("COOKIE=session-value").isSafe).toBe(false);
    expect(inspectPublicText("PASSWORD=hunter2").isSafe).toBe(false);
    expect(inspectPublicText("요약 단계만 표시").isSafe).toBe(true);
  });

  it("keyword 없는 bare 고신호 토큰(ghp_/github_pat_/glpat-/AKIA/AIza/xox/PEM)도 마스킹·차단한다", () => {
    // 이전엔 URL/Bearer/sk-/KEY=value 형태만 잡아, 산문에 박힌 bare 토큰이 공개 표면으로
    // 새어나갔다(redact 누락 + inspect가 isSafe=true). gitleaks 회피로 토큰은 런타임 조합.
    // glpat-(GitLab PAT)는 형제 redaction 게이트(W1·errors.ts)엔 있는데 이 공개-텍스트
    // redactor만 빠져 mask·gate 둘 다 통과했다(parity 회귀).
    const tokens = {
      ghp: "ghp_" + "A".repeat(36),
      pat: "github_" + "pat_" + "11" + "B".repeat(22) + "_" + "c".repeat(40),
      glpat: "gl" + "pat-" + "Ab3xZ9kLmNpQ7rSt2UvW",
      akia: "AKIA" + "ABCDEFGHIJKLMNOP",
      aiza: "AIza" + "d".repeat(35),
      xox: "xoxb-" + "1".repeat(12) + "-efabefabefab",
      pem: "-----BEGIN RSA PRIVATE KEY-----",
    };
    for (const raw of Object.values(tokens)) {
      const text = `agent note ${raw} done`;
      expect(sanitizePublicText(text)).not.toContain(raw);
      expect(inspectPublicText(text).isSafe).toBe(false);
    }
    // 평범한 산문은 여전히 안전(오탐으로 publish를 막지 않는다).
    expect(inspectPublicText("scikit-learn 파이프라인 설명").isSafe).toBe(true);
  });
});
