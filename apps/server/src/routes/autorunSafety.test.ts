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
    const glpat = "gl" + "pat-" + "Ab3xZ9kLmNpQ7rSt2UvW";
    const akia = "AKIA" + "ABCDEFGHIJKLMNOP";
    const aiza = "AIza" + "d".repeat(35);
    const xox = "xoxb-" + "1".repeat(12) + "-efabefabefab";
    const redacted = redactForPublishPhase(
      [
        `fatal: could not read from https://${ghp}@github.com/o/r.git`,
        `GH=${pat}`,
        `remote: GitLab token ${glpat} rejected`,
        `AWS_ACCESS_KEY_ID ${akia} denied`,
        `key ${aiza} quota`,
        `webhook ${xox} invalid`,
      ].join("\n"),
    );
    expect(redacted).toContain("[REDACTED:github_token]");
    // glpat-(GitLab PAT)도 redact — 형제 게이트(W1·errors.ts·publicRedaction)와 parity.
    expect(redacted).toContain("[REDACTED:gitlab_token]");
    expect(redacted).toContain("[REDACTED:aws_key]");
    expect(redacted).toContain("[REDACTED:google_key]");
    expect(redacted).toContain("[REDACTED:slack_token]");
    for (const raw of [ghp, pat, glpat, akia, aiza, xox]) {
      expect(redacted).not.toContain(raw);
    }
  });

  it("redacts prefixed env-secret assignments (SESSION_TOKEN=, DB_PASSWORD=, MY_SECRET=) — H8d/W1 parity", () => {
    // 드리프트 버그: bare keyword 규칙은 keyword를 \b 경계에 바로 둬, `_`(word char)로 이어진
    // 변수명(SESSION_TOKEN 등) 안엔 \b가 없어 prefixed 변수명을 통째로 놓쳤다(실측 false-negative —
    // SESSION_TOKEN=value가 redact 없이 publish 표면으로 노출). H8d env_secret_assign·W1과 동일한
    // [A-Za-z0-9_]* 래핑으로 parity.
    // gitleaks 회피: name=value 리터럴을 연속으로 두지 않고 런타임에 `+`로 조합(가짜 placeholder 값).
    const val = (a: string, b: string) => a + b;
    const cases = [
      { name: "SESSION_TOKEN", value: val("tok", "enplaceholder11") },
      { name: "DB_PASSWORD", value: val("pw", "placeholder2233") },
      { name: "MY_SECRET", value: val("placeholder", "val5566") },
      { name: "VITE_ACCESS_TOKEN", value: val("acc", "placeholder7788") },
    ];
    const redacted = redactForPublishPhase(cases.map((c) => c.name + "=" + c.value).join("\n"));
    for (const c of cases) {
      expect(redacted).toContain(c.name + "=[REDACTED]");
      expect(redacted).not.toContain(c.value);
    }
  });
});
