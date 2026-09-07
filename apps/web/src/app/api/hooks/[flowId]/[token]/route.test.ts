/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let answer: () => Promise<Response> = async () =>
  Response.json({ runId: "run-1", status: "succeeded" }, { status: 202 });
const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> =
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
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: String(init.body),
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
  answer = async () => Response.json({ runId: "run-1", status: "succeeded" }, { status: 202 });
});

function post(path: string, body: string, headers: Record<string, string> = {}) {
  const [flowId, token] = path.split("?")[0]!.split("/").slice(-2) as [string, string];
  return POST(new Request(`https://app.automator.dev${path}`, { method: "POST", headers, body }), {
    params: Promise.resolve({ flowId, token }),
  });
}

test("forwards body, query and caller headers without session or origin checks", async () => {
  const response = await post("/api/hooks/flow-1/tok?x=1", '{"hello":"world"}', {
    "content-type": "application/json",
    "x-demo": "yes",
    cookie: "automator-session=secret",
    origin: "https://elsewhere.example",
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ runId: "run-1", status: "succeeded" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    url: "http://api.internal:3001/hooks/flow-1/tok?x=1",
    method: "POST",
    body: '{"hello":"world"}',
  });
  expect(calls[0]!.headers["x-demo"]).toBe("yes");
  expect(calls[0]!.headers["content-type"]).toBe("application/json");
  expect(calls[0]!.headers.cookie).toBeUndefined();
});

test("relays the API's refusal statuses", async () => {
  answer = async () => Response.json({ error: "not_found" }, { status: 404 });
  const response = await post("/api/hooks/flow-1/wrong", "");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
});

test("an unreachable API is a controlled 503", async () => {
  answer = async () => {
    throw new Error("ECONNREFUSED");
  };
  const response = await post("/api/hooks/flow-1/tok", "{}");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});
