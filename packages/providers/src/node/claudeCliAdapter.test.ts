import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { createAdapterContext } from "../adapter";
import {
  ClaudeCliAdapter,
  createClaudeExecPrompt,
  extractClaudeResultContent,
  type ClaudeExecRunner,
} from "./claudeCliAdapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_claude_001",
    sessionId: "session_test",
    providerProfileId: "provider_claude_code_single_owner",
    modelId: "claude-cli-session",
    messages: [{ role: "user", content: "Hello" }],
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: "2026-05-28T07:00:00.000Z",
    ...overrides,
  };
}

describe("ClaudeCliAdapter", () => {
  it("discovers Claude CLI pseudo models without exposing tokens", async () => {
    const adapter = new ClaudeCliAdapter({ claudeBinPath: "claude" });

    const models = await adapter.discoverModels(createAdapterContext());

    expect(models.map((model) => model.id)).toContain("claude-cli-session");
    expect(models.map((model) => model.id)).toContain("sonnet");
    expect(models[0]?.providerProfileId).toBe("provider_claude_code_single_owner");
    expect(JSON.stringify(models)).not.toContain("token");
  });

  it("calls claude exec runner with CLAUDE_HOME and returns the JSON result", async () => {
    const calls: Parameters<ClaudeExecRunner>[0][] = [];
    const runner: ClaudeExecRunner = async (params) => {
      calls.push(params);
      return {
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({ type: "result", result: "Claude CLI worker response" }),
        stderr: "",
      };
    };
    const adapter = new ClaudeCliAdapter({
      claudeBinPath: "claude",
      claudeHome: "/home/robin/.claude",
      runClaudeExec: runner,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext({ timeoutMs: 12_000 }));

    expect(response.status).toBe("succeeded");
    expect(response.content).toContain("Claude CLI worker");
    expect(calls[0]?.claudeHome).toBe("/home/robin/.claude");
    expect(calls[0]?.timeoutMs).toBe(12_000);
    expect(calls[0]?.permissionMode).toBe("plan");
    expect(calls[0]?.cliModelId).toBeUndefined();
    expect(calls[0]?.prompt).toContain("USER: Hello");
  });

  it("passes explicit Claude model aliases through as cliModelId", async () => {
    const calls: Parameters<ClaudeExecRunner>[0][] = [];
    const runner: ClaudeExecRunner = async (params) => {
      calls.push(params);
      return { exitCode: 0, signal: null, stdout: JSON.stringify({ result: "done" }), stderr: "" };
    };
    const adapter = new ClaudeCliAdapter({ claudeBinPath: "claude", runClaudeExec: runner });

    await adapter.complete(baseRequest({ modelId: "sonnet" }), createAdapterContext());

    expect(calls[0]?.cliModelId).toBe("sonnet");
  });

  it("rejects concurrent Claude CLI tasks with a single-active-session lock", async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const releaseFirstPromise = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const runner: ClaudeExecRunner = async () => {
      firstStarted();
      await releaseFirstPromise;
      return { exitCode: 0, signal: null, stdout: JSON.stringify({ result: "first done" }), stderr: "" };
    };
    const adapter = new ClaudeCliAdapter({ claudeBinPath: "claude", runClaudeExec: runner });

    const first = adapter.complete(baseRequest({ id: "req_first" }), createAdapterContext());
    await firstStartedPromise;
    const second = await adapter.complete(baseRequest({ id: "req_second" }), createAdapterContext());
    releaseFirst();
    const firstResponse = await first;

    expect(firstResponse.status).toBe("succeeded");
    expect(second.status).toBe("failed");
    expect(second.error).toContain("[blocked]");
  });

  it("maps unauthorized CLI output to credential_expired and redacts raw snippets", async () => {
    const snippets: string[] = [];
    const runner: ClaudeExecRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "401 unauthorized Bearer claude-secret-token-should-not-leak-123456789",
    });
    const adapter = new ClaudeCliAdapter({ claudeBinPath: "claude", runClaudeExec: runner });

    const response = await adapter.complete(
      baseRequest(),
      createAdapterContext({ onRawError: (_status, snippet) => snippets.push(snippet) }),
    );

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[credential_expired]");
    expect(snippets[0]).toContain("<redacted>");
    expect(snippets[0]).not.toContain("claude-secret-token");
  });

  it("maps max-budget failures to rate_limit", async () => {
    const runner: ClaudeExecRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: JSON.stringify({ subtype: "error_max_budget_usd", errors: ["Reached maximum budget"] }),
      stderr: "",
    });
    const adapter = new ClaudeCliAdapter({ claudeBinPath: "claude", runClaudeExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[rate_limit]");
  });

  it("maps timeouts to network failures", async () => {
    const runner: ClaudeExecRunner = async () => ({
      exitCode: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const adapter = new ClaudeCliAdapter({ claudeBinPath: "claude", runClaudeExec: runner });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[network] claude CLI timed out");
  });
});

describe("createClaudeExecPrompt", () => {
  it("keeps the conversation role labels for the CLI prompt", () => {
    const prompt = createClaudeExecPrompt(
      baseRequest({
        messages: [
          { role: "system", content: "system guard" },
          { role: "user", content: "first question" },
          { role: "assistant", content: "first answer" },
          { role: "user", content: "next question" },
        ],
      }),
    );

    expect(prompt).toContain("SYSTEM: system guard");
    expect(prompt).toContain("ASSISTANT: first answer");
    expect(prompt).toContain("USER: next question");
  });
});

describe("extractClaudeResultContent", () => {
  it("extracts Claude JSON result output and falls back to plain text", () => {
    expect(extractClaudeResultContent(JSON.stringify({ result: "structured result" }))).toBe("structured result");
    expect(extractClaudeResultContent("plain text result")).toBe("plain text result");
  });
});
