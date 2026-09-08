import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createFlowStore } from "./flows";
import { migrate } from "./migrations";
import { createTriggerClaimStore, type TriggerClaimInput } from "./trigger-claims";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("durable trigger admission", () => {
  test("two workers admit one occurrence and a restarted worker cannot repeat or bypass uncertainty", async () => {
    const sql = new SQL(url!, { max: 4 });
    const ownerId = `did:privy:claim-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const flow = await flows.create(ownerId, {
        version: 1,
        name: "Claims",
        description: "",
        nodes: [],
        edges: [],
      });
      await flows.setEnabled(ownerId, flow.flow.id, true);
      const [owned] = (await flows.listEnabled()).filter(
        (item) => item.record.flow.id === flow.flow.id,
      );
      const input: TriggerClaimInput = {
        flowId: flow.flow.id,
        nodeId: "event",
        pollingRevision: owned!.pollingRevision,
        source: "event",
        occurrenceKey: "84532:0xtransaction:0",
        at: new Date(),
      };
      const first = createTriggerClaimStore(sql);
      const second = createTriggerClaimStore(sql);
      const results = await Promise.all([first.claim(input), second.claim(input)]);
      expect(results.map((result) => result.kind).sort()).toEqual(["claimed", "duplicate"]);
      const restarted = createTriggerClaimStore(sql);
      expect(await restarted.claim(input)).toEqual({ kind: "duplicate" });
      expect(await restarted.claim({ ...input, occurrenceKey: "next" })).toEqual({
        kind: "blocked",
      });
      const admitted = results.find((result) => result.kind === "claimed")!;
      if (admitted.kind !== "claimed") throw new Error("Missing claim");
      await first.markUncertain(admitted.id);
      expect(await restarted.claim({ ...input, occurrenceKey: "next" })).toEqual({
        kind: "blocked",
      });
      expect(
        await restarted.claim({ ...input, pollingRevision: "obsolete", occurrenceKey: "next" }),
      ).toEqual({ kind: "stale" });
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close();
    }
  });

  test("watch consumption and claim commit together, and stale observations cannot claim", async () => {
    const sql = new SQL(url!, { max: 4 });
    const ownerId = `did:privy:watch-claim-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const flow = await flows.create(ownerId, {
        version: 1,
        name: "Watch claims",
        description: "",
        nodes: [],
        edges: [],
      });
      await flows.setEnabled(ownerId, flow.flow.id, true);
      const owned = (await flows.listEnabled()).find(
        (item) => item.record.flow.id === flow.flow.id,
      )!;
      const input: TriggerClaimInput = {
        flowId: flow.flow.id,
        nodeId: "watch",
        pollingRevision: owned.pollingRevision,
        source: "watch",
        occurrenceKey: "first",
        at: new Date(),
        watch: { expectedObservationId: null, value: "10" },
      };
      const claims = createTriggerClaimStore(sql);
      expect((await claims.claim(input)).kind).toBe("claimed");
      const states = await sql<{ met: boolean; value: string }[]>`
        SELECT met, value FROM automator_watch_state WHERE flow_id = ${flow.flow.id}`;
      expect(states).toHaveLength(1);
      expect(states[0]).toMatchObject({ met: true, value: "10" });
      const count = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM automator_trigger_claims WHERE flow_id = ${flow.flow.id}`;
      expect(count[0]?.count).toBe(1);
      expect(await claims.claim(input)).toEqual({ kind: "duplicate" });
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close();
    }
  });

  test("retains completed evidence and enforces schedule admission independently of history", async () => {
    const sql = new SQL(url!, { max: 4 });
    const ownerId = `did:privy:completed-claim-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flows = createFlowStore(sql);
      const flow = await flows.create(ownerId, {
        version: 1,
        name: "Schedule claims",
        description: "",
        nodes: [],
        edges: [],
      });
      await flows.setEnabled(ownerId, flow.flow.id, true);
      const owned = (await flows.listEnabled()).find(
        (item) => item.record.flow.id === flow.flow.id,
      )!;
      const at = new Date("2026-09-08T10:00:00Z");
      const input: TriggerClaimInput = {
        flowId: flow.flow.id,
        nodeId: "schedule",
        pollingRevision: owned.pollingRevision,
        source: "schedule",
        occurrenceKey: "first",
        at,
        scheduleEveryMs: 60_000,
      };
      const claims = createTriggerClaimStore(sql);
      const admitted = await claims.claim(input);
      if (admitted.kind !== "claimed") throw new Error("Expected claim");
      const record = {
        flowName: flow.flow.name,
        document: flow.flow,
        source: "schedule" as const,
        run: {
          id: admitted.id,
          flowId: flow.flow.id,
          status: "succeeded" as const,
          startedAt: at.toISOString(),
          finishedAt: at.toISOString(),
          nodes: [],
          trigger: { nodeId: "schedule" },
          variables: {},
        },
      };
      await claims.complete(admitted.id, record, false);
      expect(await claims.latestStartedAt(flow.flow.id, "schedule")).toEqual(at);
      expect(await claims.listIssues("another-owner", flow.flow.id)).toEqual([]);
      expect(await claims.listIssues(ownerId, flow.flow.id)).toMatchObject([
        { id: admitted.id, status: "completed", historySaved: false, record },
      ]);
      expect(
        await claims.claim({
          ...input,
          occurrenceKey: "too-early",
          at: new Date(at.getTime() + 59_999),
        }),
      ).toEqual({ kind: "duplicate" });
      expect(
        (
          await claims.claim({
            ...input,
            occurrenceKey: "due",
            at: new Date(at.getTime() + 60_000),
          })
        ).kind,
      ).toBe("claimed");
      expect(
        await claims.claim({
          ...input,
          occurrenceKey: "later",
          at: new Date(at.getTime() + 120_000),
        }),
      ).toEqual({ kind: "blocked" });
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close();
    }
  });
});
