import type { ServerResponse } from "node:http";

import { createCorsHeaders } from "./cors";

export function writeJson(response: ServerResponse, statusCode: number, payload: unknown, originHeader?: string) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...createCorsHeaders(originHeader),
  });
  response.end(JSON.stringify(payload));
}
