import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export type AutorunMode = "review_only" | "proposal" | "auto_safe" | "lab_yolo";

export type AutorunCommandResult = {
  label: string;
  status: "pass" | "fail";
  stdout: string;
  stderr: string;
  attempt: number;
};

export type GeneratedFileApplyResult = {
  file: string;
  mode: "applied" | "proposal";
  proposalPath?: string;
  reason?: string;
};

type ParsedCommand =
  | {
      executable: string;
      args: string[];
      label: string;
    }
  | {
      error: string;
    };

const SAFE_PNPM_COMMANDS = new Set(["build", "lint", "test", "typecheck"]);
const SAFE_PNPM_FLAGS_WITH_VALUES = new Set(["--filter"]);
const SAFE_PNPM_STANDALONE_FLAGS = new Set(["-r", "--if-present", "--passWithNoTests", "--sort"]);
const SAFE_WORKSPACE_PACKAGES = /^@ai-orchestrator\/[a-z0-9-]+$/;
const SAFE_RELATIVE_TOKEN = /^[A-Za-z0-9@_./:=+-]+$/;
const SECRET_LIKE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "Bearer [REDACTED]"],
  // GitLab PAT(glpat-) — 형제 redaction/차단 게이트(W1 githubCommentWriteGuards·errors.ts
  // SECRET_LIKE_PATTERNS·desktop publicRedaction)는 모두 glpat을 비밀로 보는데 이 publish-phase
  // redactor만 빠져, 명령 stdout/stderr에 박힌 GitLab PAT가 LLM fix 프롬프트·report 응답(외부
  // 노출)으로 redact 없이 새어나갔다(parity 회귀). glpat-는 산문 오탐 0인 specific prefix.
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, "[REDACTED:gitlab_token]"],
  [/("|')(api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|secret|password|private[_-]?key)\1\s*:\s*("|')[^"']+\3/gi, "$1$2$1: $3[REDACTED]$3"],
  [/\b(api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=[REDACTED]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED:private_key]"],
];

export function isExperimentalAutorunEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN === "1";
}

export function getAutorunMode(env: NodeJS.ProcessEnv = process.env): AutorunMode {
  const configured = env.ORCHESTRATOR_AUTORUN_MODE;
  if (configured === "review_only" || configured === "proposal" || configured === "auto_safe" || configured === "lab_yolo") {
    return configured;
  }
  return "auto_safe";
}

export function getAutorunProviderProfileId(env: NodeJS.ProcessEnv = process.env): string {
  return env.ORCHESTRATOR_AUTORUN_PROVIDER_PROFILE_ID?.trim() || "provider_grok_oauth_dgx";
}

export function getAutorunModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.ORCHESTRATOR_AUTORUN_MODEL_ID?.trim() || "grok-oauth-session";
}

export function rejectUnlessExperimentalAutorunEnabled(
  respondJson: (statusCode: number, payload: unknown) => void,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isExperimentalAutorunEnabled(env)) {
    return false;
  }

  respondJson(403, {
    error: "experimental_autorun_disabled",
    message: "Set ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN=1 to enable guarded autorun routes.",
  });
  return true;
}

