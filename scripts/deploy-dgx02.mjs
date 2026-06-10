#!/usr/bin/env node
/**
 * DGX-02 deploy automation — encodes docs/33-dgx02-deploy-runbook.md as a
 * gated, rollback-aware script instead of a copy/paste checklist.
 *
 * Sequence (same as the runbook):
 *   1. preflight    env sanity (token set, not the dev fallback)
 *   2. tunnel-stop  close the public tunnel while deploying
 *   3. build        git pull --ff-only, install, typecheck, test, server:build
 *   4. restart      systemctl restart ai-orchestrator-server
 *   5. local-auth   /health 200 · /provider-registry 401 w/o bearer · 200 w/ bearer
 *   6. smoke        ORCHESTRATOR_TMUX_DRY_RUN=1 tmux:smoke:dry-run
 *   7. tunnel-start reopen the public tunnel — ONLY if 5+6 passed
 *   8. public-auth  same auth trio against the public URL
 *
 * Safety gates:
 *   - The tunnel is never reopened unless the local auth gate passed, so a
 *     broken deploy cannot expose unauthenticated endpoints.
 *   - If the public check shows a protected endpoint answering without a
 *     bearer, the script immediately stops the tunnel again (auto-rollback)
 *     and exits non-zero with rollback guidance.
 *   - Tokens are never printed; bearer headers are redacted in logs.
 *
 * Modes:
 *   --dry-run        print the full plan without executing anything
 *   --validate-only  run only the auth validation trio against --base-url
 *                    (use to verify a running server, local or remote)
 *   --skip-tests     skip typecheck/test during build (faster redeploys)
 *   --skip-tunnel    no cloudflared on this host (skip steps 2/7/8)
 *   --base-url URL   local server base (default http://127.0.0.1:4317)
 *   --public-url URL public base (default https://orchestrator.endruin.com)
 *
 * Run this ON DGX-02 (or any host that runs the orchestrator server):
 *   ORCHESTRATOR_API_TOKEN=... node scripts/deploy-dgx02.mjs
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const args = new Set(process.argv.slice(2));
const argValue = (flag, fallback) => {
  const list = process.argv.slice(2);
  const index = list.indexOf(flag);
  return index !== -1 && list[index + 1] ? list[index + 1] : fallback;
};

const DRY_RUN = args.has("--dry-run");
const VALIDATE_ONLY = args.has("--validate-only");
const SKIP_TESTS = args.has("--skip-tests");
const SKIP_TUNNEL = args.has("--skip-tunnel");
const BASE_URL = argValue("--base-url", process.env.DGX_SERVER_BASE_URL ?? "http://127.0.0.1:4317").replace(/\/$/, "");
const PUBLIC_URL = argValue("--public-url", process.env.DGX_PUBLIC_BASE_URL ?? "https://orchestrator.endruin.com").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.DGX_DEPLOY_HTTP_TIMEOUT_MS ?? 8_000);
const TUNNEL_UNIT = process.env.DGX_TUNNEL_UNIT ?? "cloudflared-orchestrator";
const SERVER_UNIT = process.env.DGX_SERVER_UNIT ?? "ai-orchestrator-server";

await loadDotEnvIfPresent();
const API_TOKEN = (process.env.ORCHESTRATOR_API_TOKEN ?? "").trim();

const log = (message) => console.log(redact(message));
// Sentinel thrown by fail() so the top-level catch can stop without re-logging.
// We set process.exitCode and let the event loop drain instead of calling
// process.exit(), which on Windows aborts with a libuv assertion when undici
// still holds keep-alive sockets open.
const FAIL = Symbol("deploy-fail");
const fail = (message) => {
  console.error(redact(`\n[deploy-dgx02] FAILED: ${message}`));
  process.exitCode = 1;
  throw FAIL;
};

function redact(text) {
  let out = String(text);
  if (API_TOKEN) {
    out = out.split(API_TOKEN).join("<redacted-token>");
  }
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>");
}

function run(command, commandArgs, options = {}) {
  const shown = `${command} ${commandArgs.join(" ")}`;
  if (DRY_RUN) {
    log(`  [dry-run] $ ${shown}`);
    return Promise.resolve({ code: 0 });
  }
  log(`  $ ${shown}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      env: { ...process.env, ...(options.env ?? {}) },
      cwd: options.cwd ?? process.cwd(),
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code });
      } else {
        reject(new Error(`${shown} exited with ${code}`));
      }
    });
  });
}

async function httpStatus(url, { bearer } = {}) {
  if (DRY_RUN) {
    log(`  [dry-run] GET ${url}${bearer ? " (with bearer)" : ""}`);
    return -1;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : undefined,
      signal: controller.signal,
    });
    return response.status;
  } catch (error) {
    log(`  GET ${url} -> unreachable (${error instanceof Error ? error.message : String(error)})`);
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The auth trio from the runbook. Returns { ok, exposed, detail } and never
 * throws — callers decide whether a failure blocks the tunnel or rolls back.
 */
async function validateAuthGate(base, label) {
  const health = await httpStatus(`${base}/health`);
  const noAuth = await httpStatus(`${base}/provider-registry`);
  const withAuth = await httpStatus(`${base}/provider-registry`, { bearer: API_TOKEN });
  const detail = `health=${health} registry(no bearer)=${noAuth} registry(bearer)=${withAuth}`;
  log(`  [${label}] ${detail}`);
  if (DRY_RUN) {
    return { ok: true, exposed: false, detail };
  }
  const exposed = noAuth === 200; // protected endpoint answering without auth
  const ok = health === 200 && noAuth === 401 && withAuth === 200;
  return { ok, exposed, detail };
}

