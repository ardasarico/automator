import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createEventCursorStore } from "./event-cursors";
import { createFlowStore, FlowOwnerMissingError } from "./flows";
import { migrate, migrations } from "./migrations";
import { createRunStore, RunCursorError } from "./runs";
import { createUserStore, UsernameTakenError } from "./users";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("live PostgreSQL schema", () => {
  test.skipIf(!url)("migrates idempotently and enforces the username constraints", async () => {
    // Never point this at a database with real data: the tables are truncated.
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      await migrate(sql);

      const ledger = await sql<{ name: string }[]>`SELECT name FROM automator_migrations`;
      expect(ledger.map((row) => row.name).sort()).toEqual(migrations.map((m) => m.name).sort());

      const users = createUserStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      await users.sync("did:privy:test-b", null);
      await users.saveProfile("did:privy:test-a", { name: "A", username: "shared_name" });
      await expect(
        users.saveProfile("did:privy:test-b", { name: "B", username: "shared_name" }),
      ).rejects.toBeInstanceOf(UsernameTakenError);

      await users.sync("did:privy:test-a", null);
      expect(await users.find("did:privy:test-a")).toMatchObject({ walletAddress: "0xaaa" });

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("stores flows per owner as JSON documents", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      await users.sync("did:privy:test-b", null);

      const input = {
        version: 1 as const,
        name: "Ticket checkout",
        description: "Verify, pay, issue.",
        nodes: [
          {
            id: "n1",
            type: "trigger.miniapp-open" as const,
            position: { x: 0, y: 0 },
            label: "Mini-app opened",
            config: {},
          },
          {
            id: "n2",
            type: "usdc.payment" as const,
            position: { x: 300, y: 0 },
            label: "Pay",
            config: { amount: "5" },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
      };
      const created = await flows.create("did:privy:test-a", input);
      expect(created.flow).toEqual({ ...input, id: created.flow.id });
      expect(Date.parse(created.updatedAt)).not.toBeNaN();
      expect(created.enabled).toBe(false);
      expect(created.webhookToken).toMatch(/^[0-9a-f]{32}$/);

      expect(await flows.find("did:privy:test-a", created.flow.id)).toEqual(created);
      expect(await flows.find("did:privy:test-b", created.flow.id)).toBeNull();
      expect(await flows.list("did:privy:test-b")).toEqual([]);
      expect(await flows.list("did:privy:test-a")).toEqual([
        {
          id: created.flow.id,
          name: input.name,
          description: input.description,
          updatedAt: created.updatedAt,
          enabled: false,
          triggerTypes: ["trigger.miniapp-open"],
          nodeCount: 2,
        },
      ]);

      // Activation gates the webhook and schedule lookups; the token stays the same.
      expect(await flows.findForWebhook(created.flow.id, created.webhookToken!)).toBeNull();
      expect(await flows.setEnabled("did:privy:test-b", created.flow.id, true)).toBeNull();
      const enabled = await flows.setEnabled("did:privy:test-a", created.flow.id, true);
      expect(enabled).toMatchObject({ enabled: true, webhookToken: created.webhookToken });
      expect(await flows.findForWebhook(created.flow.id, created.webhookToken!)).toEqual({
        ownerId: "did:privy:test-a",
        record: enabled!,
        pollingRevision: expect.any(String),
      });
      expect(await flows.findForWebhook(created.flow.id, "wrong")).toBeNull();
      expect(
        (await flows.listEnabled()).some((entry) => entry.record.flow.id === created.flow.id),
      ).toBe(true);
      await flows.setEnabled("did:privy:test-a", created.flow.id, false);

      const renamed = { ...input, name: "Renamed", nodes: [input.nodes[0]!], edges: [] };
      expect(await flows.update("did:privy:test-b", created.flow.id, renamed)).toBeNull();
      const updated = await flows.update("did:privy:test-a", created.flow.id, renamed);
      expect(updated?.flow).toEqual({ ...renamed, id: created.flow.id });
      expect(updated?.createdAt).toBe(created.createdAt);
      expect(Date.parse(updated!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));

      await expect(flows.create("did:privy:test-missing", input)).rejects.toBeInstanceOf(
        FlowOwnerMissingError,
      );

      // Deleting the owner removes their flows with them.
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      expect(await flows.list("did:privy:test-a")).toEqual([]);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});

describe.skipIf(!url)("live PostgreSQL runs", () => {
  test.skipIf(!url)("stores runs per owner, joins the flow name, and cascades", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const runs = createRunStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      await users.sync("did:privy:test-b", null);
      const input = {
        version: 1 as const,
        name: "Runner",
        description: "",
        nodes: [
          {
            id: "n1",
            type: "trigger.manual" as const,
            position: { x: 0, y: 0 },
            label: "Run",
            config: {},
          },
        ],
        edges: [],
      };
      const { flow } = await flows.create("did:privy:test-a", input);
      const run = {
        id: crypto.randomUUID(),
        flowId: flow.id,
        status: "succeeded" as const,
        startedAt: "2026-09-07T10:00:00.000Z",
        finishedAt: "2026-09-07T10:00:01.500Z",
        trigger: { nodeId: "n1", payload: { hello: "world" } },
        nodes: [{ nodeId: "n1", status: "succeeded" as const, outputs: { run: null } }],
        variables: { count: 1 },
      };
      const created = await runs.create("did:privy:test-a", flow, run, "schedule");
      expect(created).toEqual({ run, flowName: "Runner", source: "schedule", document: flow });
      expect(await runs.latestStartedAt(flow.id, "schedule")).toEqual(new Date(run.startedAt));
      expect(await runs.latestStartedAt(flow.id, "webhook")).toBeNull();
      expect(await runs.find("did:privy:test-a", run.id)).toEqual(created);
      expect(await runs.find("did:privy:test-b", run.id)).toBeNull();
      expect(await runs.list("did:privy:test-b")).toEqual({ runs: [] });
      expect(await runs.list("did:privy:test-a", { flowId: "other" })).toEqual({ runs: [] });
      expect(await runs.list("did:privy:test-a", { flowId: flow.id })).toEqual({
        runs: [
          {
            id: run.id,
            flowId: flow.id,
            flowName: "Runner",
            status: "succeeded",
            source: "schedule",
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
          },
        ],
      });
      // The list shows the flow's current name; the record keeps the executed snapshot.
      await flows.update("did:privy:test-a", flow.id, { ...input, name: "Renamed" });
      expect((await runs.list("did:privy:test-a")).runs[0]?.flowName).toBe("Renamed");
      expect((await runs.find("did:privy:test-a", run.id))?.document.name).toBe("Runner");

      // Full records come back newest first, capped, and owner-scoped like the summaries.
      const older = { ...run, id: crypto.randomUUID(), startedAt: "2026-09-07T09:00:00.000Z" };
      await runs.create("did:privy:test-a", flow, older, "manual");
      const records = await runs.listRecords("did:privy:test-a", 10);
      expect(records.map((record) => record.run.id)).toEqual([run.id, older.id]);
      expect(records[0]).toEqual({ ...created, flowName: "Renamed" });
      expect((await runs.listRecords("did:privy:test-a", 1)).map((r) => r.run.id)).toEqual([
        run.id,
      ]);
      expect(await runs.listRecords("did:privy:test-b", 10)).toEqual([]);

      expect(await flows.findPublished(flow.id)).toBeNull();
      expect(await flows.delete("did:privy:test-b", flow.id)).toBe(false);
      expect(await flows.delete("did:privy:test-a", flow.id)).toBe(true);
      expect(await runs.list("did:privy:test-a")).toEqual({ runs: [] });
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("pages through runs by keyset without overlap or gaps", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const runs = createRunStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      const { flow } = await flows.create("did:privy:test-a", {
        version: 1 as const,
        name: "Pager",
        description: "",
        nodes: [
          {
            id: "n1",
            type: "trigger.manual" as const,
            position: { x: 0, y: 0 },
            label: "Run",
            config: {},
          },
        ],
        edges: [],
      });
      // Seven runs at three distinct instants, so the tie-break on id is exercised too.
      const ids = ["r-a", "r-b", "r-c", "r-d", "r-e", "r-f", "r-g"];
      const instants = [
        "2026-09-07T10:00:00.000Z",
        "2026-09-07T10:00:00.000Z",
        "2026-09-07T10:00:00.000Z",
        "2026-09-07T10:00:01.000Z",
        "2026-09-07T10:00:01.000Z",
        "2026-09-07T10:00:02.000Z",
        "2026-09-07T10:00:02.000Z",
      ];
      for (const [index, id] of ids.entries()) {
        await runs.create("did:privy:test-a", flow, {
          id: `${crypto.randomUUID().slice(0, 8)}-${id}`,
          flowId: flow.id,
          status: "succeeded" as const,
          startedAt: instants[index]!,
          finishedAt: instants[index]!,
          trigger: { nodeId: "n1" },
          nodes: [{ nodeId: "n1", status: "succeeded" as const }],
          variables: {},
        });
      }
      const first = await runs.list("did:privy:test-a", { flowId: flow.id, limit: 3 });
      expect(first.runs).toHaveLength(3);
      expect(first.nextCursor).toBeString();
      const second = await runs.list("did:privy:test-a", {
        flowId: flow.id,
        limit: 3,
        cursor: first.nextCursor,
      });
      expect(second.runs).toHaveLength(3);
      expect(second.nextCursor).toBeString();
      const third = await runs.list("did:privy:test-a", {
        flowId: flow.id,
        limit: 3,
        cursor: second.nextCursor,
      });
      expect(third.runs).toHaveLength(1);
      expect(third.nextCursor).toBeUndefined();

      const everything = await runs.list("did:privy:test-a", { flowId: flow.id, limit: 100 });
      expect(everything.nextCursor).toBeUndefined();
      const walked = [...first.runs, ...second.runs, ...third.runs];
      expect(walked.map((entry) => entry.id)).toEqual(everything.runs.map((entry) => entry.id));
      expect(new Set(walked.map((entry) => entry.id)).size).toBe(ids.length);
      // Newest first; equal instants fall back to the id order.
      for (let index = 1; index < walked.length; index += 1) {
        const previous = walked[index - 1]!;
        const current = walked[index]!;
        const order = Date.parse(current.startedAt) - Date.parse(previous.startedAt);
        expect(order < 0 || (order === 0 && current.id > previous.id)).toBe(true);
      }
      await expect(runs.list("did:privy:test-a", { cursor: "not-a-cursor" })).rejects.toThrow(
        RunCursorError,
      );
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});

describe.skipIf(!url)("live PostgreSQL chains and event cursors", () => {
  test.skipIf(!url)("keeps the chain id in the document and cursors per trigger node", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const runs = createRunStore(sql);
      const cursors = createEventCursorStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      const trigger = {
        id: "n1",
        type: "trigger.onchain-event" as const,
        position: { x: 0, y: 0 },
        label: "Transfer",
        config: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
      };
      const input = {
        version: 1 as const,
        name: "Watcher",
        description: "",
        nodes: [trigger],
        edges: [],
      };

      // Without a chain id the document round-trips without one; with one it is kept.
      const plain = await flows.create("did:privy:test-a", input);
      expect("chainId" in plain.flow).toBe(false);
      const created = await flows.create("did:privy:test-a", { ...input, chainId: 4801 });
      expect(created.flow.chainId).toBe(4801);
      expect((await flows.find("did:privy:test-a", created.flow.id))?.flow.chainId).toBe(4801);
      const moved = await flows.update("did:privy:test-a", created.flow.id, {
        ...input,
        chainId: 84532,
      });
      expect(moved?.flow.chainId).toBe(84532);

      // Event runs are a valid source, and the snapshot keeps the chain.
      const run = {
        id: crypto.randomUUID(),
        flowId: created.flow.id,
        status: "succeeded" as const,
        startedAt: "2026-09-07T10:00:00.000Z",
        finishedAt: "2026-09-07T10:00:01.000Z",
        trigger: { nodeId: "n1", payload: { event: "Transfer" } },
        nodes: [{ nodeId: "n1", status: "succeeded" as const, outputs: { event: {} } }],
        variables: {},
      };
      const stored = await runs.create("did:privy:test-a", moved!.flow, run, "event");
      expect(stored.source).toBe("event");
      expect(stored.document.chainId).toBe(84532);
      expect(await runs.latestStartedAt(created.flow.id, "event")).toEqual(new Date(run.startedAt));

      await flows.setEnabled("did:privy:test-a", created.flow.id, true);
      const pollingRevision = (await flows.listEnabled()).find(
        (entry) => entry.record.flow.id === created.flow.id,
      )!.pollingRevision;
      // Cursors: one per (flow, node), block numbers beyond 2^53 survive, saves upsert.
      expect(await cursors.find(created.flow.id, "n1")).toBeNull();
      const big = BigInt("9007199254740993");
      await cursors.save(
        { flowId: created.flow.id, nodeId: "n1", chainId: 84532, lastBlock: big },
        pollingRevision,
      );
      expect(await cursors.find(created.flow.id, "n1")).toEqual({
        flowId: created.flow.id,
        nodeId: "n1",
        chainId: 84532,
        lastBlock: big,
      });
      await cursors.save(
        {
          flowId: created.flow.id,
          nodeId: "n1",
          chainId: 4801,
          lastBlock: BigInt(10),
        },
        pollingRevision,
      );
      expect(await cursors.find(created.flow.id, "n1")).toMatchObject({
        chainId: 4801,
        lastBlock: BigInt(10),
      });
      await cursors.save(
        {
          flowId: created.flow.id,
          nodeId: "n2",
          chainId: 4801,
          lastBlock: BigInt(5),
        },
        pollingRevision,
      );
      expect((await cursors.find(created.flow.id, "n2"))?.lastBlock).toBe(BigInt(5));

      // Deleting the flow takes its cursors with it.
      expect(await flows.delete("did:privy:test-a", created.flow.id)).toBe(true);
      expect(await cursors.find(created.flow.id, "n1")).toBeNull();
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});

test.skipIf(Boolean(url))("live database tests need TEST_DATABASE_URL", () => {
  console.log("Skipping packages/db integration tests: TEST_DATABASE_URL is not set.");
  expect(url).toBeUndefined();
});
