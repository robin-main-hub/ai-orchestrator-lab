import { spawn } from "node:child_process";
import { join } from "node:path";
import type {
  ModelDescriptor,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "../adapter.js";
import { AdapterError, redactSecretsForLog, truncateForLog } from "../errors.js";
import { buildCliSubprocessEnv } from "./cliSubprocessEnv.js";

export type ClaudeCliAdapterOptions = {
  profileId?: string;
  claudeBinPath: string;
  claudeHome?: string;
  cwd?: string;
  defaultTimeoutMs?: number;
  permissionMode?: ClaudePermissionMode;
  modelIds?: string[];
  runClaudeExec?: ClaudeExecRunner;
};

export type ClaudePermissionMode = "default" | "plan";

export type ClaudeExecRunnerParams = {
  claudeBinPath: string;
  claudeHome?: string;
  cwd?: string;
  prompt: string;
  cliModelId?: string;
  permissionMode: ClaudePermissionMode;
  timeoutMs: number;
  abortSignal?: AbortSignal;
};

export type ClaudeExecResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type ClaudeExecRunner = (params: ClaudeExecRunnerParams) => Promise<ClaudeExecResult>;

const DEFAULT_PROFILE_ID = "provider_claude_code_single_owner";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_PERMISSION_MODE: ClaudePermissionMode = "plan";
const DEFAULT_MODEL_IDS = [
  "claude-cli-session",
  "opus",
  "sonnet",
  "haiku",
];
const CAPTURE_LIMIT = 256_000;
let activeClaudeCliTask: { requestId: string; startedAt: string } | undefined;

export class ClaudeCliAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind = "custom" as const;
  private readonly claudeBinPath: string;
  private readonly claudeHome?: string;
  private readonly cwd?: string;
  private readonly defaultTimeoutMs: number;
  private readonly permissionMode: ClaudePermissionMode;
  private readonly modelIds: string[];
  private readonly runClaudeExec: ClaudeExecRunner;

  constructor(options: ClaudeCliAdapterOptions) {
    this.profileId = options.profileId ?? DEFAULT_PROFILE_ID;
    this.claudeBinPath = options.claudeBinPath;
    this.claudeHome = options.claudeHome;
    this.cwd = options.cwd;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.permissionMode = options.permissionMode ?? DEFAULT_PERMISSION_MODE;
    this.modelIds = options.modelIds ?? DEFAULT_MODEL_IDS;
    this.runClaudeExec = options.runClaudeExec ?? runClaudeExecSubprocess;
  }

  async discoverModels(_ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]> {
    return this.modelIds.map((id) => ({
      id,
      name: id,
      providerProfileId: this.profileId,
      contextWindow: 200_000,
      supportsStreaming: false,
      supportsTools: id !== "haiku",
      inputModalities: ["text", "image", "document"],
      tags: ["claude", "cli", "local"],
    }));
  }

  async complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse> {
    const createdAt = new Date().toISOString();
    const endpoint = `${this.claudeBinPath} --print`;
    const activeTask = activeClaudeCliTask;
    if (activeTask) {
      return {
        id: `provider_completion_response_${request.id}_claude_cli_blocked`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "failed",
        endpoint,
        error: "[blocked] Claude Code single-owner provider already has an active CLI task",
        createdAt,
      };
    }

    activeClaudeCliTask = { requestId: request.id, startedAt: createdAt };
    try {
      const result = await this.runClaudeExec({
        claudeBinPath: this.claudeBinPath,
        claudeHome: this.claudeHome,
        cwd: this.cwd,
        prompt: createClaudeExecPrompt(request),
        cliModelId: resolveCliModelId(request.modelId),
        permissionMode: this.permissionMode,
        timeoutMs: ctx.timeoutMs ?? this.defaultTimeoutMs,
        abortSignal: ctx.abortSignal,
      });

      if (result.exitCode !== 0 || result.signal || result.timedOut) {
        const error = createClaudeCliAdapterError(result);
        reportRawError(ctx, result, error);
        throw error;
      }

      const content = extractClaudeResultContent(result.stdout).trim();
      if (!content) {
        const snippet = truncateForLog(redactSecretsForLog(`${result.stderr}\n${result.stdout}`.trim()));
        ctx.onRawError?.(0, snippet);
        throw new AdapterError("unknown", "claude CLI returned an empty response", {
          providerRawSnippet: snippet,
        });
      }

      return {
        id: `provider_completion_response_${request.id}_claude_cli`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "succeeded",
        content,
        endpoint,
        createdAt,
      };
    } catch (error) {
      const adapterError = normalizeClaudeAdapterError(error);
      return {
        id: `provider_completion_response_${request.id}_claude_cli_failed`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "failed",
        endpoint,
        error: `[${adapterError.category}] ${adapterError.message}`,
        createdAt,
      };
    } finally {
      if (activeClaudeCliTask?.requestId === request.id) {
        activeClaudeCliTask = undefined;
      }
    }
  }
}

