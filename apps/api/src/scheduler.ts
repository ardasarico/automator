import {
  defaultInterval,
  flowChainId,
  intervalFormats,
  onchainEventTriggerConfigSchema,
  parseInterval,
  parseNodeConfig,
  type FlowNode,
  type FlowRecord,
} from "@automator/contracts";
import type {
  EventCursorStore,
  FlowStore,
  RunStore,
  TriggerClaimStore,
  WatchStateStore,
} from "@automator/db";
import {
  EventConfigError,
  eventPayload,
  parseEventAddress,
  parseEventArgs,
  parseEventSignature,
  type EventReader,
} from "./chain/events";
import type { ChainFactory } from "./chain/provider";
import type { DataFactory } from "./data/provider";
import { executeStoredRun, RunPersistenceError, type EngineOptions } from "./runs/execute";
import { isWatchTrigger, readWatchTrigger, type WatchSources } from "./watch/poll";
import { WatchConfigError, crossed } from "./watch/threshold";

export interface SchedulerDependencies {
  flows: FlowStore;
  runs: RunStore;
  triggerClaims: TriggerClaimStore;
  engine?: EngineOptions | ((ownerId: string) => EngineOptions);
  chainFactory?: ChainFactory;
  dataFactory?: DataFactory;
  tickMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
  eventCursors?: EventCursorStore;
  eventReaderFor?: (chainId: number) => EventReader | undefined;
  eventLookback?: number;
  eventMaxBlocks?: number;
  watchState?: WatchStateStore;
  watchSources?: WatchSources;
}

/**
 * The schedule triggers this scheduler can fire on. An interval it cannot read is reported
 * rather than skipped in silence: such a trigger never fires, and the flow looks healthy.
 */
function scheduleTriggers(
  nodes: readonly FlowNode[],
  unreadable: (node: FlowNode, text: string) => void,
): { node: FlowNode; every: number }[] {
  const triggers: { node: FlowNode; every: number }[] = [];
  for (const node of nodes) {
    if (node.type !== "trigger.schedule") continue;
    const text = String(node.config.every ?? defaultInterval);
    const every = parseInterval(text);
    if (every === null) unreadable(node, text);
    else triggers.push({ node, every });
  }
  return triggers;
}

function eventTriggers(nodes: readonly FlowNode[]): FlowNode[] {
  return nodes.filter((node) => node.type === "trigger.onchain-event");
}

function watchTriggers(nodes: readonly FlowNode[]): FlowNode[] {
  return nodes.filter(isWatchTrigger);
}

