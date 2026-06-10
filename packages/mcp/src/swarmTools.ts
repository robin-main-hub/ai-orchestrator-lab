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
  path: string;
  /** request body from the tool arguments (POST only) */
  body?: (args: Record<string, unknown>) => unknown;
};

const passthrough = (args: Record<string, unknown>) => args;

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
  const url = `${deps.baseUrl.replace(/\/$/, "")}${tool.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
  try {
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
