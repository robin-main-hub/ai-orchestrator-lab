import { describe, expect, it } from "vitest";
import {
  buildOpenCodeArgv,
  createOpenCodeRunner,
  parseOpenCodeJsonStream,
  reduceOpenCodeEvents,
  safeOpenCodeTools,
  type OpenCodeEvent,
  type OpenCodeExecResult,
  type OpenCodeExecutor,
} from "./openCodeRunner";
import { redactSecrets } from "./localShellRunner";
import type { CodingRunRequest, CodingRunStatus } from "./codingRunner";

const NOW = "2026-06-16T00:00:00.000Z";
const req: CodingRunRequest = {
  missionId: "ms_1",
  repoRoot: "/home/robin/app",
  prompt: "이 repo 분석해줘",
  allowedTools: ["read", "grep", "edit", "test"],
};

/** canned 이벤트 스트림을 흘리는 executor */
function eventExec(events: OpenCodeEvent[], over: Partial<OpenCodeExecResult> = {}): OpenCodeExecutor {
  return async (_input, onEvent) => {
    for (const event of events) onEvent(event);
    return { events, observed: true, ...over };
  };
}

describe("순수 — 도구 필터 / argv", () => {
  it("safeOpenCodeTools — 읽기전용만 통과, write/edit/bash 제거", () => {
    const { allowed, dropped } = safeOpenCodeTools(["read", "grep", "edit", "write", "test"]);
    expect(allowed).toContain("read");
    expect(allowed).toContain("grep");
    expect(allowed).not.toContain("write");
    expect(allowed).not.toContain("edit");
    expect(allowed).not.toContain("bash");
    // edit/write/test(→bash) 는 dropped
    expect(dropped).toEqual(expect.arrayContaining(["write", "edit", "bash"]));
  });

  it("safeOpenCodeTools — 읽기 도구가 하나도 없으면 최소 read 보장", () => {
    const { allowed } = safeOpenCodeTools(["edit", "write"]);
    expect(allowed).toEqual(["read"]);
  });

  it("buildOpenCodeArgv — --format json/--dir/--model 포함, --dangerously-skip-permissions 절대 없음", () => {
    const { argv, droppedTools } = buildOpenCodeArgv(req, { model: "anthropic/claude-sonnet-4-6", attachUrl: "http://localhost:4096" });
    const joined = argv.join(" ");
    expect(argv[0]).toBe("run");
    expect(joined).toContain("--format json");
    expect(joined).toContain("--dir /home/robin/app");
    expect(joined).toContain("--model anthropic/claude-sonnet-4-6");
    expect(joined).toContain("--attach http://localhost:4096");
    expect(joined).not.toContain("dangerously-skip-permissions");
    expect(joined).not.toContain("write");
    expect(joined).not.toContain("edit");
    // 프롬프트는 마지막 위치 인자
    expect(argv[argv.length - 1]).toBe(req.prompt);
    expect(droppedTools).toEqual(expect.arrayContaining(["edit", "bash"]));
  });
});

describe("순수 — 이벤트 환원", () => {
  it("reduceOpenCodeEvents — message/tool/file_edit/test/error 매핑", () => {
    const events: OpenCodeEvent[] = [
      { type: "message", text: "분석 시작" },
      { type: "tool", name: "read", detail: "src/App.tsx" },
      { type: "file_edit", path: "src/App.tsx", additions: 3, deletions: 1, diff: "+a\n-b" },
      { type: "test", passed: 12, failed: 0 },
      { type: "done", ok: true },
    ];
    const out = reduceOpenCodeEvents(events, () => NOW, redactSecrets);
    expect(out.changedFiles).toHaveLength(1);
    expect(out.changedFiles[0]).toMatchObject({ path: "src/App.tsx", change: "modified", additions: 3, deletions: 1 });
    expect(out.diffSummary).toContain("+a");
    expect(out.testResult).toMatchObject({ ran: true, passed: 12, failed: 0 });
    expect(out.errorSummary).toBeUndefined();
  });
});

describe("순수 — --format json 스트림 파싱", () => {
  it("parseOpenCodeJsonStream — JSON 줄을 이벤트로, 비-JSON 줄은 무시", () => {
    const stream = [
      "opencode v1.2.3", // 사람용 헤더 — 무시
      '{"type":"message","text":"분석 시작"}',
      '{"type":"file_edit","path":"src/a.ts","additions":4,"deletions":1}',
      '{"type":"test","passed":7,"failed":0}',
      "not json at all",
      '{"type":"done","ok":true}',
    ].join("\n");
    const events = parseOpenCodeJsonStream(stream);
    expect(events.map((e) => e.type)).toEqual(["message", "file_edit", "test", "done"]);
    expect(events.find((e) => e.type === "file_edit")).toMatchObject({ path: "src/a.ts", additions: 4 });
  });

  it("parseOpenCodeJsonStream — error/알 수 없는 type은 안전 처리", () => {
    const events = parseOpenCodeJsonStream('{"type":"error","message":"boom"}\n{"event":"weird","content":"hi"}');
    expect(events[0]).toMatchObject({ type: "error", message: "boom" });
    expect(events[1]).toMatchObject({ type: "message", text: "hi" });
  });
});

