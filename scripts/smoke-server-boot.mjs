#!/usr/bin/env node
/**
 * Hermetic server-boot smoke test.
 *
 * Builds are not enough: `tsc` (bundler resolution) accepts extensionless
 * relative imports that Node ESM rejects at runtime, so an import like
 * `from "./autorunSafety"` (missing `.js`) compiles green but crashes the
 * server on start with ERR_MODULE_NOT_FOUND. CI never started the server, so
 * that class of bug reached deploy. This script actually boots
 * `apps/server/dist/index.js` and checks /health, with no external deps
 * (binds locally, public /health needs no auth). Run after the build.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, "..", "apps", "server", "dist", "index.js");
const PORT = process.env.SMOKE_PORT ?? "4399";
const DEADLINE_MS = 20_000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, PORT, ORCHESTRATOR_API_TOKEN: process.env.ORCHESTRATOR_API_TOKEN ?? "smoke-token" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk.toString()));
  child.stderr.on("data", (chunk) => (log += chunk.toString()));

  let crashed = null;
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) crashed = code;
  });

  const start = Date.now();
  let healthy = false;
  while (Date.now() - start < DEADLINE_MS) {
    if (crashed !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {
      // not listening yet
    }
    await wait(400);
  }

  child.kill("SIGTERM");
  await wait(300);
  if (!child.killed) child.kill("SIGKILL");

  if (crashed !== null) {
    console.error(`❌ server crashed on boot (exit ${crashed}). Output:\n${log}`);
    process.exit(1);
  }
  if (!healthy) {
    console.error(`❌ server did not become healthy within ${DEADLINE_MS}ms. Output:\n${log}`);
    process.exit(1);
  }
  console.log(`✅ server booted and /health returned 200 on port ${PORT}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ boot smoke failed:", error);
  process.exit(1);
});
