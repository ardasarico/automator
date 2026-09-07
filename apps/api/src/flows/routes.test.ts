import { describe, expect, test } from "bun:test";
import {
  getFlowContract,
  listFlowsContract,
  parseResponse,
  type FlowDocumentInput,
  type FlowRecord,
} from "@automator/contracts";
import {
  documentTriggerTypes,
  FlowOwnerMissingError,
  type FlowStore,
  type UserStore,
} from "@automator/db";
import { createApp } from "../app";
import type { IdentityProvider } from "../auth/privy";

const input: FlowDocumentInput = {
  version: 1,
  name: "Ticket checkout",
  description: "Verify, pay, issue.",
  nodes: [
    { id: "n1", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
    { id: "n2", type: "usdc.payment", position: { x: 300, y: 0 }, label: "Pay", config: {} },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
};

/** In-memory stand-in for the flow store, with the same owner scoping as the SQL one. */
function fixture(overrides: Partial<FlowStore> = {}, users?: UserStore) {
  const records = new Map<string, FlowRecord & { ownerId: string }>();
  let clock = 0;
  const stamp = () => new Date(1_757_200_000_000 + clock++ * 1000).toISOString();
  const owned = (ownerId: string, id: string) => {
    const record = records.get(id);
    return record && record.ownerId === ownerId ? record : undefined;
  };
  const strip = ({ ownerId: _owner, ...record }: FlowRecord & { ownerId: string }) => record;
  const flows: FlowStore = {
    list: async (ownerId) =>
      [...records.values()]
        .filter((record) => record.ownerId === ownerId)
        .map(({ flow, updatedAt, enabled }) => ({
          id: flow.id,
          name: flow.name,
          description: flow.description,
          updatedAt,
          enabled: enabled ?? false,
          triggerTypes: documentTriggerTypes(flow.nodes),
          nodeCount: flow.nodes.length,
        })),
    find: async (ownerId, id) => {
      const record = owned(ownerId, id);
      return record ? strip(record) : null;
    },
    create: async (ownerId, body) => {
      if (ownerId === "did:privy:ghost") throw new FlowOwnerMissingError();
      const id = `flow-${records.size + 1}`;
      const now = stamp();
      const record = {
        ownerId,
        flow: { ...body, id },
        createdAt: now,
        updatedAt: now,
        enabled: false,
        webhookToken: `token-${id}`,
      };
      records.set(id, record);
      return strip(record);
    },
    update: async (ownerId, id, body) => {
      const record = owned(ownerId, id);
      if (!record) return null;
      const next = { ...record, flow: { ...body, id }, updatedAt: stamp() };
      records.set(id, next);
      return strip(next);
    },
    delete: async (ownerId, id) => {
      const record = owned(ownerId, id);
      if (record) records.delete(id);
      return Boolean(record);
    },
    findPublished: async () => null,
    findPublishedWithOwner: async () => null,
    setEnabled: async (ownerId, id, enabled) => {
      const record = owned(ownerId, id);
      if (!record) return null;
      const next = { ...record, enabled };
      records.set(id, next);
      return strip(next);
    },
    findForWebhook: async (id, token) => {
      const record = records.get(id);
      return record && record.enabled && record.webhookToken === token
        ? { ownerId: record.ownerId, record: strip(record) }
        : null;
    },
    listEnabled: async () =>
      [...records.values()]
        .filter((record) => record.enabled)
        .map((record) => ({ ownerId: record.ownerId, record: strip(record) })),
    ...overrides,
  };
  const identity: IdentityProvider = {
    verify: async (token) =>
      ["alice", "bob", "ghost"].includes(token)
        ? { id: `did:privy:${token}`, expiresAt: 2_000_000_000 }
        : null,
    walletAddress: async () => null,
  };
  const app = createApp({ database: { check: async () => "up" }, users, flows, identity });
  const request = (path: string, method = "GET", token?: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return { request, records };
}

describe("flow routes", () => {
  test.each([undefined, "forged"])("token %s is rejected on every route", async (token) => {
    const { request } = fixture({
      list: async () => {
        throw new Error("Storage must not be called");
      },
    });
    for (const [path, method, body] of [
      ["/flows", "GET", undefined],
      ["/flows", "POST", input],
      ["/flows/flow-1", "GET", undefined],
      ["/flows/flow-1", "PUT", input],
      ["/flows/flow-1", "DELETE", undefined],
      ["/flows/flow-1", "PATCH", { enabled: true }],
    ] as const) {
      const response = await request(path, method, token, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  test("create, read back, list and save a flow", async () => {
    const { request } = fixture();
    const created = await request("/flows", "POST", "alice", input);
    expect(created.status).toBe(201);
    const record = (await created.json()) as FlowRecord;
    expect(record.flow).toEqual({ ...input, id: record.flow.id });
    expect(record.createdAt).toBe(record.updatedAt);

    const read = await request(`/flows/${record.flow.id}`, "GET", "alice");
    expect(parseResponse(getFlowContract, read.status, await read.json()).data).toEqual(record);

    const listed = await request("/flows", "GET", "alice");
    expect(parseResponse(listFlowsContract, listed.status, await listed.json()).data).toEqual({
      flows: [
        {
          id: record.flow.id,
          name: input.name,
          description: input.description,
          updatedAt: record.updatedAt,
          enabled: false,
          triggerTypes: ["trigger.miniapp-open"],
          nodeCount: 2,
        },
      ],
    });

    const saved = await request(`/flows/${record.flow.id}`, "PUT", "alice", {
      ...input,
      name: "Renamed",
      edges: [],
    });
    expect(saved.status).toBe(200);
    const updated = (await saved.json()) as FlowRecord;
    expect(updated.flow).toMatchObject({ id: record.flow.id, name: "Renamed", edges: [] });
    expect(updated.createdAt).toBe(record.createdAt);
    expect(updated.updatedAt).not.toBe(record.updatedAt);
  });

  test("another user's flow is not found on read or save, and never listed", async () => {
    const { request } = fixture();
    const record = (await (await request("/flows", "POST", "alice", input)).json()) as FlowRecord;
    expect((await request(`/flows/${record.flow.id}`, "GET", "bob")).status).toBe(404);
    const save = await request(`/flows/${record.flow.id}`, "PUT", "bob", input);
    expect(save.status).toBe(404);
    expect(await save.json()).toEqual({ error: "not_found" });
    expect(await (await request("/flows", "GET", "bob")).json()).toEqual({ flows: [] });
  });

  test("the id in the path wins over one in the body", async () => {
    const { request } = fixture();
    const record = (await (await request("/flows", "POST", "alice", input)).json()) as FlowRecord;
    const response = await request(`/flows/${record.flow.id}`, "PUT", "alice", {
      ...input,
      id: "someone-elses",
    });
    // An id is not part of the input schema at all, so the whole document is refused.
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_flow" });
  });

  test.each([
    ["a blank name", { ...input, name: " " }],
    ["an unknown node type", { ...input, nodes: [{ ...input.nodes[0], type: "logic.magic" }] }],
    ["an edge to a missing node", { ...input, edges: [{ id: "e1", source: "n1", target: "nx" }] }],
    ["a duplicate node id", { ...input, nodes: [input.nodes[0], input.nodes[0]] }],
    ["a foreign key", { ...input, ownerId: "did:privy:bob" }],
    ["a bare string", "not a flow"],
  ])("rejects a document with %s on create and save", async (_name, body) => {
    const { request, records } = fixture();
    const record = (await (await request("/flows", "POST", "alice", input)).json()) as FlowRecord;
    for (const [path, method] of [
      ["/flows", "POST"],
      [`/flows/${record.flow.id}`, "PUT"],
    ] as const) {
      const response = await request(path, method, "alice", body);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "invalid_flow" });
    }
    expect(records.size).toBe(1);
    expect(records.get(record.flow.id)?.flow).toEqual(record.flow);
  });

  test("patch toggles activation for the owner only and refuses other fields", async () => {
    const { request, records } = fixture();
    const record = (await (await request("/flows", "POST", "alice", input)).json()) as FlowRecord;
    expect(record.enabled).toBe(false);
    expect(record.webhookToken).toBe(`token-${record.flow.id}`);
    const foreign = await request(`/flows/${record.flow.id}`, "PATCH", "bob", { enabled: true });
    expect(foreign.status).toBe(404);
    const bad = await request(`/flows/${record.flow.id}`, "PATCH", "alice", { name: "x" });
    expect(bad.status).toBe(422);
    const on = await request(`/flows/${record.flow.id}`, "PATCH", "alice", { enabled: true });
    expect(on.status).toBe(200);
    expect(((await on.json()) as FlowRecord).enabled).toBe(true);
    expect(records.get(record.flow.id)?.enabled).toBe(true);
    const listed = (await (await request("/flows", "GET", "alice")).json()) as {
      flows: { enabled: boolean }[];
    };
    expect(listed.flows[0]?.enabled).toBe(true);
  });

  test("delete removes only the owner's flow and answers its id", async () => {
    const { request, records } = fixture();
    const record = (await (await request("/flows", "POST", "alice", input)).json()) as FlowRecord;
    const foreign = await request(`/flows/${record.flow.id}`, "DELETE", "bob");
    expect(foreign.status).toBe(404);
    expect(records.size).toBe(1);
    const deleted = await request(`/flows/${record.flow.id}`, "DELETE", "alice");
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id: record.flow.id });
    expect(records.size).toBe(0);
    expect((await request(`/flows/${record.flow.id}`, "GET", "alice")).status).toBe(404);
  });

  test("a token whose user was never synchronized cannot create a flow", async () => {
    const { request } = fixture();
    const response = await request("/flows", "POST", "ghost", input);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("the guard still applies when the auth routes share it", async () => {
    const forbidden = async (): Promise<never> => {
      throw new Error("Storage must not be called");
    };
    const users: UserStore = { find: forbidden, sync: forbidden, saveProfile: forbidden };
    const { request } = fixture({}, users);
    expect((await request("/flows", "GET")).status).toBe(401);
    expect((await request("/flows", "GET", "alice")).status).toBe(200);
    expect((await request("/auth/me", "GET")).status).toBe(401);
  });

  test("storage failures are a controlled 503", async () => {
    const { request } = fixture({
      find: async () => {
        throw new Error("connection string with password");
      },
    });
    const response = await request("/flows/flow-1", "GET", "alice");
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"unavailable"}');
  });
});
