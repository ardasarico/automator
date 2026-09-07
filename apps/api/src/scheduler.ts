import {
  flowChainId,
  onchainEventTriggerConfigSchema,
  parseNodeConfig,
  type FlowNode,
  type FlowRecord,
} from "@automator/contracts";
import type { EventCursorStore, FlowStore, RunStore } from "@automator/db";
import {
  EventConfigError,
  eventPayload,
  parseEventAddress,
  parseEventArgs,
  parseEventSignature,
  type EventReader,
} from "./chain/events";
import type { ChainFactory } from "./chain/provider";
import { executeStoredRun, type EngineOptions } from "./runs/execute";

export interface SchedulerDependencies {
  flows: FlowStore;
  runs: RunStore;
  engine?: EngineOptions | ((ownerId: string) => EngineOptions);
  /** Trigger-driven runs are live: real chains, never dry runs. */
  chainFactory?: ChainFactory;
  /** How often the scheduler looks for due flows; thirty seconds by default. */
  tickMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
  /** Onchain-event triggers poll through these; without both they stay idle. */
  eventCursors?: EventCursorStore;
  eventReaderFor?: (chainId: number) => EventReader | undefined;
  /** How many blocks behind the head a fresh cursor starts; ten by default. */
  eventLookback?: number;
  /** The most blocks one poll covers; a flow further behind catches up over several ticks. */
  eventMaxBlocks?: number;
}

const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** `30s`, `10m`, `1h`, `1d` (or a bare number of minutes) to milliseconds; `null` when unreadable. */
export function parseInterval(text: string): number | null {
  const match = /^\s*(\d+)\s*([smhd])?\s*$/i.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  if (amount <= 0) return null;
  return amount * units[(match[2] ?? "m").toLowerCase()]!;
}

function scheduleTriggers(nodes: readonly FlowNode[]): { node: FlowNode; every: number }[] {
  const triggers: { node: FlowNode; every: number }[] = [];
  for (const node of nodes) {
    if (node.type !== "trigger.schedule") continue;
    const every = parseInterval(String(node.config.every ?? "1h"));
    if (every !== null) triggers.push({ node, every });
  }
  return triggers;
}

function eventTriggers(nodes: readonly FlowNode[]): FlowNode[] {
  return nodes.filter((node) => node.type === "trigger.onchain-event");
}

const ZERO = BigInt(0);
const ONE = BigInt(1);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs enabled flows with a schedule trigger on their interval, and polls the chain for the
 * flows with an onchain-event trigger, in process. Each tick lists the enabled flows and
 * starts every flow whose newest scheduled run is older than its shortest `every`; for every
 * onchain-event trigger it reads the logs from the node's cursor to the head (bounded per
 * tick) and starts one run per log. A flow still busy from the last tick is skipped, so runs
 * never overlap, and one flow's failure never stops the tick. Time is injectable for tests.
 */
