import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type { InvokeOutcome } from "../api-publishing/invoke";
import type { CallableFlow, CallableFlowSource } from "./callable-flows";
import { createMcpRoutes } from "./routes";

const swap: CallableFlow = {
  id: "2fa12cc4-9d3e-4a1b-8c7d-000000000000",
  name: "Swap USDC",
  description: "Swaps USDC for ETH on Base",
  inputs: [
    { name: "amount", type: "number", required: true, description: "How much USDC to swap" },
    { name: "to", type: "address", required: false, description: "" },
  ],
  outputs: ["hash"],
};
const digest: CallableFlow = {
  id: "9b0000ff-1111-2222-3333-444444444444",
  name: "Daily digest",
  description: "",
  inputs: [],
  outputs: [],
};

interface Stub extends CallableFlowSource {
  calls: { ownerId: string; flowId: string; input: unknown }[];
}

function stubSource(
  flows: CallableFlow[],
  result: InvokeOutcome = {
    kind: "ok",
    result: { runId: "run_1", status: "succeeded", output: { hash: "0xabc" } },
  },
): Stub {
  const calls: Stub["calls"] = [];
  return {
    calls,
    list: async () => flows,
    invoke: async (ownerId, flowId, input) => {
      calls.push({ ownerId, flowId, input });
      return result;
    },
  };
}

const keys = {
  verify: async (key: string) => (key === "ak_live_good" ? { id: "did:privy:owner" } : null),
};

const servers: { stop: () => void }[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const server of servers.splice(0)) server.stop();
});

function serve(source: CallableFlowSource, options: { callsPerMinute?: number } = {}) {
  const app = new Elysia().use(createMcpRoutes({ source, keys, ...options }));
  const server = Bun.serve({ port: 0, fetch: (request) => app.handle(request) });
  servers.push(server);
  return `http://localhost:${server.port}/mcp`;
}

async function connect(url: string, key = "ak_live_good") {
  const client = new Client({ name: "test", version: "0.0.0" });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }),
  );
  return client;
}

describe("MCP tools/list", () => {
  test("offers one tool per callable flow of the key's owner", async () => {
    const client = await connect(serve(stubSource([swap, digest])));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_flows",
      "swap_usdc_2fa12c",
      "daily_digest_9b0000",
    ]);
  });

  test("gives a flow tool the schema its inputs declare", async () => {
    const client = await connect(serve(stubSource([swap])));
    const tool = (await client.listTools()).tools.find((t) => t.name === "swap_usdc_2fa12c");
    expect(tool?.description).toBe("Swaps USDC for ETH on Base");
    expect(tool?.inputSchema).toEqual({
      type: "object",
      properties: {
        amount: { type: "number", description: "How much USDC to swap" },
        to: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
      },
      required: ["amount"],
      additionalProperties: false,
    });
  });
});

describe("MCP tools/call", () => {
  test("invokes the flow the tool names and returns its output", async () => {
    const source = stubSource([swap]);
    const client = await connect(serve(source));
    const result = await client.callTool({
      name: "swap_usdc_2fa12c",
      arguments: { amount: 25 },
    });
    expect(source.calls).toEqual([
      { ownerId: "did:privy:owner", flowId: swap.id, input: { amount: 25 } },
    ]);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ hash: "0xabc" });
    expect(result.content).toEqual([{ type: "text", text: '{"hash":"0xabc"}' }]);
  });

  test("list_flows answers with the same flows and their schemas", async () => {
    const client = await connect(serve(stubSource([swap])));
    const result = await client.callTool({ name: "list_flows", arguments: {} });
    expect(result.structuredContent).toEqual({
      flows: [
        {
          tool: "swap_usdc_2fa12c",
          id: swap.id,
          name: "Swap USDC",
          description: "Swaps USDC for ETH on Base",
          inputSchema: {
            type: "object",
            properties: {
              amount: { type: "number", description: "How much USDC to swap" },
              to: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
            },
            required: ["amount"],
            additionalProperties: false,
          },
        },
      ],
    });
  });

  test("reports input the flow refused, listing every field at once", async () => {
    const source = stubSource([swap], {
      kind: "invalid_input",
      problems: [
        { input: "amount", message: "amount is required." },
        { input: "to", message: "to must be an address." },
      ],
    });
    const client = await connect(serve(source));
    const result = await client.callTool({ name: "swap_usdc_2fa12c", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "amount is required. to must be an address." },
    ]);
  });

  test("says a flow unpublished since the tool list was read is gone", async () => {
    const source = stubSource([swap], { kind: "not_found" });
    const client = await connect(serve(source));
    const result = await client.callTool({ name: "swap_usdc_2fa12c", arguments: { amount: 1 } });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: '"Swap USDC" is no longer published as an API, so it cannot be called.',
      },
    ]);
  });

  test("says a flow waiting on a screen cannot be finished over MCP", async () => {
    const source = stubSource([swap], { kind: "waiting_on_screen", runId: "run_2" });
    const client = await connect(serve(source));
    const result = await client.callTool({ name: "swap_usdc_2fa12c", arguments: { amount: 1 } });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: '"Swap USDC" stops to ask its caller a question, which a tool call cannot answer. Run it in Automator instead.',
      },
    ]);
  });

  test("refuses a tool name no flow of this owner carries", async () => {
    const client = await connect(serve(stubSource([swap])));
    const result = await client.callTool({ name: "swap_usdc_ffffff", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: 'No flow of yours is published as the tool "swap_usdc_ffffff".' },
    ]);
  });

  test("never returns a stack trace when the source throws", async () => {
    const client = await connect(
      serve({
        list: async () => [swap],
        invoke: async () => {
          throw new Error("connect ECONNREFUSED 10.0.0.1:5432");
        },
      }),
    );
    const result = await client.callTool({ name: "swap_usdc_2fa12c", arguments: { amount: 1 } });
    expect(result.isError).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("10.0.0.1");
  });

  test("leaves an output that is not an object out of structuredContent", async () => {
    const source = stubSource([swap], {
      kind: "ok",
      result: { runId: "run_1", status: "succeeded", output: ["0xabc"] as never },
    });
    const client = await connect(serve(source));
    const result = await client.callTool({ name: "swap_usdc_2fa12c", arguments: { amount: 1 } });
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: '["0xabc"]' }]);
  });
});

describe("MCP authentication", () => {
  test("refuses a request carrying no key", async () => {
    const response = await fetch(serve(stubSource([swap])), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("refuses a key that is not one of ours", async () => {
    const response = await fetch(serve(stubSource([swap])), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer ak_live_wrong",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(401);
  });

  test("does not accept a Privy bearer token", async () => {
    const response = await fetch(serve(stubSource([swap])), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer eyJhbGciOiJFUzI1NiJ9.privy.token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(401);
  });
});

describe("MCP rate limiting", () => {
  test("refuses an owner who calls faster than the bucket allows", async () => {
    const url = serve(stubSource([swap]), { callsPerMinute: 1 });
    const post = () =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer ak_live_good",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
    expect((await post()).status).toBe(200);
    const limited = await post();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});
