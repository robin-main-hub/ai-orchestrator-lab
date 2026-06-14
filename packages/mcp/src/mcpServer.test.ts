import { describe, expect, it, vi } from "vitest";
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from "./mcpServer.js";
import { callSwarmTool, SWARM_TOOLS } from "./swarmTools.js";

const deps = { baseUrl: "http://127.0.0.1:4317", token: "secret-token" };

describe("handleMcpRequest", () => {
  it("responds to initialize with protocol version + serverInfo", async () => {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, deps);
    expect(res?.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: "ai-orchestrator-swarm" },
      capabilities: { tools: {} },
    });
  });

  it("lists the swarm tools", async () => {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps);
    const names = (res?.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(names).toContain("swarm_dispatch");
    expect(names).toContain("swarm_approve");
    expect(names).toContain("swarm_replay");
    expect(names).toHaveLength(SWARM_TOOLS.length);
  });

  it("calls a tool, forwarding to the orchestrator HTTP API and wrapping the result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ dispatch: { status: "pending_approval" } }),
    });
    const res = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "swarm_dispatch", arguments: { sessionId: "s", role: "qa", commandPreview: "pnpm test" } },
      },
      { ...deps, fetchImpl: fetchImpl as never },
    );
    const result = res?.result as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("pending_approval");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4317/tmux/dispatch",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns an isError content for an unknown tool (not a protocol error)", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } },
      deps,
    );
    expect((res?.result as { isError: boolean }).isError).toBe(true);
  });

  it("returns method-not-found for unknown request methods", async () => {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 5, method: "frobnicate" }, deps);
    expect(res?.error?.code).toBe(-32601);
  });

  it("treats notifications as fire-and-forget (no response)", async () => {
    expect(await handleMcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }, deps)).toBeNull();
  });
});

describe("callSwarmTool", () => {
  it("sends a bearer token and the mapped body, and marks agent as the actor on approvals", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    await callSwarmTool("swarm_approve", { sourceItemId: "x" }, { ...deps, fetchImpl: fetchImpl as never });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body as string)).toEqual({ actor: "agent", sourceItemId: "x" });
  });

  it("redacts the token from network error messages", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connect failed with secret-token in url"));
    const result = await callSwarmTool("swarm_capture", { sessionId: "s", role: "qa" }, { ...deps, fetchImpl: fetchImpl as never });
    expect(JSON.stringify(result.data)).not.toContain("secret-token");
    expect(JSON.stringify(result.data)).toContain("<redacted-token>");
  });

  it("uses GET with no body for the approvals list", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    await callSwarmTool("swarm_approvals_list", {}, { ...deps, fetchImpl: fetchImpl as never });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:4317/approvals/list");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });
});

