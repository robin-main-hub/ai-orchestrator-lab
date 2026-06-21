import { describe, expect, it } from "vitest";
import {
  createLocalShellCodingRunner,
  parseDiffStat,
  parseTestResult,
  redactSecrets,
  type ShellExecOutput,
  type ShellExecutor,
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
