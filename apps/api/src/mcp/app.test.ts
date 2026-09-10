import { listApiFlowsContract } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { generateApiKey, hashApiKey, keyDisplayPrefix } from "../api-publishing/keys";
import { flowDocument, memoryApiKeyStore, node } from "../api-publishing/test-support";
import { memoryStores } from "../runs/test-stores";
import { createApp } from "../app";
import { mcpPath } from "./routes";

/* Structural, not `ReturnType<typeof createApp>`: naming the assembled Elysia type is more
 * comparison than the checker will do once every route is mounted. */
type Handler = { handle(request: Request): Promise<Response> };

const alice = "did:privy:alice";
const database = { check: async () => "up" as const };

const quote = flowDocument("flow-quote", "Price quote", [
  node("call", "trigger.api", { description: "Quote a swap", inputs: [] }),
  node("out", "logic.return", { outputs: [{ name: "price", value: "10" }] }),
]);

async function fixture() {
  const stores = memoryStores([{ ownerId: alice, flow: quote, enabled: true }]);
  const { store: apiKeys } = memoryApiKeyStore();
  const key = generateApiKey();
  await apiKeys.create(alice, "laptop", hashApiKey(key), keyDisplayPrefix(key));
  const app: Handler = createApp({ database, apiKeys, flows: stores.flows, runs: stores.runs });
  const bare: Handler = createApp({ database, flows: stores.flows, runs: stores.runs });
  return { key, app, bare };
}

const toolsList = (app: Handler, headers: Record<string, string> = {}) =>
  app.handle(
    new Request(`http://localhost${mcpPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );

describe("the app's MCP endpoint", () => {
  test("offers the owner's published flow to a caller holding their key", async () => {
    const { app, key } = await fixture();
    const response = await toolsList(app, { Authorization: `Bearer ${key}` });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      "list_flows",
      "price_quote_flowqu",
    ]);
  });

  test("refuses a request with no key", async () => {
    const { app } = await fixture();
    expect((await toolsList(app)).status).toBe(401);
  });

  test("refuses a key that was never issued", async () => {
    const { app } = await fixture();
    const response = await toolsList(app, { Authorization: `Bearer ${generateApiKey()}` });
    expect(response.status).toBe(401);
  });

  test("is absent while the API has no key store", async () => {
    const { bare, key } = await fixture();
    const response = await toolsList(bare, { Authorization: `Bearer ${key}` });
    expect(response.status).toBe(404);
  });

  /* Both surfaces authenticate a key, and Elysia deduplicates plugins by name. If they ever
   * shared a guard instance, one of them would silently stop checking. */
  test("authenticates the same key as the machine routes, each on its own guard", async () => {
    const { app, key } = await fixture();
    const authorization = `Bearer ${key}`;
    const listed = await app.handle(
      new Request(`http://localhost${listApiFlowsContract.path}`, { headers: { authorization } }),
    );
    expect(listed.status).toBe(200);
    expect((await toolsList(app, { Authorization: authorization })).status).toBe(200);

    const unauthorized = await app.handle(
      new Request(`http://localhost${listApiFlowsContract.path}`),
    );
    expect(unauthorized.status).toBe(401);
    expect((await toolsList(app)).status).toBe(401);
  });
});