export async function runClaudeExecSubprocess(params: ClaudeExecRunnerParams): Promise<ClaudeExecResult> {
  const args = [
    "--print",
    "--output-format",
    "json",
    "--permission-mode",
    params.permissionMode,
  ];
  if (params.cliModelId) {
    args.push("--model", params.cliModelId);
  }

  let timedOut = false;
  const env = buildCliSubprocessEnv(
    params.claudeHome ? { CLAUDE_HOME: expandHomePath(params.claudeHome) } : {},
  );

  return await new Promise<ClaudeExecResult>((resolve, reject) => {
    const child = spawn(expandHomePath(params.claudeBinPath), args, {
      cwd: params.cwd ? expandHomePath(params.cwd) : undefined,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, params.timeoutMs);
    const abort = () => {
      timedOut = true;
      child.kill("SIGTERM");
    };
    params.abortSignal?.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = appendLimited(stderr, chunk);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      params.abortSignal?.removeEventListener("abort", abort);
      if (error.code === "ENOENT") {
        reject(new AdapterError("auth", "claude CLI not found", { cause: error }));
        return;
      }
      reject(new AdapterError("unknown", error.message, { cause: error }));
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      params.abortSignal?.removeEventListener("abort", abort);
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });
    child.stdin.end(params.prompt);
  });
}

export function createClaudeExecPrompt(request: ProviderCompletionRequest): string {
  const lines = [
    "You are the active assistant in AI Orchestrator Lab.",
    "Answer the latest user message directly. Use Korean when the user writes Korean.",
    "Do not reveal hidden reasoning. Do not run tools unless the prompt explicitly asks for implementation work.",
    "",
    "Conversation:",
    ...request.messages.slice(-24).map((message) => `${message.role.toUpperCase()}: ${message.content}`),
  ];
  return lines.join("\n");
}

export function extractClaudeResultContent(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as { result?: unknown; content?: unknown; message?: unknown };
    if (typeof parsed.result === "string") return parsed.result;
    if (typeof parsed.content === "string") return parsed.content;
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // Claude can be configured for text output by wrappers; fall back to raw stdout.
  }

  return trimmed;
}

function resolveCliModelId(modelId: string): string | undefined {
  if (modelId === "claude-cli-session") {
    return undefined;
  }
  return modelId;
}

function createClaudeCliAdapterError(result: ClaudeExecResult): AdapterError {
  const raw = `${result.stderr}\n${result.stdout}`.trim();
  const lower = raw.toLowerCase();
  const snippet = truncateForLog(redactSecretsForLog(raw));

  if (result.timedOut || result.signal === "SIGTERM") {
    return new AdapterError("network", "claude CLI timed out", { providerRawSnippet: snippet });
  }

  if (/401|403|unauthorized|expired|login required|not logged in|auth|permission_denied/.test(lower)) {
    return new AdapterError("credential_expired", "claude CLI session is expired or unauthorized", {
      providerRawSnippet: snippet,
    });
  }

  if (/429|rate[_ -]?limit|too many requests|quota.*exceeded|maximum budget/.test(lower)) {
    return new AdapterError("rate_limit", "claude CLI was rate limited or budget-limited", {
      providerRawSnippet: snippet,
    });
  }

  if (/5\d\d|server error|bad gateway|service unavailable|overloaded/.test(lower)) {
    return new AdapterError("provider", "claude upstream provider failed", { providerRawSnippet: snippet });
  }

  return new AdapterError("unknown", `claude CLI exited with code ${result.exitCode ?? "null"}`, {
    providerRawSnippet: snippet,
  });
}

function reportRawError(ctx: AdapterRuntimeContext, result: ClaudeExecResult, error: AdapterError) {
  const raw = `${result.stderr}\n${result.stdout}`.trim();
  const snippet = error.providerRawSnippet ?? truncateForLog(redactSecretsForLog(raw));
  ctx.onRawError?.(error.status ?? result.exitCode ?? 0, snippet);
}

function normalizeClaudeAdapterError(error: unknown): AdapterError {
  if (error instanceof AdapterError) {
    return error;
  }
  return new AdapterError("unknown", error instanceof Error ? error.message : String(error), { cause: error });
}

function appendLimited(current: string, chunk: string) {
  const next = current + chunk;
  return next.length > CAPTURE_LIMIT ? next.slice(-CAPTURE_LIMIT) : next;
}

function expandHomePath(path: string) {
  if (path === "~") {
    return process.env.HOME ?? path;
  }
  if (path.startsWith("~/")) {
    return join(process.env.HOME ?? "~", path.slice(2));
  }
  return path;
}