export function createScheduler({
  flows,
  runs,
  engine,
  chainFactory,
  tickMs = 30_000,
  now = () => new Date(),
  log = () => {},
  eventCursors,
  eventReaderFor,
  eventLookback = 10,
  eventMaxBlocks = 2000,
}: SchedulerDependencies) {
  const inFlight = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  function track(flowId: string, work: Promise<unknown>) {
    inFlight.add(flowId);
    void work.finally(() => inFlight.delete(flowId));
  }

  async function runSchedule(ownerId: string, record: FlowRecord, trigger: FlowNode) {
    const flowId = record.flow.id;
    const shared = typeof engine === "function" ? engine(ownerId) : engine;
    const chain = chainFactory
      ? await chainFactory.forUser(ownerId, "live", flowChainId(record.flow))
      : undefined;
    try {
      const result = await executeStoredRun(
        { flows, runs },
        {
          ownerId,
          record,
          source: "schedule",
          engine: {
            ...shared,
            ...(chain ? { chain } : {}),
            trigger: { nodeId: trigger.id, payload: { at: now().toISOString() } },
          },
        },
      );
      log(`Scheduled run ${result.run.id} of flow ${flowId}: ${result.run.status}`);
    } catch (error) {
      log(`Scheduled run of flow ${flowId} failed: ${describe(error)}`);
    }
  }

  /** One trigger node's poll: from its cursor (or the head minus the lookback) to the head. */
  async function pollTrigger(
    ownerId: string,
    record: FlowRecord,
    node: FlowNode,
    reader: EventReader,
    cursors: EventCursorStore,
  ) {
    const flowId = record.flow.id;
    const chainId = flowChainId(record.flow);
    const config = parseNodeConfig(onchainEventTriggerConfigSchema, node.config);
    const event = parseEventSignature(config.event);
    const address = parseEventAddress(config.address);
    const args = parseEventArgs(config.args, event);
    const latest = await reader.getBlockNumber();
    const cursor = await cursors.find(flowId, node.id);
    const lookback = BigInt(eventLookback);
    const from =
      cursor && cursor.chainId === chainId
        ? cursor.lastBlock + ONE
        : latest > lookback
          ? latest - lookback
          : ZERO;
    if (from > latest) return;
    const span = BigInt(eventMaxBlocks) - ONE;
    const to = latest - from > span ? from + span : latest;
    const logs = await reader.getLogs({
      address,
      event,
      ...(args ? { args } : {}),
      fromBlock: from,
      toBlock: to,
    });
    const shared = typeof engine === "function" ? engine(ownerId) : engine;
    // The owner's chain provider looks their wallet up (a Privy call); only worth it with logs.
    const chain =
      chainFactory && logs.length > 0
        ? await chainFactory.forUser(ownerId, "live", chainId)
        : undefined;
    let handled: bigint | null = null;
    try {
      for (const entry of logs) {
        try {
          const result = await executeStoredRun(
            { flows, runs },
            {
              ownerId,
              record,
              source: "event",
              engine: {
                ...shared,
                ...(chain ? { chain } : {}),
                trigger: { nodeId: node.id, payload: eventPayload(entry, chainId) },
                screens: "wait",
              },
            },
          );
          log(
            `Event run ${result.run.id} of flow ${flowId} (${entry.eventName} in block ${entry.blockNumber}): ${result.run.status}`,
          );
        } catch (error) {
          // A run that could not be stored leaves the cursor before its block: nothing is
          // skipped on retry, at the cost of replaying that block's earlier logs.
          handled = entry.blockNumber - ONE;
          throw error;
        }
      }
      handled = to;
    } finally {
      if (handled !== null && handled >= from)
        await cursors.save({ flowId, nodeId: node.id, chainId, lastBlock: handled });
    }
  }

  async function pollEvents(ownerId: string, record: FlowRecord, triggers: FlowNode[]) {
    const flowId = record.flow.id;
    const reader = eventReaderFor?.(flowChainId(record.flow));
    if (!reader || !eventCursors) {
      log(`Flow ${flowId} watches chain ${flowChainId(record.flow)}, which has no reader`);
      return;
    }
    for (const node of triggers) {
      try {
        await pollTrigger(ownerId, record, node, reader, eventCursors);
      } catch (error) {
        const kind = error instanceof EventConfigError ? "cannot poll" : "poll failed";
        log(`Flow ${flowId} trigger ${node.id} ${kind}: ${describe(error)}`);
      }
    }
  }

  async function runDue(): Promise<string[]> {
    const started: string[] = [];
    const enabled = await flows.listEnabled();
    for (const { ownerId, record } of enabled) {
      const flowId = record.flow.id;
      if (inFlight.has(flowId)) continue;
      const schedules = scheduleTriggers(record.flow.nodes);
      const events = eventTriggers(record.flow.nodes);
      if (schedules.length > 0) {
        const every = Math.min(...schedules.map((trigger) => trigger.every));
        const last = await runs.latestStartedAt(flowId, "schedule");
        if (!last || now().getTime() - last.getTime() >= every) {
          started.push(flowId);
          track(flowId, runSchedule(ownerId, record, schedules[0]!.node));
          continue;
        }
      }
      if (events.length > 0 && eventCursors && eventReaderFor) {
        started.push(flowId);
        track(flowId, pollEvents(ownerId, record, events));
      }
    }
    return started;
  }

  return {
    /** One pass over the enabled flows; resolves with the ids it started work for. */
    async tick(): Promise<string[]> {
      try {
        return await runDue();
      } catch (error) {
        log(`Scheduler tick failed: ${describe(error)}`);
        return [];
      }
    },
    /** Waits for the runs the last tick started, for tests and shutdown. */
    async settle(): Promise<void> {
      while (inFlight.size > 0) await new Promise((resolve) => setTimeout(resolve, 5));
    },
    start() {
      if (timer) return;
      timer = setInterval(() => void this.tick(), tickMs);
      log(`Scheduler started, checking every ${Math.round(tickMs / 1000)}s`);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
export type Scheduler = ReturnType<typeof createScheduler>;
