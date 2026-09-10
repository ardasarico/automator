import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Elysia } from "elysia";
import { createRateLimiter } from "../rate-limit";
import type { CallableFlowSource } from "./callable-flows";
import { createFlowMcpServer } from "./server";

export const mcpPath = "/mcp";

/** How the route turns an `Authorization: Bearer ak_...` header into the owner it belongs to. */
export interface ApiKeyVerifier {
  verify(key: string): Promise<{ id: string } | null>;
}

export interface McpDependencies {
  source: CallableFlowSource;
  keys: ApiKeyVerifier;
  callsPerMinute?: number;
  now?: () => number;
}

/* Stateless: one server and transport per request, so nothing about a caller survives it and
 * any instance can answer any request. There is no session id to keep, and nothing to resume. */
async function answer(request: Request, source: CallableFlowSource, ownerId: string) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    /* Every tool call returns at once, so a stream would only be an open socket doing nothing. */
    enableJsonResponse: true,
  });
  const server = createFlowMcpServer({ source, ownerId });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody: await request.json() });
  } finally {
    await server.close();
  }
}

function jsonRpcError(
  status: number,
  code: number,
  message: string,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function createMcpRoutes({
  source,
  keys,
  callsPerMinute = 60,
  now = Date.now,
}: McpDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return (
    new Elysia({ name: "mcp" })
      /* Only API keys reach this endpoint. A Privy token is a browser session and would let a
       * page a user visits drive their flows; a key is issued for a machine on purpose. */
      .resolve({ as: "scoped" }, async ({ headers }) => {
        const key = headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
        const owner = key ? await keys.verify(key) : null;
        return { owner };
      })
      .post(mcpPath, async ({ request, owner }) => {
        if (!owner) return unauthorized();
        if (!limiter.allow(owner.id))
          return jsonRpcError(429, -32_000, "Too many requests", {
            "Retry-After": String(limiter.retryAfter(owner.id)),
          });
        return answer(request, source, owner.id);
      })
      /* A stateless server has no stream to hand back and no session to delete. 405 tells a
       * client that at once, instead of leaving an SSE socket open that never sends anything. */
      .get(mcpPath, ({ owner }) =>
        owner
          ? jsonRpcError(405, -32_000, "This MCP server is stateless; use POST.", { Allow: "POST" })
          : unauthorized(),
      )
      .delete(mcpPath, ({ owner }) =>
        owner
          ? jsonRpcError(405, -32_000, "This MCP server is stateless; use POST.", { Allow: "POST" })
          : unauthorized(),
      )
  );
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
