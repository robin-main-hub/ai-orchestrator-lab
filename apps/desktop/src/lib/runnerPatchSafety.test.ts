import { describe, expect, it } from "vitest";
import {
  annotateHandoffWithSafety,
  buildRunnerPatchSafetyReport,
  buildVerificationReport,
  runPathPolicy,
  runSecretScan,
  type ActualVerification,
} from "./runnerPatchSafety";
import type { RunnerPatchHandoff } from "./runnerPatchHandoff";
import type { CodingRunResult, TestResultSummary } from "./codingRunner";

function makeHandoff(overrides: Partial<RunnerPatchHandoff> = {}): RunnerPatchHandoff {
  return {
    id: "patch_m1_t",
    missionId: "m1",
    repoRoot: "/tmp/repo",
    runnerId: "opencode",
    createdAt: "2026-06-16T00:00:00Z",
    files: [],
    unifiedDiff: "",
    stats: { files: 0, additions: 0, deletions: 0 },
    testResult: { ran: false, passed: 0, failed: 0 },
    applicable: true,
    requiresApproval: true,
    blockers: [],
    warnings: [],
    ...overrides,
  };
}

function passingTests(): TestResultSummary {
  return { ran: true, passed: 12, failed: 0, durationMs: 1840 };
}

function failingTests(): TestResultSummary {
  return { ran: true, passed: 11, failed: 1, durationMs: 1840 };
}

