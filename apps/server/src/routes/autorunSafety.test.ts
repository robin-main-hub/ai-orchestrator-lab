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
});
