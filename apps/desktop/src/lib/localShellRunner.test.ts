import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET_SEQUENCE,
  SHELL_PRESETS,
  createLocalShellCodingRunner,
  parseDiffStat,
  parseTestResult,
  redactSecrets,
  type ShellExecOutput,
  type ShellExecutor,
  type ShellPreset,
} from "./localShellRunner";
import type { CodingRunRequest, CodingRunStatus } from "./codingRunner";

const NOW = "2026-06-16T00:00:00.000Z";
const req: CodingRunRequest = {
  missionId: "ms_1",
  repoRoot: "/home/robin/app",
  prompt: "진단 돌려",
  allowedTools: ["read", "grep", "test"],
};

function okExec(map: Record<string, Partial<ShellExecOutput>>): ShellExecutor {
  return async (input) => {
    const key = Object.keys(map).find((k) => input.command.includes(k)) ?? "";
    return { exitCode: 0, stdout: "", stderr: "", observed: true, ...(map[key] ?? {}) };
  };
}

describe("순수 파서/마스킹", () => {
  it("parseDiffStat — 경로/+- 추출", () => {
    const files = parseDiffStat(" src/App.tsx | 12 +++---\n src/util.ts | 4 ++++\n 2 files changed");
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ path: "src/App.tsx", additions: 3, deletions: 3 });
    expect(files[1]).toMatchObject({ path: "src/util.ts", additions: 4, deletions: 0 });
  });

  it("parseTestResult — passed/failed 카운트", () => {
    expect(parseTestResult("Tests  13 passed (13)")).toMatchObject({ ran: true, passed: 13, failed: 0 });
    expect(parseTestResult("Tests  1 failed | 12 passed (13)")).toMatchObject({ passed: 12, failed: 1 });
  });

  it("redactSecrets — 토큰/키 마스킹", () => {
    expect(redactSecrets("Authorization: Bearer abc123def456")).toContain("<redacted>");
    const sample = ["sk", "live", "x".repeat(12)].join("-");
    expect(redactSecrets(`ANTHROPIC_AUTH_TOKEN=${sample}`)).not.toContain(sample);
    expect(redactSecrets("plain log line")).toBe("plain log line");
  });

  it("redactSecrets — fine-grained PAT(github_pat_)도 마스킹(평문 로그 노출 방지)", () => {
    // 회귀: classic gh[pousr]_ 규칙은 github_pat_를 못 잡아, 평문 PAT가 로그에 그대로 나갔다.
    const pat = ["github", "_pat_", "11", "A".repeat(22), "_", "b".repeat(40)].join("");
    const out = redactSecrets(`echoed token ${pat} done`);
    expect(out).toContain("<redacted>");
    expect(out).not.toContain(pat);
  });
});

