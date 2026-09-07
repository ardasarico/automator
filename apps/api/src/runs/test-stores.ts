import type {
  FlowDocument,
  FlowRecord,
  FlowRun,
  FlowRunRecord,
  FlowRunSource,
} from "@automator/contracts";
import type { FlowStore, RunStore } from "@automator/db";

/** In-memory flow and run stores with the same owner scoping as the SQL ones, for route tests. */
export function memoryStores(seed: { ownerId: string; flow: FlowDocument; enabled?: boolean }[]) {
  const timestamp = "2026-09-07T10:00:00.000Z";
  const flowRecords = new Map<string, FlowRecord & { ownerId: string }>();
  for (const entry of seed)
    flowRecords.set(entry.flow.id, {
      ownerId: entry.ownerId,
      flow: entry.flow,
      createdAt: timestamp,
      updatedAt: timestamp,
      enabled: entry.enabled ?? false,
      webhookToken: `token-${entry.flow.id}`,
    });
  const runRecords: Array<FlowRunRecord & { ownerId: string }> = [];
  const strip = ({ ownerId: _owner, ...record }: FlowRecord & { ownerId: string }) => record;
  const flows = {
    find: async (ownerId: string, id: string) => {
      const record = flowRecords.get(id);
      return record && record.ownerId === ownerId ? strip(record) : null;
    },
    findForWebhook: async (id: string, token: string) => {
      const record = flowRecords.get(id);
      return record && record.enabled && record.webhookToken === token
        ? { ownerId: record.ownerId, record: strip(record) }
        : null;
    },
    listEnabled: async () =>
      [...flowRecords.values()]
        .filter((record) => record.enabled)
        .map((record) => ({ ownerId: record.ownerId, record: strip(record) })),
    setEnabled: async (ownerId: string, id: string, enabled: boolean) => {
      const record = flowRecords.get(id);
      if (!record || record.ownerId !== ownerId) return null;
      const next = { ...record, enabled };
      flowRecords.set(id, next);
      return strip(next);
    },
  } as unknown as FlowStore;
  const runs: RunStore = {
    create: async (ownerId, flow, run: FlowRun, source: FlowRunSource = "manual") => {
      const record = { ownerId, run, flowName: flow.name, source, document: flow };
      runRecords.push(record);
      return { run, flowName: flow.name, source, document: flow };
    },
    latestStartedAt: async (flowId, source) => {
      const match = runRecords
        .filter((r) => r.run.flowId === flowId && r.source === source)
        .sort((a, b) => Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt))[0];
      return match ? new Date(match.run.startedAt) : null;
    },
    list: async (ownerId, options = {}) =>
      runRecords
        .filter(
          (r) => r.ownerId === ownerId && (!options.flowId || r.run.flowId === options.flowId),
        )
        .map(({ run, flowName, source }) => ({
          id: run.id,
          flowId: run.flowId,
          flowName,
          status: run.status,
          source,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
        })),
    find: async (ownerId, id) => {
      const record = runRecords.find((r) => r.ownerId === ownerId && r.run.id === id);
      return record
        ? {
            run: record.run,
            flowName: record.flowName,
            source: record.source,
            document: record.document,
          }
        : null;
    },
  };
  return { flows, runs, runRecords, flowRecords };
}
