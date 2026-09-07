/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { FlowVersionRecord, ListFlowVersionsResponse } from "@automator/contracts";

mock.module("server-only", () => ({}));

const listing: ListFlowVersionsResponse = {
  versions: [
    { id: "ver-2", number: 2, name: "Ping", createdAt: "2026-09-07T10:01:00.000Z", nodeCount: 1 },
    { id: "ver-1", number: 1, name: "Ping", createdAt: "2026-09-07T10:00:00.000Z", nodeCount: 0 },
  ],
};
const record: FlowVersionRecord = {
  id: "ver-2",
  number: 2,
  name: "Ping",
  description: "",
  document: {
    version: 1,
    id: "flow-1",
    name: "Ping",
    description: "",
    nodes: [
      { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    ],
    edges: [],
  },
  createdAt: "2026-09-07T10:01:00.000Z",
};
let answer: () => Promise<Response> = async () => Response.json(listing);
const calls: Array<{ url: string; authorization: string | null }> = [];

const { GET: list } = await import("./route");
const { GET: get } = await import("./[number]/route");

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
  answer = async () => Response.json(listing);
});

const signedIn = { origin: "https://app.automator.dev", authorization: "Bearer privy-token" };
const listRequest = (headers: Record<string, string> = signedIn) =>
  list(new Request("https://app.automator.dev/api/flows/flow-1/versions", { headers }), {
    params: Promise.resolve({ id: "flow-1" }),
  });
const getRequest = (headers: Record<string, string> = signedIn) =>
  get(new Request("https://app.automator.dev/api/flows/flow-1/versions/2", { headers }), {
    params: Promise.resolve({ id: "flow-1", number: "2" }),
  });

test("lists versions with the bearer token forwarded", async () => {
  const response = await listRequest();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(listing);
  expect(calls).toEqual([
    { url: "http://api.internal:3001/flows/flow-1/versions", authorization: "Bearer privy-token" },
  ]);
});

test("reads one version by number", async () => {
  answer = async () => Response.json(record);
  const response = await getRequest();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(record);
  expect(calls[0]?.url).toBe("http://api.internal:3001/flows/flow-1/versions/2");
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "not_found" }, { status: 404 });
  const response = await getRequest();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
});

test("a request without a token is refused before the API is called", async () => {
  const response = await listRequest({ origin: signedIn.origin });
  expect(response.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("a cross-site request is refused", async () => {
  const response = await listRequest({ ...signedIn, "sec-fetch-site": "cross-site" });
  expect(response.status).toBe(403);
  expect(calls).toHaveLength(0);
});