export async function runAllowedVerificationCommand(command: string, attempt: number, cwd = WORKSPACE_ROOT): Promise<AutorunCommandResult> {
  const parsed = parseAllowedVerificationCommand(command);
  if ("error" in parsed) {
    return {
      label: command,
      status: "fail",
      stdout: "",
      stderr: parsed.error,
      attempt,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(parsed.executable, parsed.args, {
      cwd,
      env: createSafeCommandEnv(),
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
      windowsHide: true,
    });
    return {
      label: parsed.label,
      status: "pass",
      stdout: redactForPublishPhase(stdout),
      stderr: redactForPublishPhase(stderr),
      attempt,
    };
  } catch (error: any) {
    return {
      label: parsed.label,
      status: "fail",
      stdout: redactForPublishPhase(error?.stdout || ""),
      stderr: redactForPublishPhase(error?.stderr || error?.message || ""),
      attempt,
    };
  }
}

export function parseAllowedVerificationCommand(command: string): ParsedCommand {
  const trimmed = command.trim();
  if (!trimmed) {
    return { error: "Empty verification command is not allowed." };
  }

  if (/[;&|><`$]/.test(trimmed)) {
    return { error: "Shell metacharacters are not allowed in autorun verification commands." };
  }

  if (/["']/.test(trimmed)) {
    return { error: "Quoted shell fragments are not allowed; use a preset command such as corepack pnpm --filter @ai-orchestrator/server test." };
  }

  const tokens = trimmed.split(/\s+/);
  const normalized = normalizePnpmTokens(tokens);
  if (!normalized) {
    return {
      error: "Only pnpm/corepack pnpm/npx --yes pnpm@10.11.0 verification presets are allowed.",
    };
  }

  const validation = validatePnpmArgs(normalized.args);
  if (validation) {
    return { error: validation };
  }

  const corepack = createCorepackInvocation(normalized.args);
  return {
    executable: corepack.executable,
    args: corepack.args,
    label: normalized.label,
  };
}

export function resolveSafeWorkspacePath(inputPath: string, options?: { cwd?: string; operation?: "read" | "write" }): string {
  const cwd = options?.cwd ?? WORKSPACE_ROOT;
  const operation = options?.operation ?? "read";
  const trimmed = inputPath.trim();

  if (!trimmed || trimmed.includes("\0")) {
    throw new Error("Path is empty or invalid.");
  }

  if (isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    throw new Error(`Absolute paths are not allowed: ${inputPath}`);
  }

  const fullPath = resolve(cwd, trimmed);
  const rel = relative(cwd, fullPath);
  if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }

  const normalized = rel.replace(/\\/g, "/");
  if (!isAllowedWorkspaceRelPath(normalized)) {
    throw new Error(`Path is outside autorun allowlist: ${inputPath}`);
  }

  if (operation === "write" && isForbiddenWritePath(normalized)) {
    throw new Error(`Path is blocked for autorun writes: ${inputPath}`);
  }

  return fullPath;
}

export async function writeGeneratedFileSafely(params: {
  relativePath: string;
  content: string;
  source: string;
  cwd?: string;
  mode?: AutorunMode;
}): Promise<GeneratedFileApplyResult> {
  const cwd = params.cwd ?? WORKSPACE_ROOT;
  const mode = params.mode ?? getAutorunMode();
  const fullPath = resolveSafeWorkspacePath(params.relativePath, { cwd, operation: "write" });
  const rel = relative(cwd, fullPath).replace(/\\/g, "/");

  if (mode === "review_only") {
    return writeProposalArtifact({ cwd, relativePath: rel, content: params.content, source: params.source, reason: "review_only mode" });
  }

  if (mode === "proposal" || !canAutoApplyPath(rel, mode)) {
    return writeProposalArtifact({
      cwd,
      relativePath: rel,
      content: params.content,
      source: params.source,
      reason: mode === "proposal" ? "proposal mode" : "path requires approval",
    });
  }

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, params.content, "utf8");
  const proposal = await writeProposalArtifact({ cwd, relativePath: rel, content: params.content, source: params.source, reason: "auto_safe trace" });
  return {
    file: rel,
    mode: "applied",
    proposalPath: proposal.proposalPath,
  };
}

export async function writeGeneratedTestFileSafely(params: {
  sourceFilePath: string;
  content: string;
  cwd?: string;
  mode?: AutorunMode;
}): Promise<GeneratedFileApplyResult> {
  const cwd = params.cwd ?? WORKSPACE_ROOT;
  const sourceFullPath = resolveSafeWorkspacePath(params.sourceFilePath, { cwd, operation: "read" });
  const ext = extname(params.sourceFilePath);
  const base = basename(params.sourceFilePath, ext);
  const dir = dirname(sourceFullPath);
  const testPath = resolve(dir, `${base}.test${ext}`);
  const relativeTestPath = relative(cwd, testPath).replace(/\\/g, "/");
  return writeGeneratedFileSafely({
    cwd,
    mode: params.mode,
    relativePath: relativeTestPath,
    content: params.content,
    source: "swarm-tests",
  });
}

export function redactForPublishPhase(value: string): string {
  return SECRET_LIKE_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function normalizePnpmTokens(tokens: string[]): { args: string[]; label: string } | undefined {
  if (tokens[0] === "pnpm") {
    return { args: tokens.slice(1), label: `corepack pnpm ${tokens.slice(1).join(" ")}` };
  }

  if (tokens[0] === "corepack" && tokens[1] === "pnpm") {
    return { args: tokens.slice(2), label: tokens.join(" ") };
  }

  if (tokens[0] === "npx" && tokens[1] === "--yes" && tokens[2] === "pnpm@10.11.0") {
    return { args: tokens.slice(3), label: `corepack pnpm ${tokens.slice(3).join(" ")}` };
  }

  return undefined;
}

function validatePnpmArgs(args: string[]): string | undefined {
  if (args.length === 0) {
    return "A pnpm verification command must include build, lint, test, or typecheck.";
  }

  let commandSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token || !SAFE_RELATIVE_TOKEN.test(token)) {
      return `Unsafe token in verification command: ${token ?? ""}`;
    }

    if (SAFE_PNPM_COMMANDS.has(token)) {
      commandSeen = true;
      continue;
    }

    if (SAFE_PNPM_FLAGS_WITH_VALUES.has(token)) {
      const value = args[index + 1];
      if (!value || !SAFE_WORKSPACE_PACKAGES.test(value)) {
        return `${token} must target an @ai-orchestrator workspace package.`;
      }
      index += 1;
      continue;
    }

    if (SAFE_PNPM_STANDALONE_FLAGS.has(token)) {
      continue;
    }

    return `Unsupported pnpm verification token: ${token}`;
  }

  return commandSeen ? undefined : "A pnpm verification command must include build, lint, test, or typecheck.";
}

function createSafeCommandEnv(): NodeJS.ProcessEnv {
  const names = [
    "APPDATA",
    "ComSpec",
    "HOME",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "PNPM_HOME",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
  ];
  return Object.fromEntries(names.flatMap((name) => {
    const value = process.env[name];
    return value ? [[name, value]] : [];
  }));
}

function createCorepackInvocation(pnpmArgs: string[]): { executable: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      executable: process.execPath,
      args: [join(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js"), "pnpm", ...pnpmArgs],
    };
  }

  return {
    executable: "corepack",
    args: ["pnpm", ...pnpmArgs],
  };
}

function isAllowedWorkspaceRelPath(rel: string): boolean {
  return (
    rel.startsWith("apps/") ||
    rel.startsWith("packages/") ||
    rel.startsWith("docs/") ||
    rel.startsWith("scripts/") ||
    rel.startsWith("agents/")
  );
}

function isForbiddenWritePath(rel: string): boolean {
  return (
    rel === "package.json" ||
    rel === "pnpm-lock.yaml" ||
    rel.endsWith("/package.json") ||
    rel.endsWith("/pnpm-lock.yaml") ||
    rel.startsWith(".") ||
    rel.includes("/.env") ||
    rel.includes("/node_modules/") ||
    rel.includes("/dist/") ||
    rel.includes("/routes/verifyPacket.ts") ||
    rel.includes("/routes/swarmTests.ts") ||
    rel.includes("/routes/swarmDocs.ts") ||
    rel.includes("/routes/notionSync.ts") ||
    /(^|\/)(auth|credential|secret|token|provider).*\.tsx?$/.test(rel.toLowerCase())
  );
}

function canAutoApplyPath(rel: string, mode: AutorunMode): boolean {
  if (mode === "lab_yolo") {
    return true;
  }

  return (
    rel.startsWith("docs/") ||
    rel.endsWith(".md") ||
    /\.test\.[cm]?[tj]sx?$/.test(rel) ||
    (rel.startsWith("apps/desktop/src/") && !isForbiddenWritePath(rel)) ||
    (rel.startsWith("packages/") && rel.includes("/src/") && !isForbiddenWritePath(rel))
  );
}

async function writeProposalArtifact(params: {
  cwd: string;
  relativePath: string;
  content: string;
  source: string;
  reason: string;
}): Promise<GeneratedFileApplyResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = params.relativePath.replace(/[^A-Za-z0-9._-]+/g, "__");
  const proposalRelPath = `artifacts/proposals/${stamp}-${safeName}`;
  const proposalPath = resolve(params.cwd, proposalRelPath);
  await mkdir(dirname(proposalPath), { recursive: true });
  await writeFile(
    proposalPath,
    [
      `source: ${params.source}`,
      `target: ${params.relativePath}`,
      `reason: ${params.reason}`,
      "",
      params.content,
    ].join("\n"),
    "utf8",
  );

  return {
    file: params.relativePath,
    mode: "proposal",
    proposalPath: proposalRelPath,
    reason: params.reason,
  };
}