describe("local shell runner", () => {
  it("happy path: preset 순차 → completed + diff + test 요약, observed=true", async () => {
    const statuses: CodingRunStatus[] = [];
    const runner = createLocalShellCodingRunner({
      now: () => NOW,
      execute: okExec({
        "diff --stat": { stdout: " src/App.tsx | 12 +++---\n 1 file changed" },
        typecheck: { stdout: "Tests  13 passed (13)" },
      }),
    });
    const result = await runner.run(req, { onStatus: (s) => statuses.push(s) }).done;
    expect(result.status).toBe("completed");
    expect(result.changedFiles.map((f) => f.path)).toContain("src/App.tsx");
    expect(result.testResult.passed).toBe(13);
    expect(result.observed).toBe(true);
    expect(statuses).toEqual(["running", "completed"]);
  });

  it("failed path: 명령 exit!=0 → status failed + errorSummary, 이후 preset 중단", async () => {
    let typecheckRan = false;
    const runner = createLocalShellCodingRunner({
      now: () => NOW,
      presets: ["git_status", "git_diff", "typecheck"],
      execute: async (input) => {
        if (input.command.includes("typecheck")) typecheckRan = true;
        if (input.command.includes("diff --stat")) {
          return { exitCode: 2, stdout: "", stderr: "fatal: not a git repo", observed: true };
        }
        return { exitCode: 0, stdout: "", stderr: "", observed: true };
      },
    });
    const result = await runner.run(req, {}).done;
    expect(result.status).toBe("failed");
    expect(result.errorSummary).toContain("exit 2");
    expect(typecheckRan).toBe(false); // 실패 후 다음 preset 안 돔
  });

  it("blocked: executor가 observed=false면 정직하게 failed + 사유", async () => {
    const runner = createLocalShellCodingRunner({
      now: () => NOW,
      execute: async () => ({ exitCode: -1, stdout: "", stderr: "", observed: false, blockedReason: "send-keys 게이트 off" }),
    });
    const result = await runner.run(req, {}).done;
    expect(result.status).toBe("failed");
    expect(result.errorSummary).toContain("send-keys");
    expect(result.observed).toBe(false);
  });

  it("stop: 진행 중 abort → status stopped, 변경 미적용", async () => {
    let release: () => void = () => {};
    const runner = createLocalShellCodingRunner({
      now: () => NOW,
      execute: (input) =>
        new Promise<ShellExecOutput>((resolve) => {
          release = () => resolve({ exitCode: 0, stdout: "", stderr: "", observed: true });
          if (input.signal.aborted) resolve({ exitCode: 0, stdout: "", stderr: "", observed: true });
        }),
    });
    const handle = runner.run(req, {});
    handle.stop();
    release();
    const result = await handle.done;
    expect(result.status).toBe("stopped");
    expect(result.changedFiles).toHaveLength(0);
  });

  it("preset만 실행 — arbitrary shell/mutation 없음, GitHub write 부수효과 없음", async () => {
    const seen: string[] = [];
    const runner = createLocalShellCodingRunner({
      now: () => NOW,
      execute: async (input) => {
        seen.push(input.command);
        return { exitCode: 0, stdout: "", stderr: "", observed: true };
      },
    });
    const result = await runner.run(req, {}).done;
    // 실행된 명령은 전부 preset(읽기전용/진단) — write/edit/rm/push/gh 없음
    const joined = seen.join(" ").toLowerCase();
    expect(joined).not.toMatch(/\brm\b|git push|git commit|gh pr|>\s|tee /);
    expect(JSON.stringify(result).toLowerCase()).not.toContain("pull request");
  });

  it("로그 시크릿 마스킹 — executor가 토큰을 흘려도 result 로그엔 마스킹", async () => {
    // 리터럴 시크릿을 파일에 두지 않도록 런타임 조립 (gitleaks 오탐 방지 + 테스트 의미 유지)
    const fakeToken = ["sk", "live", "redactme" + "0".repeat(10)].join("-");
    const runner = createLocalShellCodingRunner({
      now: () => NOW,
      execute: async (_input, onLog) => {
        onLog("stdout", `using ANTHROPIC_AUTH_TOKEN=${fakeToken}`);
        return { exitCode: 0, stdout: "", stderr: "", observed: true };
      },
    });
    const result = await runner.run(req, {}).done;
    expect(JSON.stringify(result.logChunks)).not.toContain(fakeToken);
  });
});

