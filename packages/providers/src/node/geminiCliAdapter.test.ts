import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { createAdapterContext } from "../adapter";
import { GeminiCliAdapter, createGeminiExecPrompt, type GeminiExecRunner } from "./geminiCliAdapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_gemini_001",
    sessionId: "session_test",
    providerProfileId: "provider_gemini_cli",
    modelId: "gemini-cli-session",
    messages: [{ role: "user", content: "안녕?" }],
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: "2026-05-26T07:00:00.000Z",
    ...overrides,
  };
}

describe("GeminiCliAdapter", () => {
  it("discovers Gemini CLI pseudo models without exposing tokens", async () => {
    const adapter = new GeminiCliAdapter({ geminiBinPath: "/opt/gemini" });

    const models = await adapter.discoverModels(createAdapterContext());

    expect(models.map((model) => model.id)).toContain("gemini-cli-session");
    expect(models.map((model) => model.id)).toContain("gemini-2.5-pro");
    expect(models[0]?.providerProfileId).toBe("provider_gemini_cli");
    expect(models.find((m) => m.id === "gemini-2.5-pro")?.inputModalities).toEqual(["text", "image", "document"]);
    expect(JSON.stringify(models)).not.toContain("token");
    expect(JSON.stringify(models)).not.toContain("oauth_token");
  });

  it("uses 2M context for pro models and 1M for flash variants", async () => {
    const adapter = new GeminiCliAdapter({ geminiBinPath: "/opt/gemini" });
    const models = await adapter.discoverModels(createAdapterContext());

    expect(models.find((m) => m.id === "gemini-2.5-pro")?.contextWindow).toBe(2_000_000);
    expect(models.find((m) => m.id === "gemini-2.5-flash")?.contextWindow).toBe(1_000_000);
  });

  it("calls gemini exec runner with GEMINI_HOME and returns stdout content", async () => {
    const calls: Parameters<GeminiExecRunner>[0][] = [];
    const runner: GeminiExecRunner = async (params) => {
      calls.push(params);
      return {
        exitCode: 0,
        signal: null,
        stdout: "안녕하세요. Gemini CLI 세션으로 응답합니다.",
        stderr: "",
      };
    };
    const adapter = new GeminiCliAdapter({
      geminiBinPath: "/home/robin/.gemini/bin/gemini",
      geminiHome: "/home/robin/.gemini",
      runGeminiExec: runner,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext({ timeoutMs: 12_000 }));

    expect(response.status).toBe("succeeded");
    expect(response.content).toContain("Gemini CLI");
    expect(calls[0]?.geminiHome).toBe("/home/robin/.gemini");
    expect(calls[0]?.timeoutMs).toBe(12_000);
    expect(calls[0]?.cliModelId).toBeUndefined();
    expect(calls[0]?.prompt).toContain("USER: 안녕?");
  });

  it("passes specific gemini-* model ids through as cliModelId", async () => {
    const calls: Parameters<GeminiExecRunner>[0][] = [];
    const runner: GeminiExecRunner = async (params) => {
      calls.push(params);
      return { exitCode: 0, signal: null, stdout: "done", stderr: "" };
    };
    const adapter = new GeminiCliAdapter({ geminiBinPath: "/opt/gemini", runGeminiExec: runner });

    await adapter.complete(baseRequest({ modelId: "gemini-2.5-pro" }), createAdapterContext());

    expect(calls[0]?.cliModelId).toBe("gemini-2.5-pro");
  });

  it("maps permission_denied to credential_expired and redacts raw snippets", async () => {
    const snippets: string[] = [];
    const runner: GeminiExecRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "PERMISSION_DENIED: Bearer secret-gemini-token-leak-12345",
    });
    const adapter = new GeminiCliAdapter({ geminiBinPath: "/opt/gemini", runGeminiExec: runner });

    const response = await adapter.complete(
      baseRequest(),
      createAdapterContext({ onRawError: (_status, snippet) => snippets.push(snippet) }),
    );

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[credential_expired]");
    expect(snippets[0]).toContain("<redacted>");
    expect(snippets[0]).not.toContain("secret-gemini-token");
  });

  it("maps timeouts to network failures", async () => {
    const runner: GeminiExecRunner = async () => ({
      exitCode: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const adapter = new GeminiCliAdapter({ geminiBinPath: "/opt/gemini", runGeminiExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[network] gemini CLI timed out");
  });

  it("maps quota exceeded to rate_limit failures", async () => {
    const runner: GeminiExecRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "RESOURCE_EXHAUSTED: quota exceeded for model",
    });
    const adapter = new GeminiCliAdapter({ geminiBinPath: "/opt/gemini", runGeminiExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[rate_limit]");
  });

  it("returns an unknown failure when CLI exits 0 but stdout is empty", async () => {
    const runner: GeminiExecRunner = async () => ({
      exitCode: 0,
      signal: null,
      stdout: "   \n",
      stderr: "",
    });
    const adapter = new GeminiCliAdapter({ geminiBinPath: "/opt/gemini", runGeminiExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[unknown]");
    expect(response.error).toContain("empty response");
  });
});

describe("createGeminiExecPrompt", () => {
  it("keeps the conversation role labels for the CLI prompt", () => {
    const prompt = createGeminiExecPrompt(
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
