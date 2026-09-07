/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { FlowDocumentInput } from "@automator/contracts";

mock.module("server-only", () => ({}));

const input: FlowDocumentInput = {
  version: 1,
  name: "Ticket checkout",
  description: "",
  nodes: [
    { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Manual", config: {} },
  ],
  edges: [],
};
const saved = {
  flow: { ...input, id: "flow-1" },
  createdAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:05:00.000Z",
};
let answer: () => Promise<Response> = async () => Response.json(saved, { status: 200 });
const calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }> =
  [];

const { DELETE, PATCH, PUT } = await import("./route");

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
  answer = async () => Response.json(saved, { status: 200 });
});

const signedIn = {
  origin: "https://app.automator.dev",
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
function put(body: string, headers: Record<string, string> = signedIn, id = "flow-1") {
  return PUT(
    new Request(`https://app.automator.dev/api/flows/${id}`, { method: "PUT", headers, body }),
    { params: Promise.resolve({ id }) },
  );
}

test("a valid document is forwarded to the API with the bearer token", async () => {
  const response = await put(JSON.stringify(input));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(saved);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/flow-1",
      method: "PUT",
      authorization: "Bearer privy-token",
      body: input,
    },
  ]);
});

test("the id is path-encoded on the way to the API", async () => {
  await put(JSON.stringify(input), signedIn, "a/b");
  expect(calls[0]?.url).toBe("http://api.internal:3001/flows/a%2Fb");
});

test("an invalid document never reaches the API", async () => {
  const response = await put(JSON.stringify({ ...input, id: "flow-1" }));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "invalid_flow" });
  expect(calls).toHaveLength(0);
});

test("unreadable JSON is a bad request", async () => {
  const response = await put("{ nope");
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test.each([
  ["a foreign origin", { ...signedIn, origin: "https://evil.example" }, 403],
  ["no token", { origin: signedIn.origin, "content-type": "application/json" }, 401],
])("%s is refused before the API is called", async (_name, headers, status) => {
  const response = await put(JSON.stringify(input), headers);
  expect(response.status).toBe(status);
  expect(calls).toHaveLength(0);
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "not_found" }, { status: 404 });
  const response = await put(JSON.stringify(input));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
});

test("an unreachable API is a controlled 503", async () => {
  answer = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  const response = await put(JSON.stringify(input));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});

test("delete forwards the bearer token and relays the id", async () => {
  answer = async () => Response.json({ id: "flow-1" }, { status: 200 });
  const response = await DELETE(
    new Request("https://app.automator.dev/api/flows/flow-1", {
      method: "DELETE",
      headers: signedIn,
    }),
    { params: Promise.resolve({ id: "flow-1" }) },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: "flow-1" });
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/flows/flow-1",
      method: "DELETE",
      authorization: "Bearer privy-token",
      body: undefined,
    },
  ]);
});

test("delete without a token never reaches the API", async () => {
  const response = await DELETE(
    new Request("https://app.automator.dev/api/flows/flow-1", {
      method: "DELETE",
      headers: { origin: signedIn.origin },
    }),
    { params: Promise.resolve({ id: "flow-1" }) },
  );
  expect(response.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("patch forwards the activation flag and relays the record", async () => {
  answer = async () => Response.json({ ...saved, enabled: true }, { status: 200 });
  const response = await PATCH(
    new Request("https://app.automator.dev/api/flows/flow-1", {
      method: "PATCH",
      headers: signedIn,
      body: JSON.stringify({ enabled: true }),
    }),
    { params: Promise.resolve({ id: "flow-1" }) },
  );
  expect(response.status).toBe(200);
  expect(((await response.json()) as { enabled: boolean }).enabled).toBe(true);
  expect(calls[0]).toMatchObject({ method: "PATCH", body: { enabled: true } });
});

test("patch refuses anything but the activation flag before the API is called", async () => {
  const response = await PATCH(
    new Request("https://app.automator.dev/api/flows/flow-1", {
      method: "PATCH",
      headers: signedIn,
      body: JSON.stringify({ name: "x" }),
    }),
    { params: Promise.resolve({ id: "flow-1" }) },
  );
  expect(response.status).toBe(422);
  expect(calls).toHaveLength(0);
});
