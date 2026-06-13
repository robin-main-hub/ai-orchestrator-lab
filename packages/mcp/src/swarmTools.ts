/**
 * MCP tool registry for the tmux swarm — a standardized front door (CAO-style
 * supervisor/worker) so an external MCP-speaking agent can drive the swarm.
 *
 * Every tool forwards to the orchestrator server's existing HTTP endpoints,
 * which enforce auth + permission + approval + redaction. The MCP layer adds NO
 * new capability and bypasses NO gate — it only standardizes access. Pure
 * request-mapping + an injected fetch, so it is fully unit-tested.
 */

export type SwarmToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  method: "GET" | "POST";
  /** static path, or a builder for GET resources whose path/query come from args */
  path: string | ((args: Record<string, unknown>) => string);
  /** request body from the tool arguments (POST only) */
  body?: (args: Record<string, unknown>) => unknown;
};

const passthrough = (args: Record<string, unknown>) => args;

// ── GitHub read-only path helpers — validate + encode args to forward to the
//    existing /integrations/github routes. No new GitHub client; the MCP layer
//    only standardizes access and the token stays in the server env. ──────────
function ghSegment(value: unknown, label: string): string {
  const raw = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(raw)) {
    throw new Error(`invalid github ${label} (allowed: A-Za-z0-9._-)`);
  }
  return encodeURIComponent(raw);
}
function ghState(value: unknown): string {
  const raw = String(value ?? "open");
  return raw === "closed" || raw === "all" ? `?state=${raw}` : "";
}
function ghNumber(value: unknown): string {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) throw new Error("invalid github PR number");
  return String(num);
}
function ghRepoBase(args: Record<string, unknown>): string {
  return `/integrations/github/repos/${ghSegment(args.owner, "owner")}/${ghSegment(args.repo, "repo")}`;
}

export const SWARM_TOOLS: ReadonlyArray<SwarmToolDef> = [
  {
    name: "swarm_dispatch",
    description:
      "Queue a tmux command for a swarm pane. Goes through the approval gate — a required dispatch is queued, not executed. Returns the intent + approval.",
    method: "POST",
    path: "/tmux/dispatch",
    body: passthrough,
    inputSchema: {
      type: "object",
      required: ["sessionId", "role", "commandPreview"],
      additionalProperties: true,
      properties: {
        sessionId: { type: "string" },
        role: { type: "string", description: "tmux pane role, e.g. qa, code, architect" },
        paneId: { type: "string" },
        commandPreview: { type: "string", description: "the command text to run in the pane" },
        approvalState: { type: "string", enum: ["required", "approved"], default: "required" },
        dispatchMode: { type: "string", enum: ["record_only", "execute_if_approved"], default: "execute_if_approved" },
        tmuxSessionName: { type: "string", default: "ai-swarm" },
      },
    },
  },
  {
    name: "swarm_capture",
    description: "Capture (read-only) a swarm pane's recent output. Redacted by the server before return.",
    method: "POST",
    path: "/tmux/capture",
    body: passthrough,
    inputSchema: {
      type: "object",
      required: ["sessionId", "role"],
      additionalProperties: true,
      properties: {
        sessionId: { type: "string" },
        role: { type: "string" },
        paneId: { type: "string" },
        lines: { type: "number", default: 40 },
        tmuxSessionName: { type: "string", default: "ai-swarm" },
      },
    },
  },
  {
    name: "swarm_approvals_list",
    description: "List the pending approval queue (what is waiting for a human/supervisor decision).",
    method: "GET",
    path: "/approvals/list",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "swarm_approve",
    description: "Grant a queued approval by its sourceItemId (or approvalId). Required before a dispatch can execute.",
    method: "POST",
    path: "/approvals/grant",
    body: (args) => ({ actor: "agent", ...args }),
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        sourceItemId: { type: "string" },
        approvalId: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "swarm_reject",
    description: "Reject a queued approval by its sourceItemId (or approvalId).",
    method: "POST",
    path: "/approvals/reject",
    body: (args) => ({ actor: "agent", ...args }),
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        sourceItemId: { type: "string" },
        approvalId: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "swarm_replay",
    description: "Execute an approved dispatch by replaying its stored payload (the only path that actually runs send-keys).",
    method: "POST",
    path: "/approvals/replay",
    body: (args) => ({ actor: "agent", ...args }),
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        sourceItemId: { type: "string" },
        approvalId: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  // ── GitHub read-only tools (D3) — forward to the existing /integrations/github
  //    routes. Read-only by construction: GET only, no write surface. The result
  //    is whatever the route returns (honest `outcome` + bounded/redacted data);
  //    the agent reads it, but the MCP layer does NOT auto-attach it to any
  //    mission/coding context (that stays an explicit user action). ────────────
  {
    name: "github_status",
    description:
      "GitHub read-only connector status (configured/tokenPresent). Never returns the token. No GitHub call when unconfigured.",
    method: "GET",
    path: "/integrations/github/status",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "github_pr_list",
    description:
      "List a repo's pull requests (read-only). Returns bounded summaries with an honest outcome (observed/not_configured/permission_denied/connection_failed).",
    method: "GET",
    path: (args) => `${ghRepoBase(args)}/pulls${ghState(args.state)}`,
    inputSchema: {
      type: "object",
      required: ["owner", "repo"],
      additionalProperties: false,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
      },
    },
  },
  {
    name: "github_pr_read",
    description: "Read one pull request's detail (read-only, observed). Body is a bounded excerpt, not the raw unbounded payload.",
    method: "GET",
    path: (args) => `${ghRepoBase(args)}/pulls/${ghNumber(args.number)}`,
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "number"],
      additionalProperties: false,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        number: { type: "number" },
      },
    },
  },
  {
    name: "github_file_read",
    description: "Read a file's text content (read-only, observed). Returns bounded UTF-8 text with a `truncated` flag — never the whole raw file unbounded.",
    method: "GET",
    path: (args) =>
      `${ghRepoBase(args)}/file?path=${encodeURIComponent(String(args.path ?? ""))}` +
      (args.ref ? `&ref=${encodeURIComponent(String(args.ref))}` : ""),
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path"],
      additionalProperties: false,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", description: "file path within the repo, e.g. src/index.ts" },
        ref: { type: "string", description: "branch/tag/sha (optional)" },
      },
    },
  },
];

export type SwarmToolDeps = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type SwarmToolResult = { ok: boolean; status: number; data: unknown };

function redactToken(text: string, token: string): string {
  let out = text;
  if (token) out = out.split(token).join("<redacted-token>");
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>");
}

export async function callSwarmTool(
  name: string,
  args: Record<string, unknown>,
  deps: SwarmToolDeps,
): Promise<SwarmToolResult> {
  const tool = SWARM_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`unknown swarm tool: ${name}`);
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
  try {
    // build the path inside try so an invalid GET arg (bad owner/repo) becomes a
    // clean, redacted error result instead of throwing out of the tool call.
    const path = typeof tool.path === "function" ? tool.path(args) : tool.path;
    const url = `${deps.baseUrl.replace(/\/$/, "")}${path}`;
    const response = await fetchImpl(url, {
      method: tool.method,
      headers: {
        authorization: `Bearer ${deps.token}`,
        ...(tool.method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: tool.method === "POST" && tool.body ? JSON.stringify(tool.body(args)) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = redactToken(text.slice(0, 600), deps.token);
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    const message = redactToken(error instanceof Error ? error.message : String(error), deps.token);
    return { ok: false, status: 0, data: { error: message } };
  } finally {
    clearTimeout(timer);
  }
}