async function loadDotEnvIfPresent() {
  let text = "";
  try {
    text = await readFile(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [rawKey, ...rest] = line.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

// ---------------------------------------------------------------------------

async function main() {
log(
  `[deploy-dgx02] mode=${DRY_RUN ? "dry-run" : VALIDATE_ONLY ? "validate-only" : "deploy"} base=${BASE_URL}${
    SKIP_TUNNEL ? " (tunnel skipped)" : ` public=${PUBLIC_URL}`
  }`,
);

// 1. preflight
if (!API_TOKEN) {
  fail("ORCHESTRATOR_API_TOKEN is not set. Generate one: openssl rand -hex 32");
}
if (!DRY_RUN && !VALIDATE_ONLY && API_TOKEN === "dev-orchestrator-token") {
  fail("refusing to deploy with the dev fallback token in production. Set a strong ORCHESTRATOR_API_TOKEN.");
}
if (process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS === "1" && !args.has("--allow-send-keys")) {
  fail(
    "ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS=1 is set. Deploying with real send-keys enabled requires --allow-send-keys (runbook: keep it empty unless intentionally approved).",
  );
}
log("[1/8] preflight OK");

if (VALIDATE_ONLY) {
  const gate = await validateAuthGate(BASE_URL, "validate-only");
  if (gate.exposed) {
    fail(
      `protected endpoint is exposed without bearer auth (${gate.detail}). Stop the tunnel: sudo systemctl stop ${TUNNEL_UNIT}`,
    );
  }
  if (!gate.ok) {
    fail(`auth validation failed (${gate.detail})`);
  }
  log("[validate-only] auth gate PASSED");
  return;
}

try {
  // 2. close the public tunnel while deploying
  if (!SKIP_TUNNEL) {
    log(`[2/8] stopping public tunnel (${TUNNEL_UNIT})`);
    await run("sudo", ["systemctl", "stop", TUNNEL_UNIT]);
  } else {
    log("[2/8] tunnel skipped (--skip-tunnel)");
  }

  // 3. pull + build (+ optional tests)
  log("[3/8] pull and build");
  await run("git", ["pull", "--ff-only", "origin", "main"]);
  await run("corepack", ["pnpm", "install", "--frozen-lockfile"]);
  if (!SKIP_TESTS) {
    await run("corepack", ["pnpm", "typecheck"]);
    await run("corepack", ["pnpm", "-r", "--if-present", "test"]);
  } else {
    log("  tests skipped (--skip-tests)");
  }
  await run("corepack", ["pnpm", "server:build"]);

  // 4. restart the orchestrator server
  log(`[4/8] restarting orchestrator server (${SERVER_UNIT})`);
  await run("sudo", ["systemctl", "restart", SERVER_UNIT]);

  // 5. local auth gate — the tunnel does NOT reopen unless this passes
  log("[5/8] validating local health and auth");
  let gate = { ok: DRY_RUN, exposed: false, detail: "dry-run" };
  if (!DRY_RUN) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      gate = await validateAuthGate(BASE_URL, `local attempt ${attempt}`);
      if (gate.ok) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  } else {
    await validateAuthGate(BASE_URL, "local");
  }
  if (!DRY_RUN && !gate.ok) {
    fail(
      `local auth gate failed (${gate.detail}). Tunnel stays CLOSED. Rollback: git checkout <known-good-sha> && corepack pnpm server:build && sudo systemctl restart ${SERVER_UNIT}`,
    );
  }
  log("  local auth gate PASSED");

  // 6. no-engine smoke
  log("[6/8] tmux dry-run smoke");
  await run("corepack", ["pnpm", "tmux:smoke:dry-run"], {
    env: { ORCHESTRATOR_TMUX_DRY_RUN: "1", TMUX_DRY_RUN_BASE_URL: BASE_URL },
  });

  // 7. reopen the tunnel — only reached when 5 and 6 passed
  if (!SKIP_TUNNEL) {
    log(`[7/8] reopening public tunnel (${TUNNEL_UNIT})`);
    await run("sudo", ["systemctl", "start", TUNNEL_UNIT]);

    // 8. public auth gate with auto-rollback on exposure
    log("[8/8] validating public health and auth");
    if (!DRY_RUN) {
      let publicGate = { ok: false, exposed: false, detail: "unchecked" };
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        publicGate = await validateAuthGate(PUBLIC_URL, `public attempt ${attempt}`);
        if (publicGate.exposed || publicGate.ok) break;
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      if (publicGate.exposed) {
        log("  !! protected endpoint exposed without auth — stopping tunnel (auto-rollback)");
        await run("sudo", ["systemctl", "stop", TUNNEL_UNIT]);
        fail(
          `public endpoint exposed without bearer (${publicGate.detail}). Tunnel re-closed. Fix auth before reopening.`,
        );
      }
      if (!publicGate.ok) {
        fail(`public auth gate failed (${publicGate.detail}). Check the tunnel and DNS; the server itself passed local checks.`);
      }
    } else {
      await validateAuthGate(PUBLIC_URL, "public");
    }
  } else {
    log("[7/8][8/8] tunnel skipped (--skip-tunnel)");
  }

  log(`\n[deploy-dgx02] ${DRY_RUN ? "dry-run plan complete" : "deploy complete"} ✔`);
  } catch (error) {
    if (error === FAIL) throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
}

main().catch((error) => {
  if (error !== FAIL) {
    console.error(redact(`\n[deploy-dgx02] FAILED: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
  }
});
