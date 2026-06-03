import type { IncomingMessage } from "node:http";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { codingPacketSchema } from "@ai-orchestrator/protocol";
import type { CodingPacket } from "@ai-orchestrator/protocol";

const execAsync = promisify(exec);

export type VerifyPacketRouteDependencies = {
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  respondJson: (statusCode: number, payload: unknown) => void;
};

export async function handleVerifyPacketRoute({
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  respondJson,
}: VerifyPacketRouteDependencies): Promise<boolean> {
  if (pathname === "/verify-packet" && method === "POST") {
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

    const ALLOWED_COMMANDS = new Set([
      "corepack pnpm --filter @ai-orchestrator/protocol test",
      "pnpm --filter @ai-orchestrator/protocol test",
      "node -e \"process.exit(0)\"",
      "node -e \"process.exit(1)\"",
    ]);

    try {
      // Validate that all requested commands are strictly whitelisted
      for (const cmd of payload.verificationPlan) {
        if (!ALLOWED_COMMANDS.has(cmd)) {
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
          const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd(), timeout: 15000 });
          results.push({ label: cmd, status: "pass", stdout, stderr });
        } catch (execError: any) {
          passed = false;
          results.push({ 
            label: cmd, 
            status: "fail", 
            stdout: execError.stdout, 
            stderr: execError.stderr || execError.message 
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
