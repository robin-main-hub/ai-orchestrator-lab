#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_REFRESH_URL = "https://auth.x.ai/oauth2/token";
const DEFAULT_EXPIRY_MARGIN_MINUTES = 30;
const DEFAULT_CLI_REFRESH_TIMEOUT_MS = 20_000;

const GROK_PROFILES = [
  {
    id: "personal_grok_1",
    label: "Grok #1",
    accountSlot: "1",
    accountFile: ".grok/accounts/1.json",
    home: ".grok",
  },
  {
    id: "personal_grok_2",
    label: "Grok #2",
    accountSlot: "2",
    accountFile: ".grok/accounts/2.json",
    home: ".grok2",
  },
  {
    id: "personal_grok_3",
    label: "Grok #3",
    accountSlot: "3",
    accountFile: ".grok/accounts/3.json",
    home: ".grok3",
  },
];

const CLAUDE_PROFILES = [
  {
    id: "personal_claude_max20",
    label: "Claude Max20",
    configDir: ".claude-max20",
  },
  {
    id: "personal_claude_premium",
    label: "Claude Premium",
    configDir: ".claude-premium",
  },
];

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

  const homeRoot = resolve(args.homeRoot ?? homedir());
  const workspaceRoot = resolve(args.workspaceRoot ?? process.cwd());

  // Load .env from workspace root if exists
  await loadDotEnv(workspaceRoot);

  const options = {
    hydrateGrokHomes: Boolean(args.hydrateGrokHomes),
    refresh: Boolean(args.refresh),
    probeGrok: Boolean(args.probeGrok),
    probeMimo: Boolean(args.probeMimo),
    probeRemote: Boolean(args.probeRemote),
    grokCliRefreshFallback: Boolean(args.grokCliRefreshFallback),
    json: Boolean(args.json),
    homeRoot,
    workspaceRoot,
    expiryMarginMinutes: Number(args.expiresWithinMinutes ?? DEFAULT_EXPIRY_MARGIN_MINUTES),
    refreshUrl: args.grokRefreshUrl ?? DEFAULT_REFRESH_URL,
    grokCliRefreshTimeoutMs: Number(args.grokCliRefreshTimeoutMs ?? DEFAULT_CLI_REFRESH_TIMEOUT_MS),
    grokBin: args.grokBin ?? process.env.GROK_BIN ?? "grok",
  };

  const grok = [];
  for (const profile of GROK_PROFILES) {
    grok.push(await checkGrokProfile(profile, options));
  }

  const claude = await Promise.all(CLAUDE_PROFILES.map((profile) => checkClaudeProfile(profile, homeRoot)));
  const mimo = await checkMimoProfiles(options, workspaceRoot);
  const remote = await checkRemoteProfiles(options);
  const antigravity = await checkAntigravity(homeRoot);
  const report = {
    generatedAt: new Date().toISOString(),
    policy: {
      secretHandling: "No access tokens or refresh tokens are printed.",
      refreshRule: "Refresh is attempted only for local profiles with refresh tokens and explicit --refresh.",
    },
    grok,
    claude,
    mimo,
    remote,
    antigravity,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

async function checkGrokProfile(profile, options) {
  const accountFile = resolveUnderHome(options.homeRoot, profile.accountFile);
  const grokHome = resolveUnderHome(options.homeRoot, profile.home);
  const authFile = join(grokHome, "auth.json");
  const result = {
    provider: "grok",
    id: profile.id,
    label: profile.label,
    accountSlot: profile.accountSlot,
    accountFile,
    home: grokHome,
    authFile,
    registered: false,
    homeConfigured: false,
    refreshable: false,
    refreshed: false,
    probe: "not_run",
    state: "missing_account_file",
  };

  const entry = await readJsonIfExists(accountFile);
  if (!entry) {
    return result;
  }

  result.registered = true;
  result.email = entry.email ?? "(unknown)";
  result.userId = entry.user_id ?? entry.principal_id ?? "(unknown)";
  result.expiresAt = entry.expires_at ?? "(unknown)";
  result.refreshable = Boolean(entry.refresh_token && entry.oidc_client_id);
  result.homeConfigured = await pathExists(authFile);

  const expiry = classifyExpiry(entry.expires_at, options.expiryMarginMinutes);
  result.state = expiry.state;
  result.expiresInMinutes = expiry.expiresInMinutes;

  let activeEntry = entry;
  if (options.hydrateGrokHomes && result.registered) {
    await writeGrokAuthFile(authFile, activeEntry);
    result.homeConfigured = true;
  }

  if (options.refresh && result.refreshable && (expiry.state === "expired" || expiry.state === "expires_soon")) {
    const refreshed = await refreshGrokEntry(entry, options.refreshUrl);
    if (refreshed.ok) {
      activeEntry = refreshed.entry;
      result.refreshed = true;
      result.expiresAt = activeEntry.expires_at ?? result.expiresAt;
      const refreshedExpiry = classifyExpiry(activeEntry.expires_at, options.expiryMarginMinutes);
      result.state = refreshedExpiry.state;
      result.expiresInMinutes = refreshedExpiry.expiresInMinutes;
      await writeJson(accountFile, activeEntry);
      if (options.hydrateGrokHomes) {
        await writeGrokAuthFile(authFile, activeEntry);
      }
    } else {
      result.refreshError = refreshed.error;
      result.state = "refresh_failed";
      result.reauthRequired = true;
    }
  }

  if (
    options.refresh &&
    options.grokCliRefreshFallback &&
    result.homeConfigured &&
    result.state === "refresh_failed"
  ) {
    const fallback = await runGrokCliRefreshFallback(options.grokBin, grokHome, options.grokCliRefreshTimeoutMs);
    result.cliRefreshFallback = fallback.ok ? "ok" : `failed: ${fallback.error}`;
    if (fallback.ok) {
      const homeEntry = await readGrokAuthEntry(authFile);
      if (homeEntry) {
        activeEntry = homeEntry;
        result.expiresAt = activeEntry.expires_at ?? result.expiresAt;
        const fallbackExpiry = classifyExpiry(activeEntry.expires_at, options.expiryMarginMinutes);
        result.state = fallbackExpiry.state === "expired"
          ? "active_probe_ok_expiry_metadata_stale"
          : fallbackExpiry.state;
        result.expiresInMinutes = fallbackExpiry.expiresInMinutes;
        await writeJson(accountFile, activeEntry);
      } else {
        result.state = "active_probe_ok_expiry_unknown";
      }
    }
  }

  if (options.probeGrok && result.homeConfigured) {
    result.probe = await probeGrok(options.grokBin, grokHome);
  }

  if (result.state === "refresh_failed" && result.probe === "ok") {
    result.state = "active_probe_ok_reauth_required_for_refresh";
    result.reauthRequired = true;
  }

  if (result.reauthRequired) {
    result.reauthMethod = "Run Grok login and complete the browser/device approval flow. Do not paste device codes or OAuth tokens into chat logs.";
    result.reauthCommandWindows = `$env:GROK_HOME="${grokHome}"; grok login --oauth`;
    result.reauthCommandDeviceWindows = `$env:GROK_HOME="${grokHome}"; grok login --device-auth`;
    result.reauthCommandPosix = `GROK_HOME="${toPosixPath(grokHome)}" grok login --oauth`;
    result.reauthCommandDevicePosix = `GROK_HOME="${toPosixPath(grokHome)}" grok login --device-auth`;
  }

  return result;
}

async function refreshGrokEntry(entry, refreshUrl) {
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: entry.refresh_token,
      client_id: entry.oidc_client_id,
    });
    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!response.ok) {
      return { ok: false, error: `refresh HTTP ${response.status}` };
    }
    const body = await response.json();
    if (!body.access_token) {
      return { ok: false, error: "refresh response did not include access_token" };
    }
    const next = { ...entry, key: body.access_token };
    if (body.refresh_token) {
      next.refresh_token = body.refresh_token;
    }
    if (typeof body.expires_in === "number") {
      next.expires_at = new Date(Date.now() + body.expires_in * 1000).toISOString();
    }
    return { ok: true, entry: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeGrokAuthFile(authFile, entry) {
  const issuer = entry.oidc_issuer ?? "https://auth.x.ai";
  const clientId = entry.oidc_client_id;
  if (!clientId) {
    throw new Error(`Cannot write ${authFile}: oidc_client_id is missing`);
  }
  await mkdir(dirname(authFile), { recursive: true });
  await writeJson(authFile, {
    [`${issuer}::${clientId}`]: entry,
  });
}

async function probeGrok(grokBin, grokHome) {
  try {
    await execFileAsync(grokBin, ["models"], {
      env: { ...process.env, GROK_HOME: grokHome },
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `failed: ${message.split(/\r?\n/)[0]}`;
  }
}

async function runGrokCliRefreshFallback(grokBin, grokHome, timeoutMs) {
  try {
    await execFileAsync(grokBin, [
      "-p",
      "Reply OK if this Grok CLI session is active.",
      "--output-format",
      "json",
    ], {
      env: { ...process.env, GROK_HOME: grokHome },
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message.split(/\r?\n/)[0] };
  }
}

async function checkClaudeProfile(profile, homeRoot) {
  const configDir = resolveUnderHome(homeRoot, profile.configDir);
  const exists = await pathExists(configDir);
  return {
    provider: "claude",
    id: profile.id,
    label: profile.label,
    configDir,
    registered: exists,
    state: exists ? "registered_probe_required" : "missing_config_dir",
    refreshMethod: "Claude CLI manages its own session refresh; run a short plan-mode probe before assigning work.",
    probeCommandWindows: `$env:CLAUDE_CONFIG_DIR="${configDir}"; claude --permission-mode plan -p "Reply OK if this Claude profile is active."`,
    probeCommandPosix: `CLAUDE_CONFIG_DIR="${toPosixPath(configDir)}" claude --permission-mode plan -p "Reply OK if this Claude profile is active."`,
  };
}

async function checkAntigravity(homeRoot) {
  const roamingPath = process.platform === "win32"
    ? join(homeRoot, "AppData", "Roaming", "Antigravity")
    : join(homeRoot, ".config", "Antigravity");
  const exists = await pathExists(roamingPath);
  return {
    provider: "antigravity",
    id: "personal_antigravity_profiles",
    label: "Antigravity/Gemini personal profiles",
    configPath: roamingPath,
    registered: exists,
    state: exists ? "registered_login_check_required" : "missing_config_dir",
    refreshMethod: "No local token refresh is configured here; use the lane login-check handoff when the app account changes or after reboot.",
    loginCheckScripts: [
      "corepack pnpm antigravity:ultra-task -- --task-id ultra-login-check --title \"Ultra login check\" --body \"Confirm this lane-a handoff is readable. Do not modify files.\" --run-dry-run",
      "corepack pnpm antigravity:pro1-task -- --task-id pro1-login-check --title \"Pro #1 login check\" --body \"Confirm this lane-b handoff is readable. Do not modify files.\" --run-dry-run",
      "corepack pnpm antigravity:pro2-task -- --task-id pro2-login-check --title \"Pro #2 login check\" --body \"Confirm this lane-c handoff is readable. Do not modify files.\" --run-dry-run",
    ],
  };
}

async function loadDotEnv(workspaceRoot) {
  const envPath = join(workspaceRoot, ".env");
  try {
    const content = await readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.trim().match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.warn(`Warning: failed to read .env file: ${error.message}`);
    }
  }
}

async function checkMimoProfiles(options, workspaceRoot) {
  const configPath = join(workspaceRoot, "opencode.json");
  const result = [];

  let config;
  try {
    const raw = await readFile(configPath, "utf8");
    config = JSON.parse(raw);
  } catch (error) {
    return [{
      provider: "mimo",
      id: "mimo_all",
      label: "MiMo/OpenCode profiles",
      registered: false,
      state: "missing_config_file",
      error: error.code === "ENOENT" ? "opencode.json not found" : error.message,
      baseURL: "(none)",
    }];
  }

  const providers = config.provider || {};
  for (const [providerId, provider] of Object.entries(providers)) {
    if (providerId !== "mimo" && providerId !== "mimo-tp") continue;

    const { baseURL, apiKey } = provider.options || {};
    const profile = {
      provider: "mimo",
      id: providerId,
      label: provider.name || providerId,
      registered: false,
      state: "missing_api_key",
      baseURL: baseURL || "(none)",
    };

    if (!baseURL || !apiKey) {
      result.push(profile);
      continue;
    }

    profile.registered = true;
    let resolvedApiKey = apiKey;
    const envMatch = apiKey.match(/^\{env:(.+)\}$/);
    if (envMatch) {
      const envVarName = envMatch[1];
      const envValue = process.env[envVarName];
      if (!envValue) {
        profile.state = "missing_env_var";
        profile.envVarName = envVarName;
        result.push(profile);
        continue;
      }
      resolvedApiKey = envValue;
      profile.envVarName = envVarName;
    }

    profile.state = "registered_probe_required";

    if (options.probeMimo) {
      try {
        const resolvedBaseURL = baseURL.replace(/\/$/, "");
        const res = await fetch(`${resolvedBaseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resolvedApiKey}`,
          },
          body: JSON.stringify({
            model: "mimo-v2.5-pro",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          profile.state = "active";
          profile.probe = "ok";
        } else {
          const text = await res.text();
          profile.probe = `failed: HTTP ${res.status}`;
          if (res.status === 401 || res.status === 403) {
            profile.state = "unauthorized";
          } else {
            profile.state = "probe_failed";
          }
        }
      } catch (error) {
        profile.state = "network_error";
        profile.probe = `failed: ${error.message}`;
      }
    }

    result.push(profile);
  }

  return result;
}

const REMOTE_PROFILES = [
  {
    id: "remote_codex_dgx01",
    label: "Codex (DGX-01)",
    host: "100.81.57.88",
    user: "robin",
    cmd: "~/.codex/packages/standalone/releases/0.132.0-aarch64-unknown-linux-musl/codex",
    args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"],
    provider: "codex",
    testInput: "Reply exactly: OK",
    expectedOutput: "OK",
  },
  {
    id: "remote_codex_dgx02",
    label: "Codex (DGX-02)",
    host: "100.71.215.84",
    user: "robin",
    cmd: "~/.codex/packages/standalone/releases/0.132.0-aarch64-unknown-linux-musl/codex",
    args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"],
    provider: "codex",
    testInput: "Reply exactly: OK",
    expectedOutput: "OK",
  },
  {
    id: "remote_grok_dgx01",
    label: "Grok (DGX-01)",
    host: "100.81.57.88",
    user: "robin",
    cmd: "~/.grok/bin/grok",
    args: ["-p", "Reply exactly: OK", "--output-format", "json"],
    provider: "grok",
  },
  {
    id: "remote_grok_dgx02",
    label: "Grok (DGX-02)",
    host: "100.71.215.84",
    user: "robin",
    cmd: "~/.grok/bin/grok",
    args: ["-p", "Reply exactly: OK", "--output-format", "json"],
    provider: "grok",
  },
];

async function checkRemoteProfiles(options) {
  const result = [];
  for (const profile of REMOTE_PROFILES) {
    result.push(await checkRemoteProfile(profile, options));
  }
  return result;
}

async function checkRemoteProfile(profile, options) {
  const status = {
    provider: profile.provider,
    id: profile.id,
    label: profile.label,
    host: profile.host,
    user: profile.user,
    registered: false,
    state: "probe_required",
    probe: "not_run",
  };

  if (!options.probeRemote) {
    status.state = "registered_probe_required";
    return status;
  }

  const escapedArgs = profile.args.map(arg => {
    if (arg.includes(" ") || arg.includes("'") || arg.includes("\"")) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  }).join(" ");
  const remoteCmd = `${profile.cmd} ${escapedArgs}`;

  return new Promise((resolve) => {
    const sshArgs = [
      "-o", "ConnectTimeout=5",
      "-o", "StrictHostKeyChecking=no",
      `${profile.user}@${profile.host}`,
      remoteCmd
    ];

    const child = spawn("ssh", sshArgs, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      status.state = "network_error";
      status.probe = "failed: timeout";
      resolve(status);
    }, 15000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (err) => {
      clearTimeout(timer);
      status.state = "ssh_client_error";
      status.probe = `failed: ${err.message}`;
      resolve(status);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      status.registered = true;
      if (exitCode === 0) {
        status.state = "active";
        status.probe = "ok";
      } else {
        status.probe = `failed: exit code ${exitCode}`;
        const errLog = `${stderr}\n${stdout}`.trim();
        if (errLog.includes("Permission denied") || errLog.includes("permission denied") || errLog.includes("PermissionDenied")) {
          status.state = "permission_denied";
        } else if (errLog.includes("Invalid API Key") || errLog.includes("401") || errLog.includes("unauthorized")) {
          status.state = "unauthorized";
        } else if (errLog.includes("Connection closed") || errLog.includes("Connection timed out") || errLog.includes("timeout")) {
          status.state = "network_error";
        } else {
          status.state = "probe_failed";
        }
        status.error = errLog.split(/\r?\n/)[0] || `Exit code ${exitCode}`;
      }
      resolve(status);
    });

    if (profile.testInput) {
      child.stdin.end(profile.testInput);
    } else {
      child.stdin.end();
    }
  });
}

function classifyExpiry(expiresAt, marginMinutes) {
  if (!expiresAt) {
    return { state: "unknown_expiry", expiresInMinutes: null };
  }
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return { state: "unknown_expiry", expiresInMinutes: null };
  }
  const expiresInMinutes = Math.round((expiresMs - Date.now()) / 60_000);
  if (expiresInMinutes <= 0) {
    return { state: "expired", expiresInMinutes };
  }
  if (expiresInMinutes <= marginMinutes) {
    return { state: "expires_soon", expiresInMinutes };
  }
  return { state: "active", expiresInMinutes };
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(stripBom(await readFile(path, "utf8")));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readGrokAuthEntry(authFile) {
  const auth = await readJsonIfExists(authFile);
  if (!auth) {
    return undefined;
  }
  if (auth.email || auth.user_id || auth.principal_id) {
    return auth;
  }
  const prop = Object.entries(auth)[0];
  return prop ? prop[1] : undefined;
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error && ["ENOENT", "EISDIR", "EPERM"].includes(error.code)) {
      return error.code === "EISDIR" || error.code === "EPERM";
    }
    return false;
  }
}

function resolveUnderHome(homeRoot, relativePath) {
  return resolve(homeRoot, relativePath);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if ([
      "--json",
      "--refresh",
      "--hydrate-grok-homes",
      "--probe-grok",
      "--probe-mimo",
      "--probe-remote",
      "--grok-cli-refresh-fallback"
    ].includes(arg)) {
      out[toCamelCase(arg.slice(2))] = true;
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

function printReport(report) {
  console.log(`Personal AI session health (${report.generatedAt})`);
  console.log("");
  for (const entry of report.grok) {
    console.log(`${entry.label}: ${entry.state}`);
    console.log(`  email: ${entry.email ?? "(unknown)"}`);
    console.log(`  home: ${entry.home}`);
    console.log(`  expiresInMinutes: ${entry.expiresInMinutes ?? "(unknown)"}`);
    console.log(`  refreshable: ${entry.refreshable ? "yes" : "no"}`);
    console.log(`  refreshed: ${entry.refreshed ? "yes" : "no"}`);
    if (entry.refreshError) {
      console.log(`  refreshError: ${entry.refreshError}`);
    }
    if (entry.cliRefreshFallback) {
      console.log(`  cliRefreshFallback: ${entry.cliRefreshFallback}`);
    }
    if (entry.reauthRequired) {
      console.log("  reauthRequired: yes");
      console.log(`  reauthCommandWindows: ${entry.reauthCommandWindows}`);
    }
    console.log(`  probe: ${entry.probe}`);
  }
  console.log("");
  for (const entry of report.claude) {
    console.log(`${entry.label}: ${entry.state}`);
    console.log(`  configDir: ${entry.configDir}`);
  }
  console.log("");
  for (const entry of report.mimo) {
    console.log(`${entry.label}: ${entry.state}`);
    console.log(`  baseURL: ${entry.baseURL}`);
    if (entry.envVarName) {
      console.log(`  apiKeySource: env.${entry.envVarName}`);
    }
    if (entry.probe) {
      console.log(`  probe: ${entry.probe}`);
    }
  }
  console.log("");
  for (const entry of report.remote) {
    console.log(`${entry.label}: ${entry.state}`);
    console.log(`  host: ${entry.user}@${entry.host}`);
    if (entry.probe) {
      console.log(`  probe: ${entry.probe}`);
    }
    if (entry.error) {
      console.log(`  error: ${entry.error}`);
    }
  }
  console.log("");
  console.log(`${report.antigravity.label}: ${report.antigravity.state}`);
  console.log(`  configPath: ${report.antigravity.configPath}`);
  console.log("");
  console.log("No access tokens or refresh tokens were printed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-personal-ai-sessions.mjs [options]

Options:
  --json                         Print JSON report.
  --refresh                      Refresh Grok access tokens when expired or near expiry.
  --grok-cli-refresh-fallback     If direct refresh fails, run a short 'grok -p' probe for CLI-managed refresh.
  --hydrate-grok-homes           Write ~/.grok2/auth.json and ~/.grok3/auth.json from account slots.
  --probe-grok                   Run 'grok models' for each configured Grok home.
  --probe-mimo                   Run a quick completion ping request for each configured MiMo profile.
  --probe-remote                 Run a quick verification query via SSH for each remote Codex/Grok profile on DGX-01/02.
  --expires-within-minutes <n>    Refresh threshold. Default: ${DEFAULT_EXPIRY_MARGIN_MINUTES}.
  --home-root <path>              Test/helper override for ~.
  --workspace-root <path>         Test/helper override for workspace root.
  --grok-bin <path>               Grok binary. Default: GROK_BIN or grok.
  --grok-cli-refresh-timeout-ms <n>
                                 Timeout for CLI refresh fallback. Default: ${DEFAULT_CLI_REFRESH_TIMEOUT_MS}.

Recommended startup check:
  corepack pnpm personal-ai:sessions -- --refresh --grok-cli-refresh-fallback --hydrate-grok-homes --probe-grok --probe-mimo --probe-remote
`);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}

