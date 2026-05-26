import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { createAdapterContext } from "../adapter";
import { GrokCliOAuthAdapter, createGrokExecPrompt, type GrokExecRunner } from "./grokCliOAuthAdapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_grok_001",
    sessionId: "session_test",
    providerProfileId: "provider_grok_oauth",
    modelId: "grok-oauth-session",
    messages: [{ role: "user", content: "안녕?" }],
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: "2026-05-26T07:00:00.000Z",
    ...overrides,
  };
}

describe("GrokCliOAuthAdapter", () => {
  it("discovers Grok OAuth pseudo models without exposing tokens", async () => {
    const adapter = new GrokCliOAuthAdapter({ grokBinPath: "/opt/grok" });

    const models = await adapter.discoverModels(createAdapterContext());

    expect(models.map((model) => model.id)).toContain("grok-oauth-session");
    expect(models.map((model) => model.id)).toContain("grok-4");
    expect(models[0]?.providerProfileId).toBe("provider_grok_oauth");
    expect(JSON.stringify(models)).not.toContain("token");
    expect(JSON.stringify(models)).not.toContain("auth.json");
  });

  it("calls grok exec runner with GROK_HOME and returns stdout content", async () => {
    const calls: Parameters<GrokExecRunner>[0][] = [];
    const runner: GrokExecRunner = async (params) => {
      calls.push(params);
      return {
        exitCode: 0,
        signal: null,
        stdout: "안녕하세요. Grok OAuth 세션으로 응답합니다.",
        stderr: "",
      };
    };
    const adapter = new GrokCliOAuthAdapter({
      grokBinPath: "/home/robin/.grok/bin/grok",
      grokHome: "/home/robin/.grok",
      runGrokExec: runner,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext({ timeoutMs: 12_000 }));

    expect(response.status).toBe("succeeded");
    expect(response.content).toContain("Grok OAuth");
    expect(calls[0]?.grokHome).toBe("/home/robin/.grok");
    expect(calls[0]?.timeoutMs).toBe(12_000);
    expect(calls[0]?.cliModelId).toBeUndefined();
    expect(calls[0]?.prompt).toContain("USER: 안녕?");
  });

  it("passes specific grok-* model ids through as cliModelId", async () => {
    const calls: Parameters<GrokExecRunner>[0][] = [];
    const runner: GrokExecRunner = async (params) => {
      calls.push(params);
      return { exitCode: 0, signal: null, stdout: "done", stderr: "" };
    };
    const adapter = new GrokCliOAuthAdapter({ grokBinPath: "/opt/grok", runGrokExec: runner });

    await adapter.complete(baseRequest({ modelId: "grok-code" }), createAdapterContext());

    expect(calls[0]?.cliModelId).toBe("grok-code");
  });

  it("treats the grok-oauth-* pseudo id as no explicit cliModelId", async () => {
    const calls: Parameters<GrokExecRunner>[0][] = [];
    const runner: GrokExecRunner = async (params) => {
      calls.push(params);
      return { exitCode: 0, signal: null, stdout: "done", stderr: "" };
    };
    const adapter = new GrokCliOAuthAdapter({ grokBinPath: "/opt/grok", runGrokExec: runner });

    await adapter.complete(baseRequest({ modelId: "grok-oauth-session" }), createAdapterContext());

    expect(calls[0]?.cliModelId).toBeUndefined();
  });

  it("maps unauthorized CLI output to a credential_expired failure and redacts raw snippets", async () => {
    const snippets: string[] = [];
    const runner: GrokExecRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "401 unauthorized Bearer secret-grok-token-leak-987654321",
    });
    const adapter = new GrokCliOAuthAdapter({ grokBinPath: "/opt/grok", runGrokExec: runner });

    const response = await adapter.complete(
      baseRequest(),
      createAdapterContext({ onRawError: (_status, snippet) => snippets.push(snippet) }),
    );

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[credential_expired]");
    expect(snippets[0]).toContain("<redacted>");
    expect(snippets[0]).not.toContain("secret-grok-token");
  });

  it("maps timeouts to network failures", async () => {
    const runner: GrokExecRunner = async () => ({
      exitCode: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const adapter = new GrokCliOAuthAdapter({ grokBinPath: "/opt/grok", runGrokExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[network] grok CLI timed out");
  });

  it("maps 429 rate limit responses to rate_limit failures", async () => {
    const runner: GrokExecRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "HTTP 429 too many requests",
    });
    const adapter = new GrokCliOAuthAdapter({ grokBinPath: "/opt/grok", runGrokExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[rate_limit]");
  });

  it("returns an unknown failure when CLI exits 0 but stdout is empty", async () => {
    const runner: GrokExecRunner = async () => ({
      exitCode: 0,
      signal: null,
      stdout: "   \n",
      stderr: "",
    });
    const adapter = new GrokCliOAuthAdapter({ grokBinPath: "/opt/grok", runGrokExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[unknown]");
    expect(response.error).toContain("empty response");
  });
});

describe("createGrokExecPrompt", () => {
  it("keeps the conversation role labels for the CLI prompt", () => {
    const prompt = createGrokExecPrompt(
      baseRequest({
        messages: [
          { role: "system", content: "system guard" },
          { role: "user", content: "첫 질문" },
          { role: "assistant", content: "첫 답변" },
          { role: "user", content: "다음 질문" },
        ],
      }),
    );

    expect(prompt).toContain("SYSTEM: system guard");
    expect(prompt).toContain("ASSISTANT: 첫 답변");
    expect(prompt).toContain("USER: 다음 질문");
  });
});
