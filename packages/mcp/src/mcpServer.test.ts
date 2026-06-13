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

  it("모든 GitHub 도구는 GET이고 write 도구가 없다(읽기 전용)", () => {
    const gh = SWARM_TOOLS.filter((t) => t.name.startsWith("github_"));
    expect(gh.length).toBeGreaterThanOrEqual(4);
    expect(gh.every((t) => t.method === "GET")).toBe(true);
    expect(SWARM_TOOLS.some((t) => /github_(create|comment|merge|commit|push|write|update|delete)/.test(t.name))).toBe(false);
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

  it("잘못된 owner/repo는 fetch 없이 깨끗한 에러(path injection 방지)", async () => {
    const fetchImpl = okFetch();
    const result = await callSwarmTool("github_pr_list", { owner: "../../admin", repo: "r" }, { ...deps, fetchImpl: fetchImpl as never });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.data)).toContain("invalid github owner");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
