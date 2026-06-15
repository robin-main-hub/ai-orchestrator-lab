import { describe, expect, it } from "vitest";
import {
  appendRunnerLog,
  createMockCodingRunner,
  initialRunnerState,
  isMutatingRun,
  settleRunnerState,
  startRunnerState,
  summarizeChangedFiles,
  type CodingRunRequest,
  type CodingRunStatus,
} from "./codingRunner";

const NOW = "2026-06-16T00:00:00.000Z";
const noWait = () => Promise.resolve();
const req: CodingRunRequest = {
  missionId: "ms_1",
  repoRoot: "/home/robin/app",
  prompt: "null 가드 추가하고 타입체크 돌려",
  allowedTools: ["read", "grep", "edit", "test"],
};

describe("codingRunner 순수 헬퍼", () => {
  it("summarizeChangedFiles — 통계 한 줄 / 빈 경우", () => {
    expect(summarizeChangedFiles([])).toBe("변경 없음");
    expect(
      summarizeChangedFiles([
        { path: "a", change: "modified", additions: 12, deletions: 3 },
        { path: "b", change: "added", additions: 30, deletions: 0 },
      ]),
    ).toBe("2개 파일 · +42 / -3");
  });

  it("isMutatingRun — 변경 도구 유무", () => {
    expect(isMutatingRun(["read", "grep"])).toBe(false);
    expect(isMutatingRun(["read", "edit"])).toBe(true);
    expect(isMutatingRun(["bash"])).toBe(true);
  });

  it("state reducer — start/append(cap)/settle", () => {
    let s = startRunnerState(initialRunnerState(), req);
    expect(s.status).toBe("running");
    for (let i = 0; i < 600; i += 1) s = appendRunnerLog(s, { at: NOW, stream: "stdout", text: `l${i}` }, 500);
    expect(s.logs.length).toBe(500);
    expect(s.logs[s.logs.length - 1]!.text).toBe("l599");
    s = settleRunnerState(s, {
      status: "completed",
      logChunks: [],
      changedFiles: [],
      diffSummary: "",
      testResult: { ran: true, passed: 1, failed: 0 },
      startedAt: NOW,
      endedAt: NOW,
      observed: false,
    });
    expect(s.status).toBe("completed");
  });
});

describe("mock runner — run → logs → completed", () => {
  it("성공 시나리오: 로그 스트림 + 제안 diff + 테스트 요약, observed=false", async () => {
    const statuses: CodingRunStatus[] = [];
    const runner = createMockCodingRunner({ wait: noWait, now: () => NOW });
    const handle = runner.run(req, { onStatus: (s) => statuses.push(s) });
    const result = await handle.done;
    expect(result.status).toBe("completed");
    expect(result.logChunks.length).toBeGreaterThan(3);
    expect(result.changedFiles.map((f) => f.path)).toContain("src/App.tsx");
    expect(result.diffSummary).toContain("+++ b/src/App.tsx");
    expect(result.testResult).toMatchObject({ ran: true, failed: 0 });
    expect(result.observed).toBe(false); // 시뮬레이션은 절대 observed 표식 안 함
    expect(statuses).toEqual(["running", "completed"]);
  });

  it("실패 시나리오: errorSummary + status failed, 변경 0 (미적용)", async () => {
    const runner = createMockCodingRunner({ wait: noWait, now: () => NOW, scenario: "failed" });
    const result = await runner.run(req, {}).done;
    expect(result.status).toBe("failed");
    expect(result.errorSummary).toContain("TypeError");
    expect(result.changedFiles).toHaveLength(0);
    expect(result.testResult.failed).toBeGreaterThan(0);
  });

  it("중지: stop() → status stopped, 변경 미적용", async () => {
    let resolveStep: () => void = () => {};
    // 첫 step에서 멈추도록 첫 wait를 보류시킨다
    const gatedWait = () =>
      new Promise<void>((resolve) => {
        resolveStep = resolve;
      });
    const runner = createMockCodingRunner({ wait: gatedWait, now: () => NOW });
    const handle = runner.run(req, {});
    handle.stop();
    resolveStep(); // 보류된 첫 step 풀어줌 → stopped 분기로
    const result = await handle.done;
    expect(result.status).toBe("stopped");
    expect(result.changedFiles).toHaveLength(0);
    expect(result.logChunks.some((c) => c.text.includes("중지"))).toBe(true);
  });

  it("no_changes 시나리오: 변경/diff 없음, 테스트는 통과", async () => {
    const runner = createMockCodingRunner({ wait: noWait, now: () => NOW, scenario: "no_changes" });
    const result = await runner.run(req, {}).done;
    expect(result.status).toBe("completed");
    expect(result.changedFiles).toHaveLength(0);
    expect(result.diffSummary).toBe("");
    expect(result.testResult.passed).toBeGreaterThan(0);
  });

  it("no auto GitHub write — runner 출력에 GitHub/PR/push 부수효과 표면 없음", async () => {
    const runner = createMockCodingRunner({ wait: noWait, now: () => NOW });
    const result = await runner.run(req, {}).done;
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("pull request");
    expect(serialized).not.toContain("git push");
    expect(serialized).not.toContain("/pulls");
  });
});
