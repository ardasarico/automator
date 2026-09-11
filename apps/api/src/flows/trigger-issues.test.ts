import { expect, test } from "bun:test";
import type { FlowRecord, TriggerExecutionIssue } from "@automator/contracts";
import type { FlowStore } from "@automator/db";
import { createApp } from "../app";

const issue: TriggerExecutionIssue = {
  id: "claim",
  nodeId: "trigger",
  source: "schedule",
  status: "running",
  startedAt: "2026-09-08T00:00:00.000Z",
  historySaved: false,
  record: null,
};
const lookups: string[][] = [];
function fixture(reader?: (owner: string, flow: string) => Promise<TriggerExecutionIssue[]>) {
  const flows = {
    find: async (owner: string, id: string) => {
      lookups.push([owner, id]);
      return owner === "alice" && id === "flow" ? ({} as FlowRecord) : null;
    },
  } as FlowStore;
  const app = createApp({
    database: { check: async () => "up" },
    flows,
    identity: {
      verify: async (token) =>
        token === "alice" || token === "bob" ? { id: token, expiresAt: 2e9 } : null,
      walletAddress: async () => null,
    },
    triggerIssues: reader ? { listIssues: reader } : undefined,
  });
  return (token = "alice", id = "flow") =>
    app.handle(
      new Request(`http://localhost/flows/${id}/trigger-issues`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
}
test("issues require an authenticated owner and pass owner scoping to the reader", async () => {
  const calls: string[][] = [];
  const request = fixture(async (owner, flow) => {
    calls.push([owner, flow]);
    return [issue];
  });
  expect((await request("forged")).status).toBe(401);
  expect((await request("bob")).status).toBe(404);
  expect((await request("alice", "missing")).status).toBe(404);
  expect(calls).toEqual([]);
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ issues: [issue] });
  expect(calls).toEqual([["alice", "flow"]]);
});
test("an unconfigured reader is unavailable, not an empty issue list, and never reads the store", async () => {
  lookups.length = 0;
  const response = await fixture()();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
  expect(lookups).toEqual([]);
});
test("reader failures and malformed retained data are sanitized", async () => {
  const failed = await fixture(async () => {
    throw new Error("private database detail");
  })();
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: "unavailable" });
  const malformed = await fixture(async () => [
    { ...issue, status: "invented" } as unknown as TriggerExecutionIssue,
  ])();
  expect(malformed.status).toBe(500);
  expect(await malformed.json()).toEqual({ error: "unavailable" });
});