describe("runSecretScan — added lines only (+), 컨텍스트/삭제는 무시", () => {
  it("(SC1) 시크릿 없는 patch → pass + findings 0", () => {
    const handoff = makeHandoff({
      files: [
        {
          path: "src/App.tsx",
          change: "modified",
          additions: 1,
          deletions: 0,
          diff: ["--- a/src/App.tsx", "+++ b/src/App.tsx", "+const X = 42;"].join("\n"),
        },
      ],
    });
    const report = runSecretScan(handoff);
    expect(report.status).toBe("pass");
    expect(report.findings).toEqual([]);
  });

  it("(SC2) 추가 라인의 sk-key 감지 → blocked + masked preview", () => {
    const fakeKey = ["sk", "test", "abcdefghijklmnop"].join("-");
    const handoff = makeHandoff({
      files: [
        {
          path: "src/config.ts",
          change: "added",
          additions: 1,
          deletions: 0,
          diff: ["--- /dev/null", `+++ b/src/config.ts`, `+const KEY = "${fakeKey}";`].join("\n"),
        },
      ],
    });
    const report = runSecretScan(handoff);
    expect(report.status).toBe("blocked");
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.filePath).toBe("src/config.ts");
    expect(finding.pattern).toBe("openai_key");
    expect(finding.redactedPreview).toContain("<redacted>");
    expect(finding.redactedPreview).not.toContain("abcdefghijklmnop");
  });

  it("(SC3) bearer / aws / github / env_secret_assign 라벨 분류", () => {
    const token = ["gh", "p", "_", "A".repeat(36)].join("");
    const awsKey = "AKIA" + "0123456789ABCDEF";
    const bearer = "Bearer " + "abcdefghij1234567890";
    const apiAssign = "APIKEY_VAR = " + "secretvalue123";
    const handoff = makeHandoff({
      files: [
        {
          path: "src/auth.ts",
          change: "modified",
          additions: 4,
          deletions: 0,
          diff: [
            "+++ b/src/auth.ts",
            `+const A = \`${bearer}\`;`,
            `+const B = ${awsKey};`,
            `+const C = "${token}";`,
            `+const ${apiAssign}`,
          ].join("\n"),
        },
      ],
    });
    const report = runSecretScan(handoff);
    expect(report.status).toBe("blocked");
    const labels = report.findings.map((f) => f.pattern).sort();
    expect(labels).toContain("bearer_token");
    expect(labels).toContain("aws_access_key");
    expect(labels).toContain("github_token");
    expect(labels).toContain("env_secret_assign");
  });

  it("(SC3b) fine-grained PAT(github_pat_)도 github_token으로 분류 → blocked", () => {
    // 회귀: classic 규칙 gh[pousr]_는 github_pat_를 못 잡아, fine-grained PAT가 평범한
    // 변수 할당으로 patch에 들어오면 검출을 빠져나갔다(applicable=true 유지). alternation으로 닫음.
    const pat = ["github", "_pat_", "11", "A".repeat(22), "_", "b".repeat(40)].join("");
    const handoff = makeHandoff({
      files: [
        {
          path: "src/cfg.ts",
          change: "added",
          additions: 1,
          deletions: 0,
          diff: ["--- /dev/null", "+++ b/src/cfg.ts", `+const cfg = "${pat}";`].join("\n"),
        },
      ],
    });
    const report = runSecretScan(handoff);
    expect(report.status).toBe("blocked");
    expect(report.findings.map((f) => f.pattern)).toContain("github_token");
    expect(report.findings[0]!.redactedPreview).not.toContain("bbbb");
  });

  it("(SC4) 컨텍스트 / 삭제(-) 라인에 시크릿이 있어도 무시 — patch가 *도입*하는 것만 본다", () => {
    const fakeKey = ["sk", "stale", "abcdefghijklmnop"].join("-");
    const handoff = makeHandoff({
      files: [
        {
          path: "src/old.ts",
          change: "modified",
          additions: 1,
          deletions: 1,
          diff: [
            "--- a/src/old.ts",
            "+++ b/src/old.ts",
            "@@",
            ` const KEY = "${fakeKey}";`, // context — leading space
            `-const OLD = "${fakeKey}";`, // deletion
            "+const KEY2 = 42;",
          ].join("\n"),
        },
      ],
    });
    const report = runSecretScan(handoff);
    expect(report.status).toBe("pass");
    expect(report.findings).toEqual([]);
  });

  it("(SC5) diff가 비어 있는 파일은 매칭 0", () => {
    const handoff = makeHandoff({
      files: [{ path: "a.ts", change: "modified", additions: 0, deletions: 0 }],
    });
    expect(runSecretScan(handoff).findings).toEqual([]);
  });

  it("(SC6) bare slack/google/PEM 시크릿도 분류 → blocked(회귀: W1엔 있고 H8d엔 없던 false negative)", () => {
    // W1 공유 scanForSecrets는 잡지만 H8d SECRET_RULES엔 없어, 변수명 키워드 없이 들어온
    // 이 3종(따옴표 안 Slack/Google 토큰, bare PEM 블록)이 env_secret_assign도 빠져나가
    // applicable=true로 승인 큐까지 흘러갔다. fixture는 gitleaks 회피 위해 런타임 조합.
    const slack = "xox" + "b-" + "2222222222-3333333333-" + "abcdefghijklmnop";
    const google = "AIza" + "Sy" + "A1234567890abcdefghijklmnopqrstuv";
    const pem = "-----BEGIN " + "PRIVATE KEY-----";
    // glpat-(GitLab PAT) — 형제 게이트(W1·errors.ts·publicRedaction·autorun)엔 있는데 H8d만
    // 빠져 patch가 pass로 통과하던 false-negative. gitleaks 회피 위해 런타임 조합.
    const glpat = "gl" + "pat-" + "Ab3xZ9kLmNpQ7rSt2UvW";
    const handoff = makeHandoff({
      files: [
        {
          path: "src/leak.ts",
          change: "added",
          additions: 4,
          deletions: 0,
          diff: [
            "--- /dev/null",
            "+++ b/src/leak.ts",
            `+const s = "${slack}";`,
            `+const g = "${google}";`,
            `+const p = "${pem}";`,
            `+const gl = "${glpat}";`,
          ].join("\n"),
        },
      ],
    });
    const report = runSecretScan(handoff);
    expect(report.status).toBe("blocked");
    const labels = report.findings.map((f) => f.pattern).sort();
    expect(labels).toContain("slack_token");
    expect(labels).toContain("google_api_key");
    expect(labels).toContain("private_key_block");
    expect(labels).toContain("gitlab_token");
    // 마스킹 — raw 토큰 본문은 노출 안 됨
    for (const f of report.findings) {
      expect(f.redactedPreview).toContain("<redacted>");
    }
    expect(report.findings.map((f) => f.redactedPreview).join("")).not.toContain("abcdefghijklmnop");
  });
});

