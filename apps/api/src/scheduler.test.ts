import { describe, expect, test } from "bun:test";
import type { FlowDocument } from "@automator/contracts";
import type { Address, Hex } from "viem";
import { createStubChain, type ChainReader } from "@automator/flow-engine";
import type { EventFilter, EventLog, EventReader } from "./chain/events";
import type { ChainFactory } from "./chain/provider";
import { memoryEventCursors, memoryStores, memoryWatchState } from "./runs/test-stores";
import { createScheduler, parseInterval } from "./scheduler";
import type { WatchSources } from "./watch/poll";

function scheduled(id: string, every: string): FlowDocument {
  return {
    version: 1,
    id,
    name: id,
    description: "",
    nodes: [
      {
        id: "s",
        type: "trigger.schedule",
        position: { x: 0, y: 0 },
        label: "Every",
        config: { every },
      },
      {
        id: "v",
        type: "logic.set-variable",
        position: { x: 300, y: 0 },
        label: "Mark",
        config: { name: "ran", value: "{{trigger.at}}" },
      },
    ],
    edges: [{ id: "e", source: "s", sourceHandle: "tick", target: "v", targetHandle: "value" }],
  };
}

describe("parseInterval", () => {
  test.each([
    ["30s", 30_000],
    ["10m", 600_000],
    ["1h", 3_600_000],
    ["2d", 172_800_000],
    ["15", 900_000],
    [" 5 M ", 300_000],
  ])("%s -> %d ms", (text, ms) => {
    expect(parseInterval(text)).toBe(ms);
  });
  test.each(["", "0m", "abc", "1w", "-5m", "999999999999999999999d"])("rejects %s", (text) => {
    expect(parseInterval(text)).toBeNull();
  });
});

