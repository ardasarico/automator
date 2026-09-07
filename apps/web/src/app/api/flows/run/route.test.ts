/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { FlowDocument, FlowRun } from "@automator/contracts";

mock.module("server-only", () => ({}));

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Ping",
  description: "",
  nodes: [
    { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Manual", config: {} },
  ],
  edges: [],
};
const run: FlowRun = {
  id: "run-1",
  flowId: "flow-1",
  status: "succeeded",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T10:00:01.000Z",
  trigger: { nodeId: "n1" },
  nodes: [{ nodeId: "n1", status: "succeeded", outputs: { run: null } }],
  variables: {},
};
let answer: () => Promise<Response> = async () => Response.json(run, { status: 200 });
const calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }> =
  [];

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
      method: init.method ?? "GET",
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
  answer = async () => Response.json(run, { status: 200 });
});

const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
function post(body: string, headers: Record<string, string> = signedIn) {
  return POST(
    new Request("https://app.automator.dev/api/flows/run", { method: "POST", headers, body }),
  );
}

test("a run request is forwarded to the API with the bearer token", async () => {
  const body = { document, trigger: { payload: { hello: "world" } } };
  const response = await post(JSON.stringify(body));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(run);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/run",
      method: "POST",
      authorization: "Bearer privy-token",
      body,
    },
  ]);
});

test("a body without a document never reaches the API", async () => {
  const response = await post(JSON.stringify({ trigger: {} }));
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test.each([
  ["a foreign origin", { ...signedIn, origin: "https://evil.example" }, 403],
  ["no token", { origin: signedIn.origin, "content-type": "application/json" }, 401],
])("%s is refused before the API is called", async (_name, headers, status) => {
  const response = await post(JSON.stringify({ document }), headers);
  expect(response.status).toBe(status);
  expect(calls).toHaveLength(0);
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "unauthorized" }, { status: 401 });
  const response = await post(JSON.stringify({ document }));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("an unreachable API is a controlled 503", async () => {
  answer = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  const response = await post(JSON.stringify({ document }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});
