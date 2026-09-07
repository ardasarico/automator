import type { FlowNode } from "@automator/contracts";
import type { FlowStore, RunStore } from "@automator/db";
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

/**
 * Runs enabled flows with a schedule trigger on their interval, in process: each tick lists
 * the enabled flows and starts every flow whose newest scheduled run is older than its
 * shortest `every`. A flow still running from the last tick is skipped, so runs never
 * overlap, and one flow's failure never stops the tick. Time is injectable for tests.
 */
export function createScheduler({
  flows,
  runs,
  engine,
  chainFactory,
  tickMs = 30_000,
  now = () => new Date(),
  log = () => {},
}: SchedulerDependencies) {
  const inFlight = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  async function runDue(): Promise<string[]> {
    const started: string[] = [];
    const enabled = await flows.listEnabled();
    for (const { ownerId, record } of enabled) {
      const flowId = record.flow.id;
      const triggers = scheduleTriggers(record.flow.nodes);
      if (triggers.length === 0 || inFlight.has(flowId)) continue;
      const every = Math.min(...triggers.map((trigger) => trigger.every));
      const last = await runs.latestStartedAt(flowId, "schedule");
      if (last && now().getTime() - last.getTime() < every) continue;
      const trigger = triggers[0]!.node;
      inFlight.add(flowId);
      started.push(flowId);
      const shared = typeof engine === "function" ? engine(ownerId) : engine;
      const chain = chainFactory ? await chainFactory.forUser(ownerId, "live") : undefined;
      void executeStoredRun(
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
      )
        .then((result) =>
          log(`Scheduled run ${result.run.id} of flow ${flowId}: ${result.run.status}`),
        )
        .catch((error: unknown) =>
          log(
            `Scheduled run of flow ${flowId} failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        )
        .finally(() => inFlight.delete(flowId));
    }
    return started;
  }

  return {
    /** One pass over the enabled flows; resolves with the ids it started. */
    async tick(): Promise<string[]> {
      try {
        return await runDue();
      } catch (error) {
        log(`Scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`);
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
