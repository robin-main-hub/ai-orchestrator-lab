import type { IncomingMessage } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { codingPacketSchema } from "@ai-orchestrator/protocol";
import type { CodingPacket } from "@ai-orchestrator/protocol";

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExecFileAsync = promisify(execFile) as ExecFileAsync;

const allowedCommands: Record<string, { file: string; args: string[] }> = {
  "corepack pnpm --filter @ai-orchestrator/protocol test": {
    file: "corepack",
    args: ["pnpm", "--filter", "@ai-orchestrator/protocol", "test"],
  },
  "pnpm --filter @ai-orchestrator/protocol test": {
    file: "pnpm",
    args: ["--filter", "@ai-orchestrator/protocol", "test"],
  },
};

function createSubprocessEnv(): NodeJS.ProcessEnv {
  return {
    CI: process.env.CI,
    COREPACK_HOME: process.env.COREPACK_HOME,
    HOME: process.env.HOME,
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    PNPM_HOME: process.env.PNPM_HOME,
  };
}

function limitOutputLength(output: string, maxLength = 20_000): string {
  if (output.length <= maxLength) return output;
  return `${output.slice(0, maxLength)}\n\n[... Output truncated due to size limits ...]`;
}

function redactSecretLikeValues(output: string): string {
  return output
    .replace(/\bBearer\s+[A-Za-z0-9._:-]+/gi, "Bearer <redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "<redacted>")
    .replace(/\b([A-Z0-9_]*(?:API[_-]?KEY|AUTH[_-]?TOKEN|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=([^\s]+)/gi, "$1=<redacted>");
}

function sanitizeSubprocessOutput(output: unknown): string {
  if (output == null) return "";
  let sanitized = String(output);
  const cwd = process.cwd();
  if (cwd) {
    sanitized = sanitized.split(cwd).join("<root>");
  }
  sanitized = redactSecretLikeValues(sanitized);
  return limitOutputLength(sanitized);
}

export type VerifyPacketRouteDependencies = {
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  respondJson: (statusCode: number, payload: unknown) => void;
  execFileAsync?: ExecFileAsync;
};

function isPacketVerificationAllowed(): boolean {
  const rawEnv = process.env.NODE_ENV;
  const nodeEnv = (rawEnv || "production").toLowerCase().trim();
  const safeEnvironments = ["development", "dev", "test", "local"];
  const blockedEnvironments = ["production", "prod", "staging"];
  return safeEnvironments.includes(nodeEnv) && !blockedEnvironments.includes(nodeEnv);
}

export async function handleVerifyPacketRoute({
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  respondJson,
  execFileAsync = defaultExecFileAsync,
}: VerifyPacketRouteDependencies): Promise<boolean> {
  if (pathname === "/verify-packet" && method === "POST") {
    if (!isPacketVerificationAllowed()) {
      respondJson(403, {
        error: "production_execution_blocked",
        message: "Coding packet verification command execution is disabled in production.",
      });
      return true;
    }

    let payload: CodingPacket;
    try {
      payload = codingPacketSchema.parse(await readJsonBody(request)) as CodingPacket;
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_coding_packet_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    try {
      // Validate that all requested commands are strictly whitelisted
      for (const cmd of payload.verificationPlan) {
        if (!allowedCommands[cmd]) {
          respondJson(400, {
            error: "command_not_allowed",
            message: `Command "${cmd}" is not in the whitelist of allowed commands.`,
          });
          return true;
        }
      }

      const commands = payload.verificationPlan;
      const results = [];
      let passed = true;

      for (const cmd of commands) {
        try {
          // Execute in workspace root
          const command = allowedCommands[cmd];
          if (!command) {
            throw new Error(`Command "${cmd}" is not in the whitelist of allowed commands.`);
          }
          const { stdout, stderr } = await execFileAsync(command.file, command.args, {
            cwd: process.cwd(),
            env: createSubprocessEnv(),
            timeout: 15000,
          });
          results.push({
            label: cmd,
            status: "pass",
            stdout: sanitizeSubprocessOutput(stdout),
            stderr: sanitizeSubprocessOutput(stderr),
          });
        } catch (execError: any) {
          passed = false;
          results.push({
            label: cmd,
            status: "fail",
            stdout: sanitizeSubprocessOutput(execError.stdout),
            stderr: sanitizeSubprocessOutput(execError.stderr || execError.message),
          });
          break; // Stop on first failure
        }
      }

      if (commands.length === 0) {
        passed = false;
        results.push({
          label: "No executable commands found in verificationPlan",
          status: "fail",
          stdout: "",
          stderr: "Verification plan must contain allowed commands."
        });
      }

      const report = {
        id: `verifier_${randomUUID()}`,
        status: passed ? "passed" : "warning",
        checks: results.map((r) => ({ label: r.label, status: r.status })),
        notes: [
          `Verification executed ${commands.length} commands.`,
          ...results.filter((r) => r.status === "fail").map((r) => `Failed on: ${r.label}\n${r.stderr}`),
        ],
        rawOutputs: results,
        message: passed ? "All tests passed successfully" : "Some tests failed",
        exitCode: passed ? 0 : 1,
        stdout: results.map(r => r.stdout).join("\n"),
        stderr: results.map(r => r.stderr).join("\n"),
      };

      respondJson(200, report);
    } catch (error) {
      respondJson(500, {
        error: "verification_execution_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return true;
  }

  return false;
}
