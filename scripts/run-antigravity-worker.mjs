#!/usr/bin/env node
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const PROVIDER = "Antigravity/Gemini";
const ENABLE_ENV = "ENABLE_PERSONAL_ANTIGRAVITY_PROFILES";
const OWNER_ENV = "OWNER_USER_ID";
const FALLBACK_ENV = "ENABLE_PERSONAL_ANTIGRAVITY_FALLBACK";
const ULTRA_FIRST_PROFILE = "personal_antigravity_ultra";
const ALLOWED_ROUTES = new Set(["personal_codex", "personal_lab"]);
const BLOCKED_ROUTES = new Set([
  "slack_bot",
  "company_webapp",
  "public_api",
  "multi_user_openclaw",
  "shared_service",
  "scheduled_bulk_job",
  "shared",
]);

const PROFILES = {
  personal_antigravity_ultra: {
    profileId: "personal_antigravity_ultra",
    provider: PROVIDER,
    planTier: "Ultra",
    maxConcurrentTasks: 1,
    capabilities: ["coding", "review", "validation"],
    note: "Coding-capable lane. Prefer this profile when heavy validation is needed.",
  },
  personal_antigravity_pro_1: {
    profileId: "personal_antigravity_pro_1",
    provider: PROVIDER,
    planTier: "Pro",
    maxConcurrentTasks: 1,
    capabilities: ["coding", "review", "validation"],
    note: "Coding-capable lane.",
  },
  personal_antigravity_pro_2: {
    profileId: "personal_antigravity_pro_2",
    provider: PROVIDER,
    planTier: "Pro",
    maxConcurrentTasks: 1,
    capabilities: ["coding", "review", "validation"],
    note: "Coding-capable lane.",
  },
  primary_google_account: {
    profileId: "primary_google_account",
    provider: "Google/Gemini",
    planTier: "excluded",
    maxConcurrentTasks: 0,
    capabilities: [],
    excluded: true,
    note: "Protected primary Google account. Never use for automation.",
  },
};

