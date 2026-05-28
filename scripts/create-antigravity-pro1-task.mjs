#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = ".codex-tasks/antigravity";
const DEFAULT_ROUTE_TYPE = "personal_codex";
const DEFAULT_USER_ID = "robin";
const PROFILE_ID = "personal_antigravity_pro_1";
const LANE = "lane_b";
const LANE_DIR = "lane-b";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerScript = join(scriptDir, "run-antigravity-worker.mjs");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const taskId = args.taskId ?? timestampTaskId();
  const title = args.title ?? taskId;
  const root = resolve(args.root ?? DEFAULT_ROOT);
  const taskDir = join(root, taskId, LANE_DIR);
  const requestFile = join(taskDir, "request.md");
  const resultFile = join(taskDir, "result.md");
  const logFile = join(taskDir, "log.txt");
  const userId = args.userId ?? process.env.REQUEST_USER_ID ?? process.env.OWNER_USER_ID ?? DEFAULT_USER_ID;
  const routeType = args.routeType ?? process.env.ANTIGRAVITY_ROUTE_TYPE ?? DEFAULT_ROUTE_TYPE;
  const body = await loadBody(args);

  await mkdir(taskDir, { recursive: true });
  await writeFile(requestFile, createRequestMarkdown({ title, taskId, routeType, body }), "utf8");

  const workerArgs = [
    workerScript,
    "--task",
    requestFile,
    "--user-id",
    userId,
    "--route-type",
    routeType,
    "--lane",
    LANE,
    "--result",
    resultFile,
    "--log",
    logFile,
  ];

  console.log(`Created Pro #1 Antigravity task: ${requestFile}`);
  console.log("");
  console.log("Handoff command:");
  console.log(`node ${workerArgs.map(quoteArg).join(" ")}`);

  if (args.runDryRun) {
    await runWorker([...workerArgs, "--dry-run"]);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--run-dry-run") {
      out.runDryRun = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    const key = match ? match[1] : arg.startsWith("--") ? arg.slice(2) : undefined;
    if (!key) {
      throw new Error(`unexpected positional argument: ${arg}`);
    }
    const value = match ? match[2] : argv[++index];
    if (value === undefined) {
      throw new Error(`missing value for --${key}`);
    }
    out[toCamelCase(key)] = value;
  }
  return out;
}

async function loadBody(args) {
  if (args.bodyFile) {
    return readFile(resolve(args.bodyFile), "utf8");
  }
  if (args.body) {
    return args.body;
  }
  return [
    "Implement the assigned coding task in this isolated Pro #1 lane.",
    "",
    "Constraints:",
    "- Work only on the requested files or modules.",
    "- Keep changes independent from Ultra lane work.",
    "- Keep changes easy for Codex to inspect and merge at checkpoint.",
    "- Call out risks, tests run, and unresolved questions in the result.",
  ].join("\n");
}

function createRequestMarkdown({ title, taskId, routeType, body }) {
  return [
    `# ${title}`,
    "",
    `- workerProfile: ${PROFILE_ID}`,
    `- lane: ${LANE}`,
    "- planTier: Pro",
    "- routeType: " + routeType,
    "- taskId: " + taskId,
    "",
    "## Operating Rule",
    "",
    "You are the Pro #1 Antigravity/Gemini coding worker. Produce code in this isolated lane and keep the output checkpoint-friendly for Codex review and merge.",
    "",
    "## Task",
    "",
    body.trim(),
    "",
  ].join("\n");
}

async function runWorker(args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Antigravity Pro #1 worker dry-run failed with exit code ${code}`));
    });
  });
}

function timestampTaskId() {
  return `pro1-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
}

function quoteArg(value) {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function printUsage() {
  console.log(`Usage:
  node scripts/create-antigravity-pro1-task.mjs --task-id provider-refactor-pro1 --title "Pro #1 coding task" --body-file ./task.md

Options:
  --task-id <id>       Defaults to a pro1 timestamp id.
  --title <title>      Defaults to task id.
  --body <markdown>    Inline task body.
  --body-file <path>   Markdown task body file.
  --root <path>        Defaults to .codex-tasks/antigravity.
  --user-id <id>       Defaults to REQUEST_USER_ID, OWNER_USER_ID, then robin.
  --route-type <type>  Defaults to personal_codex.
  --run-dry-run        Also invoke run-antigravity-worker.mjs with --lane lane_b --dry-run.
`);
}