// Characterization tests (no behavior change) for the two previously-unasserted
// STATIC exports of localShellRunner.ts: SHELL_PRESETS and DEFAULT_PRESET_SEQUENCE.
// The "local shell runner" block above drives the runtime executor (run/stop/blocked/
// mask) and the line-117 test pins the *runtime-executed* commands as side-effect-free,
// but neither asserts the static preset TABLE itself — the source of every command the
// runner can ever issue. This is the load-bearing safety surface:
//   - The module's doc contract is "preset 진단 명령만 실행 (arbitrary shell 금지, 변경
//     도구 금지) … 디스크를 바꾸지 않는다. 자동 GitHub write/PR/commit 0." That promise
//     lives entirely in this table's shape: a FIXED keyset (no user-supplied command),
//     every entry flagged mutating:false, and every command read-only/diagnostic.
//   - SHELL_PRESETS must enumerate exactly the ShellPreset union (a typo'd/extra key
//     would silently widen or narrow the menu), carry non-empty trimmed label+command,
//     and stamp mutating:false on ALL five — the single flag the UI/runner trusts to
//     decide a preset is safe.
//   - Every command must be statically read-only: git status/diff are inspect-only and
//     the three pnpm scripts are diagnostics. None may contain a mutating git verb, a
//     destructive shell verb, an output redirect, or privilege escalation — otherwise a
//     "diagnostic" preset could write the disk / push / commit behind the contract.
//   - DEFAULT_PRESET_SEQUENCE is the auto-run menu: it must be non-empty, every element
//     a real SHELL_PRESETS key, duplicate-free, and itself fully mutating:false — the
//     out-of-box runner must never auto-issue anything outside the safe table.

const ALL_SHELL_PRESETS: ShellPreset[] = ["git_status", "git_diff", "typecheck", "test", "build"];

describe("SHELL_PRESETS (static safety table)", () => {
  it("enumerates exactly the ShellPreset union", () => {
    expect(Object.keys(SHELL_PRESETS).sort()).toEqual([...ALL_SHELL_PRESETS].sort());
  });

  it("every preset carries a non-empty trimmed label and command, and is flagged mutating:false", () => {
    for (const key of ALL_SHELL_PRESETS) {
      const preset = SHELL_PRESETS[key];
      expect(preset.label.trim()).toBe(preset.label);
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.command.trim()).toBe(preset.command);
      expect(preset.command.length).toBeGreaterThan(0);
      // the single flag the runner/UI trusts to call a preset "safe"
      expect(preset.mutating).toBe(false);
    }
  });

  it("every command is statically read-only — no mutating git verb, destructive shell verb, redirect, or escalation", () => {
    // verbs/operators that would let a "diagnostic" preset change the disk or push/commit
    const FORBIDDEN = [
      /\bgit\s+(commit|push|add|checkout|reset|clean|rebase|merge|stash|restore|rm|mv|tag|fetch|pull|apply)\b/,
      /\b(rm|mv|cp|tee|sudo|chmod|chown|kill|truncate|dd)\b/,
      /\bgh\s+pr\b/,
      />/, // output redirect (>, >>)
    ];
    for (const key of ALL_SHELL_PRESETS) {
      const command = SHELL_PRESETS[key].command;
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(command), `${key}: "${command}" matched ${pattern}`).toBe(false);
      }
    }
    // positive shape: status/diff are inspect-only git; the rest are pnpm diagnostics
    expect(SHELL_PRESETS.git_status.command).toMatch(/^git status\b/);
    expect(SHELL_PRESETS.git_diff.command).toMatch(/\bdiff\b/);
    for (const key of ["typecheck", "test", "build"] as const) {
      expect(SHELL_PRESETS[key].command).toMatch(/\bpnpm\b/);
    }
  });
});

describe("DEFAULT_PRESET_SEQUENCE (auto-run menu)", () => {
  it("is the exact status→diff→typecheck order", () => {
    expect(DEFAULT_PRESET_SEQUENCE).toEqual(["git_status", "git_diff", "typecheck"]);
  });

  it("is non-empty, duplicate-free, and every element is a real mutating:false preset", () => {
    expect(DEFAULT_PRESET_SEQUENCE.length).toBeGreaterThan(0);
    expect(new Set(DEFAULT_PRESET_SEQUENCE).size).toBe(DEFAULT_PRESET_SEQUENCE.length);
    for (const key of DEFAULT_PRESET_SEQUENCE) {
      expect(ALL_SHELL_PRESETS).toContain(key);
      expect(SHELL_PRESETS[key].mutating).toBe(false);
    }
  });
});
