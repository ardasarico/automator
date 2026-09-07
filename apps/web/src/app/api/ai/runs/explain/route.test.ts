/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { ExplainRunRequest, ExplainRunResponse } from "@automator/contracts";

mock.module("server-only", () => ({}));

const explained: ExplainRunResponse = {
  kind: "message",
  text: "The Discord node has no webhook URL. Set one in its settings.",
};
const body: ExplainRunRequest = {
  document: {
    version: 1,
    name: "Ping",
    description: "",
    nodes: [
      { id: "n1", type: "trigger.manual", position: { x: 80, y: 120 }, label: "Run", config: {} },
    ],
    edges: [],
  },
  run: {
    status: "failed",
    trigger: { nodeId: "n1", payload: {} },
    nodes: [{ nodeId: "n1", status: "failed", error: "boom" }],
  },
  nodeId: "n1",
};
let answer: () => Promise<Response> = async () => Response.json(explained, { status: 200 });
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
  answer = async () => Response.json(explained, { status: 200 });
});

const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
function post(payload: string, headers: Record<string, string> = signedIn) {
  return POST(
    new Request("https://app.automator.dev/api/ai/runs/explain", {
      method: "POST",
      headers,
      body: payload,
    }),
  );
}

test("the run is forwarded with the bearer token and the answer relayed", async () => {
  const response = await post(JSON.stringify(body));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(explained);
  expect(calls).toEqual([
    { url: "http://api.internal:3001/ai/runs/explain", authorization: "Bearer privy-token", body },
  ]);
});

test("a body without the run never reaches the API", async () => {
  expect((await post(JSON.stringify({ document: body.document }))).status).toBe(400);
  expect(calls).toHaveLength(0);
});

test.each([
  ["a foreign origin", { ...signedIn, origin: "https://evil.example" }, 403],
  ["no token", { origin: signedIn.origin, "content-type": "application/json" }, 401],
])("%s is refused before the API is called", async (_name, headers, status) => {
  expect((await post(JSON.stringify(body), headers)).status).toBe(status);
  expect(calls).toHaveLength(0);
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "invalid_flow" }, { status: 422 });
  const response = await post(JSON.stringify(body));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "invalid_flow" });
});
