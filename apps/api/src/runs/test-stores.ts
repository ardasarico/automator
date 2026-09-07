import {
  runListDefaultLimit,
  type FlowDocument,
  type FlowRecord,
  type FlowRun,
  type FlowRunRecord,
  type FlowRunSource,
} from "@automator/contracts";
import {
  RunCursorError,
  type EventCursor,
  type EventCursorStore,
  type FlowStore,
  type RunStore,
} from "@automator/db";

/** An in-memory cursor store keyed like the SQL one, for scheduler tests. */
export function memoryEventCursors(seed: EventCursor[] = []) {
  const cursors = new Map<string, EventCursor>();
  for (const cursor of seed) cursors.set(`${cursor.flowId}:${cursor.nodeId}`, cursor);
  const store: EventCursorStore = {
    find: async (flowId, nodeId) => cursors.get(`${flowId}:${nodeId}`) ?? null,
    save: async (cursor) => {
      cursors.set(`${cursor.flowId}:${cursor.nodeId}`, { ...cursor });
    },
  };
  return { store, cursors };
}

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
    // Same paging semantics as the SQL store; the cursor is simply the last run's id.
    list: async (ownerId, options = {}) => {
      const limit = options.limit ?? runListDefaultLimit;
      const ordered = runRecords
        .filter(
          (r) => r.ownerId === ownerId && (!options.flowId || r.run.flowId === options.flowId),
        )
        .sort(
          (a, b) =>
            Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt) ||
            a.run.id.localeCompare(b.run.id),
        );
      let start = 0;
      if (options.cursor !== undefined) {
        const index = ordered.findIndex((r) => r.run.id === options.cursor);
        if (index < 0) throw new RunCursorError();
        start = index + 1;
      }
      const page = ordered.slice(start, start + limit);
      const runs = page.map(({ run, flowName, source }) => ({
        id: run.id,
        flowId: run.flowId,
        flowName,
        status: run.status,
        source,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      }));
      const last = page.at(-1);
      return start + limit < ordered.length && last ? { runs, nextCursor: last.run.id } : { runs };
    },
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
    listRecords: async (ownerId, limit) =>
      runRecords
        .filter((r) => r.ownerId === ownerId)
        .sort((a, b) => Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt))
        .slice(0, limit)
        .map(({ run, flowName, source, document }) => ({ run, flowName, source, document })),
  };
  return { flows, runs, runRecords, flowRecords };
}
