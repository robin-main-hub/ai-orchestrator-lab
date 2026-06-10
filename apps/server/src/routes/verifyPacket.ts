import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { codingPacketSchema } from "@ai-orchestrator/protocol";
import type {
  CodingPacket,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import type { AutorunCommandResult } from "./autorunSafety.js";
import {
  getAutorunMode,
  getAutorunModelId,
  getAutorunProviderProfileId,
  redactForPublishPhase,
  rejectUnlessExperimentalAutorunEnabled,
  runAllowedVerificationCommand,
  writeGeneratedFileSafely,
} from "./autorunSafety.js";

export type VerifyPacketRouteDependencies = {
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  respondJson: (statusCode: number, payload: unknown) => void;
  completeProvider?: (
    request: ProviderCompletionRequest,
  ) => Promise<ProviderCompletionResponse>;
  runVerificationCommand?: (
    command: string,
    attempt: number,
  ) => Promise<AutorunCommandResult>;
};

export async function handleVerifyPacketRoute({
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  respondJson,
  completeProvider,
  runVerificationCommand = runAllowedVerificationCommand,
}: VerifyPacketRouteDependencies): Promise<boolean> {
  if (pathname === "/verify-packet" && method === "POST") {
    if (rejectUnlessExperimentalAutorunEnabled(respondJson)) {
      return true;
    }

    let payload: CodingPacket;
    try {
      payload = codingPacketSchema.parse(
        await readJsonBody(request),
      ) as CodingPacket;
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
      const commands = payload.verificationPlan.filter(
        (cmd) => typeof cmd === "string" && cmd.trim().length > 0,
      );
      const autorunMode = getAutorunMode();
      const results: AutorunCommandResult[] = [];
      const fileApplications = [];
      let passed = true;

      for (const cmd of commands) {
        let attempts = 0;
        let cmdPassed = false;
        const maxAttempts =
          autorunMode === "auto_safe" || autorunMode === "lab_yolo" ? 3 : 1;

        while (attempts < maxAttempts && !cmdPassed) {
          attempts++;
          const commandResult = await runVerificationCommand(cmd, attempts);
          if (commandResult.status === "pass") {
            results.push(commandResult);
            cmdPassed = true;
            continue;
          }

          if (isNonRetryableVerificationFailure(commandResult.stderr)) {
            passed = false;
            results.push(commandResult);
            break;
          }

          if (attempts < maxAttempts && completeProvider) {
            const prompt = `The command "${cmd}" failed with the following redacted output:\n\nSTDOUT:\n${commandResult.stdout}\n\nSTDERR:\n${commandResult.stderr}\n\nPlease fix the issues. Output the fixed files using the following format for each file:\n\n\`\`\`filepath\nfilecontent\n\`\`\`\n\nOnly provide the files that need to be changed. Do not output anything else.`;

            try {
              const fixResponse = await completeProvider({
                id: randomUUID(),
                sessionId: randomUUID(),
                providerProfileId: getAutorunProviderProfileId(),
                modelId: getAutorunModelId(),
                messages: [
                  {
                    role: "system",
                    content:
                      "You are an automated coding assistant. Provide minimal fixes for failing tests. Never include secrets. Format your response exactly as requested.",
                  },
                  { role: "user", content: prompt },
                ],
                source: "server",
                routePreference: "server_proxy",
                createdAt: new Date().toISOString(),
              });

              if (fixResponse.content) {
                const content = redactForPublishPhase(fixResponse.content);
                const fileRegex = /```([^\n]+)\n([\s\S]*?)```/g;
                let match;
                while ((match = fileRegex.exec(content)) !== null) {
                  const filePath = match[1]?.trim();
                  const fileContent = match[2];
                  if (filePath && fileContent !== undefined) {
                    fileApplications.push(
                      await writeGeneratedFileSafely({
                        relativePath: filePath,
                        content: fileContent,
                        source: "verify-packet",
                        mode: autorunMode,
                      }),
                    );
                  }
                }
              }
            } catch (fixError) {
              console.error("Auto-fix generation failed:", fixError);
            }
          } else {
            passed = false;
            results.push(commandResult);
            break;
          }
        }
        if (!passed) {
          break;
        }
      }

      if (commands.length === 0) {
        passed = false;
        results.push({
          label: "No executable commands found in verificationPlan",
          status: "fail",
          stdout: "",
          stderr:
            "Verification plan must contain pnpm, corepack pnpm, or npx --yes pnpm@10.11.0 commands.",
          attempt: 1,
        });
      }

      const report = {
        id: `verifier_${randomUUID()}`,
        status: passed ? "passed" : "warning",
        checks: results.map((result) => ({
          label: result.label,
          status: result.status,
        })),
        notes: [
          `Verification executed ${commands.length} commands.`,
          ...results
            .filter((result) => result.status === "fail")
            .map((result) => `Failed on: ${result.label}\n${result.stderr}`),
        ],
        rawOutputs: results,
        fileApplications,
        autorunMode,
        message: passed
          ? "All tests passed successfully"
          : "Some tests failed",
        exitCode: passed ? 0 : 1,
        stdout: results.map((result) => result.stdout).join("\n"),
        stderr: results.map((result) => result.stderr).join("\n"),
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

function isNonRetryableVerificationFailure(stderr: string): boolean {
  return (
    stderr.includes("not allowed") ||
    stderr.includes("Unsupported pnpm") ||
    stderr.includes("Only pnpm") ||
    stderr.includes("must include")
  );
}
