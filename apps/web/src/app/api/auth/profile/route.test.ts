/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const saved = {
  user: { id: "did:privy:test", name: "Test", username: "test_user", walletAddress: "0xabc" },
};
let answer: () => Promise<Response> = async () => Response.json(saved, { status: 200 });
const calls: Array<{ authorization: string | null; body: unknown }> = [];

const { PUT } = await import("./route");

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const warnings: string[] = [];
const originalWarn = console.warn;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  console.warn = (line: string) => {
    warnings.push(line);
  };
  globalThis.fetch = (async (_url: URL, init: RequestInit) => {
    calls.push({
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
  warnings.length = 0;
  answer = async () => Response.json(saved, { status: 200 });
});

const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
function put(body: string, headers: Record<string, string> = signedIn) {
  return PUT(
    new Request("https://app.automator.dev/api/auth/profile", { method: "PUT", headers, body }),
  );
}

test("a valid profile is forwarded with the bearer token", async () => {
  const response = await put(JSON.stringify({ name: "Test", username: "test_user" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(saved);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual([
    { authorization: "Bearer privy-token", body: { name: "Test", username: "test_user" } },
  ]);
});

test("a body that is not JSON is an invalid request", async () => {
  const response = await put("not json");
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_request" });
  expect(calls).toEqual([]);
  expect(warnings).toEqual([
    'Auth proxy failed {"path":"/api/auth/profile","status":400,"code":"invalid_request"}',
  ]);
});

test("a body that does not match the profile schema is rejected before the API", async () => {
  for (const body of [
    JSON.stringify({ name: "Test" }),
    JSON.stringify({ name: "Test", username: "No" }),
    JSON.stringify({ name: "   ", username: "test_user" }),
    JSON.stringify({ name: "Test", username: "test_user", role: "admin" }),
    JSON.stringify([]),
  ]) {
    const response = await put(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_profile" });
  }
  expect(calls).toEqual([]);
});

test("a request without an Origin header is refused", async () => {
  const response = await put(JSON.stringify({ name: "Test", username: "test_user" }), {
    authorization: "Bearer privy-token",
    "content-type": "application/json",
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "forbidden" });
  expect(calls).toEqual([]);
});

test("a cross-site request is refused", async () => {
  const response = await put(JSON.stringify({ name: "Test", username: "test_user" }), {
    ...signedIn,
    "sec-fetch-site": "cross-site",
  });
  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

test("a request without a bearer token never reaches the API", async () => {
  const response = await put(JSON.stringify({ name: "Test", username: "test_user" }), {
    origin: "https://app.automator.dev",
    "content-type": "application/json",
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
  expect(calls).toEqual([]);
});

test("an API failure keeps its status and error body", async () => {
  for (const [status, code] of [
    [401, "unauthorized"],
    [409, "username_taken"],
    [503, "unavailable"],
  ] as const) {
    answer = async () => Response.json({ error: code }, { status });
    const response = await put(JSON.stringify({ name: "Test", username: "test_user" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
