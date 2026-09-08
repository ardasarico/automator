import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createDatabase } from "@automator/db";
import type { FlowDocumentInput, FlowNodeType } from "@automator/contracts";
import { createStubChain } from "@automator/flow-engine";
import type { ChainFactory } from "./chain/provider";
import type { EventLog, EventReader } from "./chain/events";
import { createScheduler, type SchedulerDependencies } from "./scheduler";

const url = process.env.TEST_DATABASE_URL;
const address = "0x1111111111111111111111111111111111111111";
const entry: EventLog = {
  address,
  eventName: "Transfer",
  args: { from: address, to: address, value: 1n },
  blockNumber: 100n,
  blockHash: `0x${"a".repeat(64)}`,
  transactionHash: `0x${"b".repeat(64)}`,
  logIndex: 0,
};
const reader: EventReader = {
  getBlockNumber: async () => 100n,
  getLogs: async () => [entry],
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function document(type: FlowNodeType): FlowDocumentInput {
  return {
    version: 1,
    name: "Scheduler integration",
    description: "",
    nodes: [
      {
        id: "trigger",
        type,
        label: "Trigger",
        position: { x: 0, y: 0 },
        config: {
          every: "30s",
          address,
          token: "native",
          network: "base",
          threshold: "5",
          comparison: "below",
        },
      },
    ],
    edges: [],
  };
}

async function fixture(type: FlowNodeType) {
  const database = createDatabase(url);
  const otherDatabase = createDatabase(url);
  const cleanup = new SQL(url!, { max: 1 });
  const ownerId = `did:privy:scheduler-integration-${crypto.randomUUID()}`;
  await database.migrate();
  await database.users.sync(ownerId, null);
  const input = document(type);
  const flowId = (await database.flows.create(ownerId, input)).flow.id;
  await database.flows.setEnabled(ownerId, flowId, true);
  const dependencies = (db = database): SchedulerDependencies => ({
    flows: {
      ...db.flows,
      listEnabled: async () =>
        (await db.flows.listEnabled()).filter((flow) => flow.record.flow.id === flowId),
    },
    runs: db.runs,
    triggerClaims: db.triggerClaims,
    watchState: db.watchState,
    eventCursors: db.eventCursors,
    eventReaderFor: () => reader,
    watchSources: {
      balances: { read: async () => ({ raw: 1n, decimals: 0, token: "native", symbol: "ETH" }) },
    },
  });
  return {
    database,
    otherDatabase,
    ownerId,
    input,
    flowId,
    dependencies,
    close: async () => {
      await cleanup`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await Promise.all([database.close(), otherDatabase.close(), cleanup.close()]);
    },
  };
}

describe.skipIf(!url)("scheduler with PostgreSQL admission and state", () => {
  test("two workers block an active event and a restart deduplicates it after cursor persistence fails", async () => {
    const f = await fixture("trigger.onchain-event");
    const started = deferred();
    const finish = deferred();
    let effects = 0;
    const engine = {
      executors: {
        "trigger.onchain-event": {
          kind: "trigger" as const,
          run: async () => {
            effects += 1;
            started.resolve();
            await finish.promise;
            return { event: {} };
          },
        },
      },
    };
    const first = createScheduler({
      ...f.dependencies(),
      engine,
      eventCursors: {
        ...f.database.eventCursors,
        save: async () => {
          throw new Error("Simulated lost cursor write");
        },
      },
    });
    const second = createScheduler({ ...f.dependencies(f.otherDatabase), engine });
    try {
      await first.tick();
      await started.promise;
      await second.tick();
      await second.settle();
      expect(effects).toBe(1);
      const owned = (await f.database.flows.listEnabled()).find(
        (flow) => flow.record.flow.id === f.flowId,
      )!;
      expect(
        await f.otherDatabase.triggerClaims.claim({
          flowId: f.flowId,
          nodeId: "other-trigger",
          source: "schedule",
          pollingRevision: owned.pollingRevision,
          occurrenceKey: "another-source",
          at: new Date(),
          scheduleEveryMs: 30_000,
        }),
      ).toEqual({ kind: "blocked" });
      expect((await f.database.eventCursors.find(f.flowId, "trigger"))?.lastBlock).toBe(99n);
      finish.resolve();
      await first.settle();
      const restarted = createScheduler({ ...f.dependencies(f.otherDatabase), engine });
      await restarted.tick();
      await restarted.settle();
      expect(effects).toBe(1);
      expect((await f.database.runs.list(f.ownerId)).runs).toHaveLength(1);
      expect((await f.database.eventCursors.find(f.flowId, "trigger"))?.lastBlock).toBe(100n);
      expect(await f.database.triggerClaims.listIssues(f.ownerId, f.flowId)).toEqual([]);
    } finally {
      finish.resolve();
      await Promise.all([first.settle(), second.settle()]);
      await f.close();
    }
  });

  test.each(["trigger.schedule", "trigger.balance", "trigger.onchain-event"] as const)(
    "%s cannot admit old work after configuration changes during wallet lookup",
    async (type) => {
      const f = await fixture(type);
      const started = deferred();
      const finish = deferred();
      let effects = 0;
      const chainFactory: ChainFactory = {
        chainIds: [84532],
        canSign: false,
        chain: () => undefined,
        wallet: async () => null,
        forUser: async () => {
          started.resolve();
          await finish.promise;
          return createStubChain();
        },
      };
      const scheduler = createScheduler({
        ...f.dependencies(),
        chainFactory,
        engine: {
          executors: {
            [type]: {
              kind: "trigger",
              run: async () => {
                effects += 1;
                return {};
              },
            },
          },
        },
      });
      try {
        await scheduler.tick();
        await started.promise;
        await f.database.flows.update(f.ownerId, f.flowId, { ...f.input, chainId: 4801 });
        finish.resolve();
        await scheduler.settle();
        expect(effects).toBe(0);
        expect((await f.database.runs.list(f.ownerId)).runs).toHaveLength(0);
        expect(await f.database.watchState.find(f.flowId, "trigger")).toBeNull();
        expect(await f.database.eventCursors.find(f.flowId, "trigger")).toBeNull();
        expect(await f.database.triggerClaims.listIssues(f.ownerId, f.flowId)).toEqual([]);
      } finally {
        finish.resolve();
        await scheduler.settle();
        await f.close();
      }
    },
  );

  test("a delayed older watch reading cannot overwrite a newer crossing", async () => {
    const f = await fixture("trigger.balance");
    const started = deferred();
    const finish = deferred();
    let effects = 0;
    const engine = {
      executors: {
        "trigger.balance": {
          kind: "trigger" as const,
          run: async () => {
            effects += 1;
            return { balance: {} };
          },
        },
      },
    };
    const slow = createScheduler({
      ...f.dependencies(),
      engine,
      watchSources: {
        balances: {
          read: async () => {
            started.resolve();
            await finish.promise;
            return { raw: 10n, decimals: 0, token: "native", symbol: "ETH" };
          },
        },
      },
    });
    const fast = createScheduler({ ...f.dependencies(f.otherDatabase), engine });
    try {
      await slow.tick();
      await started.promise;
      await fast.tick();
      await fast.settle();
      expect(effects).toBe(1);
      const latest = await f.database.watchState.find(f.flowId, "trigger");
      expect(latest?.met).toBe(true);
      finish.resolve();
      await slow.settle();
      expect(await f.database.watchState.find(f.flowId, "trigger")).toEqual(latest);
      const restarted = createScheduler({ ...f.dependencies(f.otherDatabase), engine });
      await restarted.tick();
      await restarted.settle();
      expect(effects).toBe(1);
    } finally {
      finish.resolve();
      await Promise.all([slow.settle(), fast.settle()]);
      await f.close();
    }
  });
});
