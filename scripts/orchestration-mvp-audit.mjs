#!/usr/bin/env node
import { spawn } from "node:child_process";

const checks = [
  {
    name: "git diff whitespace",
    command: "git",
    args: ["diff", "--check"],
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
];

const forbiddenOutputPatterns = [
  /https?:\/\/[^\s"')]+/i,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/i,
  /sk-[A-Za-z0-9_-]{8,}/i,
  /tp-[A-Za-z0-9_-]{8,}/i,
  /\/Users\/[^\s"')]+/i,
  /(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\s*:/i,
];

const results = [];

for (const check of checks) {
  const result = await runCheck(check);
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
      const forbiddenMatches = forbiddenOutputPatterns
        .filter((pattern) => pattern.test(combined))
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

function preview(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 360);
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
