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

  it("redacts bare high-signal token prefixes (github/aws/google/slack) with no keyword", () => {
    // 이전엔 keyword 없는 bare 토큰(git URL의 ghp_, AKIA 등)이 redactForPublishPhase를
    // 빠져나가 LLM fix 프롬프트·report 응답(외부 노출)으로 새어나갔다. W1/H8d 차단 스캐너가
    // 비밀로 보는 형식은 publish 표면에서도 redact한다. gitleaks 회피로 토큰은 런타임 조합.
    const ghp = "ghp_" + "A".repeat(36);
    const pat = "github_" + "pat_" + "11" + "B".repeat(22) + "_" + "c".repeat(40);
    const akia = "AKIA" + "ABCDEFGHIJKLMNOP";
    const aiza = "AIza" + "d".repeat(35);
    const xox = "xoxb-" + "1".repeat(12) + "-efabefabefab";
    const redacted = redactForPublishPhase(
      [
        `fatal: could not read from https://${ghp}@github.com/o/r.git`,
        `GH=${pat}`,
        `AWS_ACCESS_KEY_ID ${akia} denied`,
        `key ${aiza} quota`,
        `webhook ${xox} invalid`,
      ].join("\n"),
    );
    expect(redacted).toContain("[REDACTED:github_token]");
    expect(redacted).toContain("[REDACTED:aws_key]");
    expect(redacted).toContain("[REDACTED:google_key]");
    expect(redacted).toContain("[REDACTED:slack_token]");
    for (const raw of [ghp, pat, akia, aiza, xox]) {
      expect(redacted).not.toContain(raw);
    }
  });
});