describe("runPathPolicy — allowlist/denylist (deny가 allow보다 강함)", () => {
  it("(PP1) 정책 미설정 → warning (강제 차단 X)", () => {
    const handoff = makeHandoff({
      files: [{ path: "src/A.tsx", change: "modified", additions: 1, deletions: 0 }],
    });
    const report = runPathPolicy(handoff, undefined);
    expect(report.status).toBe("warning");
    expect(report.violations).toEqual([]);
  });

  it("(PP2) allowlist 통과 → pass", () => {
    const handoff = makeHandoff({
      files: [
        { path: "apps/desktop/src/A.tsx", change: "modified", additions: 1, deletions: 0 },
        { path: "apps/desktop/src/B.tsx", change: "modified", additions: 1, deletions: 0 },
      ],
    });
    const report = runPathPolicy(handoff, { allow: ["apps/desktop/"] });
    expect(report.status).toBe("pass");
    expect(report.violations).toEqual([]);
  });

  it("(PP3) allowlist 밖 → blocked + not_in_allowlist 위반", () => {
    const handoff = makeHandoff({
      files: [
        { path: "apps/desktop/src/A.tsx", change: "modified", additions: 1, deletions: 0 },
        { path: "infra/secrets.tf", change: "modified", additions: 1, deletions: 0 },
      ],
    });
    const report = runPathPolicy(handoff, { allow: ["apps/desktop/**"] });
    expect(report.status).toBe("blocked");
    expect(report.violations).toEqual([{ filePath: "infra/secrets.tf", reason: "not_in_allowlist" }]);
  });

  it("(PP4) deny가 allow보다 강함 — allowlist 안에 있어도 deny면 차단", () => {
    const handoff = makeHandoff({
      files: [
        { path: "apps/desktop/src/A.tsx", change: "modified", additions: 1, deletions: 0 },
        { path: "apps/desktop/secrets/prod.env", change: "modified", additions: 1, deletions: 0 },
      ],
    });
    const report = runPathPolicy(handoff, {
      allow: ["apps/desktop/"],
      deny: ["apps/desktop/secrets/"],
    });
    expect(report.status).toBe("blocked");
    expect(report.violations).toEqual([{ filePath: "apps/desktop/secrets/prod.env", reason: "denied" }]);
  });

  it("(PP5) 'foo/**', 'foo/*', 'foo/' 모두 동일한 prefix 의미", () => {
    const handoff = makeHandoff({
      files: [{ path: "apps/desktop/src/X.tsx", change: "modified", additions: 1, deletions: 0 }],
    });
    for (const pat of ["apps/desktop/**", "apps/desktop/*", "apps/desktop/", "apps/desktop"]) {
      const report = runPathPolicy(handoff, { allow: [pat] });
      expect(report.status).toBe("pass");
    }
  });

  it("(PP6) '.'/'..' segment로 deny/allow를 우회하는 정규화-회피 경로는 unsafe_path로 차단(회귀)", () => {
    // deny ".github/workflows/" 를 startsWith로 빠져나가지만 git 적용 시 같은 파일로 접힌다.
    const dotEvade = makeHandoff({
      files: [{ path: ".github/./workflows/evil.yml", change: "added", additions: 1, deletions: 0 }],
    });
    const r1 = runPathPolicy(dotEvade, { deny: [".github/workflows/"] });
    expect(r1.status).toBe("blocked");
    expect(r1.violations).toEqual([{ filePath: ".github/./workflows/evil.yml", reason: "unsafe_path" }]);

    // ".." 탈출 — allow "src/" 의 startsWith는 통과하지만 적용되면 repo 밖. 정책 안에 있어도 unsafe.
    const escape = makeHandoff({
      files: [{ path: "src/../../../etc/passwd", change: "added", additions: 1, deletions: 0 }],
    });
    const r2 = runPathPolicy(escape, { allow: ["src/"] });
    expect(r2.status).toBe("blocked");
    expect(r2.violations).toEqual([{ filePath: "src/../../../etc/passwd", reason: "unsafe_path" }]);

    // 정책 미설정(allow/deny 둘 다 없음)이어도 '..' 탈출은 warning이 아니라 blocked(fail-closed).
    const noPolicy = makeHandoff({
      files: [{ path: "src/../.github/workflows/evil.yml", change: "added", additions: 1, deletions: 0 }],
    });
    const r3 = runPathPolicy(noPolicy, undefined);
    expect(r3.status).toBe("blocked");
    expect(r3.violations).toEqual([
      { filePath: "src/../.github/workflows/evil.yml", reason: "unsafe_path" },
    ]);

    // 정상 hidden 파일/경로(. 으로 시작하지만 '.' segment 아님)는 계속 통과.
    const legit = makeHandoff({
      files: [{ path: "src/.hidden/file.ts", change: "modified", additions: 1, deletions: 0 }],
    });
    expect(runPathPolicy(legit, { allow: ["src/"] }).status).toBe("pass");
  });
});

describe("buildVerificationReport — runner-claimed vs actual 분리", () => {
  it("(V1) actual 미제공 → status:'not_run', mismatch=false", () => {
    const report = buildVerificationReport({ testResult: passingTests() }, undefined);
    expect(report.actualVerification.status).toBe("not_run");
    expect(report.mismatch).toBe(false);
    expect(report.runnerClaimedTests).toEqual(passingTests());
  });

  it("(V2) actual=passed + runner도 passed → mismatch=false", () => {
    const actual: ActualVerification = { status: "passed", command: "pnpm test", ranAt: "t" };
    const report = buildVerificationReport({ testResult: passingTests() }, actual);
    expect(report.mismatch).toBe(false);
  });

  it("(V3) actual=failed인데 runner는 passed 주장 → mismatch=true", () => {
    const actual: ActualVerification = { status: "failed", command: "pnpm test", ranAt: "t" };
    const report = buildVerificationReport({ testResult: passingTests() }, actual);
    expect(report.mismatch).toBe(true);
  });

  it("(V4) actual=passed인데 runner는 fail 주장 → mismatch=true", () => {
    const actual: ActualVerification = { status: "passed", command: "pnpm test", ranAt: "t" };
    const report = buildVerificationReport({ testResult: failingTests() }, actual);
    expect(report.mismatch).toBe(true);
  });

  it("(V5) runner.ran=false면 mismatch 판정 안 함 (정직)", () => {
    const noRun: TestResultSummary = { ran: false, passed: 0, failed: 0 };
    const actual: ActualVerification = { status: "passed", command: "pnpm test", ranAt: "t" };
    const report = buildVerificationReport({ testResult: noRun }, actual);
    expect(report.mismatch).toBe(false);
  });
});

