import { readFile } from "node:fs/promises";

await loadDotEnvIfPresent();

const baseUrl = (
  process.env.TMUX_DRY_RUN_BASE_URL ??
  process.env.DGX_SERVER_BASE_URL ??
  "http://127.0.0.1:4317"
).replace(/\/$/, "");
const apiToken = (process.env.ORCHESTRATOR_API_TOKEN ?? "dev-orchestrator-token").trim();
const authHeader = { authorization: `Bearer ${apiToken}` };
const now = Date.now();
const sessionId = process.env.SMOKE_SESSION_ID ?? "session_tmux_dry_run_smoke";
const terminalSessionId = process.env.SMOKE_TERMINAL_SESSION_ID ?? "terminal_session_ai_swarm";
const tmuxSessionName = process.env.SMOKE_TMUX_SESSION_NAME ?? "ai-swarm";
const role = process.env.SMOKE_TMUX_ROLE ?? "qa";
const paneId = process.env.SMOKE_TMUX_PANE_ID ?? "%7";
const commandPreview = process.env.SMOKE_TMUX_COMMAND ?? "printf 'tmux dry-run smoke'";
const sourceItemId = `tmux_dispatch_dryrun_smoke_${now}`;
const approvedItemId = `tmux_dispatch_dryrun_approved_${now}`;

const health = await readJson(`${baseUrl}/health`);
assert(health.status === "ok", "health.status must be ok");
assert(
  Array.isArray(health.capabilities) && health.capabilities.includes("tmux-dispatch-gate"),
  "server must advertise tmux-dispatch-gate",
);

const pendingDispatch = await readJson(`${baseUrl}/tmux/dispatch`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(
    createTmuxDispatchRequest({
      approvalState: "required",
      commandPreview,
      createdAt: new Date(now).toISOString(),
      id: sourceItemId,
    }),
  ),
});
assert(pendingDispatch.permission?.decision === "approval_required", "required dispatch must require approval");
assert(pendingDispatch.dispatch?.status === "pending_approval", "required dispatch must stay pending");
assert(pendingDispatch.approval?.sourceItemId === sourceItemId, "approval must link back to dispatch id");

const pendingApprovals = await readJson(`${baseUrl}/approvals/list`);
assert(
  pendingApprovals.queue?.some((item) => item.sourceItemId === sourceItemId),
  "approval queue must include the tmux dispatch source item",
);

const grant = await readJson(`${baseUrl}/approvals/grant`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    actor: "user",
    reason: "tmux dry-run smoke approval",
    sourceItemId,
  }),
});
assert(grant.status === "approved", "approval grant must succeed");
assert(grant.approval?.state === "approved", "approval state must become approved");

const approvedDispatch = await readJson(`${baseUrl}/tmux/dispatch`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(
    createTmuxDispatchRequest({
      approvalState: "approved",
      commandPreview,
      createdAt: new Date(now + 1000).toISOString(),
      id: approvedItemId,
      permissionDecision: "allow",
    }),
  ),
});
assert(approvedDispatch.permission?.decision === "allow", "approved dispatch must pass permission gate");
assert(approvedDispatch.dispatch?.status === "recorded", "dry-run approved dispatch must be recorded");
assert(approvedDispatch.dispatch?.attempted === false, "dry-run must not attempt tmux send-keys");
assert(
  String(approvedDispatch.dispatch?.reason ?? "").includes("ORCHESTRATOR_TMUX_DRY_RUN"),
  "dry-run response must prove ORCHESTRATOR_TMUX_DRY_RUN handled the dispatch",
);

const finalApprovals = await readJson(`${baseUrl}/approvals/list`);
assert(
  !finalApprovals.queue?.some((item) => item.sourceItemId === sourceItemId),
  "approval queue must no longer include the granted source item",
);

console.log(
  JSON.stringify(
    {
      baseUrl,
      health: {
        capabilities: health.capabilities,
        runtimeStatus: health.runtime?.status,
        status: health.status,
      },
      pendingDispatch: {
        approvalId: pendingDispatch.approval?.id,
        dispatchStatus: pendingDispatch.dispatch?.status,
        permission: pendingDispatch.permission?.decision,
        sourceItemId,
      },
      grant: {
        approvalState: grant.approval?.state,
        status: grant.status,
      },
      approvedDispatch: {
        attempted: approvedDispatch.dispatch?.attempted,
        dispatchStatus: approvedDispatch.dispatch?.status,
        permission: approvedDispatch.permission?.decision,
        reason: approvedDispatch.dispatch?.reason,
        sourceItemId: approvedItemId,
      },
      approvals: {
        pendingAfterGrant: finalApprovals.summary?.pending,
      },
    },
    null,
    2,
  ),
);

function createTmuxDispatchRequest(overrides) {
  return {
    dispatchMode: "execute_if_approved",
    host: "dgx_02",
    paneId,
    requestedBy: "user",
    role,
    sessionId,
    terminalSessionId,
    tmuxSessionName,
    ...overrides,
  };
}

async function loadDotEnvIfPresent() {
  const envUrl = new URL("../.env", import.meta.url);
  let text = "";
  try {
    text = await readFile(envUrl, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const [rawKey, ...rawValueParts] = line.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    const rawValue = rawValueParts.join("=").trim();
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function readJson(url, init) {
  const mergedHeaders = { ...authHeader, ...(init?.headers ?? {}) };
  const response = await fetch(url, { ...init, headers: mergedHeaders });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${rawText.slice(0, 600)}`);
  }

  return JSON.parse(rawText);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
