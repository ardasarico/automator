/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const message = {
  id: "m1",
  role: "assistant" as const,
  parts: [{ type: "text" as const, text: "hi" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};
let answer: () => Promise<Response> = async () => Response.json({ message });
const calls: Array<{ url: string; authorization: string | null; body: unknown }> = [];

const { PATCH } = await import("./route");

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
  answer = async () => Response.json({ message });
});

const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
const patch = (body: string, headers: Record<string, string> = signedIn) =>
  PATCH(
    new Request("https://app.automator.dev/api/flows/flow-1/ai/messages/m1", {
      method: "PATCH",
      headers,
      body,
    }),
    { params: Promise.resolve({ id: "flow-1", messageId: "m1" }) },
  );

test("applies a proposal state with the bearer token forwarded", async () => {
  const response = await patch(JSON.stringify({ state: "applied" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message });
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/flow-1/ai/messages/m1",
      authorization: "Bearer privy-token",
      body: { state: "applied" },
    },
  ]);
});

test("a body outside the two known states never reaches the API", async () => {
  const response = await patch(JSON.stringify({ state: "pending" }));
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test("a body that is not JSON never reaches the API", async () => {
  const response = await patch("not json");
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test.each([
  ["a foreign origin", { ...signedIn, origin: "https://evil.example" }, 403],
  ["no token", { origin: signedIn.origin, "content-type": "application/json" }, 401],
])("%s is refused before the API is called", async (_name, headers, status) => {
  const response = await patch(JSON.stringify({ state: "applied" }), headers);
  expect(response.status).toBe(status);
  expect(calls).toHaveLength(0);
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "not_found" }, { status: 404 });
  const response = await patch(JSON.stringify({ state: "applied" }));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
});
