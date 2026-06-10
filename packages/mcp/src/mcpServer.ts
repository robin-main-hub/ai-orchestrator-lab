/**
 * Minimal MCP (Model Context Protocol) JSON-RPC 2.0 handler for the swarm — no
 * SDK dependency. Implements `initialize`, `tools/list`, `tools/call`, and
 * notifications. Pure: takes a parsed request + deps, returns a response object
 * (or null for notifications), so it is fully unit-tested; the stdio transport
 * is a thin loop in bin.ts.
 */

import { SWARM_TOOLS, callSwarmTool, type SwarmToolDeps } from "./swarmTools.js";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "ai-orchestrator-swarm", version: "0.1.0" };

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/**
 * Handle one JSON-RPC message. Returns the response, or null for notifications
 * (methods starting with `notifications/`, or any request without an `id`).
 */
export async function handleMcpRequest(
  request: JsonRpcRequest,
  deps: SwarmToolDeps,
): Promise<JsonRpcResponse | null> {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return err(request?.id ?? null, -32600, "invalid request");
  }

  const isNotification = request.id === undefined || request.method.startsWith("notifications/");

  switch (request.method) {
    case "initialize":
      return ok(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "ping":
      return ok(request.id, {});

    case "tools/list":
      return ok(request.id, {
        tools: SWARM_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });

    case "tools/call": {
      const name = typeof request.params?.name === "string" ? request.params.name : "";
      const args = (request.params?.arguments as Record<string, unknown>) ?? {};
      if (!SWARM_TOOLS.some((tool) => tool.name === name)) {
        return ok(request.id, {
          isError: true,
          content: [{ type: "text", text: `unknown tool: ${name}` }],
        });
      }
      const result = await callSwarmTool(name, args, deps);
      return ok(request.id, {
        isError: !result.ok,
        content: [{ type: "text", text: JSON.stringify({ status: result.status, ...toObject(result.data) }) }],
      });
    }

    default:
      if (isNotification) return null;
      return err(request.id, -32601, `method not found: ${request.method}`);
  }
}

function toObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { data };
}
