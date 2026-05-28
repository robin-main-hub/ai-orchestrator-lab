#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL("./run-antigravity-worker.mjs", import.meta.url));
const baseEnv = {
  ...process.env,
  ENABLE_PERSONAL_ANTIGRAVITY_PROFILES: "true",
  OWNER_USER_ID: "owner-robin",
  REQUEST_USER_ID: "owner-robin",
  ANTIGRAVITY_ROUTE_TYPE: "personal_codex",
};

const tempRoot = await mkdtemp(join(tmpdir(), "antigravity-worker-"));
try {
  await testOwnerDryRun();
  await testNonOwnerBlocked();
  await testSharedRouteBlocked();
  await testPrimaryAccountBlocked();
  await testSingleActiveLock();
  await testLaneSelection();
  await testFallbackLogging();
  await testGuiRejected();
  console.log("Antigravity worker smoke passed.");
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}

async function testOwnerDryRun() {
  const paths = await createTask("owner-dry-run");
  const result = await runWorker([
    "--task", paths.request,
    "--profile", "personal_antigravity_ultra",
    "--dry-run",
  ]);
  assert(result.code === 0, result.stderr);
  const resultText = await readFile(paths.result, "utf8");
  assert(resultText.includes("personal_antigravity_ultra"), "dry-run result should name selected profile");
  const logText = await readFile(paths.log, "utf8");
  assert(logText.includes("\"selectedBy\":\"explicit_owner_selection\""), "dry-run should log explicit selection");
}

async function testNonOwnerBlocked() {
  const paths = await createTask("non-owner");
  const result = await runWorker([
    "--task", paths.request,
    "--profile", "personal_antigravity_pro_1",
    "--user-id", "someone-else",
    "--dry-run",
  ]);
  assert(result.code !== 0, "non-owner request should fail");
  assert(result.stderr.includes("configured owner"), result.stderr);
}

async function testSharedRouteBlocked() {
  const paths = await createTask("shared-route");
  const result = await runWorker([
    "--task", paths.request,
    "--profile", "personal_antigravity_pro_1",
    "--route-type", "company_webapp",
    "--dry-run",
  ]);
  assert(result.code !== 0, "shared route should fail");
  assert(result.stderr.includes("blocked shared route type"), result.stderr);
}

async function testPrimaryAccountBlocked() {
  const paths = await createTask("primary-account");
  const result = await runWorker([
    "--task", paths.request,
    "--profile", "primary_google_account",
    "--dry-run",
  ]);
  assert(result.code !== 0, "primary account should fail");
  assert(result.stderr.includes("primary_google_account is excluded"), result.stderr);
}

async function testSingleActiveLock() {
  const paths = await createTask("single-lock");
  const lockDir = join(paths.dir, "locks");
  const first = execFileAsync(process.execPath, [
    script,
    "--task", paths.request,
    "--profile", "personal_antigravity_pro_1",
    "--lock-dir", lockDir,
    "--hold-lock-ms", "700",
    "--dry-run",
  ], { env: baseEnv, windowsHide: true });
  await delay(200);
  const second = await runWorker([
    "--task", paths.request,
    "--profile", "personal_antigravity_pro_1",
    "--lock-dir", lockDir,
    "--dry-run",
  ]);
  assert(second.code !== 0, "second concurrent task should fail");
  assert(second.stderr.includes("active task"), second.stderr);
  await first;
}

async function testLaneSelection() {
  const paths = await createTask("lane-selection");
  const result = await runWorker([
    "--task", paths.request,
    "--lane", "lane_c",
    "--dry-run",
  ]);
  assert(result.code === 0, result.stderr);
  const resultText = await readFile(paths.result, "utf8");
  assert(resultText.includes("personal_antigravity_pro_2"), "lane_c should select pro_2");
  assert(resultText.includes("selectedBy: lane"), "lane selection should be visible");
}

async function testFallbackLogging() {
  const paths = await createTask("fallback");
  const lockDir = join(paths.dir, "locks");
  const first = execFileAsync(process.execPath, [
    script,
    "--task", paths.request,
    "--lane", "lane_b",
    "--lock-dir", lockDir,
    "--hold-lock-ms", "700",
    "--dry-run",
  ], { env: baseEnv, windowsHide: true });
  await delay(200);
  const second = await runWorker([
    "--task", paths.request,
    "--lane", "lane_b",
    "--fallback-profile", "personal_antigravity_pro_2",
    "--lock-dir", lockDir,
    "--dry-run",
  ], { ENABLE_PERSONAL_ANTIGRAVITY_FALLBACK: "true" });
  assert(second.code === 0, second.stderr);
  const logText = await readFile(paths.log, "utf8");
  assert(logText.includes("\"selectedBy\":\"owner_enabled_fallback\""), "fallback must be logged");
  assert(logText.includes("\"fallbackFrom\":\"personal_antigravity_pro_1\""), "fallback source must be logged");
  await first;
}

async function testGuiRejected() {
  const paths = await createTask("gui-rejected");
  const result = await runWorker([
    "--task", paths.request,
    "--profile", "personal_antigravity_ultra",
    "--mode", "gui",
    "--dry-run",
  ]);
  assert(result.code !== 0, "GUI automation mode should fail");
  assert(result.stderr.includes("GUI or browser automation mode is rejected"), result.stderr);
}

async function createTask(name) {
  const dir = join(tempRoot, name);
  const request = join(dir, "request.md");
  const result = join(dir, "result.md");
  const log = join(dir, "log.txt");
  await mkdir(dir, { recursive: true });
  await writeFile(request, `# ${name}\n\nImplement safely in an isolated coding lane.\n`, { encoding: "utf8" });
  return { dir, request, result, log };
}

async function runWorker(args, extraEnv = {}) {
  try {
    const output = await execFileAsync(process.execPath, [script, ...args], {
      env: { ...baseEnv, ...extraEnv },
      windowsHide: true,
    });
    return { code: 0, stdout: output.stdout, stderr: output.stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message,
    };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
