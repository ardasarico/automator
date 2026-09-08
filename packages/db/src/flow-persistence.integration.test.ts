import { describe, expect, spyOn, test } from "bun:test";
import { SQL } from "bun";
import type { FlowDocumentInput } from "@automator/contracts";
import { createEventCursorStore } from "./event-cursors";
import { createFlowStore } from "./flows";
import { createFlowVersionStore } from "./flow-versions";
import { migrate } from "./migrations";
import { createUserStore } from "./users";
import { createWatchStateStore } from "./watch-state";

const url = process.env.TEST_DATABASE_URL;
const input: FlowDocumentInput = {
  version: 1,
  name: "Atomic save",
  description: "",
  nodes: [
    { id: "watch", type: "trigger.price", label: "Price", position: { x: 0, y: 0 }, config: {} },
  ],
  edges: [],
};

describe.skipIf(!url)("flow persistence", () => {
  test("commits concurrent saves and history in the same order", async () => {
    const sql = new SQL(url!, { max: 4, connectionTimeout: 5 });
    const ownerId = `did:privy:audit-atomic-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const versions = createFlowVersionStore(sql);
      const created = await flows.create(ownerId, input, { recordVersion: true });
      expect((await versions.find(ownerId, created.flow.id, 1))?.document).toEqual(created.flow);
      await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          flows.update(
            ownerId,
            created.flow.id,
            {
              ...input,
              nodes: input.nodes.map((node) => ({ ...node, position: { x: index + 1, y: 0 } })),
            },
            { recordVersion: true },
          ),
        ),
      );
      const history = await versions.list(ownerId, created.flow.id);
      expect(history.map((version) => version.number)).toEqual(
        Array.from({ length: 13 }, (_, index) => 13 - index),
      );
      expect((await versions.find(ownerId, created.flow.id, 13))?.document).toEqual(
        (await flows.find(ownerId, created.flow.id))?.flow,
      );
      const current = (await flows.find(ownerId, created.flow.id))!.flow;
      await flows.update(
        ownerId,
        created.flow.id,
        { ...current, name: "Renamed" },
        { recordVersion: true },
      );
      expect(await versions.list(ownerId, created.flow.id)).toHaveLength(13);
      await flows.update(
        ownerId,
        created.flow.id,
        { ...current, chainId: 4801 },
        { recordVersion: true },
      );
      expect((await versions.find(ownerId, created.flow.id, 14))?.document.chainId).toBe(4801);
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });

  test("history failures roll back both creates and updates", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    const ownerId = `did:privy:audit-rollback-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const versions = createFlowVersionStore(sql);
      const created = await flows.create(ownerId, input, { recordVersion: true });
      await flows.setEnabled(ownerId, created.flow.id, true);
      const poll = (await flows.listEnabled()).find(
        (entry) => entry.record.flow.id === created.flow.id,
      )!;
      const watch = { flowId: created.flow.id, nodeId: "watch", met: true, value: "100" };
      await createWatchStateStore(sql).save(watch, poll.pollingRevision, null);
      const version = (await versions.find(ownerId, created.flow.id, 1))!;
      const uuid = spyOn(crypto, "randomUUID").mockReturnValue(
        version.id as ReturnType<typeof crypto.randomUUID>,
      );
      try {
        await expect(flows.create(ownerId, input, { recordVersion: true })).rejects.toThrow();
        await expect(
          flows.update(ownerId, created.flow.id, { ...input, nodes: [] }, { recordVersion: true }),
        ).rejects.toThrow();
      } finally {
        uuid.mockRestore();
      }
      expect(await flows.list(ownerId)).toHaveLength(1);
      expect(await flows.find(ownerId, created.flow.id)).toEqual({ ...created, enabled: true });
      expect(await versions.list(ownerId, created.flow.id)).toHaveLength(1);
      expect(await createWatchStateStore(sql).find(created.flow.id, "watch")).toMatchObject(watch);
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });

  test("trigger configuration, removal, and chain edits reset polling state", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    const ownerId = `did:privy:audit-state-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const watches = createWatchStateStore(sql);
      const events = createEventCursorStore(sql);
      const created = await flows.create(ownerId, input);
      const flowId = created.flow.id;
      await flows.setEnabled(ownerId, flowId, true);
      const seed = async () => {
        const poll = (await flows.listEnabled()).find((entry) => entry.record.flow.id === flowId)!;
        const previous = await watches.find(flowId, "watch");
        await watches.save(
          { flowId, nodeId: "watch", met: true, value: "100" },
          poll.pollingRevision,
          previous?.observationId ?? null,
        );
        await events.save(
          { flowId, nodeId: "watch", chainId: 84532, lastBlock: 100n },
          poll.pollingRevision,
        );
      };
      await seed();
      const moved = {
        ...input,
        name: "Renamed",
        nodes: input.nodes.map((node) => ({ ...node, label: "Moved", position: { x: 20, y: 10 } })),
      };
      await flows.update(ownerId, flowId, moved);
      expect(await watches.find(flowId, "watch")).not.toBeNull();
      expect(await events.find(flowId, "watch")).not.toBeNull();
      const configured = {
        ...moved,
        nodes: moved.nodes.map((node) => ({ ...node, config: { threshold: "200" } })),
      };
      await flows.update(ownerId, flowId, configured);
      expect(await watches.find(flowId, "watch")).toBeNull();
      expect(await events.find(flowId, "watch")).toBeNull();
      await seed();
      await flows.update(ownerId, flowId, { ...configured, chainId: 4801 });
      expect(await watches.find(flowId, "watch")).toBeNull();
      expect(await events.find(flowId, "watch")).toBeNull();
      await seed();
      await flows.update(ownerId, flowId, { ...configured, chainId: 4801, nodes: [] });
      expect(await watches.find(flowId, "watch")).toBeNull();
      expect(await events.find(flowId, "watch")).toBeNull();
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });
});