const LANE_TO_PROFILE = {
  lane_a: "personal_antigravity_ultra",
  lane_b: "personal_antigravity_pro_1",
  lane_c: "personal_antigravity_pro_2",
  coding_lane_a: "personal_antigravity_ultra",
  coding_lane_b: "personal_antigravity_pro_1",
  coding_lane_c: "personal_antigravity_pro_2",
  heavy_validation: "personal_antigravity_ultra",
  architecture_second_opinion: "personal_antigravity_ultra",
};

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

  const startedAt = new Date().toISOString();
  const taskFile = requiredArg(args, "task");
  const routeType = args.routeType ?? process.env.ANTIGRAVITY_ROUTE_TYPE ?? "";
  const userId = args.userId ?? process.env.REQUEST_USER_ID ?? "";
  const ownerUserId = args.ownerUserId ?? process.env[OWNER_ENV] ?? "";
  const dryRun = Boolean(args.dryRun);
  const mode = args.mode ?? "file_handoff";
  const taskId = args.taskId ?? inferTaskId(taskFile);
  const taskDir = args.taskDir ? resolve(args.taskDir) : dirname(resolve(taskFile));
  const resultFile = resolve(args.result ?? join(taskDir, "result.md"));
  const logFile = resolve(args.log ?? join(taskDir, "log.txt"));
  const lockDir = resolve(args.lockDir ?? join(taskDir, "..", "locks"));

  const selected = selectProfile(args);
  const selectedProfile = PROFILES[selected.profileId];
  assertPolicy({
    selectedProfile,
    routeType,
    userId,
    ownerUserId,
    mode,
  });

  await mkdir(taskDir, { recursive: true });
  await mkdir(dirname(resultFile), { recursive: true });
  await mkdir(dirname(logFile), { recursive: true });
  await mkdir(lockDir, { recursive: true });

  const fallbackRequested = args.fallbackProfile;
  let lock = await tryAcquireProfileLock(lockDir, selectedProfile.profileId, taskId);
  let activeProfile = selectedProfile;
  let selectedBy = selected.selectedBy;
  let fallbackFrom;

  if (!lock && fallbackRequested) {
    if (process.env[FALLBACK_ENV] !== "true") {
      throw new Error(`fallback requested but ${FALLBACK_ENV}=true is not set`);
    }
    const fallbackProfile = PROFILES[fallbackRequested];
    if (!fallbackProfile) {
      throw new Error(`unknown fallback profile: ${fallbackRequested}`);
    }
    assertProfileAllowed(fallbackProfile);
    fallbackFrom = activeProfile.profileId;
    const fallbackLock = await tryAcquireProfileLock(lockDir, fallbackProfile.profileId, taskId);
    if (fallbackLock) {
      lock = fallbackLock;
      activeProfile = fallbackProfile;
      selectedBy = "owner_enabled_fallback";
    }
  }

  if (!lock) {
    await appendAuditLog(logFile, {
      profileId: activeProfile.profileId,
      provider: activeProfile.provider,
      planTier: activeProfile.planTier,
      routeType,
      userId,
      taskId,
      startTime: startedAt,
      endTime: new Date().toISOString(),
      concurrencyState: "blocked_existing_active_task",
      selectedBy,
    });
    throw new Error(`profile already has an active task: ${activeProfile.profileId}`);
  }

  let endTime = "";
  try {
    const taskText = await readFile(resolve(taskFile), "utf8");
    if (args.holdLockMs) {
      await delay(Number(args.holdLockMs));
    }
    const resultText = createResultMarkdown({
      dryRun,
      taskFile: resolve(taskFile),
      taskId,
      taskText,
      profile: activeProfile,
      routeType,
      selectedBy,
      fallbackFrom,
    });
    await writeFile(resultFile, resultText, "utf8");
    endTime = new Date().toISOString();
    await appendAuditLog(logFile, {
      profileId: activeProfile.profileId,
      provider: activeProfile.provider,
      planTier: activeProfile.planTier,
      routeType,
      userId,
      taskId,
      startTime: startedAt,
      endTime,
      concurrencyState: "single_active_task_acquired",
      selectedBy,
      fallbackFrom,
      dryRun,
      resultFile,
    });
    console.log(`Antigravity worker handoff ${dryRun ? "dry-run " : ""}completed: ${resultFile}`);
  } finally {
    await releaseProfileLock(lock);
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
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--ultra-first") {
      out.ultraFirst = true;
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

function selectProfile(args) {
  if (args.ultraFirst) {
    return { profileId: ULTRA_FIRST_PROFILE, selectedBy: "ultra_first" };
  }
  if (args.profile) {
    return { profileId: args.profile, selectedBy: "explicit_owner_selection" };
  }
  if (args.lane) {
    const profileId = LANE_TO_PROFILE[args.lane];
    if (!profileId) {
      throw new Error(`unknown lane: ${args.lane}`);
    }
    return { profileId, selectedBy: "lane" };
  }
  if (args.role) {
    const profileId = LANE_TO_PROFILE[args.role];
    if (!profileId) {
      throw new Error(`unknown role: ${args.role}`);
    }
    return { profileId, selectedBy: "lane" };
  }
  throw new Error("select a worker with --profile, --lane, or --role");
}

function assertPolicy({ selectedProfile, routeType, userId, ownerUserId, mode }) {
  if (process.env[ENABLE_ENV] !== "true") {
    throw new Error(`${ENABLE_ENV}=true is required`);
  }
  if (!ownerUserId) {
    throw new Error(`${OWNER_ENV} is required`);
  }
  if (!userId) {
    throw new Error("--user-id or REQUEST_USER_ID is required");
  }
  if (userId !== ownerUserId) {
    throw new Error("Antigravity personal profiles only accept the configured owner");
  }
  if (!routeType) {
    throw new Error("--route-type is required");
  }
  if (BLOCKED_ROUTES.has(routeType)) {
    throw new Error(`blocked shared route type: ${routeType}`);
  }
  if (!ALLOWED_ROUTES.has(routeType)) {
    throw new Error(`route type must be personal_codex or personal_lab, got: ${routeType}`);
  }
  if (mode !== "file_handoff") {
    throw new Error("GUI or browser automation mode is rejected; use file_handoff");
  }
  assertProfileAllowed(selectedProfile);
}

function assertProfileAllowed(profile) {
  if (!profile) {
    throw new Error("unknown Antigravity profile");
  }
  if (profile.excluded || profile.profileId === "primary_google_account") {
    throw new Error("primary_google_account is excluded from automation");
  }
}

async function tryAcquireProfileLock(lockDir, profileId, taskId) {
  const lockPath = join(lockDir, `${profileId}.lock`);
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({ profileId, taskId, pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
    await handle.close();
    return { lockPath };
  } catch (error) {
    if (error && error.code === "EEXIST") {
      return undefined;
    }
    throw error;
  }
}

async function releaseProfileLock(lock) {
  if (!lock) return;
  await rm(lock.lockPath, { force: true });
}

function createResultMarkdown({ dryRun, taskFile, taskId, taskText, profile, routeType, selectedBy, fallbackFrom }) {
  return [
    "# Antigravity Worker Handoff Result",
    "",
    `- status: ${dryRun ? "dry_run" : "handoff_prepared"}`,
    `- taskId: ${taskId}`,
    `- taskFile: ${taskFile}`,
    `- profileId: ${profile.profileId}`,
    `- provider: ${profile.provider}`,
    `- planTier: ${profile.planTier}`,
    `- routeType: ${routeType}`,
    `- selectedBy: ${selectedBy}`,
    fallbackFrom ? `- fallbackFrom: ${fallbackFrom}` : undefined,
    `- maxConcurrentTasks: ${profile.maxConcurrentTasks}`,
    "",
    "## Policy",
    "",
    "This is a single-owner personal coding/research handoff. All allowed profiles are individually paid accounts controlled by the owner. This is not a shared service, family-account workaround, public provider, free-tier rotation, or multi-user account pool.",
    "",
    "## Task Preview",
    "",
    "```md",
    taskText.slice(0, 4000),
    "```",
    "",
    "## Next Step",
    "",
    dryRun
      ? "Dry run only. No Antigravity CLI, GUI, browser session, OAuth cookie, or unofficial API wrapper was invoked."
      : "File handoff prepared. Use an official documented Antigravity interface manually or through a future approved adapter.",
    "",
  ].filter(Boolean).join("\n");
}

async function appendAuditLog(logFile, record) {
  await mkdir(dirname(logFile), { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await writeFile(logFile, line, { flag: "a", encoding: "utf8" });
}

function requiredArg(args, name) {
  if (!args[name]) {
    throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  return args[name];
}

function inferTaskId(taskFile) {
  const normalized = resolve(taskFile).replace(/\\/g, "/");
  const parts = normalized.split("/");
  const requestIndex = parts.lastIndexOf("request.md");
  if (requestIndex > 0) {
    return parts[requestIndex - 1] || "antigravity_task";
  }
  return `antigravity_${Date.now()}`;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-antigravity-worker.mjs --task .codex-tasks/antigravity/<task>/request.md --user-id OWNER --route-type personal_codex --ultra-first --dry-run

Selectors:
  --ultra-first
  --profile personal_antigravity_ultra|personal_antigravity_pro_1|personal_antigravity_pro_2
  --lane lane_a|lane_b|lane_c
  --role heavy_validation

Required env:
  ENABLE_PERSONAL_ANTIGRAVITY_PROFILES=true
  OWNER_USER_ID=<single owner id>

Safety:
  primary_google_account is always blocked.
  GUI/browser automation mode is rejected.
  Each profile has a single active task lock.`);
}
