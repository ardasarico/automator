/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

// The routes and the API client are server modules; the marker has no meaning here.
mock.module("server-only", () => ({}));

const user = { id: "did:privy:test", name: "Test", username: "test_user", walletAddress: "0xabc" };
let answer: () => Promise<Response> = async () =>
  Response.json({ user, expiresAt: 2_000_000_000 }, { status: 200 });
const calls: Array<{ url: string; authorization: string | null }> = [];

const { DELETE, POST } = await import("./route");

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalNodeEnv = process.env.NODE_ENV;
const warnings: string[] = [];
const originalWarn = console.warn;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  console.warn = (line: string) => {
    warnings.push(line);
  };
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    calls.push({
      url: String(url),
      authorization: new Headers(init.headers).get("authorization"),
    });
    return answer();
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
  Object.assign(process.env, { NODE_ENV: originalNodeEnv });
});
beforeEach(() => {
  calls.length = 0;
  warnings.length = 0;
  Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  answer = async () => Response.json({ user, expiresAt: 2_000_000_000 }, { status: 200 });
});

function post(headers: Record<string, string>, url = "https://app.automator.dev/api/auth/session") {
  return POST(new Request(url, { method: "POST", headers }));
}
const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "sec-fetch-site": "same-origin",
};

test("a request without an Origin header is refused", async () => {
  const response = await post({ authorization: "Bearer privy-token" });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "forbidden" });
  expect(calls).toEqual([]);
  expect(warnings).toEqual([
    'Auth proxy failed {"path":"/api/auth/session","status":403,"code":"forbidden"}',
  ]);
});

test("a cross-site request is refused", async () => {
  const response = await post({ ...signedIn, "sec-fetch-site": "cross-site" });
  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

test("an Origin from another host is refused", async () => {
  const response = await post({ ...signedIn, origin: "https://evil.example" });
  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

test("the forwarded host decides the origin comparison behind a proxy", async () => {
  const allowed = await post(
    { ...signedIn, "x-forwarded-host": "app.automator.dev" },
    "http://10.0.0.4:3000/api/auth/session",
  );
  expect(allowed.status).toBe(200);
  const refused = await post(
    { ...signedIn, "x-forwarded-host": "other.automator.dev" },
    "http://10.0.0.4:3000/api/auth/session",
  );
  expect(refused.status).toBe(403);
});

test("a comma-separated forwarded host list uses the last entry", async () => {
  const allowed = await post(
    { ...signedIn, "x-forwarded-host": "other.automator.dev, app.automator.dev" },
    "http://10.0.0.4:3000/api/auth/session",
  );
  expect(allowed.status).toBe(200);
  const refused = await post(
    { ...signedIn, "x-forwarded-host": "app.automator.dev, other.automator.dev" },
    "http://10.0.0.4:3000/api/auth/session",
  );
  expect(refused.status).toBe(403);
});

test("a same-origin request without a bearer token is unauthorized and never reaches the API", async () => {
  const response = await post({ origin: "https://app.automator.dev" });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
  expect(calls).toEqual([]);
});

test("a successful session mirrors the token into the cookie", async () => {
  const response = await post(signedIn);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user, expiresAt: 2_000_000_000 });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual([
    { url: "http://api.internal:3001/auth/session", authorization: "Bearer privy-token" },
  ]);
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("automator-session=privy-token");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("HttpOnly");
  expect(cookie.toLowerCase()).toContain("samesite=lax");
  expect(cookie).toContain(`Expires=${new Date(2_000_000_000 * 1000).toUTCString()}`);
  expect(cookie).not.toContain("Secure");
});

test("the cookie is only marked Secure in production", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  const response = await post(signedIn);
  expect(response.headers.get("set-cookie")).toContain("Secure");
});

test("an API failure keeps its status and error body", async () => {
  for (const [status, code] of [
    [401, "unauthorized"],
    [409, "username_taken"],
    [503, "unavailable"],
  ] as const) {
    answer = async () => Response.json({ error: code }, { status });
    const response = await post(signedIn);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});

test("an unreachable API becomes 503", async () => {
  answer = () => Promise.reject(new TypeError("socket hang up"));
  const response = await post(signedIn);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});

test("DELETE clears the cookie for a same-origin request", async () => {
  const response = await DELETE(
    new Request("https://app.automator.dev/api/auth/session", {
      method: "DELETE",
      headers: { origin: "https://app.automator.dev" },
    }),
  );
  expect(response.status).toBe(204);
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("automator-session=;");
  expect(cookie).toContain("Max-Age=0");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Path=/");
});

test("DELETE without an Origin header is refused", async () => {
  const response = await DELETE(
    new Request("https://app.automator.dev/api/auth/session", { method: "DELETE" }),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("set-cookie")).toBeNull();
});
