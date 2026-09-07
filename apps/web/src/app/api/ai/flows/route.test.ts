/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { GenerateFlowResponse } from "@automator/contracts";

mock.module("server-only", () => ({}));

const generated: GenerateFlowResponse = {
  summary: "A manual run posts to Discord.",
  document: {
    version: 1,
    name: "Ping",
    description: "",
    nodes: [
      { id: "n1", type: "trigger.manual", position: { x: 80, y: 120 }, label: "Run", config: {} },
    ],
    edges: [],
  },
};
let answer: () => Promise<Response> = async () => Response.json(generated, { status: 200 });
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
  answer = async () => Response.json(generated, { status: 200 });
});

const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
function post(body: string, headers: Record<string, string> = signedIn) {
  return POST(
    new Request("https://app.automator.dev/api/ai/flows", { method: "POST", headers, body }),
  );
}

test("a prompt is forwarded with the bearer token and the answer relayed", async () => {
  const response = await post(JSON.stringify({ prompt: "post to discord" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(generated);
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/ai/flows",
      authorization: "Bearer privy-token",
      body: { prompt: "post to discord" },
    },
  ]);
});

test("a body without a prompt never reaches the API", async () => {
  expect((await post(JSON.stringify({ document: generated.document }))).status).toBe(400);
  expect(calls).toHaveLength(0);
});

test.each([
  ["a foreign origin", { ...signedIn, origin: "https://evil.example" }, 403],
  ["no token", { origin: signedIn.origin, "content-type": "application/json" }, 401],
])("%s is refused before the API is called", async (_name, headers, status) => {
  expect((await post(JSON.stringify({ prompt: "x" }), headers)).status).toBe(status);
  expect(calls).toHaveLength(0);
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "unavailable" }, { status: 503 });
  const response = await post(JSON.stringify({ prompt: "x" }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});