describe("GitHub read-only MCP tools (D3)", () => {
  const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });

  it("tools/list에 GitHub read-only 도구가 노출된다", async () => {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 9, method: "tools/list" }, deps);
    const names = (res?.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["github_status", "github_pr_list", "github_pr_read", "github_file_read"]));
  });

  it("읽기 도구는 GET only(D3) — write는 comment_plan/comment_execute(W1) + branch_plan(W2) + file_change_plan(W3a) + pr_plan(W4a)만", () => {
    const gh = SWARM_TOOLS.filter((t) => t.name.startsWith("github_"));
    expect(gh.length).toBeGreaterThanOrEqual(9);
    // read-only는 GET만 — github_status / pr_list / pr_read / file_read
    const readOnly = gh.filter((t) => !/^github_(comment_|branch_|file_change_|pr_plan)/.test(t.name));
    expect(readOnly.every((t) => t.method === "GET")).toBe(true);
    // write는 comment_plan/comment_execute + branch_plan + file_change_plan + pr_plan 다섯 개만.
    // 명시 차단: pr_create_execute는 W4b로 분리, file_change_execute는 W3b, branch_execute는 W2b.
    const writeNames = gh.filter((t) => t.method === "POST").map((t) => t.name);
    expect(writeNames.sort()).toEqual([
      "github_branch_plan",
      "github_comment_execute",
      "github_comment_plan",
      "github_file_change_plan",
      "github_pr_plan",
    ]);
    expect(
      SWARM_TOOLS.some((t) =>
        /github_(branch_execute|branch_delete|file_change_execute|file_change_force|pr_create|pr_create_execute|pr_execute|pr_merge|merge|commit|push|file_(create|write|update|delete)|comment_(update|delete))/.test(t.name),
      ),
    ).toBe(false);
  });

  it("github_pr_list는 기존 /integrations/github 라우트로 GET forward(새 client 없음)", async () => {
    const fetchImpl = okFetch();
    await callSwarmTool("github_pr_list", { owner: "robin-main-hub", repo: "ai-orchestrator-lab" }, { ...deps, fetchImpl: fetchImpl as never });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:4317/integrations/github/repos/robin-main-hub/ai-orchestrator-lab/pulls");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("github_pr_read는 PR 번호를 경로에 싣는다", async () => {
    const fetchImpl = okFetch();
    await callSwarmTool("github_pr_read", { owner: "o", repo: "r", number: 42 }, { ...deps, fetchImpl: fetchImpl as never });
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:4317/integrations/github/repos/o/r/pulls/42");
  });

  it("github_file_read는 path를 쿼리로 인코딩한다", async () => {
    const fetchImpl = okFetch();
    await callSwarmTool("github_file_read", { owner: "o", repo: "r", path: "src/a.ts" }, { ...deps, fetchImpl: fetchImpl as never });
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:4317/integrations/github/repos/o/r/file?path=src%2Fa.ts");
  });

  it("github_comment_plan + github_comment_execute 도구가 노출되고 둘 다 POST forwarder", () => {
    const planTool = SWARM_TOOLS.find((t) => t.name === "github_comment_plan");
    const executeTool = SWARM_TOOLS.find((t) => t.name === "github_comment_execute");
    expect(planTool?.method).toBe("POST");
    expect(executeTool?.method).toBe("POST");
    // MCP는 게이트 우회 통로가 아니다 — github_comment_create_direct 같은 우회 도구 금지
    expect(SWARM_TOOLS.some((t) => /github.*(direct|raw|skip|bypass)/.test(t.name))).toBe(false);
    // write 가능한 다른 github 도구는 만들지 않는다 — branch는 plan만(W2), execute/delete/force는 금지.
    // commit/file_create/pr_create/merge는 어떤 형태로도 금지.
    expect(
      SWARM_TOOLS.some((t) =>
        /github_(branch_execute|branch_delete|branch_force|commit|file_(create|write|update|delete)|pr_create|merge|comment_(update|delete))/.test(t.name),
      ),
    ).toBe(false);
  });

  it("github_comment_plan은 /integrations/github/write/comment/plan으로 body 그대로 forward", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    await callSwarmTool(
      "github_comment_plan",
      { repoFullName: "robin/lab", number: 7, targetKind: "pull_request", body: "리뷰 확인" },
      { ...deps, fetchImpl: fetchImpl as never },
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:4317/integrations/github/write/comment/plan");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      repoFullName: "robin/lab", number: 7, targetKind: "pull_request", body: "리뷰 확인",
    });
  });

  it("github_comment_execute는 /integrations/github/write/comment/execute로 forward — 직접 GitHub 호출 없음", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    await callSwarmTool(
      "github_comment_execute",
      { planId: "gcwp_1", bodySha256: "sha", autoExecuteArmed: true, armedAt: "2026-06-14T00:00:00.000Z" },
      { ...deps, fetchImpl: fetchImpl as never },
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:4317/integrations/github/write/comment/execute");
    expect(init.method).toBe("POST");
    // 페이로드는 그대로 forward — MCP가 가공/우회하지 않는다.
    expect(JSON.parse(init.body as string)).toMatchObject({ planId: "gcwp_1", bodySha256: "sha" });
    // MCP는 직접 GitHub API에 가지 않는다 — orchestrator URL만 호출.
    expect(String(url)).not.toContain("api.github.com");
  });

  it("잘못된 owner/repo는 fetch 없이 깨끗한 에러(path injection 방지)", async () => {
    const fetchImpl = okFetch();
    const result = await callSwarmTool("github_pr_list", { owner: "../../admin", repo: "r" }, { ...deps, fetchImpl: fetchImpl as never });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.data)).toContain("invalid github owner");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
