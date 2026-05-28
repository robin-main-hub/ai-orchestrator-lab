#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL("./check-personal-ai-sessions.mjs", import.meta.url));
const tempRoot = await mkdtemp(join(tmpdir(), "personal-ai-sessions-"));

try {
  await seedGrokAccounts();
  const { stdout } = await execFileAsync(process.execPath, [
    script,
    "--home-root",
    tempRoot,
    "--hydrate-grok-homes",
    "--json",
  ], { windowsHide: true });
  assert(!stdout.includes("token-1"), "report must not print access tokens");
  assert(!stdout.includes("refresh-1"), "report must not print refresh tokens");
  const report = JSON.parse(stdout);
  assert(report.grok.length === 3, "expected three Grok profiles");
  assert(report.grok[0].email === "grok1@example.com", "expected Grok #1 email metadata");
  assert(report.grok[1].home.endsWith(".grok2"), "expected Grok #2 home");
  assert(report.grok[2].state === "active", "expected future token to be active");
  const grok2Auth = await readFile(join(tempRoot, ".grok2", "auth.json"), "utf8");
  assert(grok2Auth.includes("grok2@example.com"), "expected hydrated Grok #2 auth file");
  assert(grok2Auth.includes("token-2"), "hydrated auth file should keep local token value");
  console.log("Personal AI session smoke passed.");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function seedGrokAccounts() {
  const accountDir = join(tempRoot, ".grok", "accounts");
  await mkdir(accountDir, { recursive: true });
  for (const slot of [1, 2, 3]) {
    await writeFile(join(accountDir, `${slot}.json`), `${JSON.stringify({
      key: `token-${slot}`,
      auth_mode: "oidc",
      create_time: new Date().toISOString(),
      user_id: `user-${slot}`,
      email: `grok${slot}@example.com`,
      first_name: "Grok",
      last_name: `Account${slot}`,
      principal_type: "User",
      principal_id: `user-${slot}`,
      team_id: `team-${slot}`,
      coding_data_retention_opt_out: false,
      refresh_token: `refresh-${slot}`,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      oidc_issuer: "https://auth.x.ai",
      oidc_client_id: "client-id",
    }, null, 2)}\n`, "utf8");
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
