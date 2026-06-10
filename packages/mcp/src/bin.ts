#!/usr/bin/env node
/**
 * stdio transport for the swarm MCP server: newline-delimited JSON-RPC on
 * stdin/stdout (the MCP stdio convention). Add to an MCP client (e.g. Claude
 * Desktop) so an external agent can drive the gated tmux swarm.
 *
 *   ORCHESTRATOR_API_TOKEN=... DGX_SERVER_BASE_URL=http://127.0.0.1:4317 \
 *     node packages/mcp/dist/bin.js
 *
 * All operations flow through the orchestrator HTTP API and its approval gate.
 */
import { createInterface } from "node:readline";
import { handleMcpRequest, type JsonRpcRequest } from "./mcpServer.js";

const deps = {
  baseUrl: process.env.DGX_SERVER_BASE_URL ?? process.env.ORCHESTRATOR_BASE_URL ?? "http://127.0.0.1:4317",
  token: (process.env.ORCHESTRATOR_API_TOKEN ?? "dev-orchestrator-token").trim(),
  timeoutMs: Number(process.env.SWARM_MCP_TIMEOUT_MS ?? 8_000),
};

const rl = createInterface({ input: process.stdin });
const write = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);

// The MCP client owns the lifecycle: when it closes stdin, readline ends and
// the process exits naturally once in-flight work drains — no process.exit()
// (which aborts on Windows while undici keep-alive sockets are open).
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }
  handleMcpRequest(request, deps)
    .then((response) => {
      if (response) write(response);
    })
    .catch((error) => {
      write({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      });
    });
});
