import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import type { FlowDocumentInput } from "@automator/contracts";
import { createEventCursorStore } from "./event-cursors";
import { createFlowStore } from "./flows";
import { migrate } from "./migrations";
import { createUserStore } from "./users";
import { createWatchStateStore } from "./watch-state";

const url = process.env.TEST_DATABASE_URL;
const input: FlowDocumentInput = {
  version: 1,
  name: "Polling fence",
  description: "",
  nodes: [
    { id: "watch", type: "trigger.price", label: "Price", position: { x: 0, y: 0 }, config: {} },
  ],
  edges: [],
};

describe.skipIf(!url)("polling configuration fence", () => {
  test("an old poll cannot recreate state after a configuration edit", async () => {
    const sql = new SQL(url!, { max: 4, connectionTimeout: 5 });
    const ownerId = `did:privy:fence-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const watches = createWatchStateStore(sql);
      const events = createEventCursorStore(sql);
      const created = await flows.create(ownerId, input);
      const flowId = created.flow.id;
      await flows.setEnabled(ownerId, flowId, true);
      const poll = (await flows.listEnabled()).find((entry) => entry.record.flow.id === flowId)!;
      await flows.update(ownerId, flowId, {
        ...input,
        nodes: input.nodes.map((node) => ({ ...node, config: { threshold: "200" } })),
      });
      await watches.save(
        { flowId, nodeId: "watch", met: true, value: "100" },
        poll.pollingRevision,
        null,
      );
      await events.save(
        { flowId, nodeId: "watch", chainId: 84532, lastBlock: 100n },
        poll.pollingRevision,
      );
      expect(await watches.find(flowId, "watch")).toBeNull();
      expect(await events.find(flowId, "watch")).toBeNull();
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });

  test("layout edits preserve a poll but executable edits and activation ABA fence it", async () => {
    const sql = new SQL(url!, { max: 4, connectionTimeout: 5 });
    const ownerId = `did:privy:fence-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const created = await flows.create(ownerId, input);
      const flowId = created.flow.id;
      await flows.setEnabled(ownerId, flowId, true);
      const revision = async () =>
        (await flows.listEnabled()).find((entry) => entry.record.flow.id === flowId)!
          .pollingRevision;
      const original = await revision();
      await flows.update(ownerId, flowId, {
        ...input,
        chainId: 84532,
        name: "Renamed",
        nodes: input.nodes.map((node) => ({ ...node, label: "Moved", position: { x: 20, y: 10 } })),
      });
      expect(await flows.isCurrentPoll(flowId, original)).toBe(true);
      expect(await revision()).toBe(original);
      await flows.update(ownerId, flowId, { ...input, chainId: 4801 });
      await flows.update(ownerId, flowId, input);
      expect(await flows.isCurrentPoll(flowId, original)).toBe(false);
      const restored = await revision();
      await flows.setEnabled(ownerId, flowId, false);
      expect(await flows.isCurrentPoll(flowId, restored)).toBe(false);
      await flows.setEnabled(ownerId, flowId, true);
      expect(await flows.isCurrentPoll(flowId, restored)).toBe(false);
      const active = await revision();
      await flows.setEnabled(ownerId, flowId, true);
      expect(await revision()).toBe(active);
      await flows.update(ownerId, flowId, {
        ...input,
        nodes: [
          ...input.nodes,
          {
            id: "effect",
            type: "notify.email",
            label: "Email",
            position: { x: 0, y: 0 },
            config: { to: "new@example.com" },
          },
        ],
        edges: [{ id: "edge", source: "watch", target: "effect" }],
      });
      expect(await flows.isCurrentPoll(flowId, active)).toBe(false);
      await flows.delete(ownerId, flowId);
      expect(await flows.isCurrentPoll(flowId, active)).toBe(false);
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });

  test("racing observations use CAS and an older event cursor cannot move progress back", async () => {
    const sql = new SQL(url!, { max: 4, connectionTimeout: 5 });
    const ownerId = `did:privy:fence-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const watches = createWatchStateStore(sql);
      const events = createEventCursorStore(sql);
      const flowId = (await flows.create(ownerId, input)).flow.id;
      await flows.setEnabled(ownerId, flowId, true);
      const revision = (await flows.listEnabled()).find(
        (entry) => entry.record.flow.id === flowId,
      )!.pollingRevision;
      const state = { flowId, nodeId: "watch", met: false, value: "100" };
      expect(
        (
          await Promise.all([
            watches.save(state, revision, null),
            watches.save({ ...state, value: "200" }, revision, null),
          ])
        ).sort(),
      ).toEqual([false, true]);
      const previous = (await watches.find(flowId, "watch"))!;
      expect(
        (
          await Promise.all([
            watches.save({ ...state, met: true }, revision, previous.observationId),
            watches.save({ ...state, value: "300" }, revision, previous.observationId),
          ])
        ).sort(),
      ).toEqual([false, true]);
      expect((await watches.find(flowId, "watch"))!.observationId).not.toBe(previous.observationId);
      const cursor = { flowId, nodeId: "watch", chainId: 84532, lastBlock: 200n };
      await events.save(cursor, revision);
      await events.save({ ...cursor, lastBlock: 100n }, revision);
      expect((await events.find(flowId, "watch"))?.lastBlock).toBe(200n);
      const latestObservation = (await watches.find(flowId, "watch"))!.observationId;
      await Promise.all([
        flows.update(ownerId, flowId, { ...input, nodes: [] }),
        events.save({ ...cursor, lastBlock: 300n }, revision),
        watches.save(state, revision, latestObservation),
      ]);
      expect(await events.find(flowId, "watch")).toBeNull();
      expect(await watches.find(flowId, "watch")).toBeNull();
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });
});