describe("scheduler", () => {
  function fixture() {
    let clock = new Date("2026-09-07T10:00:00.000Z");
    const stores = memoryStores([
      { ownerId: "did:privy:alice", flow: scheduled("fast", "10m"), enabled: true },
      { ownerId: "did:privy:alice", flow: scheduled("slow", "1h"), enabled: true },
      { ownerId: "did:privy:bob", flow: scheduled("off", "1m"), enabled: false },
      {
        ownerId: "did:privy:bob",
        flow: {
          ...scheduled("manual", "1m"),
          nodes: [{ ...scheduled("manual", "1m").nodes[0]!, type: "trigger.manual" }],
          edges: [],
        },
        enabled: true,
      },
    ]);
    const lines: string[] = [];
    const scheduler = createScheduler({
      ...stores,
      now: () => clock,
      log: (line) => lines.push(line),
      engine: { now: () => clock, sleep: async () => {} },
    });
    return {
      scheduler,
      stores,
      lines,
      advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    };
  }

  test("first tick runs every enabled flow with a schedule trigger, once, as source schedule", async () => {
    const { scheduler, stores, lines } = fixture();
    expect((await scheduler.tick()).sort()).toEqual(["fast", "slow"]);
    await scheduler.settle();
    expect(stores.runRecords.map((r) => [r.run.flowId, r.source, r.run.status, r.ownerId])).toEqual(
      [
        ["fast", "schedule", "succeeded", "did:privy:alice"],
        ["slow", "schedule", "succeeded", "did:privy:alice"],
      ],
    );
    expect(stores.runRecords[0]!.run.trigger).toEqual({
      nodeId: "s",
      payload: { at: "2026-09-07T10:00:00.000Z" },
    });
    expect(lines.filter((line) => line.startsWith("Scheduled run"))).toHaveLength(2);
    // Nothing is due yet on the next tick.
    expect(await scheduler.tick()).toEqual([]);
  });

  test("a flow runs again only once its interval has passed", async () => {
    const { scheduler, advance } = fixture();
    await scheduler.tick();
    await scheduler.settle();
    advance(9 * 60_000);
    expect(await scheduler.tick()).toEqual([]);
    advance(2 * 60_000);
    expect(await scheduler.tick()).toEqual(["fast"]);
    await scheduler.settle();
    advance(50 * 60_000);
    expect((await scheduler.tick()).sort()).toEqual(["fast", "slow"]);
    await scheduler.settle();
  });

  test("a flow still running is not started twice", async () => {
    const { scheduler, stores, advance } = fixture();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = stores.runs.create;
    stores.runs.create = async (...args) => {
      await gate;
      return original(...args);
    };
    await scheduler.tick();
    advance(60 * 60_000);
    expect(await scheduler.tick()).toEqual([]);
    release();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(2);
  });

  test("overlapping ticks cannot start the same due flow twice", async () => {
    const { scheduler, stores } = fixture();
    const responses = await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]);
    await scheduler.settle();
    expect(responses.flat().sort()).toEqual(["fast", "slow"]);
    expect(stores.runRecords).toHaveLength(2);
  });

  test("each schedule node follows its own interval", async () => {
    let clock = new Date("2026-09-07T10:00:00.000Z");
    const flow = scheduled("multiple", "1h");
    flow.nodes.push({ ...flow.nodes[0]!, id: "fast", config: { every: "10m" } });
    const stores = memoryStores([{ ownerId: "alice", flow, enabled: true }]);
    const scheduler = createScheduler({
      ...stores,
      now: () => clock,
      engine: { now: () => clock },
    });
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords.map((record) => record.run.trigger?.nodeId)).toEqual(["s", "fast"]);
    clock = new Date(clock.getTime() + 10 * 60_000);
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords.map((record) => record.run.trigger?.nodeId)).toEqual([
      "s",
      "fast",
      "fast",
    ]);
  });

  test("wallet provider failures are logged and do not reject detached work", async () => {
    const stores = memoryStores([
      { ownerId: "alice", flow: scheduled("failure", "1m"), enabled: true },
    ]);
    const lines: string[] = [];
    const chainFactory = {
      forUser: async () => {
        throw new Error("wallet unavailable");
      },
    } as unknown as ChainFactory;
    const scheduler = createScheduler({ ...stores, chainFactory, log: (line) => lines.push(line) });
    expect(await scheduler.tick()).toEqual(["failure"]);
    await scheduler.settle();
    expect(lines).toEqual(["Scheduled run of flow failure failed: wallet unavailable"]);
    expect(stores.runRecords).toHaveLength(0);
  });

  test("a store failure is logged and the tick survives", async () => {
    const { scheduler, stores, lines } = fixture();
    stores.flows.listEnabled = async () => {
      throw new Error("database gone");
    };
    expect(await scheduler.tick()).toEqual([]);
    expect(lines).toEqual(["Scheduler tick failed: database gone"]);
  });

  test("one flow's schedule lookup failure does not suppress later flows", async () => {
    const { scheduler, stores, lines } = fixture();
    const original = stores.runs.latestStartedAt;
    stores.runs.latestStartedAt = async (flowId, ...args) => {
      if (flowId === "fast") throw new Error("lookup failed");
      return original(flowId, ...args);
    };
    expect(await scheduler.tick()).toEqual(["slow"]);
    await scheduler.settle();
    expect(stores.runRecords.map((record) => record.run.flowId)).toEqual(["slow"]);
    expect(lines).toContain("Flow fast scheduling failed: lookup failed");
  });

  test("settle waits for a tick still listing flows before the first run starts", async () => {
    const { scheduler, stores } = fixture();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = stores.flows.listEnabled;
    stores.flows.listEnabled = async () => {
      await gate;
      return original();
    };
    const tick = scheduler.tick();
    let settled = false;
    const settlement = scheduler.settle().then(() => {
      settled = true;
    });
    await Promise.resolve();
    const settledBeforeListing = settled;
    release();
    await tick;
    await settlement;
    expect(settledBeforeListing).toBe(false);
    expect(stores.runRecords).toHaveLength(2);
  });

  test("a finished schedule with a failed history write still waits for its interval", async () => {
    const { scheduler, stores, advance } = fixture();
    let attempts = 0;
    stores.runs.create = async () => {
      attempts++;
      throw new Error("history unavailable");
    };
    await scheduler.tick();
    await scheduler.settle();
    expect(attempts).toBe(2);
    advance(60_000);
    expect(await scheduler.tick()).toEqual([]);
    expect(attempts).toBe(2);
    advance(9 * 60_000);
    expect(await scheduler.tick()).toEqual(["fast"]);
    await scheduler.settle();
    expect(attempts).toBe(3);
  });
});

