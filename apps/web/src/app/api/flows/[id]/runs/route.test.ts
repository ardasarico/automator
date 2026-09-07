/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { FlowRunRecord } from "@automator/contracts";

mock.module("server-only", () => ({}));

const record: FlowRunRecord = {
  run: {
    id: "run-1",
    flowId: "flow-1",
    status: "succeeded",
    startedAt: "2026-09-07T10:00:00.000Z",
    finishedAt: "2026-09-07T10:00:01.000Z",
    trigger: { nodeId: "t" },
    nodes: [],
    variables: {},
  },
  flowName: "Ping",
  source: "manual",
  document: { version: 1, id: "flow-1", name: "Ping", description: "", nodes: [], edges: [] },
};
let answer: () => Promise<Response> = async () => Response.json(record, { status: 201 });
const calls: Array<{ url: string; authorization: string | null; body: unknown }> = [];

const { POST } = await import("./route");

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalWarn = console.warn;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  console.warn = () => {};
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    calls.push({
      url: String(url),
      authorization: new Headers(init.headers).get("authorization"),
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    });
    return answer();
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
});
beforeEach(() => {
  calls.length = 0;
  answer = async () => Response.json(record, { status: 201 });
});

const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
function post(body: string, headers: Record<string, string> = signedIn) {
  return POST(
    new Request("https://app.automator.dev/api/flows/flow-1/runs", {
      method: "POST",
      headers,
      body,
    }),
    { params: Promise.resolve({ id: "flow-1" }) },
  );
}

test("forwards the trigger choice with the bearer token and relays the record", async () => {
  const response = await post(JSON.stringify({ trigger: { payload: {} } }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(record);
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/flow-1/runs",
      authorization: "Bearer privy-token",
      body: { trigger: { payload: {} } },
    },
  ]);
});

test("a body carrying a document is refused before the API is called", async () => {
  const response = await post(JSON.stringify({ document: {} }));
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "not_found" }, { status: 404 });
  const response = await post("{}");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
});

test("a foreign origin is refused", async () => {
  const response = await post("{}", { ...signedIn, origin: "https://evil.example" });
  expect(response.status).toBe(403);
  expect(calls).toHaveLength(0);
});
