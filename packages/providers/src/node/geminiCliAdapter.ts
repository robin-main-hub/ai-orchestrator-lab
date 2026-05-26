import { spawn } from "node:child_process";
import { join } from "node:path";
import type {
  ModelDescriptor,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "../adapter.js";
import { AdapterError, redactSecretsForLog, truncateForLog } from "../errors.js";

export type GeminiCliAdapterOptions = {
  profileId?: string;
  geminiBinPath: string;
  geminiHome?: string;
  cwd?: string;
  defaultTimeoutMs?: number;
  modelIds?: string[];
  runGeminiExec?: GeminiExecRunner;
};

export type GeminiExecRunnerParams = {
  geminiBinPath: string;
  geminiHome?: string;
  cwd?: string;
  prompt: string;
  cliModelId?: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
};

export type GeminiExecResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type GeminiExecRunner = (params: GeminiExecRunnerParams) => Promise<GeminiExecResult>;

const DEFAULT_PROFILE_ID = "provider_gemini_cli";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_IDS = [
  "gemini-cli-session",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];
const CAPTURE_LIMIT = 256_000;

export class GeminiCliAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind = "custom" as const;
  private readonly geminiBinPath: string;
  private readonly geminiHome?: string;
  private readonly cwd?: string;
  private readonly defaultTimeoutMs: number;
  private readonly modelIds: string[];
  private readonly runGeminiExec: GeminiExecRunner;

  constructor(options: GeminiCliAdapterOptions) {
    this.profileId = options.profileId ?? DEFAULT_PROFILE_ID;
    this.geminiBinPath = options.geminiBinPath;
    this.geminiHome = options.geminiHome;
    this.cwd = options.cwd;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.modelIds = options.modelIds ?? DEFAULT_MODEL_IDS;
    this.runGeminiExec = options.runGeminiExec ?? runGeminiExecSubprocess;
  }

  async discoverModels(_ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]> {
    return this.modelIds.map((id) => ({
      id,
      name: id,
      providerProfileId: this.profileId,
      contextWindow: id.includes("flash") ? 1_000_000 : 2_000_000,
      supportsStreaming: false,
      supportsTools: id.includes("pro") || id === "gemini-cli-session",
      inputModalities: ["text", "image", "document"],
      tags: ["gemini", "cli"],
    }));
  }

  async complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse> {
    const createdAt = new Date().toISOString();
    const endpoint = `${this.geminiBinPath} -p`;

    try {
      const result = await this.runGeminiExec({
        geminiBinPath: this.geminiBinPath,
        geminiHome: this.geminiHome,
        cwd: this.cwd,
        prompt: createGeminiExecPrompt(request),
        cliModelId: resolveCliModelId(request.modelId),
        timeoutMs: ctx.timeoutMs ?? this.defaultTimeoutMs,
        abortSignal: ctx.abortSignal,
      });

      if (result.exitCode !== 0 || result.signal || result.timedOut) {
        const error = createGeminiCliAdapterError(result);
        reportRawError(ctx, result, error);
        throw error;
      }

      const content = result.stdout.trim();
      if (!content) {
        const snippet = truncateForLog(redactSecretsForLog(`${result.stderr}\n${result.stdout}`.trim()));
        ctx.onRawError?.(0, snippet);
        throw new AdapterError("unknown", "gemini CLI returned an empty response", {
          providerRawSnippet: snippet,
        });
      }

      return {
        id: `provider_completion_response_${request.id}_gemini_cli`,
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
      const adapterError = normalizeGeminiAdapterError(error);
      return {
        id: `provider_completion_response_${request.id}_gemini_cli_failed`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "failed",
        endpoint,
        error: `[${adapterError.category}] ${adapterError.message}`,
        createdAt,
      };
    }
  }
}

export async function runGeminiExecSubprocess(params: GeminiExecRunnerParams): Promise<GeminiExecResult> {
  const args = ["-p", params.prompt];
  if (params.cliModelId) {
    args.push("--model", params.cliModelId);
  }

  let timedOut = false;
  const env = {
    ...process.env,
    ...(params.geminiHome ? { GEMINI_HOME: expandHomePath(params.geminiHome) } : {}),
  };

  return await new Promise<GeminiExecResult>((resolve, reject) => {
    const child = spawn(expandHomePath(params.geminiBinPath), args, {
      cwd: params.cwd ? expandHomePath(params.cwd) : undefined,
      env,
      stdio: ["ignore", "pipe", "pipe"],
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
        reject(new AdapterError("auth", "gemini CLI not found", { cause: error }));
        return;
      }
      reject(new AdapterError("unknown", error.message, { cause: error }));
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      params.abortSignal?.removeEventListener("abort", abort);
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

export function createGeminiExecPrompt(request: ProviderCompletionRequest): string {
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

function resolveCliModelId(modelId: string): string | undefined {
  if (modelId === "gemini-cli-session") {
    return undefined;
  }
  return modelId;
}

function createGeminiCliAdapterError(result: GeminiExecResult): AdapterError {
  const raw = `${result.stderr}\n${result.stdout}`.trim();
  const lower = raw.toLowerCase();
  const snippet = truncateForLog(redactSecretsForLog(raw));

  if (result.timedOut || result.signal === "SIGTERM") {
    return new AdapterError("network", "gemini CLI timed out", { providerRawSnippet: snippet });
  }

  if (/401|403|unauthorized|expired|login required|not logged in|auth|permission_denied/.test(lower)) {
    return new AdapterError("credential_expired", "gemini CLI session is expired or unauthorized", {
      providerRawSnippet: snippet,
    });
  }

  if (/429|rate[_ -]?limit|too many requests|quota.*exceeded/.test(lower)) {
    return new AdapterError("rate_limit", "gemini CLI was rate limited", { providerRawSnippet: snippet });
  }

  if (/5\d\d|server error|bad gateway|service unavailable/.test(lower)) {
    return new AdapterError("provider", "gemini upstream provider failed", { providerRawSnippet: snippet });
  }

  return new AdapterError("unknown", `gemini CLI exited with code ${result.exitCode ?? "null"}`, {
    providerRawSnippet: snippet,
  });
}

function reportRawError(ctx: AdapterRuntimeContext, result: GeminiExecResult, error: AdapterError) {
  const raw = `${result.stderr}\n${result.stdout}`.trim();
  const snippet = error.providerRawSnippet ?? truncateForLog(redactSecretsForLog(raw));
  ctx.onRawError?.(error.status ?? result.exitCode ?? 0, snippet);
}

function normalizeGeminiAdapterError(error: unknown): AdapterError {
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
