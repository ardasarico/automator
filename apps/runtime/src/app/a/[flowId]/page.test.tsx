/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { generateMetadata } = await import("./page");

const flow = {
  id: "flow-1",
  name: "Ticket desk",
  description: "Buy a ticket and get it as a QR code.",
  updatedAt: "2026-09-11T00:00:00.000Z",
};
let reply: () => Promise<Response> = async () => Response.json(flow);

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  globalThis.fetch = (async () => reply()) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
});
beforeEach(() => {
  reply = async () => Response.json(flow);
});

const props = {
  params: Promise.resolve({ flowId: "flow-1" }),
  searchParams: Promise.resolve({}),
};

test("a published app's link previews with its name and its own description", async () => {
  const metadata = await generateMetadata(props);
  expect(metadata.title).toBe("Ticket desk · Automator Apps");
  expect(metadata.description).toBe(flow.description);
  expect(metadata.openGraph).toMatchObject({
    title: "Ticket desk · Automator Apps",
    description: flow.description,
  });
});

test("an app without a description gets a generic sentence", async () => {
  reply = async () => Response.json({ ...flow, description: "" });
  const metadata = await generateMetadata(props);
  const description = metadata.description;
  expect(typeof description).toBe("string");
  expect(description).not.toBe("");
  expect(metadata.openGraph?.description).toBe(description as string);
});

test("a missing app previews as the host", async () => {
  reply = async () => Response.json({ error: "not_found" }, { status: 404 });
  const metadata = await generateMetadata(props);
  expect(metadata.title).toBe("Automator Apps");
  expect(metadata.description).toBeTruthy();
});
