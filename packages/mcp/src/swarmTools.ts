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
  // ── GitHub W1 comment write (PR/Issue comment create — 유일한 write 표면) ────
  // 두 도구 모두 서버 라우트로 forward만 한다(MCP 측에는 GitHub client 없음).
  // 모든 검증(allowlist·secret·bodySha·target preflight·tryClaim·approval-or-armed)은
  // 서버가 수행 — MCP가 게이트를 우회할 길이 없다.
  {
    name: "github_comment_plan",
    description:
      "Create a comment write PLAN (no GitHub POST). Server validates allowlist/secret/body. Result is approval_required or blocked — actual posting goes through github_comment_execute and the server gate.",
    method: "POST",
    path: "/integrations/github/write/comment/plan",
    body: passthrough,
    inputSchema: {
      type: "object",
      required: ["repoFullName", "number", "targetKind", "body"],
      additionalProperties: true,
      properties: {
        repoFullName: { type: "string", description: 'GitHub repository, e.g. "owner/repo"' },
        number: { type: "number", description: "PR or issue number" },
        targetKind: { type: "string", enum: ["pull_request", "issue"] },
        body: { type: "string", description: "comment body (will be hashed for replay integrity)" },
      },
    },
  },
  {
    name: "github_comment_execute",
    description:
      "Execute a previously created plan. The server gate requires (approvalId AND approved) OR (autoExecuteArmed === true AND armedAt). bodySha256 must match the server-stored plan exactly. Only the server posts to GitHub.",
    method: "POST",
    path: "/integrations/github/write/comment/execute",
    body: passthrough,
    inputSchema: {
      type: "object",
      required: ["planId", "bodySha256"],
      additionalProperties: true,
      properties: {
        planId: { type: "string" },
        bodySha256: { type: "string" },
        approvalId: { type: "string" },
        autoExecuteArmed: { type: "boolean" },
        armedAt: { type: "string" },
      },
    },
  },
  // ── GitHub W2 branch create (plan ONLY at this phase) ──────────────────────
  // execute는 W2b에서 별도 도구로 분리. plan만 노출해도 정직성이 깨지지 않는다 —
  // execute는 어차피 approval 게이트(armed 없음)를 통과해야 하고, 서버가 단독으로
  // GitHub POST를 호출한다.
  {
    name: "github_branch_plan",
    description:
      "Create a branch create PLAN (no GitHub POST). Server validates allowlist + branch name policy (agent/*, work/*, user/*, mission/* prefix only; main/master/develop/release/hotfix blocked) + sourceRef existence + target ref absence. Result is approval_required or blocked or already_exists. Actual creation goes through approval and a separate execute step.",
    method: "POST",
    path: "/integrations/github/write/branch/plan",
    body: passthrough,
    inputSchema: {
      type: "object",
      required: ["repoFullName", "sourceRef", "newBranchName"],
      additionalProperties: true,
      properties: {
        repoFullName: { type: "string", description: 'GitHub repository, e.g. "owner/repo"' },
        sourceRef: { type: "string", description: 'source branch — "main", "develop", etc. refs/heads/* form is normalized.' },
        newBranchName: { type: "string", description: 'new branch name without refs/heads/ — must start with agent/, work/, user/, or mission/' },
      },
    },
  },
  // ── GitHub W3a file change plan (plan ONLY at this phase) ──────────────────
  // execute(W3b)는 별도. 이 도구는 절대 GitHub mutation을 일으키지 않는다 —
  // 서버가 read만으로 plan을 만들고, baseFileSha/baseContentSha256/newContentSha256과
  // bounded unified diff를 응답에 돌려준다.
  {
    name: "github_file_change_plan",
    description:
      "Create a file change PLAN (no GitHub PUT/POST/DELETE). Server validates allowlist + target branch policy (agent/*, work/*, user/*, mission/* prefix only) + path policy (.env / .github/workflows / *.pem / *.key / lock files / build outputs blocked) + size + binary + secret scan + no-op check. Server reads the current file from GitHub and returns a bounded unified diff preview. Result is approval_required or blocked. Actual file update is a separate, future-phase step.",
    method: "POST",
    path: "/integrations/github/write/file/plan",
    body: passthrough,
    inputSchema: {
      type: "object",
      required: ["repoFullName", "branchName", "path", "newContent"],
      additionalProperties: true,
      properties: {
        repoFullName: { type: "string", description: 'GitHub repository, e.g. "owner/repo"' },
        branchName: { type: "string", description: 'target branch (no refs/heads/) — must start with agent/, work/, user/, or mission/' },
        path: { type: "string", description: 'repo-root-relative path. no leading /, no ../, no \\\\' },
        newContent: { type: "string", description: 'UTF-8 text. binary/NUL blocked. server caps size.' },
        baseFileSha: { type: "string", description: 'optional: the file blob sha you saw — server rejects on mismatch (optimistic concurrency)' },
      },
    },
  },
  // ── GitHub W4a PR create plan (plan ONLY at this phase) ────────────────────
  // GitHub POST /pulls는 절대 호출하지 않는다. 서버가 base/head/compare를 read해서
  // 변경 요약을 evidence로 만든다. execute(W4b)는 별도 phase에서 분리.
  {
    name: "github_pr_plan",
    description:
      "Create a pull-request PLAN (no GitHub POST /pulls). Server validates allowlist + base branch allowlist (default main/develop, configurable via GITHUB_PR_BASE_ALLOWLIST) + head branch policy (agent/*, work/*, user/*, mission/* prefix only) + base != head + title/body length and secret scan, then reads compare base...head and returns a bounded files preview. Result is approval_required or blocked or already_exists. Actual PR creation is a separate, future-phase step.",
    method: "POST",
    path: "/integrations/github/write/pr/plan",
    body: passthrough,
    inputSchema: {
      type: "object",
      required: ["repoFullName", "baseBranch", "headBranch", "title", "body"],
      additionalProperties: true,
      properties: {
        repoFullName: { type: "string", description: 'GitHub repository, e.g. "owner/repo"' },
        baseBranch: { type: "string", description: 'PR base — must be allowed by GITHUB_PR_BASE_ALLOWLIST (default main/develop)' },
        headBranch: { type: "string", description: 'PR head — must start with agent/, work/, user/, or mission/' },
        title: { type: "string", description: 'PR title (max 160 chars, secret-scanned)' },
        body: { type: "string", description: 'PR body (max 16000 chars, secret-scanned). Empty string allowed.' },
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
