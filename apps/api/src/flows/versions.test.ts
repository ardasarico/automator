import { describe, expect, test } from "bun:test";
import {
  getFlowVersionContract,
  listFlowVersionsContract,
  parseResponse,
  Value,
  type FlowDocument,
  type FlowDocumentInput,
  type FlowRecord,
  type FlowVersionRecord,
} from "@automator/contracts";
import type { FlowStore, FlowVersionStore } from "@automator/db";
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

function graphChanged(before: FlowDocument, after: FlowDocument): boolean {
  const graph = ({ version, chainId, nodes, edges }: FlowDocument) => ({
    version,
    chainId,
    nodes,
    edges,
  });
  return !Value.Equal(graph(before), graph(after));
}

function fixture() {
  const records = new Map<string, FlowRecord & { ownerId: string }>();
  const versions = new Map<string, (FlowVersionRecord & { ownerId: string })[]>();
  let clock = 0;
  const stamp = () => new Date(1_757_200_000_000 + clock++ * 1000).toISOString();
  const owned = (ownerId: string, id: string) => {
    const record = records.get(id);
    return record && record.ownerId === ownerId ? record : undefined;
  };
  const strip = ({ ownerId: _owner, ...record }: FlowRecord & { ownerId: string }) => record;
  const flows = {
    find: async (ownerId, id) => {
      const record = owned(ownerId, id);
      return record ? strip(record) : null;
    },
    create: async (ownerId, body, options) => {
      const id = `flow-${records.size + 1}`;
      const now = stamp();
      const record = { ownerId, flow: { ...body, id }, createdAt: now, updatedAt: now };
      records.set(id, record);
      if (options?.recordVersion) await store.record(ownerId, id, body);
      return strip(record);
    },
    update: async (ownerId, id, body, options) => {
      const record = owned(ownerId, id);
      if (!record) return null;
      const next = { ...record, flow: { ...body, id }, updatedAt: stamp() };
      records.set(id, next);
      if (options?.recordVersion && graphChanged(record.flow, next.flow))
        await store.record(ownerId, id, body);
      return strip(next);
    },
  } satisfies Partial<FlowStore> as unknown as FlowStore;
  const store: FlowVersionStore = {
    record: async (ownerId, flowId, body) => {
      if (!owned(ownerId, flowId)) return null;
      const list = versions.get(flowId) ?? [];
      const record = {
        ownerId,
        id: `ver-${flowId}-${list.length + 1}`,
        number: list.length + 1,
        name: body.name,
        description: body.description,
        document: { ...body, id: flowId },
        createdAt: stamp(),
      };
      versions.set(flowId, [...list, record]);
      const { ownerId: _owner, ...stripped } = record;
      return stripped;
    },
    list: async (ownerId, flowId) =>
      (versions.get(flowId) ?? [])
        .filter((version) => version.ownerId === ownerId)
        .map(({ id, number, name, createdAt, document }) => ({
          id,
          number,
          name,
          createdAt,
          nodeCount: document.nodes.length,
        }))
        .reverse(),
    find: async (ownerId, flowId, number) => {
      const version = (versions.get(flowId) ?? []).find(
        (entry) => entry.ownerId === ownerId && entry.number === number,
      );
      if (!version) return null;
      const { ownerId: _owner, ...stripped } = version;
      return stripped;
    },
  };
  const identity: IdentityProvider = {
    verify: async (token) =>
      ["alice", "bob"].includes(token) ? { id: `did:privy:${token}`, expiresAt: 2e9 } : null,
    walletAddress: async () => null,
  };
  const app = createApp({
    database: { check: async () => "up" },
    flows,
    flowVersions: store,
    identity,
  });
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
  const create = async (token: string) =>
    (await (await request("/flows", "POST", token, input)).json()) as FlowRecord;
  return { request, create };
}

describe("flow version routes", () => {
  test.each([undefined, "forged"])("token %s answers 401", async (token) => {
    const { request } = fixture();
    for (const path of ["/flows/flow-1/versions", "/flows/flow-1/versions/1"]) {
      const response = await request(path, "GET", token);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  test("creating a flow records version 1", async () => {
    const { request, create } = fixture();
    const record = await create("alice");
    const listed = await request(`/flows/${record.flow.id}/versions`, "GET", "alice");
    const { data } = parseResponse(listFlowVersionsContract, listed.status, await listed.json());
    expect(data).toEqual({
      versions: [
        {
          id: `ver-${record.flow.id}-1`,
          number: 1,
          name: input.name,
          createdAt: expect.any(String),
          nodeCount: 2,
        },
      ],
    });

    const read = await request(`/flows/${record.flow.id}/versions/1`, "GET", "alice");
    const version = parseResponse(getFlowVersionContract, read.status, await read.json());
    expect(version.status).toBe(200);
    expect(version.data).toMatchObject({
      number: 1,
      name: input.name,
      description: input.description,
      document: record.flow,
    });
  });

  test("a save that changes the graph records a version; a rename alone does not", async () => {
    const { request, create } = fixture();
    const record = await create("alice");
    const renamed = await request(`/flows/${record.flow.id}`, "PUT", "alice", {
      ...input,
      name: "Renamed",
      description: "New description",
    });
    expect(renamed.status).toBe(200);
    const afterRename = await request(`/flows/${record.flow.id}/versions`, "GET", "alice");
    expect(((await afterRename.json()) as { versions: unknown[] }).versions).toHaveLength(1);

    const trimmed = await request(`/flows/${record.flow.id}`, "PUT", "alice", {
      ...input,
      name: "Renamed",
      nodes: [input.nodes[0]!],
      edges: [],
    });
    expect(trimmed.status).toBe(200);
    const listed = await request(`/flows/${record.flow.id}/versions`, "GET", "alice");
    const result = parseResponse(listFlowVersionsContract, listed.status, await listed.json());
    if (result.status !== 200) throw new Error(`Expected 200, got ${result.status}`);
    expect(result.data.versions.map((version) => [version.number, version.nodeCount])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(result.data.versions[0]?.name).toBe("Renamed");

    await request(`/flows/${record.flow.id}`, "PUT", "alice", {
      ...input,
      name: "Renamed",
      nodes: [input.nodes[0]!],
      edges: [],
    });
    const again = await request(`/flows/${record.flow.id}/versions`, "GET", "alice");
    expect(((await again.json()) as { versions: unknown[] }).versions).toHaveLength(2);
  });

  test("another user's flow, a missing number and a malformed number answer 404", async () => {
    const { request, create } = fixture();
    const record = await create("alice");
    for (const [path, token] of [
      [`/flows/${record.flow.id}/versions`, "bob"],
      [`/flows/${record.flow.id}/versions/1`, "bob"],
      ["/flows/missing/versions", "alice"],
      [`/flows/${record.flow.id}/versions/2`, "alice"],
      [`/flows/${record.flow.id}/versions/0`, "alice"],
      [`/flows/${record.flow.id}/versions/latest`, "alice"],
    ] as const) {
      const response = await request(path, "GET", token);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
  });
});
