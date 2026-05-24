import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ModelDescriptor,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "../adapter";
import { AdapterError, redactSecretsForLog, truncateForLog } from "../errors";

export type CodexCliOAuthAdapterOptions = {
  profileId?: string;
  codexBinPath: string;
  codexHome?: string;
  cwd?: string;
  defaultTimeoutMs?: number;
  modelIds?: string[];
  runCodexExec?: CodexExecRunner;
};

export type CodexExecRunnerParams = {
  codexBinPath: string;
  codexHome?: string;
  cwd?: string;
  prompt: string;
  cliModelId?: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
};

export type CodexExecResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  lastMessage?: string;
  timedOut?: boolean;
};

export type CodexExecRunner = (params: CodexExecRunnerParams) => Promise<CodexExecResult>;

const DEFAULT_PROFILE_ID = "provider_codex_oauth";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_IDS = [
  "codex-session",
  "codex-high",
  "codex-medium",
  "codex-low",
  "codex-review",
  "codex-apply-patch",
  "codex-browser",
  "codex-local",
  "codex-dgx",
];
const CAPTURE_LIMIT = 256_000;

export class CodexCliOAuthAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind = "custom" as const;
  private readonly codexBinPath: string;
  private readonly codexHome?: string;
  private readonly cwd?: string;
  private readonly defaultTimeoutMs: number;
  private readonly modelIds: string[];
  private readonly runCodexExec: CodexExecRunner;

  constructor(options: CodexCliOAuthAdapterOptions) {
    this.profileId = options.profileId ?? DEFAULT_PROFILE_ID;
    this.codexBinPath = options.codexBinPath;
    this.codexHome = options.codexHome;
    this.cwd = options.cwd;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.modelIds = options.modelIds ?? DEFAULT_MODEL_IDS;
    this.runCodexExec = options.runCodexExec ?? runCodexExecSubprocess;
  }

  async discoverModels(_ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]> {
    return this.modelIds.map((id) => ({
      id,
      name: id,
      providerProfileId: this.profileId,
      contextWindow: 128_000,
      supportsStreaming: false,
      supportsTools: id !== "codex-low",
      inputModalities: id === "codex-browser" ? ["text", "image", "document"] : ["text", "document"],
      tags: ["codex", "oauth", "cli", "dgx"],
    }));
  }

  async complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse> {
    const createdAt = new Date().toISOString();
    const endpoint = `${this.codexBinPath} exec`;

    try {
      const result = await this.runCodexExec({
        codexBinPath: this.codexBinPath,
        codexHome: this.codexHome,
        cwd: this.cwd,
        prompt: createCodexExecPrompt(request),
        cliModelId: resolveCliModelId(request.modelId),
        timeoutMs: ctx.timeoutMs ?? this.defaultTimeoutMs,
        abortSignal: ctx.abortSignal,
      });

      if (result.exitCode !== 0 || result.signal || result.timedOut) {
        const error = createCodexCliAdapterError(result);
        reportRawError(ctx, result, error);
        throw error;
      }

      const content = (result.lastMessage ?? extractFinalMessageFromJsonl(result.stdout)).trim();
      if (!content) {
        const snippet = truncateForLog(redactSecretsForLog(`${result.stderr}\n${result.stdout}`.trim()));
        ctx.onRawError?.(0, snippet);
        throw new AdapterError("unknown", "codex CLI returned an empty final message", {
          providerRawSnippet: snippet,
        });
      }

      return {
        id: `provider_completion_response_${request.id}_codex_cli`,
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
      const adapterError = normalizeCodexAdapterError(error);
      return {
        id: `provider_completion_response_${request.id}_codex_cli_failed`,
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

export async function runCodexExecSubprocess(params: CodexExecRunnerParams): Promise<CodexExecResult> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "ai-orchestrator-codex-"));
  const outputPath = join(tmpRoot, "last-message.txt");
  const args = [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--output-last-message",
    outputPath,
  ];
  if (params.cliModelId) {
    args.push("--model", params.cliModelId);
  }
  args.push("-");

  let timedOut = false;
  const env = {
    ...process.env,
    ...(params.codexHome ? { CODEX_HOME: expandHomePath(params.codexHome) } : {}),
  };

  try {
    return await new Promise<CodexExecResult>((resolve, reject) => {
      const child = spawn(expandHomePath(params.codexBinPath), args, {
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
          reject(new AdapterError("auth", "codex CLI not found", { cause: error }));
          return;
        }
        reject(new AdapterError("unknown", error.message, { cause: error }));
      });
      child.once("close", async (exitCode, signal) => {
        clearTimeout(timer);
        params.abortSignal?.removeEventListener("abort", abort);
        const lastMessage = await readFile(outputPath, "utf8").catch(() => undefined);
        resolve({ exitCode, signal, stdout, stderr, lastMessage, timedOut });
      });
      child.stdin.end(params.prompt);
    });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

export function createCodexExecPrompt(request: ProviderCompletionRequest): string {
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
  if (modelId.startsWith("codex-")) {
    return undefined;
  }
  return modelId;
}

function createCodexCliAdapterError(result: CodexExecResult): AdapterError {
  const raw = `${result.stderr}\n${result.stdout}`.trim();
  const lower = raw.toLowerCase();
  const snippet = truncateForLog(redactSecretsForLog(raw));

  if (result.timedOut || result.signal === "SIGTERM") {
    return new AdapterError("network", "codex CLI timed out", { providerRawSnippet: snippet });
  }

  if (/401|unauthorized|expired|login required|not logged in|auth/.test(lower)) {
    return new AdapterError("credential_expired", "codex OAuth session is expired or unauthorized", {
      providerRawSnippet: snippet,
    });
  }

  if (/429|rate[_ -]?limit|too many requests/.test(lower)) {
    return new AdapterError("rate_limit", "codex CLI was rate limited", { providerRawSnippet: snippet });
  }

  if (/5\d\d|server error|bad gateway|service unavailable/.test(lower)) {
    return new AdapterError("provider", "codex upstream provider failed", { providerRawSnippet: snippet });
  }

  return new AdapterError("unknown", `codex CLI exited with code ${result.exitCode ?? "null"}`, {
    providerRawSnippet: snippet,
  });
}

function reportRawError(ctx: AdapterRuntimeContext, result: CodexExecResult, error: AdapterError) {
  const raw = `${result.stderr}\n${result.stdout}`.trim();
  const snippet = error.providerRawSnippet ?? truncateForLog(redactSecretsForLog(raw));
  ctx.onRawError?.(error.status ?? result.exitCode ?? 0, snippet);
}

function normalizeCodexAdapterError(error: unknown): AdapterError {
  if (error instanceof AdapterError) {
    return error;
  }
  return new AdapterError("unknown", error instanceof Error ? error.message : String(error), { cause: error });
}

function extractFinalMessageFromJsonl(stdout: string): string {
  const candidates: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const candidate = extractStringCandidate(parsed);
      if (candidate) {
        candidates.push(candidate);
      }
    } catch {
      // Ignore non-protocol log lines.
    }
  }
  return candidates.at(-1) ?? "";
}

function extractStringCandidate(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["final_message", "last_message", "output_text", "content", "text"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  const message = record.message;
  if (message && typeof message === "object") {
    const nested = extractStringCandidate(message);
    if (nested) return nested;
  }
  const item = record.item;
  if (item && typeof item === "object") {
    const nested = extractStringCandidate(item);
    if (nested) return nested;
  }
  return undefined;
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
