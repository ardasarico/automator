import { describe, expect, test } from "bun:test";
import { createApp } from "../app";
import type { CallableFlowSource } from "./callable-flows";
import { mcpPath } from "./routes";

const database = { check: async () => "up" as const };
const source: CallableFlowSource = {
  list: async () => [],
  invoke: async () => ({ ok: false, reason: "not_found", message: "none" }),
};
const keys = { verify: async () => ({ id: "did:privy:owner" }) };

const post = (app: ReturnType<typeof createApp>, headers: Record<string, string> = {}) =>
  app.handle(
    new Request(`http://localhost${mcpPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );

describe("the app's MCP endpoint", () => {
  test("answers once a key verifier and a flow source are configured", async () => {
    const response = await post(createApp({ database, callableFlows: source, apiKeys: keys }), {
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer ak_live_good",
    });
    expect(response.status).toBe(200);
  });

  test("refuses a request with no key", async () => {
    const response = await post(createApp({ database, callableFlows: source, apiKeys: keys }));
    expect(response.status).toBe(401);
  });

  test("is absent while the API cannot verify a key", async () => {
    const response = await post(createApp({ database, callableFlows: source }));
    expect(response.status).toBe(404);
  });
});
