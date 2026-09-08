/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { POST: answer } = await import("./[sessionId]/answer/route");
const { POST: start } = await import("./route");

const screen = {
  sessionId: "s1",
  token: "tok",
  status: "screen",
  steps: [],
  screen: { nodeId: "p", type: "screen.page", label: "Hello", config: {} },
};
let reply: () => Promise<Response> = async () => Response.json(screen, { status: 201 });
const calls: Array<{
  url: string;
  forwardedFor: string | null;
  authorization: string | null;
}> = [];
const upstreamSignals: Array<AbortSignal | null | undefined> = [];

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    upstreamSignals.push(init.signal);
    const headers = new Headers(init.headers);
    calls.push({
      url: String(url),
      forwardedFor: headers.get("x-forwarded-for"),
      authorization: headers.get("authorization"),
    });
    return reply();
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
});
beforeEach(() => {
  calls.length = 0;
  upstreamSignals.length = 0;
  reply = async () => Response.json(screen, { status: 201 });
});

const flowParams = { params: Promise.resolve({ flowId: "flow-1" }) };
const answerParams = {
  params: Promise.resolve({ flowId: "flow-1", sessionId: "s1" }),
};

test("starting a session forwards the visitor's address and no credential", async () => {
  const response = await start(
    new Request("https://runtime.test/api/a/flow-1/sessions", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    }),
    flowParams,
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(screen);
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/public/flows/flow-1/sessions",
      forwardedFor: "203.0.113.9, 10.0.0.1",
      authorization: null,
    },
  ]);
});

test("answering forwards the visitor's address with the answer", async () => {
  reply = async () => Response.json(screen, { status: 200 });
  const response = await answer(
    new Request("https://runtime.test/api/a/flow-1/sessions/s1/answer", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify({ token: "tok", nodeId: "p", port: "next" }),
    }),
    answerParams,
  );
  expect(response.status).toBe(200);
  expect(calls[0]).toMatchObject({
    url: "http://api.internal:3001/public/flows/flow-1/sessions/s1/answer",
    forwardedFor: "203.0.113.9",
  });
});

test("refuses an answer without its screen id before reaching the API", async () => {
  const response = await answer(
    new Request("https://runtime.test/api/a/flow-1/sessions/s1/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "tok", port: "next" }),
    }),
    answerParams,
  );
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test("sends no address header when the visitor's request carries none", async () => {
  await start(
    new Request("https://runtime.test/api/a/flow-1/sessions", {
      method: "POST",
    }),
    flowParams,
  );
  expect(calls[0]?.forwardedFor).toBeNull();
});

test("passes the API's rate limit refusal through", async () => {
  reply = async () => Response.json({ error: "rate_limited" }, { status: 429 });
  const response = await start(
    new Request("https://runtime.test/api/a/flow-1/sessions", {
      method: "POST",
    }),
    flowParams,
  );
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: "rate_limited" });
});

test("aborting a visitor's start request aborts its API request", async () => {
  const controller = new AbortController();
  await start(
    new Request("https://runtime.test/api/a/flow-1/sessions", {
      method: "POST",
      signal: controller.signal,
    }),
    flowParams,
  );

  expect(upstreamSignals[0]?.aborted).toBe(false);
  controller.abort();
  expect(upstreamSignals[0]?.aborted).toBe(true);
});

test("aborting a visitor's answer request aborts its API request", async () => {
  reply = async () => Response.json(screen, { status: 200 });
  const controller = new AbortController();
  await answer(
    new Request("https://runtime.test/api/a/flow-1/sessions/s1/answer", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "tok", nodeId: "p", port: "next" }),
    }),
    answerParams,
  );

  expect(upstreamSignals[0]?.aborted).toBe(false);
  controller.abort();
  expect(upstreamSignals[0]?.aborted).toBe(true);
});