describe("buildRunnerPatchSafetyReport — 통합", () => {
  it("(R1) 모두 깨끗 + 정책 설정됨 → pass", () => {
    const handoff = makeHandoff({
      files: [
        {
          path: "apps/desktop/src/A.tsx",
          change: "modified",
          additions: 1,
          deletions: 0,
          diff: "+++ b/apps/desktop/src/A.tsx\n+const X = 42;",
        },
      ],
    });
    const report = buildRunnerPatchSafetyReport({
      handoff,
      result: { testResult: passingTests() },
      pathPolicy: { allow: ["apps/desktop/"] },
      actualVerification: { status: "passed", command: "pnpm test", ranAt: "t" },
    });
    expect(report.status).toBe("pass");
  });

  it("(R2) 정책 미설정만 있으면 warning", () => {
    const handoff = makeHandoff({
      files: [{ path: "apps/desktop/src/A.tsx", change: "modified", additions: 1, deletions: 0 }],
    });
    const report = buildRunnerPatchSafetyReport({
      handoff,
      result: { testResult: { ran: false, passed: 0, failed: 0 } },
    });
    expect(report.status).toBe("warning");
    expect(report.pathPolicy.status).toBe("warning");
  });

  it("(R3) secret 감지 + 정책 위반 → blocked (warning < blocked)", () => {
    const fakeKey = ["sk", "live", "abcdefghijklmnop"].join("-");
    const handoff = makeHandoff({
      files: [
        {
          path: "infra/secrets.ts",
          change: "added",
          additions: 1,
          deletions: 0,
          diff: `+++ b/infra/secrets.ts\n+const K = "${fakeKey}";`,
        },
      ],
    });
    const report = buildRunnerPatchSafetyReport({
      handoff,
      result: { testResult: passingTests() },
      pathPolicy: { allow: ["apps/desktop/"] },
    });
    expect(report.status).toBe("blocked");
    expect(report.secretScan.status).toBe("blocked");
    expect(report.pathPolicy.status).toBe("blocked");
  });
});

describe("annotateHandoffWithSafety — handoff에 safety 반영", () => {
  it("(A1) safety blocked면 applicable을 강제로 false (handoff가 원래 applicable이었어도)", () => {
    const fakeKey = ["sk", "live", "abcdefghijklmnop"].join("-");
    const baseHandoff = makeHandoff({
      applicable: true,
      files: [
        {
          path: "src/c.ts",
          change: "added",
          additions: 1,
          deletions: 0,
          diff: `+++ b/src/c.ts\n+const K = "${fakeKey}";`,
        },
      ],
    });
    const report = buildRunnerPatchSafetyReport({
      handoff: baseHandoff,
      result: { testResult: passingTests() },
    });
    const annotated = annotateHandoffWithSafety(baseHandoff, report);
    expect(annotated.applicable).toBe(false);
    expect(annotated.safetyBlockers).toContain("secret_in_patch");
  });

  it("(A2) safety warning만 있으면 applicable은 유지", () => {
    const handoff = makeHandoff({
      applicable: true,
      files: [{ path: "src/c.ts", change: "modified", additions: 1, deletions: 0 }],
    });
    const report = buildRunnerPatchSafetyReport({
      handoff,
      result: { testResult: passingTests() },
    });
    const annotated = annotateHandoffWithSafety(handoff, report);
    expect(annotated.applicable).toBe(true);
    expect(annotated.safetyWarnings).toContain("path_policy_unset");
    expect(annotated.safetyBlockers).toEqual([]);
  });

  it("(A3) requiresApproval은 무조건 true 유지 (자동 적용 라인)", () => {
    const handoff = makeHandoff({ applicable: true });
    const report = buildRunnerPatchSafetyReport({
      handoff,
      result: { testResult: { ran: false, passed: 0, failed: 0 } },
    });
    const annotated = annotateHandoffWithSafety(handoff, report);
    expect(annotated.requiresApproval).toBe(true);
  });
});