const ZERO = BigInt(0);
const ONE = BigInt(1);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createScheduler({
  flows,
  runs,
  triggerClaims,
  engine,
  chainFactory,
  dataFactory,
  tickMs = 30_000,
  now = () => new Date(),
  log = () => {},
  eventCursors,
  eventReaderFor,
  eventLookback = 10,
  eventMaxBlocks = 2000,
  watchState,
  watchSources,
}: SchedulerDependencies) {
  const inFlight = new Set<string>();
  let ticking = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function track(flowId: string, work: () => Promise<unknown>) {
    inFlight.add(flowId);
    void work()
      .catch((error) => log(`Flow ${flowId} failed: ${describe(error)}`))
      .finally(() => inFlight.delete(flowId));
  }

  async function runSchedule(
    ownerId: string,
    record: FlowRecord,
    trigger: FlowNode,
    every: number,
    pollingRevision: string,
  ) {
    const flowId = record.flow.id;
    try {
      const shared = typeof engine === "function" ? engine(ownerId) : engine;
      const chain = chainFactory
        ? await chainFactory.forUser(ownerId, "live", flowChainId(record.flow))
        : undefined;
      const data = dataFactory?.forOwner(ownerId, "live");
      if (!(await flows.isCurrentPoll(flowId, pollingRevision))) return;
      const at = now();
      const admission = await triggerClaims.claim({
        flowId,
        nodeId: trigger.id,
        pollingRevision,
        source: "schedule",
        occurrenceKey: at.toISOString(),
        at,
        scheduleEveryMs: every,
      });
      if (admission.kind !== "claimed") {
        if (admission.kind === "blocked")
          log(`Flow ${flowId} has an unresolved execution; scheduled run paused`);
        return;
      }
      const result = await executeStoredRun(
        { flows, runs },
        {
          ownerId,
          record,
          source: "schedule",
          claim: { id: admission.id, store: triggerClaims },
          engine: {
            ...shared,
            ...(chain ? { chain } : {}),
            ...(data ? { data } : {}),
            trigger: { nodeId: trigger.id, payload: { at: at.toISOString() } },
          },
        },
      );
      log(`Scheduled run ${result.run.id} of flow ${flowId}: ${result.run.status}`);
    } catch (error) {
      log(`Scheduled run of flow ${flowId} failed: ${describe(error)}`);
    }
  }

  async function pollTrigger(
    ownerId: string,
    record: FlowRecord,
    node: FlowNode,
    reader: EventReader,
    cursors: EventCursorStore,
    pollingRevision: string,
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
    const logs = (
      await reader.getLogs({
        address,
        event,
        ...(args ? { args } : {}),
        fromBlock: from,
        toBlock: to,
      })
    ).sort((a, b) =>
      a.blockNumber < b.blockNumber
        ? -1
        : a.blockNumber > b.blockNumber
          ? 1
          : a.logIndex - b.logIndex,
    );
    const shared = typeof engine === "function" ? engine(ownerId) : engine;
    const chain =
      chainFactory && logs.length > 0
        ? await chainFactory.forUser(ownerId, "live", chainId)
        : undefined;
    const data = logs.length > 0 ? dataFactory?.forOwner(ownerId, "live") : undefined;
    let handled: bigint | null = null;
    try {
      for (const entry of logs) {
        if (!(await flows.isCurrentPoll(flowId, pollingRevision))) return;
        try {
          const admission = await triggerClaims.claim({
            flowId,
            nodeId: node.id,
            pollingRevision,
            source: "event",
            at: now(),
            occurrenceKey: `${chainId}:${entry.transactionHash.toLowerCase()}:${entry.logIndex}`,
          });
          if (admission.kind === "duplicate") continue;
          if (admission.kind === "stale") return;
          if (admission.kind !== "claimed")
            throw new Error("An unresolved execution has paused this flow");
          const result = await executeStoredRun(
            { flows, runs },
            {
              ownerId,
              record,
              source: "event",
              claim: { id: admission.id, store: triggerClaims },
              engine: {
                ...shared,
                ...(chain ? { chain } : {}),
                ...(data ? { data } : {}),
                trigger: { nodeId: node.id, payload: eventPayload(entry, chainId) },
                screens: "wait",
              },
            },
          );
          log(
            `Event run ${result.run.id} of flow ${flowId} (${entry.eventName} in block ${entry.blockNumber}): ${result.run.status}`,
          );
        } catch (error) {
          if (error instanceof RunPersistenceError) {
            log(`Event run ${error.record.run.id} of flow ${flowId}: ${describe(error)}`);
            if (error.claimCompleted) continue;
          }
          // Keep the cursor before any unhandled or unresolved occurrence. Completed
          // logs earlier in this block are skipped by their durable claims on the next poll.
          handled = entry.blockNumber - ONE;
          throw error;
        }
      }
      handled = to;
    } finally {
      if (handled !== null && handled >= from)
        await cursors.save(
          { flowId, nodeId: node.id, chainId, lastBlock: handled },
          pollingRevision,
        );
    }
  }

  async function pollWatchTrigger(
    ownerId: string,
    record: FlowRecord,
    node: FlowNode,
    state: WatchStateStore,
    pollingRevision: string,
  ) {
    const flowId = record.flow.id;
    const chainId = flowChainId(record.flow);
    const previous = await state.find(flowId, node.id);
    const reading = await readWatchTrigger(node, chainId, watchSources ?? {});
    if (!crossed(previous?.met, reading.met)) {
      if (previous?.met !== reading.met || previous?.value !== reading.value)
        await state.save(
          { flowId, nodeId: node.id, met: reading.met, value: reading.value },
          pollingRevision,
          previous?.observationId ?? null,
        );
      return;
    }
    const shared = typeof engine === "function" ? engine(ownerId) : engine;
    const chain = chainFactory ? await chainFactory.forUser(ownerId, "live", chainId) : undefined;
    const data = dataFactory?.forOwner(ownerId, "live");
    // Admission and consuming the observation commit together. A process lost after this
    // point leaves an inspectable unresolved claim, never an automatically retried crossing.
    const admission = await triggerClaims.claim({
      flowId,
      nodeId: node.id,
      pollingRevision,
      source: "watch",
      at: now(),
      occurrenceKey: previous?.observationId ?? "initial",
      watch: { expectedObservationId: previous?.observationId ?? null, value: reading.value },
    });
    if (admission.kind !== "claimed") {
      if (admission.kind === "blocked")
        log(`Flow ${flowId} has an unresolved execution; watch crossing paused`);
      return;
    }
    const result = await executeStoredRun(
      { flows, runs },
      {
        ownerId,
        record,
        source: "watch",
        claim: { id: admission.id, store: triggerClaims },
        engine: {
          ...shared,
          ...(chain ? { chain } : {}),
          ...(data ? { data } : {}),
          trigger: { nodeId: node.id, payload: reading.payload },
          screens: "wait",
        },
      },
    );
    log(
      `Watch run ${result.run.id} of flow ${flowId} (${node.type} at ${reading.value}): ${result.run.status}`,
    );
  }

  async function pollWatches(
    ownerId: string,
    record: FlowRecord,
    triggers: FlowNode[],
    pollingRevision: string,
  ) {
    const flowId = record.flow.id;
    if (!watchState) return;
    for (const node of triggers) {
      try {
        await pollWatchTrigger(ownerId, record, node, watchState, pollingRevision);
      } catch (error) {
        const kind = error instanceof WatchConfigError ? "cannot watch" : "watch failed";
        log(`Flow ${flowId} trigger ${node.id} ${kind}: ${describe(error)}`);
      }
    }
  }

  async function pollEvents(
    ownerId: string,
    record: FlowRecord,
    triggers: FlowNode[],
    pollingRevision: string,
  ) {
    const flowId = record.flow.id;
    const reader = eventReaderFor?.(flowChainId(record.flow));
    if (!reader || !eventCursors) {
      log(`Flow ${flowId} watches chain ${flowChainId(record.flow)}, which has no reader`);
      return;
    }
    for (const node of triggers) {
      try {
        await pollTrigger(ownerId, record, node, reader, eventCursors, pollingRevision);
      } catch (error) {
        const kind = error instanceof EventConfigError ? "cannot poll" : "poll failed";
        log(`Flow ${flowId} trigger ${node.id} ${kind}: ${describe(error)}`);
      }
    }
  }

  async function runDue(): Promise<string[]> {
    const started: string[] = [];
    const enabled = await flows.listEnabled();
    for (const { ownerId, record, pollingRevision } of enabled) {
      const flowId = record.flow.id;
      if (inFlight.has(flowId)) continue;
      try {
        const schedules = scheduleTriggers(record.flow.nodes, (node, text) =>
          log(
            `Flow ${flowId} trigger ${node.id} never fires: "${text}" is not an interval such as ${intervalFormats}`,
          ),
        );
        const events = eventTriggers(record.flow.nodes);
        const due: { node: FlowNode; every: number }[] = [];
        for (const { node, every } of schedules) {
          const [stored, claimed] = await Promise.all([
            runs.latestStartedAt(flowId, "schedule", node.id),
            triggerClaims.latestStartedAt(flowId, node.id),
          ]);
          const last = claimed && (!stored || claimed > stored) ? claimed : stored;
          if (!last || now().getTime() - last.getTime() >= every) due.push({ node, every });
        }
        const watches = watchTriggers(record.flow.nodes);
        const pollsEvents = events.length > 0 && eventCursors && eventReaderFor;
        const pollsWatches = watches.length > 0 && watchState;
        if (due.length > 0 || pollsEvents || pollsWatches) {
          started.push(flowId);
          track(flowId, async () => {
            for (const { node, every } of due)
              await runSchedule(ownerId, record, node, every, pollingRevision);
            if (pollsEvents) await pollEvents(ownerId, record, events, pollingRevision);
            if (pollsWatches) await pollWatches(ownerId, record, watches, pollingRevision);
          });
        }
      } catch (error) {
        log(`Flow ${flowId} scheduling failed: ${describe(error)}`);
      }
    }
    return started;
  }

  return {
    async tick(): Promise<string[]> {
      // Reserve the tick before its first await: two timers can overlap while the stores
      // are slow, before any individual flow has been marked in flight.
      if (ticking) return [];
      ticking = true;
      try {
        return await runDue();
      } catch (error) {
        log(`Scheduler tick failed: ${describe(error)}`);
        return [];
      } finally {
        ticking = false;
      }
    },
    async settle(): Promise<void> {
      while (ticking || inFlight.size > 0) await new Promise((resolve) => setTimeout(resolve, 5));
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
