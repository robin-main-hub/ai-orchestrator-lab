import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { createAdapterContext } from "../adapter";
import { CodexCliOAuthAdapter, createCodexExecPrompt, type CodexExecRunner } from "./codexCliOAuthAdapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_codex_001",
    sessionId: "session_test",
    providerProfileId: "provider_codex_oauth",
    modelId: "codex-session",
    messages: [{ role: "user", content: "안녕?" }],
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: "2026-05-25T07:00:00.000Z",
    ...overrides,
  };
}

describe("CodexCliOAuthAdapter", () => {
  it("discovers Codex OAuth pseudo models without exposing tokens", async () => {
    const adapter = new CodexCliOAuthAdapter({ codexBinPath: "/opt/codex" });

    const models = await adapter.discoverModels(createAdapterContext());

    expect(models.map((model) => model.id)).toContain("codex-session");
    expect(models[0]?.providerProfileId).toBe("provider_codex_oauth");
    expect(JSON.stringify(models)).not.toContain("token");
  });

  it("calls codex exec runner with CODEX_HOME and returns the last message", async () => {
    const calls: Parameters<CodexExecRunner>[0][] = [];
    const runner: CodexExecRunner = async (params) => {
      calls.push(params);
      return {
        exitCode: 0,
        signal: null,
        stdout: '{"type":"ignored"}\n',
        stderr: "",
        lastMessage: "안녕하세요. Codex OAuth 세션으로 응답합니다.",
      };
    };
    const adapter = new CodexCliOAuthAdapter({
      codexBinPath: "/home/robin/.codex/bin/codex",
      codexHome: "/home/robin/.codex",
      runCodexExec: runner,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext({ timeoutMs: 12_000 }));

    expect(response.status).toBe("succeeded");
    expect(response.content).toContain("Codex OAuth");
    expect(calls[0]?.codexHome).toBe("/home/robin/.codex");
    expect(calls[0]?.timeoutMs).toBe(12_000);
    expect(calls[0]?.cliModelId).toBeUndefined();
    expect(calls[0]?.prompt).toContain("USER: 안녕?");
  });

  it("passes through real model ids while keeping codex-* ids as profile modes", async () => {
    const calls: Parameters<CodexExecRunner>[0][] = [];
    const runner: CodexExecRunner = async (params) => {
      calls.push(params);
      return { exitCode: 0, signal: null, stdout: "", stderr: "", lastMessage: "done" };
    };
    const adapter = new CodexCliOAuthAdapter({ codexBinPath: "/opt/codex", runCodexExec: runner });

    await adapter.complete(baseRequest({ modelId: "gpt-5.5" }), createAdapterContext());

    expect(calls[0]?.cliModelId).toBe("gpt-5.5");
  });

  it("maps unauthorized CLI output to a credential_expired failure and redacts raw snippets", async () => {
    const snippets: string[] = [];
    const runner: CodexExecRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "401 unauthorized Bearer secret-token-should-not-leak-123456789",
    });
    const adapter = new CodexCliOAuthAdapter({ codexBinPath: "/opt/codex", runCodexExec: runner });

    const response = await adapter.complete(
      baseRequest(),
      createAdapterContext({ onRawError: (_status, snippet) => snippets.push(snippet) }),
    );

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[credential_expired]");
    expect(snippets[0]).toContain("<redacted>");
    expect(snippets[0]).not.toContain("secret-token-should-not-leak");
  });

  it("maps timeouts to network failures", async () => {
    const runner: CodexExecRunner = async () => ({
      exitCode: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const adapter = new CodexCliOAuthAdapter({ codexBinPath: "/opt/codex", runCodexExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[network] codex CLI timed out");
  });
});

describe("createCodexExecPrompt", () => {
  it("keeps the conversation role labels for the CLI prompt", () => {
    const prompt = createCodexExecPrompt(
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
