import { describe, expect, spyOn, test } from "bun:test";
import {
  documentOutline,
  documentTriggers,
  getFlowContract,
  listFlowsContract,
  parseResponse,
  type FlowDocumentInput,
  type FlowProblem,
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
import type { ChainFactory } from "../chain/provider";

const input: FlowDocumentInput = {
  version: 1,
  name: "Ticket checkout",
  description: "Verify, pay, issue.",
  nodes: [
    { id: "n1", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
    {
      id: "n2",
      type: "usdc.payout",
      position: { x: 300, y: 0 },
      label: "Pay",
      /* Configured, so this fixture is a flow the activation gate lets through. */
      config: { to: "0x1111111111111111111111111111111111111111", amount: "10" },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
};

function fixture(
  overrides: Partial<FlowStore> = {},
  users?: UserStore,
  log = false,
  chainFactory?: ChainFactory,
) {
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
          triggers: documentTriggers(flow.nodes),
          nodeCount: flow.nodes.length,
          outline: documentOutline(flow),
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
    setAppPublished: async (ownerId, id, appPublished) => {
      const record = owned(ownerId, id);
      if (!record) return null;
      const next = { ...record, appPublished };
      records.set(id, next);
      return strip(next);
    },
    findForWebhook: async (id, token) => {
      const record = records.get(id);
      return record && record.enabled && record.webhookToken === token
        ? { ownerId: record.ownerId, record: strip(record), pollingRevision: "0" }
        : null;
    },
    listEnabled: async () =>
      [...records.values()]
        .filter((record) => record.enabled)
        .map((record) => ({
          ownerId: record.ownerId,
          record: strip(record),
          pollingRevision: "0",
        })),
    isCurrentPoll: async () => true,
    ...overrides,
  };
  const identity: IdentityProvider = {
    verify: async (token) =>
      ["alice", "bob", "ghost"].includes(token)
        ? { id: `did:privy:${token}`, expiresAt: 2_000_000_000 }
        : null,
    walletAddress: async () => null,
  };
  const app = createApp({
    database: { check: async () => "up" },
    users,
    flows,
    identity,
    log,
    chainFactory,
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
          triggers: [
            { nodeId: "n1", type: "trigger.miniapp-open", summary: "when someone opens the app" },
          ],
          nodeCount: 2,
          outline: {
            nodes: [
              { id: "n1", type: "trigger.miniapp-open", x: 0, y: 0 },
              { id: "n2", type: "usdc.payout", x: 300, y: 0 },
            ],
            edges: [{ source: "n1", target: "n2" }],
          },
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

  describe("the activation gate", () => {
    /* A payout with no recipient: an error the builder shows and a run would fail on. */
    const broken: FlowDocumentInput = {
      ...input,
      nodes: [input.nodes[0]!, { ...input.nodes[1]!, config: { to: "", amount: "10" } }],
    };
    /* A Discord post with no webhook: a blank secret, which is a warning, not a fault. */
    const warned: FlowDocumentInput = {
      ...input,
      nodes: [
        input.nodes[0]!,
        {
          id: "n2",
          type: "notify.discord",
          position: { x: 300, y: 0 },
          label: "Tell the team",
          config: { webhookUrl: "", content: "Someone paid" },
        },
      ],
    };

    async function stored(document: FlowDocumentInput) {
      const context = fixture();
      const created = (await (
        await context.request("/flows", "POST", "alice", document)
      ).json()) as FlowRecord;
      return { ...context, id: created.flow.id };
    }

    test("refuses to activate a stored flow that has an error, and says which", async () => {
      const { request, records, id } = await stored(broken);
      const refused = await request(`/flows/${id}`, "PATCH", "alice", { enabled: true });
      expect(refused.status).toBe(422);
      const body = (await refused.json()) as { error: string; problems?: FlowProblem[] };
      expect(body.error).toBe("invalid_flow");
      expect(body.problems).toEqual([
        { severity: "error", nodeId: "n2", message: "“Pay” needs a recipient address." },
      ]);
      // The refusal has to leave the flow off, not merely report on the way past.
      expect(records.get(id)?.enabled).toBeFalsy();
    });

    test("a blank secret is a warning, so it does not block activation", async () => {
      const { request, records, id } = await stored(warned);
      const allowed = await request(`/flows/${id}`, "PATCH", "alice", { enabled: true });
      expect(allowed.status).toBe(200);
      expect(records.get(id)?.enabled).toBe(true);
    });

    test("deactivating is always allowed, however broken the flow is", async () => {
      const { request, records, id } = await stored(input);
      expect((await request(`/flows/${id}`, "PATCH", "alice", { enabled: true })).status).toBe(200);
      // Break the stored document underneath a live flow, as editing and saving would.
      const live = records.get(id)!;
      records.set(id, {
        ...live,
        flow: { ...live.flow, nodes: broken.nodes.map((n) => ({ ...n })) },
      });
      const off = await request(`/flows/${id}`, "PATCH", "alice", { enabled: false });
      expect(off.status).toBe(200);
      expect(records.get(id)?.enabled).toBe(false);
      // …and it stays refused on the way back on.
      expect((await request(`/flows/${id}`, "PATCH", "alice", { enabled: true })).status).toBe(422);
    });

    test("the gate reads the stored document, so a client cannot talk its way past it", async () => {
      const { request, records, id } = await stored(broken);
      // The patch body carries no document at all; there is nothing here for a client to fake.
      for (const patch of [{ enabled: true }, { enabled: true, appPublished: true }])
        expect((await request(`/flows/${id}`, "PATCH", "alice", patch)).status).toBe(422);
      expect(records.get(id)?.enabled).toBeFalsy();
      expect(records.get(id)?.appPublished).toBeFalsy();
    });

    test("publishing the app is not gated, only activation is", async () => {
      const { request, records, id } = await stored(broken);
      expect((await request(`/flows/${id}`, "PATCH", "alice", { appPublished: true })).status).toBe(
        200,
      );
      expect(records.get(id)?.appPublished).toBe(true);
    });

    test("a flow that is not the caller's is not found rather than checked", async () => {
      const { request, id } = await stored(broken);
      expect((await request(`/flows/${id}`, "PATCH", "bob", { enabled: true })).status).toBe(404);
    });
  });

  describe("the signing gate", () => {
    /* Only what the gate reads: whether the server can sign at all, and whether this wallet lets it. */
    function signer(canSign: boolean, signing: boolean | "unreachable"): ChainFactory {
      return {
        chainIds: [84532],
        canSign,
        chain: () => undefined,
        forUser: async () => {
          throw new Error("not used");
        },
        wallet: async () => {
          if (signing === "unreachable") throw new Error("Privy is down");
          return { id: "w1", address: "0x" + "a".repeat(40), delegated: signing, signing };
        },
      };
    }

    async function stored(document: FlowDocumentInput, chainFactory: ChainFactory) {
      const context = fixture({}, undefined, false, chainFactory);
      const created = (await (
        await context.request("/flows", "POST", "alice", document)
      ).json()) as FlowRecord;
      return { ...context, id: created.flow.id };
    }

    const refusal = [
      {
        severity: "error",
        nodeId: "n2",
        message: "“Pay” needs server signing, which is off for your wallet.",
      },
    ];

    test("refuses to publish or activate a paying flow while the wallet's signing is off", async () => {
      const { request, records, id } = await stored(input, signer(true, false));
      for (const patch of [{ appPublished: true }, { enabled: true }]) {
        const refused = await request(`/flows/${id}`, "PATCH", "alice", patch);
        expect(refused.status).toBe(422);
        expect(await refused.json()).toEqual({ error: "invalid_flow", problems: refusal });
      }
      expect(records.get(id)?.appPublished).toBeFalsy();
      expect(records.get(id)?.enabled).toBeFalsy();
    });

    test("lets the same flow through once signing is on", async () => {
      const { request, records, id } = await stored(input, signer(true, true));
      expect((await request(`/flows/${id}`, "PATCH", "alice", { appPublished: true })).status).toBe(
        200,
      );
      expect((await request(`/flows/${id}`, "PATCH", "alice", { enabled: true })).status).toBe(200);
      expect(records.get(id)?.appPublished).toBe(true);
      expect(records.get(id)?.enabled).toBe(true);
    });

    test("does not gate a server that cannot sign at all, nor a flow that never signs", async () => {
      const unsigned = await stored(input, signer(false, false));
      expect(
        (await unsigned.request(`/flows/${unsigned.id}`, "PATCH", "alice", { appPublished: true }))
          .status,
      ).toBe(200);
      const reading: FlowDocumentInput = {
        ...input,
        nodes: [input.nodes[0]!, { ...input.nodes[1]!, type: "usdc.balance", config: {} }],
      };
      const readOnly = await stored(reading, signer(true, "unreachable"));
      expect(
        (await readOnly.request(`/flows/${readOnly.id}`, "PATCH", "alice", { appPublished: true }))
          .status,
      ).toBe(200);
    });

    test("unpublishing and deactivating are never refused", async () => {
      const { request, records, id } = await stored(input, signer(true, false));
      const live = records.get(id)!;
      records.set(id, { ...live, enabled: true, appPublished: true });
      expect(
        (await request(`/flows/${id}`, "PATCH", "alice", { appPublished: false, enabled: false }))
          .status,
      ).toBe(200);
      expect(records.get(id)?.appPublished).toBe(false);
      expect(records.get(id)?.enabled).toBe(false);
    });

    test("a wallet that cannot be checked is a 503, not a pass", async () => {
      const { request, records, id } = await stored(input, signer(true, "unreachable"));
      const answer = await request(`/flows/${id}`, "PATCH", "alice", { appPublished: true });
      expect(answer.status).toBe(503);
      expect(await answer.json()).toEqual({ error: "unavailable" });
      expect(records.get(id)?.appPublished).toBeFalsy();
    });

    test("config problems are reported before signing, so the list stays actionable", async () => {
      const broken: FlowDocumentInput = {
        ...input,
        nodes: [input.nodes[0]!, { ...input.nodes[1]!, config: { to: "", amount: "10" } }],
      };
      const { request, id } = await stored(broken, signer(true, false));
      const refused = await request(`/flows/${id}`, "PATCH", "alice", { enabled: true });
      const body = (await refused.json()) as { problems?: FlowProblem[] };
      expect(body.problems?.map((problem) => problem.message)).toEqual([
        "“Pay” needs a recipient address.",
      ]);
    });
  });

  test("patch publishes the app separately from activation and rejects an empty patch", async () => {
    const { request, records } = fixture();
    const record = (await (await request("/flows", "POST", "alice", input)).json()) as FlowRecord;
    const empty = await request(`/flows/${record.flow.id}`, "PATCH", "alice", {});
    expect(empty.status).toBe(422);
    const foreign = await request(`/flows/${record.flow.id}`, "PATCH", "bob", {
      appPublished: true,
    });
    expect(foreign.status).toBe(404);
    const published = await request(`/flows/${record.flow.id}`, "PATCH", "alice", {
      appPublished: true,
    });
    expect(published.status).toBe(200);
    const body = (await published.json()) as FlowRecord;
    expect(body.appPublished).toBe(true);
    expect(body.enabled).toBe(false);
    expect(records.get(record.flow.id)?.appPublished).toBe(true);
    const removed = await request(`/flows/${record.flow.id}`, "PATCH", "alice", {
      appPublished: false,
    });
    expect(((await removed.json()) as FlowRecord).appPublished).toBe(false);
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

  test("a stored document that no longer matches the schema is a 422, not a 500", async () => {
    const stale: FlowRecord = {
      flow: {
        ...input,
        id: "flow-stale",
        nodes: [{ ...input.nodes[1]!, type: "world.retired" as never }],
        edges: [],
      },
      createdAt: "2026-09-07T10:00:00.000Z",
      updatedAt: "2026-09-07T10:00:00.000Z",
      enabled: false,
      webhookToken: "token-flow-stale",
    };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { request } = fixture({ find: async () => stale }, undefined, true);
      const response = await request("/flows/flow-stale", "GET", "alice");
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "invalid_flow" });
      expect(warn.mock.calls.map(String).join(" ")).toContain("flow-stale");
    } finally {
      warn.mockRestore();
    }
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
