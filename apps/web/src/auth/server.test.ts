/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { navigationModule } from "./test-navigation";

mock.module("server-only", () => ({}));

const user = { id: "did:privy:test", name: "Test", username: "test_user", walletAddress: "0xabc" };
let cookie: string | undefined;
let answer: () => Promise<Response> = async () => Response.json({ user }, { status: 200 });
const calls: Array<string | null> = [];

mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookie ? { name, value: cookie } : undefined) }),
}));
mock.module("next/navigation", () => navigationModule);

const { getCurrentUser, requireUser, SESSION_COOKIE } = await import("./server");

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  globalThis.fetch = (async (_url: URL, init: RequestInit) => {
    calls.push(new Headers(init.headers).get("authorization"));
    return answer();
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
});
beforeEach(() => {
  cookie = "privy-token";
  calls.length = 0;
  answer = async () => Response.json({ user }, { status: 200 });
});

test("the session cookie name is the one the route handlers write", () => {
  expect(SESSION_COOKIE).toBe("automator-session");
});

test("no session cookie means no user and no API call", async () => {
  cookie = undefined;
  expect(await getCurrentUser()).toBeNull();
  expect(calls).toEqual([]);
});

test("a valid cookie returns the user the API knows", async () => {
  expect(await getCurrentUser()).toEqual(user);
  expect(calls).toEqual(["Bearer privy-token"]);
});

test("a rejected token is treated as signed out", async () => {
  answer = async () => Response.json({ error: "unauthorized" }, { status: 401 });
  expect(await getCurrentUser()).toBeNull();
});

test("an unavailable API is an error, not a silent sign-out", async () => {
  answer = async () => Response.json({ error: "unavailable" }, { status: 503 });
  await expect(getCurrentUser()).rejects.toThrow("unavailable");
});

test("requireUser sends a signed-out visitor to the login page", async () => {
  cookie = undefined;
  await expect(requireUser()).rejects.toThrow("redirect:/login");
});

test("requireUser sends an unfinished profile to onboarding", async () => {
  answer = async () => Response.json({ user: { ...user, username: null } }, { status: 200 });
  await expect(requireUser()).rejects.toThrow("redirect:/onboarding");
});

test("requireUser returns a complete profile", async () => {
  expect(await requireUser()).toEqual(user);
});
