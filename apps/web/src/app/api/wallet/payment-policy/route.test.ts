/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { GET, PUT } = await import("./route");
const policy = { enabled: false, recipients: [], limits: [] };
const state = { policy, day: "2026-09-08", usage: [] };
const calls: Array<{ url: string; init: RequestInit & { cache?: string } }> = [];
let answer = async () => Response.json(state);
const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalWarn = console.warn;
beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  console.warn = () => {};
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
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
  answer = async () => Response.json(state);
});
function call(
  method: "GET" | "PUT",
  body: string = JSON.stringify(policy),
  headers: Record<string, string> = {},
) {
  return (method === "GET" ? GET : PUT)(
    new Request("https://app.automator.dev/api/wallet/payment-policy", {
      method,
      headers: {
        origin: "https://app.automator.dev",
        authorization: "Bearer alice",
        "content-type": "application/json",
        ...headers,
      },
      ...(method === "PUT" ? { body } : {}),
    }),
  );
}

test("forwards authenticated reads and updates without caching", async () => {
  for (const method of ["GET", "PUT"] as const) {
    const response = await call(method);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(state);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const forwarded = calls.at(-1)!;
    expect(forwarded.url).toBe("http://api.internal:3001/wallet/payment-policy");
    expect(forwarded.init.method).toBe(method);
    expect(new Headers(forwarded.init.headers).get("authorization")).toBe("Bearer alice");
    expect(forwarded.init.cache).toBe("no-store");
    expect(forwarded.init.signal).toBeInstanceOf(AbortSignal);
    if (method === "PUT") expect(JSON.parse(forwarded.init.body as string)).toEqual(policy);
  }
});

test("blocks foreign origins and missing tokens before forwarding", async () => {
  for (const method of ["GET", "PUT"] as const) {
    expect((await call(method, undefined, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(method, undefined, { authorization: "" })).status).toBe(401);
    expect((await call(method, undefined, { "sec-fetch-site": "cross-site" })).status).toBe(403);
  }
  expect((await call("PUT", undefined, { origin: "" })).status).toBe(403);
  expect(calls).toHaveLength(0);
});

test("rejects malformed input and invalid rules before forwarding", async () => {
  for (const body of [
    "{",
    "null",
    JSON.stringify({ ...policy, userId: "bob" }),
    JSON.stringify({ ...policy, enabled: true }),
  ]) {
    const response = await call("PUT", body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  }
  expect(calls).toHaveLength(0);
});

test("validates API responses and sanitizes network failures", async () => {
  for (const method of ["GET", "PUT"] as const) {
    answer = async () => Response.json({ error: "unauthorized" }, { status: 401 });
    expect((await call(method)).status).toBe(401);
    for (const fail of [
      async () => Response.json({ secret: "malformed" }),
      async () => {
        throw new Error("private network detail");
      },
    ]) {
      answer = fail;
      const response = await call(method);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  }
});
