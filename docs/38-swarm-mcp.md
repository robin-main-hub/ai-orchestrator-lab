# Swarm MCP Server

A standardized MCP (Model Context Protocol) front door to the tmux swarm — the
CAO-style supervisor/worker pattern. An external MCP-speaking agent (Claude
Desktop, etc.) can drive the swarm through the **same gates** as the desktop
client: every tool call forwards to the orchestrator server's HTTP API, which
enforces auth + permission + approval + redaction. The MCP layer adds no new
capability and bypasses no gate.

`packages/mcp` is a dependency-free JSON-RPC 2.0 stdio server.

## Tools

| tool | endpoint | gate |
| --- | --- | --- |
| `swarm_dispatch` | POST /tmux/dispatch | queued for approval (not executed) |
| `swarm_capture` | POST /tmux/capture | read-only, redacted |
| `swarm_approvals_list` | GET /approvals/list | — |
| `swarm_approve` / `swarm_reject` | POST /approvals/{grant,reject} | actor recorded as `agent` |
| `swarm_replay` | POST /approvals/replay | the only path that runs send-keys |

A supervisor agent thus: `swarm_dispatch` → `swarm_approvals_list` →
`swarm_approve` → `swarm_replay`, exactly the gated flow the desktop uses.

## Run

```bash
corepack pnpm --filter @ai-orchestrator/mcp build
ORCHESTRATOR_API_TOKEN=... DGX_SERVER_BASE_URL=http://127.0.0.1:4317 \
  node packages/mcp/dist/bin.js
```

## Add to an MCP client (e.g. Claude Desktop)

```json
{
  "mcpServers": {
    "ai-orchestrator-swarm": {
      "command": "node",
      "args": ["/abs/path/ai-orchestrator-lab/packages/mcp/dist/bin.js"],
      "env": {
        "ORCHESTRATOR_API_TOKEN": "<same token as the server>",
        "DGX_SERVER_BASE_URL": "http://127.0.0.1:4317"
      }
    }
  }
}
```

## Verified

Piped real JSON-RPC (`initialize` / `tools/list` / `tools/call swarm_dispatch` /
`swarm_approvals_list`) into the stdio bin against a live orchestrator server:
the dispatch returned `dispatch.status=pending_approval` /
`permission.decision=approval_required` (queued, NOT executed) and the queue
listed the pending item — i.e. the external agent hit the approval gate. Unit
tests cover the JSON-RPC handler and the tool → HTTP mapping (bearer, body,
token redaction).
