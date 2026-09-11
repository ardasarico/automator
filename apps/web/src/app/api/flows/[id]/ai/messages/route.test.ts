/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const message = {
  id: "m1",
  role: "assistant" as const,
  parts: [{ type: "text" as const, text: "hi" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};
const listing = { messages: [message] };
const cleared = { cleared: true };

/** A `text/event-stream` body made of the given chunks, closed once they are all enqueued. */
function sseResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}

let answer: () => Promise<Response> = async () => Response.json(listing);
const calls: Array<{ url: string; authorization: string | null; body: unknown }> = [];
/* Set to hold the upstream call open, so a mid-stream abort can be observed before it resolves. */
let deferred: Promise<void> | null = null;
let lastSignal: AbortSignal | undefined;
let signalCaptured: Promise<void>;
let resolveSignalCaptured: () => void;

const { GET, DELETE, POST } = await import("./route");

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalWarn = console.warn;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  console.warn = () => {};
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    lastSignal = init.signal as AbortSignal | undefined;
    resolveSignalCaptured();
    calls.push({
      url: String(url),
      authorization: new Headers(init.headers).get("authorization"),
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    });
    if (deferred) await deferred;
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
  answer = async () => Response.json(listing);
  deferred = null;
  lastSignal = undefined;
  signalCaptured = new Promise((resolve) => (resolveSignalCaptured = resolve));
});

const signedIn = { origin: "https://app.automator.dev", authorization: "Bearer privy-token" };
const jsonSignedIn = { ...signedIn, "content-type": "application/json" };

const list = (headers: Record<string, string> = signedIn) =>
  GET(new Request("https://app.automator.dev/api/flows/flow-1/ai/messages", { headers }), {
    params: Promise.resolve({ id: "flow-1" }),
  });
const clear = (headers: Record<string, string> = signedIn) =>
  DELETE(new Request("https://app.automator.dev/api/flows/flow-1/ai/messages", { headers }), {
    params: Promise.resolve({ id: "flow-1" }),
  });
const send = (body: string, headers: Record<string, string> = jsonSignedIn) =>
  POST(
    new Request("https://app.automator.dev/api/flows/flow-1/ai/messages", {
      method: "POST",
      headers,
      body,
    }),
    { params: Promise.resolve({ id: "flow-1" }) },
  );

test("GET lists messages with the bearer token forwarded", async () => {
  const response = await list();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(listing);
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/flow-1/ai/messages",
      authorization: "Bearer privy-token",
      body: undefined,
    },
  ]);
});

test("GET without a token is refused before the API is called", async () => {
  const response = await list({ origin: signedIn.origin });
  expect(response.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("GET from a foreign origin is refused", async () => {
  const response = await list({ ...signedIn, "sec-fetch-site": "cross-site" });
  expect(response.status).toBe(403);
  expect(calls).toHaveLength(0);
});

test("DELETE clears messages with the bearer token forwarded", async () => {
  answer = async () => Response.json(cleared);
  const response = await clear();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(cleared);
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/flow-1/ai/messages",
      authorization: "Bearer privy-token",
      body: undefined,
    },
  ]);
});

test("DELETE without a token is refused before the API is called", async () => {
  const response = await clear({ origin: signedIn.origin });
  expect(response.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("DELETE from a foreign origin is refused", async () => {
  const response = await clear({ ...signedIn, "sec-fetch-site": "cross-site" });
  expect(response.status).toBe(403);
  expect(calls).toHaveLength(0);
});

test("POST relays the upstream event-stream body byte for byte", async () => {
  const chunks = ['data: {"type":"message","id":"m1"}\n\n', 'data: {"type":"done"}\n\n'];
  answer = async () => sseResponse(chunks);
  const response = await send(JSON.stringify({ text: "Say hello instead" }));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
  expect(await response.text()).toBe(chunks.join(""));
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/flow-1/ai/messages",
      authorization: "Bearer privy-token",
      body: { text: "Say hello instead" },
    },
  ]);
});

test("POST with a body that fails the contract never reaches the API", async () => {
  const response = await send(JSON.stringify({ text: "" }));
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test("POST with a body that is not JSON never reaches the API", async () => {
  const response = await send("not json");
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test.each([
  ["a foreign origin", { ...jsonSignedIn, origin: "https://evil.example" }, 403],
  ["no token", { origin: signedIn.origin, "content-type": "application/json" }, 401],
])("POST from %s is refused before the API is called", async (_name, headers, status) => {
  const response = await send(JSON.stringify({ text: "hi" }), headers);
  expect(response.status).toBe(status);
  expect(calls).toHaveLength(0);
});

test("POST relays a rejected upstream turn by its error code", async () => {
  answer = async () =>
    Response.json({ error: "rate_limited", detail: "Too many requests." }, { status: 429 });
  const response = await send(JSON.stringify({ text: "hi" }));
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: "rate_limited" });
});

test("malformed upstream error evidence is reported as unavailable", async () => {
  answer = async () => Response.json({ nonsense: true }, { status: 500 });
  const response = await send(JSON.stringify({ text: "hi" }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});

test("aborting the incoming request also aborts the upstream fetch", async () => {
  let release = () => {};
  deferred = new Promise<void>((resolve) => (release = resolve));
  const controller = new AbortController();
  const responsePromise = POST(
    new Request("https://app.automator.dev/api/flows/flow-1/ai/messages", {
      method: "POST",
      headers: jsonSignedIn,
      body: JSON.stringify({ text: "hi" }),
      signal: controller.signal,
    }),
    { params: Promise.resolve({ id: "flow-1" }) },
  );

  await signalCaptured;
  expect(lastSignal?.aborted).toBe(false);
  controller.abort();
  expect(lastSignal?.aborted).toBe(true);

  release();
  await responsePromise;
});
