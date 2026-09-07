import { describe, expect, test } from "bun:test";
import type { FlowDocument } from "@automator/contracts";
import { memoryStores } from "./runs/test-stores";
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
