import { describe, expect, it } from "vitest";
import {
  isExperimentalAutorunEnabled,
  parseAllowedVerificationCommand,
  redactForPublishPhase,
  resolveSafeWorkspacePath,
} from "./autorunSafety";

describe("experimental autorun safety", () => {
  it("stays disabled unless the explicit gate is set", () => {
    expect(isExperimentalAutorunEnabled({})).toBe(false);
    expect(isExperimentalAutorunEnabled({ ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN: "1" })).toBe(true);
  });

  it("accepts pnpm verification presets and rejects shell fragments", () => {
    expect(parseAllowedVerificationCommand("corepack pnpm --filter @ai-orchestrator/server test")).toMatchObject({
      label: "corepack pnpm --filter @ai-orchestrator/server test",
    });
    expect(parseAllowedVerificationCommand("node -e process.exit(0)")).toMatchObject({
      error: expect.stringContaining("Only pnpm"),
    });
    expect(parseAllowedVerificationCommand("corepack pnpm test && del package.json")).toMatchObject({
      error: expect.stringContaining("Shell metacharacters"),
    });
  });

  it("blocks path escapes and forbidden autorun writes", () => {
    expect(() => resolveSafeWorkspacePath("../outside.ts")).toThrow("escapes workspace");
    expect(() => resolveSafeWorkspacePath("apps/server/src/routes/notionSync.ts", { operation: "write" })).toThrow(
      "blocked for autorun writes",
    );
    expect(resolveSafeWorkspacePath("apps/server/src/index.test.ts")).toContain("apps");
  });

  it("redacts common secret shapes before publish or proposal storage", () => {
    const redacted = redactForPublishPhase(
      [
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
        "api_key=sk-abcdefghijklmnopqrstuvwxyz",
        "password: super-secret-value",
        '{"access_token":"json-secret-value"}',
      ].join("\n"),
    );

    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain("api_key=[REDACTED]");
    expect(redacted).toContain("password=[REDACTED]");
    expect(redacted).toContain('"access_token": "[REDACTED]"');
    expect(redacted).not.toContain("super-secret-value");
    expect(redacted).not.toContain("json-secret-value");
  });

  it("redacts GitLab PAT (glpat-) before publish — 형제 게이트(W1·errors.ts·publicRedaction)와 parity", () => {
    // glpat-(GitLab PAT)는 형제 redaction/차단 게이트가 모두 비밀로 보는데 이 publish-phase
    // redactor만 빠져, 명령 stdout/stderr에 박힌 GitLab PAT가 LLM fix 프롬프트·report 응답(외부
    // 노출)으로 새어나갔다(parity 회귀). gitleaks 회피로 토큰은 런타임 조합.
    const glpat = "gl" + "pat-" + "Ab3xZ9kLmNpQ7rSt2UvW";
    const redacted = redactForPublishPhase(`remote: GitLab token ${glpat} rejected`);
    expect(redacted).toContain("[REDACTED:gitlab_token]");
    expect(redacted).not.toContain(glpat);
  });
});
