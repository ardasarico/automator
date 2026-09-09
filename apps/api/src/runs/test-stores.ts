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
  type WatchState,
  type WatchStateStore,
  type TriggerClaimStore,
  type TriggerClaimInput,
} from "@automator/db";

export function memoryEventCursors(seed: EventCursor[] = []) {
  const cursors = new Map<string, EventCursor>();
  for (const cursor of seed) cursors.set(`${cursor.flowId}:${cursor.nodeId}`, cursor);
  const store: EventCursorStore = {
    find: async (flowId, nodeId) => cursors.get(`${flowId}:${nodeId}`) ?? null,
    save: async (cursor) => {
      cursors.set(`${cursor.flowId}:${cursor.nodeId}`, { ...cursor });
      return true;
    },
  };
  return { store, cursors };
}

export function memoryWatchState(
  seed: Array<Omit<WatchState, "observationId"> & { observationId?: string }> = [],
) {
  const states = new Map<string, WatchState>();
  for (const state of seed)
    states.set(`${state.flowId}:${state.nodeId}`, {
      ...state,
      observationId: state.observationId ?? crypto.randomUUID(),
    });
  const store: WatchStateStore = {
    find: async (flowId, nodeId) => states.get(`${flowId}:${nodeId}`) ?? null,
    save: async (state, _revision, expectedObservationId) => {
      const key = `${state.flowId}:${state.nodeId}`;
      if ((states.get(key)?.observationId ?? null) !== expectedObservationId) return false;
      states.set(key, { ...state, observationId: crypto.randomUUID() });
      return true;
    },
  };
  return { store, states };
}

export function memoryStores(
  seed: { ownerId: string; flow: FlowDocument; enabled?: boolean }[],
  watch?: ReturnType<typeof memoryWatchState>,
) {
  const timestamp = "2026-09-07T10:00:00.000Z";
  const pollingRevisions = new Map(seed.map((entry) => [entry.flow.id, "0"]));
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
        ? {
            ownerId: record.ownerId,
            record: strip(record),
            pollingRevision: pollingRevisions.get(record.flow.id)!,
          }
        : null;
    },
    listEnabled: async () =>
      [...flowRecords.values()]
        .filter((record) => record.enabled)
        .map((record) => ({
          ownerId: record.ownerId,
          record: strip(record),
          pollingRevision: pollingRevisions.get(record.flow.id)!,
        })),
    isCurrentPoll: async (id: string, revision: string) =>
      Boolean(flowRecords.get(id)?.enabled && pollingRevisions.get(id) === revision),
    setEnabled: async (ownerId: string, id: string, enabled: boolean) => {
      const record = flowRecords.get(id);
      if (!record || record.ownerId !== ownerId) return null;
      const next = { ...record, enabled };
      if (record.enabled !== enabled) pollingRevisions.set(id, crypto.randomUUID());
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
    latestStartedAt: async (flowId, source, triggerNodeId) => {
      const match = runRecords
        .filter(
          (r) =>
            r.run.flowId === flowId &&
            r.source === source &&
            (triggerNodeId === undefined || r.run.trigger?.nodeId === triggerNodeId),
        )
        .sort((a, b) => Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt))[0];
      return match ? new Date(match.run.startedAt) : null;
    },
    stats: async (ownerId, options) => {
      const days = Array.from({ length: options.days }, (_, back) => {
        const at = new Date(Date.now() - (options.days - 1 - back) * 86_400_000);
        return { date: at.toISOString().slice(0, 10), succeeded: 0, failed: 0, waiting: 0 };
      });
      const totals = { succeeded: 0, failed: 0, waiting: 0 };
      for (const record of runRecords) {
        if (record.ownerId !== ownerId) continue;
        if (options.flowId && record.run.flowId !== options.flowId) continue;
        const date = record.run.startedAt.slice(0, 10);
        const day = days.find((entry) => entry.date === date);
        totals[record.run.status] += 1;
        if (day) day[record.run.status] += 1;
      }
      return { days, totals };
    },
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
  const claims = new Map<
    string,
    TriggerClaimInput & {
      id: string;
      status: string;
      record?: FlowRunRecord;
      historySaved?: boolean;
    }
  >();
  const triggerClaims: TriggerClaimStore = {
    claim: async (input) => {
      if (
        !flowRecords.get(input.flowId)?.enabled ||
        pollingRevisions.get(input.flowId) !== input.pollingRevision
      )
        return { kind: "stale" };
      const entries = [...claims.values()].filter(
        (entry) => entry.flowId === input.flowId && entry.nodeId === input.nodeId,
      );
      const duplicate = entries.find(
        (entry) =>
          entry.pollingRevision === input.pollingRevision &&
          entry.source === input.source &&
          entry.occurrenceKey === input.occurrenceKey,
      );
      if (duplicate) return { kind: duplicate.status === "completed" ? "duplicate" : "blocked" };
      if (
        [...claims.values()].some(
          (entry) => entry.flowId === input.flowId && entry.status !== "completed",
        )
      )
        return { kind: "blocked" };
      if (
        input.scheduleEveryMs !== undefined &&
        entries.some(
          (entry) =>
            entry.source === "schedule" &&
            input.at.getTime() - entry.at.getTime() < input.scheduleEveryMs!,
        )
      )
        return { kind: "duplicate" };
      if (input.watch) {
        if (!watch)
          throw new Error("Watch test fixture needs its watch state bound to memoryStores");
        const key = `${input.flowId}:${input.nodeId}`;
        const previous = watch.states.get(key);
        if ((previous?.observationId ?? null) !== input.watch.expectedObservationId)
          return { kind: "stale" };
        if (previous?.met) return { kind: "duplicate" };
        watch.states.set(key, {
          flowId: input.flowId,
          nodeId: input.nodeId,
          met: true,
          value: input.watch.value,
          observationId: crypto.randomUUID(),
        });
      }
      const id = crypto.randomUUID();
      claims.set(id, { ...input, id, status: "running" });
      return { kind: "claimed", id };
    },
    listIssues: async () => [],
    latestStartedAt: async (flowId, nodeId) =>
      [...claims.values()]
        .filter(
          (entry) =>
            entry.flowId === flowId && entry.nodeId === nodeId && entry.source === "schedule",
        )
        .sort((a, b) => b.at.getTime() - a.at.getTime())[0]?.at ?? null,
    complete: async (id, record, historySaved) => {
      const claim = claims.get(id)!;
      Object.assign(claim, { status: "completed", record, historySaved });
    },
    markUncertain: async (id) => {
      claims.get(id)!.status = "uncertain";
    },
  };
  return { flows, runs, triggerClaims, claims, runRecords, flowRecords, pollingRevisions };
}