describe("opencode runner", () => {
  it("happy: 이벤트 스트림 → completed + 변경 제안 + observed=true", async () => {
    const statuses: CodingRunStatus[] = [];
    const runner = createOpenCodeRunner({
      now: () => NOW,
      model: "anthropic/claude-sonnet-4-6",
      execute: eventExec([
        { type: "message", text: "분석 중" },
        { type: "file_edit", path: "src/util.ts", additions: 2, deletions: 0 },
        { type: "done", ok: true },
      ]),
    });
    const result = await runner.run(req, { onStatus: (s) => statuses.push(s) }).done;
    expect(result.status).toBe("completed");
    expect(result.changedFiles.map((f) => f.path)).toContain("src/util.ts");
    expect(result.observed).toBe(true);
    expect(statuses).toEqual(["running", "completed"]);
  });

  it("error 이벤트 → failed + errorSummary", async () => {
    const runner = createOpenCodeRunner({
      now: () => NOW,
      model: "anthropic/claude-sonnet-4-6",
      execute: eventExec([
        { type: "message", text: "시도" },
        { type: "error", message: "model rate limited" },
      ]),
    });
    const result = await runner.run(req, {}).done;
    expect(result.status).toBe("failed");
    expect(result.errorSummary).toContain("rate limited");
  });

  it("observed=false → 정직하게 failed + 사유 (opencode 미설치/게이트 off)", async () => {
    const runner = createOpenCodeRunner({
      now: () => NOW,
      model: "anthropic/claude-sonnet-4-6",
      execute: async () => ({ events: [], observed: false, blockedReason: "opencode 미설치" }),
    });
    const result = await runner.run(req, {}).done;
    expect(result.status).toBe("failed");
    expect(result.observed).toBe(false);
    expect(result.errorSummary).toContain("opencode");
  });

  it("execute throw → failed (observed=false)", async () => {
    const runner = createOpenCodeRunner({
      now: () => NOW,
      model: "anthropic/claude-sonnet-4-6",
      execute: async () => {
        throw new Error("server unreachable");
      },
    });
    const result = await runner.run(req, {}).done;
    expect(result.status).toBe("failed");
    expect(result.observed).toBe(false);
    expect(result.errorSummary).toContain("unreachable");
  });

  it("stop: abort → stopped, 변경 미적용", async () => {
    let release: () => void = () => {};
    const runner = createOpenCodeRunner({
      now: () => NOW,
      model: "anthropic/claude-sonnet-4-6",
      execute: (input) =>
        new Promise<OpenCodeExecResult>((resolve) => {
          release = () => resolve({ events: [], observed: true });
          if (input.signal.aborted) resolve({ events: [], observed: true });
        }),
    });
    const handle = runner.run(req, {});
    handle.stop();
    release();
    const result = await handle.done;
    expect(result.status).toBe("stopped");
    expect(result.changedFiles).toHaveLength(0);
  });

  it("로그 시크릿 마스킹 — opencode가 토큰을 흘려도 result 로그엔 마스킹", async () => {
    const fakeToken = ["sk", "ant", "redactme" + "0".repeat(10)].join("-");
    const runner = createOpenCodeRunner({
      now: () => NOW,
      model: "anthropic/claude-sonnet-4-6",
      execute: eventExec([{ type: "message", text: `using ANTHROPIC_AUTH_TOKEN=${fakeToken}` }, { type: "done", ok: true }]),
    });
    const result = await runner.run(req, {}).done;
    expect(JSON.stringify(result.logChunks)).not.toContain(fakeToken);
  });

  it("읽기전용 강제 — argv에 write/edit 도구가 안 들어가고 로그에 제외 안내", async () => {
    const logs: string[] = [];
    const runner = createOpenCodeRunner({
      now: () => NOW,
      model: "anthropic/claude-sonnet-4-6",
      execute: eventExec([{ type: "done", ok: true }]),
    });
    await runner.run({ ...req, allowedTools: ["read", "edit", "write"] }, { onLog: (c) => logs.push(c.text) }).done;
    const joined = logs.join(" ");
    expect(joined).toContain("읽기전용 강제");
  });
});