const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const alice = "0x1111111111111111111111111111111111111111" as Address;

function watching(id: string, config: Record<string, unknown> = {}, chainId?: 84532 | 4801) {
  const document: FlowDocument = {
    version: 1,
    id,
    name: id,
    description: "",
    ...(chainId ? { chainId } : {}),
    nodes: [
      {
        id: "ev",
        type: "trigger.onchain-event",
        position: { x: 0, y: 0 },
        label: "Transfer",
        config: { address: usdc, ...config },
      },
      {
        id: "v",
        type: "logic.set-variable",
        position: { x: 300, y: 0 },
        label: "Mark",
        config: { name: "seen", value: "{{trigger.args.value}}" },
      },
    ],
    edges: [{ id: "e", source: "ev", sourceHandle: "event", target: "v", targetHandle: "value" }],
  };
  return document;
}

function transfer(block: number, index: number, value: number): EventLog {
  return {
    address: usdc,
    eventName: "Transfer",
    args: { from: alice, to: alice, value: BigInt(value) },
    blockNumber: BigInt(block),
    blockHash: `0xb${block}` as Hex,
    transactionHash: `0xt${block}${index}` as Hex,
    logIndex: index,
  };
}

/** A reader with a movable head that answers the logs inside the asked range, in order. */
function scriptedReader(head: number, logs: EventLog[]) {
  const filters: EventFilter[] = [];
  let failNext: Error | null = null;
  const state = { head: BigInt(head) };
  const reader: EventReader = {
    getBlockNumber: async () => state.head,
    getLogs: async (filter) => {
      filters.push(filter);
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      return logs.filter(
        (log) =>
          log.address === filter.address &&
          log.blockNumber >= filter.fromBlock &&
          log.blockNumber <= filter.toBlock,
      );
    },
  };
  return {
    reader,
    filters,
    setHead: (block: number) => (state.head = BigInt(block)),
    failNext: (error: Error) => (failNext = error),
  };
}

