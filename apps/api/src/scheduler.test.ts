import { describe, expect, test } from "bun:test";
import type { FlowDocument } from "@automator/contracts";
import type { Address, Hex } from "viem";
import type { EventFilter, EventLog, EventReader } from "./chain/events";
import { memoryEventCursors, memoryStores } from "./runs/test-stores";
import { createScheduler, parseInterval } from "./scheduler";

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
  test.each(["", "0m", "abc", "1w", "-5m"])("rejects %s", (text) => {
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

  test("a store failure is logged and the tick survives", async () => {
    const { scheduler, stores, lines } = fixture();
    stores.flows.listEnabled = async () => {
      throw new Error("database gone");
    };
    expect(await scheduler.tick()).toEqual([]);
    expect(lines).toEqual(["Scheduler tick failed: database gone"]);
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

  test("a flow still polling is not polled again, and a store failure keeps earlier blocks", async () => {
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
    expect(lines.at(-1)).toBe("Flow watch trigger ev poll failed: database gone");
    // The first log's block is done; the cursor stops just before the failed one.
    expect(cursors.cursors.get("watch:ev")?.lastBlock).toBe(BigInt(998));
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
