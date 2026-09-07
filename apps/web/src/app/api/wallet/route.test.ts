/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const wallet = {
  address: "0x1111111111111111111111111111111111111111",
  chainId: 4801,
  chainName: "World Chain Sepolia",
  nativeBalance: "0",
  nativeSymbol: "ETH",
  usdcBalance: "0",
};
let answer: () => Promise<Response> = async () => Response.json(wallet, { status: 200 });
const calls: Array<{ url: string; authorization: string | null }> = [];

const { GET } = await import("./route");

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalWarn = console.warn;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  console.warn = () => {};
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), authorization: new Headers(init.headers).get("authorization") });
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
  answer = async () => Response.json(wallet, { status: 200 });
});

function get(
  query = "",
  headers: Record<string, string> = { authorization: "Bearer privy-token" },
) {
  return GET(new Request(`https://app.automator.dev/api/wallet${query}`, { headers }));
}

test("forwards the chain id and the bearer token", async () => {
  const response = await get("?chainId=4801");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(wallet);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual([
    { url: "http://api.internal:3001/wallet?chainId=4801", authorization: "Bearer privy-token" },
  ]);
});

test("omits the query when no chain is asked for", async () => {
  await get();
  expect(calls[0]?.url).toBe("http://api.internal:3001/wallet");
});

test("needs a bearer token", async () => {
  const response = await get("", {});
  expect(response.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("passes the API's refusal through", async () => {
  answer = async () => Response.json({ error: "not_found" }, { status: 404 });
  const response = await get();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
});