describe("onchain-event polling", () => {
  function fixture(
    options: {
      flows?: { flow: FlowDocument; enabled?: boolean }[];
      head?: number;
      logs?: EventLog[];
      cursors?: Parameters<typeof memoryEventCursors>[0];
      maxBlocks?: number;
      readers?: Partial<Record<number, EventReader>>;
      chainFactory?: ChainFactory;
    } = {},
  ) {
    const stores = memoryStores(
      (options.flows ?? [{ flow: watching("watch"), enabled: true }]).map((entry) => ({
        ownerId: "did:privy:alice",
        ...entry,
      })),
    );
    const chain = scriptedReader(options.head ?? 1000, options.logs ?? []);
    const cursors = memoryEventCursors(options.cursors);
    const lines: string[] = [];
    const scheduler = createScheduler({
      ...stores,
      log: (line) => lines.push(line),
      engine: { sleep: async () => {} },
      ...(options.chainFactory ? { chainFactory: options.chainFactory } : {}),
      eventCursors: cursors.store,
      eventReaderFor: (chainId) =>
        options.readers ? options.readers[chainId] : chainId === 84532 ? chain.reader : undefined,
      eventLookback: 5,
      eventMaxBlocks: options.maxBlocks ?? 2000,
    });
    return { scheduler, stores, chain, cursors, lines };
  }

  test("a fresh cursor starts a few blocks behind the head and never replays history", async () => {
    const { scheduler, stores, chain, cursors } = fixture({
      head: 1000,
      logs: [transfer(900, 0, 1), transfer(996, 2, 25), transfer(1000, 0, 7)],
    });
    expect(await scheduler.tick()).toEqual(["watch"]);
    await scheduler.settle();
    expect(chain.filters).toHaveLength(1);
    expect(chain.filters[0]).toMatchObject({
      address: usdc,
      fromBlock: BigInt(995),
      toBlock: BigInt(1000),
    });
    expect(chain.filters[0]!.event.name).toBe("Transfer");
    expect(chain.filters[0]!.args).toBeUndefined();
    expect(stores.runRecords.map((r) => [r.source, r.run.status, r.run.trigger.nodeId])).toEqual([
      ["event", "succeeded", "ev"],
      ["event", "succeeded", "ev"],
    ]);
    expect(stores.runRecords[0]!.run.trigger.payload).toEqual({
      event: "Transfer",
      args: { from: alice, to: alice, value: "25" },
      address: usdc,
      blockNumber: "996",
      blockHash: "0xb996",
      transactionHash: "0xt9962",
      logIndex: 2,
      chainId: 84532,
    });
    expect(stores.runRecords[0]!.run.variables).toEqual({ seen: "25" });
    expect(cursors.cursors.get("watch:ev")).toEqual({
      flowId: "watch",
      nodeId: "ev",
      chainId: 84532,
      lastBlock: BigInt(1000),
    });
    // At the head there is nothing to ask for.
    await scheduler.tick();
    await scheduler.settle();
    expect(chain.filters).toHaveLength(1);
    chain.setHead(1003);
    await scheduler.tick();
    await scheduler.settle();
    expect(chain.filters[1]).toMatchObject({ fromBlock: BigInt(1001), toBlock: BigInt(1003) });
  });

  test("asks for the owner's chain provider only when a poll found logs", async () => {
    const forUserCalls: Array<[string, string, number | undefined]> = [];
    const chainFactory = {
      forUser: async (userId: string, mode: "live" | "dry-run", chainId?: number) => {
        forUserCalls.push([userId, mode, chainId]);
        return createStubChain();
      },
    } as unknown as ChainFactory;
    const { scheduler, chain, stores } = fixture({
      head: 1000,
      logs: [transfer(1003, 0, 5)],
      chainFactory,
    });
    await scheduler.tick();
    await scheduler.settle();
    expect(forUserCalls).toEqual([]);
    chain.setHead(1003);
    await scheduler.tick();
    await scheduler.settle();
    expect(forUserCalls).toEqual([["did:privy:alice", "live", 84532]]);
    expect(stores.runRecords.map((r) => r.run.status)).toEqual(["succeeded"]);
  });

  test("passes the indexed argument filter along", async () => {
    const { scheduler, chain } = fixture({
      flows: [{ flow: watching("watch", { args: `{"to": "${alice}"}` }), enabled: true }],
    });
    await scheduler.tick();
    await scheduler.settle();
    expect(chain.filters[0]!.args).toEqual({ to: alice });
  });

  test("catches up in bounded steps over several ticks", async () => {
    const { scheduler, chain, cursors } = fixture({
      head: 5000,
      maxBlocks: 2000,
      cursors: [{ flowId: "watch", nodeId: "ev", chainId: 84532, lastBlock: BigInt(100) }],
    });
    for (let i = 0; i < 3; i++) {
      await scheduler.tick();
      await scheduler.settle();
    }
    expect(chain.filters.map((f) => [f.fromBlock, f.toBlock])).toEqual([
      [BigInt(101), BigInt(2100)],
      [BigInt(2101), BigInt(4100)],
      [BigInt(4101), BigInt(5000)],
    ]);
    expect(cursors.cursors.get("watch:ev")?.lastBlock).toBe(BigInt(5000));
  });

  test("an RPC failure is logged, keeps the cursor, and is retried next tick", async () => {
    const { scheduler, chain, cursors, lines, stores } = fixture({
      head: 1000,
      logs: [transfer(998, 0, 1)],
      cursors: [{ flowId: "watch", nodeId: "ev", chainId: 84532, lastBlock: BigInt(990) }],
    });
    chain.failNext(new Error("rate limited"));
    await scheduler.tick();
    await scheduler.settle();
    expect(lines).toEqual(["Flow watch trigger ev poll failed: rate limited"]);
    expect(cursors.cursors.get("watch:ev")?.lastBlock).toBe(BigInt(990));
    expect(stores.runRecords).toHaveLength(0);
    await scheduler.tick();
    await scheduler.settle();
    expect(chain.filters[1]).toMatchObject({ fromBlock: BigInt(991), toBlock: BigInt(1000) });
    expect(stores.runRecords).toHaveLength(1);
    expect(cursors.cursors.get("watch:ev")?.lastBlock).toBe(BigInt(1000));
  });

  test("a trigger the listener cannot read is logged without touching the chain", async () => {
    const { scheduler, chain, lines } = fixture({
      flows: [
        { flow: watching("blank", { address: "" }), enabled: true },
        { flow: watching("broken", { event: "Transfer(" }), enabled: true },
        { flow: watching("off"), enabled: false },
      ],
    });
    await scheduler.tick();
    await scheduler.settle();
    expect(chain.filters).toHaveLength(0);
    expect(lines.sort()).toEqual([
      "Flow blank trigger ev cannot poll: The contract address is not valid: (blank)",
      "Flow broken trigger ev cannot poll: The event signature could not be parsed: Transfer(",
    ]);
  });

  test("a flow still polling is not polled again, and completed events are consumed on history failure", async () => {
    const { scheduler, stores, chain, cursors, lines } = fixture({
      head: 1000,
      logs: [transfer(997, 0, 1), transfer(999, 0, 2)],
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = stores.runs.create;
    let created = 0;
    stores.runs.create = async (...args) => {
      await gate;
      if (created++ === 1) throw new Error("database gone");
      return original(...args);
    };
    expect(await scheduler.tick()).toEqual(["watch"]);
    expect(await scheduler.tick()).toEqual([]);
    release();
    await scheduler.settle();
    expect(chain.filters).toHaveLength(1);
    expect(stores.runRecords).toHaveLength(1);
    expect(lines.at(-1)).toContain("The run finished but its history could not be saved.");
    expect(cursors.cursors.get("watch:ev")?.lastBlock).toBe(BigInt(1000));
    await scheduler.tick();
    await scheduler.settle();
    expect(created).toBe(2);
  });

  test("a failed history write does not replay or skip other logs in the same block", async () => {
    const { scheduler, stores, cursors } = fixture({
      head: 1000,
      logs: [transfer(1000, 0, 1), transfer(1000, 1, 2), transfer(1000, 2, 3)],
    });
    const original = stores.runs.create;
    let attempts = 0;
    stores.runs.create = async (...args) => {
      if (++attempts === 2) throw new Error("history unavailable");
      return original(...args);
    };
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords.map((record) => record.run.variables.seen)).toEqual(["1", "3"]);
    expect(cursors.cursors.get("watch:ev")?.lastBlock).toBe(BigInt(1000));
    await scheduler.tick();
    await scheduler.settle();
    expect(attempts).toBe(3);
  });

  test("polls the flow's own chain, and a chain change restarts the cursor there", async () => {
    const world = scriptedReader(500, [transfer(499, 0, 3)]);
    const { scheduler, stores, cursors, lines } = fixture({
      flows: [
        { flow: watching("onworld", {}, 4801), enabled: true },
        { flow: watching("nochain", {}, 84532), enabled: true },
      ],
      readers: { 4801: world.reader },
      cursors: [{ flowId: "onworld", nodeId: "ev", chainId: 84532, lastBlock: BigInt(100) }],
    });
    await scheduler.tick();
    await scheduler.settle();
    expect(world.filters[0]).toMatchObject({ fromBlock: BigInt(495), toBlock: BigInt(500) });
    expect(stores.runRecords.map((r) => [r.run.flowId, r.run.trigger.payload])).toEqual([
      ["onworld", expect.objectContaining({ chainId: 4801, blockNumber: "499" })],
    ]);
    expect(cursors.cursors.get("onworld:ev")).toMatchObject({
      chainId: 4801,
      lastBlock: BigInt(500),
    });
    expect(lines).toContain("Flow nochain watches chain 84532, which has no reader");
  });
});

const ethUsdFeed = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";

/** A flow whose only trigger watches a price or a balance. */
function watcher(
  id: string,
  type: "trigger.price" | "trigger.balance",
  config: Record<string, unknown>,
): FlowDocument {
  return {
    version: 1,
    id,
    name: id,
    description: "",
    nodes: [
      { id: "w", type, position: { x: 0, y: 0 }, label: "Watch", config },
      {
        id: "v",
        type: "logic.set-variable",
        position: { x: 300, y: 0 },
        label: "Mark",
        config: { name: "seen", value: "{{trigger.threshold}}" },
      },
    ],
    edges: [
      {
        id: "e",
        source: "w",
        sourceHandle: type === "trigger.price" ? "price" : "balance",
        target: "v",
        targetHandle: "value",
      },
    ],
  };
}

/** A chain reader whose feed answer can be moved between ticks. */
function movablePrice(start: string, decimals = 8) {
  const state = { answer: BigInt(start) };
  const reader = {
    readContract: async (call: { functionName: string }) =>
      call.functionName === "decimals"
        ? decimals
        : [BigInt(1), state.answer, BigInt(1788858000), BigInt(1788858900), BigInt(1)],
  } as unknown as ChainReader;
  return { reader, set: (answer: string) => (state.answer = BigInt(answer)) };
}

describe("watch triggers", () => {
  function fixture(
    document: FlowDocument,
    sources: WatchSources,
    seed: Parameters<typeof memoryWatchState>[0] = [],
  ) {
    const stores = memoryStores([{ ownerId: "did:privy:alice", flow: document, enabled: true }]);
    const watch = memoryWatchState(seed);
    const lines: string[] = [];
    const scheduler = createScheduler({
      ...stores,
      log: (line) => lines.push(line),
      engine: { sleep: async () => {} },
      watchState: watch.store,
      watchSources: sources,
    });
    return { scheduler, stores, lines, watch };
  }

  test("a price below the threshold starts one run and stores the crossing", async () => {
    const price = movablePrice("387542000000");
    const { scheduler, stores, watch, lines } = fixture(
      watcher("dip", "trigger.price", {
        pair: "ETH / USD",
        comparison: "below",
        threshold: "4000",
      }),
      { chainReaderFor: () => price.reader },
    );
    expect(await scheduler.tick()).toEqual(["dip"]);
    await scheduler.settle();
    expect(stores.runRecords.map((r) => [r.run.flowId, r.source, r.run.status])).toEqual([
      ["dip", "watch", "succeeded"],
    ]);
    expect(stores.runRecords[0]!.run.trigger).toEqual({
      nodeId: "w",
      payload: {
        pair: "ETH / USD",
        feed: ethUsdFeed,
        price: "3875.42",
        threshold: "4000",
        comparison: "below",
        decimals: 8,
        roundId: "1",
        updatedAt: "2026-09-08T09:15:00.000Z",
        chainId: 84532,
      },
    });
    expect(watch.states.get("dip:w")).toMatchObject({
      flowId: "dip",
      nodeId: "w",
      met: true,
      value: "3875.42",
    });
    expect(lines[0]).toContain("Watch run");
  });

  test("a condition that keeps holding does not run again", async () => {
    const price = movablePrice("387542000000");
    const { scheduler, stores } = fixture(
      watcher("dip", "trigger.price", {
        pair: "ETH / USD",
        comparison: "below",
        threshold: "4000",
      }),
      { chainReaderFor: () => price.reader },
    );
    await scheduler.tick();
    await scheduler.settle();
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(1);
  });

  test("the watcher re-arms once the price crosses back", async () => {
    const price = movablePrice("387542000000");
    const { scheduler, stores, watch } = fixture(
      watcher("dip", "trigger.price", {
        pair: "ETH / USD",
        comparison: "below",
        threshold: "4000",
      }),
      { chainReaderFor: () => price.reader },
    );
    await scheduler.tick();
    await scheduler.settle();
    price.set("420000000000");
    await scheduler.tick();
    await scheduler.settle();
    expect(watch.states.get("dip:w")).toMatchObject({ met: false, value: "4200" });
    expect(stores.runRecords).toHaveLength(1);
    price.set("390000000000");
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(2);
  });

  test("a condition that does not hold stores the reading and starts nothing", async () => {
    const price = movablePrice("420000000000");
    const { scheduler, stores, watch } = fixture(
      watcher("dip", "trigger.price", {
        pair: "ETH / USD",
        comparison: "below",
        threshold: "4000",
      }),
      { chainReaderFor: () => price.reader },
    );
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(0);
    expect(watch.states.get("dip:w")).toMatchObject({ met: false, value: "4200" });
  });

  test("a balance below the threshold runs with the Token API reading", async () => {
    const { scheduler, stores } = fixture(
      watcher("low", "trigger.balance", {
        address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        network: "base",
        comparison: "below",
        threshold: "1",
      }),
      {
        balances: {
          read: async () => ({
            raw: BigInt("420000000000000000"),
            decimals: 18,
            symbol: "ETH",
            token: "native",
          }),
        },
      },
    );
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords.map((r) => [r.run.flowId, r.source])).toEqual([["low", "watch"]]);
    expect(stores.runRecords[0]!.run.trigger).toMatchObject({
      nodeId: "w",
      payload: { balance: "0.42", symbol: "ETH", threshold: "1", network: "base" },
    });
  });

  test("a config the poller cannot read is logged without a run", async () => {
    const { scheduler, stores, lines } = fixture(
      watcher("bad", "trigger.price", { pair: "custom", feed: "", threshold: "4000" }),
      { chainReaderFor: () => movablePrice("1").reader },
    );
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(0);
    expect(lines[0]).toBe(
      "Flow bad trigger w cannot watch: The feed address is not valid: (blank)",
    );
  });

  test("a balance trigger without a Token API key says so and starts nothing", async () => {
    const { scheduler, stores, lines } = fixture(
      watcher("nokey", "trigger.balance", {
        address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        threshold: "1",
      }),
      {},
    );
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(0);
    expect(lines[0]).toContain("needs a Token API key");
  });

  test("a reader failure is logged and retried on the next tick", async () => {
    let fail = true;
    const price = movablePrice("387542000000");
    const { scheduler, stores, lines } = fixture(
      watcher("flaky", "trigger.price", {
        pair: "ETH / USD",
        comparison: "below",
        threshold: "4000",
      }),
      {
        chainReaderFor: () =>
          ({
            readContract: async (call: { functionName: string }) => {
              if (fail) throw new Error("rpc down");
              return (
                price.reader as unknown as { readContract: (c: unknown) => unknown }
              ).readContract(call);
            },
          }) as unknown as ChainReader,
      },
    );
    await scheduler.tick();
    await scheduler.settle();
    expect(lines[0]).toBe("Flow flaky trigger w watch failed: rpc down");
    expect(stores.runRecords).toHaveLength(0);
    fail = false;
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(1);
  });

  test("wallet setup failures do not consume a crossing before execution can begin", async () => {
    const stores = memoryStores([
      {
        ownerId: "alice",
        enabled: true,
        flow: watcher("retry", "trigger.price", {
          pair: "ETH / USD",
          comparison: "below",
          threshold: "4000",
        }),
      },
    ]);
    const watch = memoryWatchState();
    const price = movablePrice("390000000000");
    let unavailable = true;
    const chainFactory = {
      forUser: async () => {
        if (unavailable) throw new Error("wallet unavailable");
        return createStubChain();
      },
    } as unknown as ChainFactory;
    const scheduler = createScheduler({
      ...stores,
      chainFactory,
      watchState: watch.store,
      watchSources: { chainReaderFor: () => price.reader },
    });
    await scheduler.tick();
    await scheduler.settle();
    expect(watch.states.size).toBe(0);
    expect(stores.runRecords).toHaveLength(0);
    unavailable = false;
    await scheduler.tick();
    await scheduler.settle();
    expect(stores.runRecords).toHaveLength(1);
    expect(watch.states.get("retry:w")?.met).toBe(true);
  });
});
