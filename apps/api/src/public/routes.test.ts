import { describe, expect, test } from "bun:test";
import { getPublicFlowContract, parseResponse, type FlowRecord } from "@automator/contracts";
import type { FlowStore } from "@automator/db";
import { createApp } from "../app";

const record: FlowRecord = {
  flow: { version: 1, id: "flow-1", name: "Public", description: "", nodes: [], edges: [] },
  createdAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
};

function fixture() {
  const calls: string[] = [];
  const flows = {
    findPublished: async (id: string) => {
      calls.push(id);
      return id === "flow-1" ? record : null;
    },
  } as unknown as FlowStore;
  const app = createApp({ database: { check: async () => "up" }, flows });
  return { calls, get: (path: string) => app.handle(new Request(`http://localhost${path}`)) };
}

describe("public flow read", () => {
  test("answers a published flow without a token", async () => {
    const { get } = fixture();
    const response = await get("/public/flows/flow-1");
    expect(response.status).toBe(200);
    expect(parseResponse(getPublicFlowContract, 200, await response.json()).data).toEqual({
      id: "flow-1",
      name: "Public",
      description: "",
      updatedAt: record.updatedAt,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("an unpublished or unknown flow is not found", async () => {
    const { get, calls } = fixture();
    const response = await get("/public/flows/private");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(calls).toEqual(["private"]);
  });

  test("the private flow routes still need a token", async () => {
    const { get } = fixture();
    expect((await get("/flows/flow-1")).status).toBe(401);
  });
});
