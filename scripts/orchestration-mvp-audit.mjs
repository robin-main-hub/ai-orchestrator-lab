#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const checks = [
  {
    name: "git diff whitespace",
    command: "git",
    args: ["diff", "--check"],
  },
  {
    name: "desktop public redaction regression",
    command: "pnpm",
    args: [
      "--filter",
      "@ai-orchestrator/desktop",
      "test",
      "--run",
      "src/lib/publicRedaction.test.ts",
      "src/lib/controlQueuePresentation.test.ts",
      "src/lib/agentRuntimeConfig.test.ts",
      "src/runtime/conversationPipeline.test.ts",
      "src/lib/agentChatContinuity.test.ts",
      "src/lib/agentConversationReadiness.test.ts",
    ],
  },
  {
    name: "provider manifest smoke",
    command: "node",
    args: ["scripts/smoke-provider-ai-manifest.mjs"],
  },
  {
    name: "mimo redaction smoke",
    command: "node",
    args: ["scripts/smoke-mimo-chat-redaction.mjs"],
  },
  {
    name: "provider ai safe run-all",
    command: "node",
    args: ["scripts/provider-ai-smoke.mjs", "--run-all"],
  },
  {
    name: "operator surface maturity scan",
    type: "static-source-scan",
  },
];

const sourceScanTargets = [
  "apps/desktop/src/components/AgentsSidebar.tsx",
  "apps/desktop/src/components/AgentConfigDrawer.tsx",
  "apps/desktop/src/components/ConversationWorkbench/WorkbenchHeader.tsx",
  "apps/desktop/src/components/CheatSheetOverlay.tsx",
  "apps/desktop/src/components/TerminalDock.tsx",
  "apps/desktop/src/components/ChannelRailPanel.tsx",
  "apps/desktop/src/components/SessionIndexRailPanel.tsx",
  "apps/desktop/src/lib/providerSmokeReadiness.ts",
  "apps/desktop/src/lib/controlQueuePresentation.ts",
  "apps/desktop/src/lib/cockpitProjectionHealth.ts",
  "apps/desktop/src/lib/agentChannelStatus.ts",
  "apps/desktop/src/runtime/stage2Runtime.ts",
  "apps/desktop/src/runtime/stage3Runtime.ts",
  "apps/desktop/src/runtime/stage30DgxEndpoints.ts",
  "apps/server/src/http/cors.ts",
  "apps/server/src/index.ts",
  "packages/protocol/src/index.ts",
];

const forbiddenSourcePatterns = [
  { id: "raw-model-pending", pattern: /model pending/i },
  { id: "raw-provider-pending", pattern: /provider pending/i },
  { id: "raw-command-palette", pattern: /Global Command Palette|Search commands|Keyboard Shortcuts/i },
  { id: "raw-execution-disabled", pattern: /execution disabled/i },
  { id: "raw-placeholder-listening", pattern: /placeholder listening/i },
  { id: "raw-sample-conversation", pattern: /샘플 대화|호환성 점검|호환성 확인 준비/ },
  { id: "raw-unknown-fallback", pattern: /timestamp unavailable|unknown error/i },
  { id: "cors-fallback-allowed-origin", pattern: /FALLBACK_ALLOWED_ORIGIN/ },
  { id: "mock-delegation-production-only", pattern: /mock agent delegation execution is disabled in production/i },
  { id: "dgx-public-fallback-default-list", pattern: /DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS\s*=\s*\[[^\]]*ENDRUIN_ORCHESTRATOR_BASE_URL/ },
];

const forbiddenOutputPatterns = [
  /https?:\/\/[^\s"')]+/i,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/i,
  /sk-[A-Za-z0-9_-]{8,}/i,
  /tp-[A-Za-z0-9_-]{8,}/i,
  /\b(?:ghp|github_pat|xoxb|xoxp|ya29)\S+/i,
  /\beyJ[A-Za-z0-9._-]{16,}\b/i,
  /\/Users\/[^\s"')]+/i,
  /\/home\/[^\s"')]+/i,
  /\b[A-Za-z]:\\Users\\[^\s"')]+/i,
  /\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD|COOKIE|KEY)[A-Za-z0-9_]*\s*=\s*["']?[^\s"']+["']?/i,
  /(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\s*:/i,
];

const results = [];

for (const check of checks) {
  const result = check.type === "static-source-scan" ? await runStaticSourceScan(check) : await runCheck(check);
  results.push(result);
  if (result.exitCode !== 0) {
    printResults(results);
    process.exit(result.exitCode || 1);
  }
  if (result.forbiddenMatches.length > 0) {
    printResults(results);
    process.exit(1);
  }
}

printResults(results);

function runCheck(check) {
  return new Promise((resolve) => {
    const child = spawn(check.command, check.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (exitCode) => {
      const combined = `${stdout}\n${stderr}`;
      const publicCombined = redactAuditOutput(combined);
      const forbiddenMatches = forbiddenOutputPatterns
        .filter((pattern) => pattern.test(publicCombined))
        .map((pattern) => pattern.source);
      resolve({
        exitCode,
        forbiddenMatches,
        name: check.name,
        stderrPreview: preview(stderr),
        stdoutPreview: preview(stdout),
      });
    });
  });
}

async function runStaticSourceScan(check) {
  const matches = [];
  for (const target of sourceScanTargets) {
    const source = await readFile(target, "utf8");
    for (const forbidden of forbiddenSourcePatterns) {
      if (forbidden.pattern.test(source)) {
        matches.push(`${target}:${forbidden.id}`);
      }
    }
  }
  return {
    exitCode: matches.length > 0 ? 1 : 0,
    forbiddenMatches: matches,
    name: check.name,
    stderrPreview: "",
    stdoutPreview: matches.length > 0 ? matches.join(" ") : "운영 표면 금지 문구 없음",
  };
}

function preview(value) {
  const lines = redactAuditOutput(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const maxLines = 6;
  const visibleLines = lines.slice(0, maxLines);
  const omittedCount = Math.max(0, lines.length - visibleLines.length);
  const joined = [
    ...visibleLines,
    omittedCount > 0 ? `... ${omittedCount} lines omitted` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const maxChars = 360;
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars - 1).trimEnd()}…`;
}

function redactAuditOutput(value) {
  return value
    .replace(/(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\s*:[^\n\r]*/gi, "[redacted:internal]")
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted:url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [redacted]")
    .replace(/\b(?:ghp|github_pat|xoxb|xoxp|ya29)\S+/gi, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9._-]{16,}\b/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/tp-[A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD|COOKIE|KEY)[A-Za-z0-9_]*\s*=\s*["']?[^\s"']+["']?/gi, "[redacted]")
    .replace(/\/Users\/[^\s"')]+/g, "[redacted:path]")
    .replace(/\/home\/[^\s"')]+/g, "[redacted:path]")
    .replace(/\b[A-Za-z]:\\Users\\[^\s"')]+/g, "[redacted:path]");
}

function printResults(results) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
}
