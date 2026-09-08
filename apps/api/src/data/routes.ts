import {
  createDataRecordContract,
  createDataTableContract,
  deleteDataRecordContract,
  deleteDataTableContract,
  getDataTableContract,
  isDataRecordInput,
  isDataTableInput,
  listDataRecordsContract,
  listDataTablesContract,
  normalizeRecordValues,
  parseDataRecordListLimit,
  updateDataRecordContract,
  updateDataTableContract,
  validateRecordValues,
  Type,
  type ApiErrorCode,
  type DataTable,
  type DataTableUsage,
} from "@automator/contracts";
import {
  DataColumnDuplicateError,
  DataColumnTypeLockedError,
  DataLimitError,
  DataRecordCursorError,
  DataTableOwnerMissingError,
  type DataRecordStore,
  type DataTableStore,
  type FlowStore,
} from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";

export interface DataDependencies {
  dataTables: DataTableStore;
  dataRecords: DataRecordStore;
  /** Only read, to name the flows that still reference a table the owner wants to delete. */
  flows: FlowStore;
  identity: IdentityProvider | undefined;
  callsPerMinute?: number;
  now?: () => number;
}

type Failure = { status: 404 | 409 | 422; error: ApiErrorCode };

/**
 * Maps a store guard to its response and rethrows everything else. A cap is a conflict the caller
 * can resolve, a malformed schema or cursor is unprocessable, and a vanished owner is not found.
 */
function failureFor(error: unknown, scope: "table" | "record"): Failure {
  const code: ApiErrorCode = scope === "table" ? "invalid_table" : "invalid_record";
  if (error instanceof DataColumnDuplicateError) return { status: 422, error: "invalid_table" };
  if (error instanceof DataRecordCursorError) return { status: 422, error: "invalid_record" };
  if (error instanceof DataColumnTypeLockedError) return { status: 409, error: "invalid_table" };
  if (error instanceof DataLimitError) return { status: 409, error: code };
  if (error instanceof DataTableOwnerMissingError) return { status: 404, error: "not_found" };
  throw error;
}

/** The owner's flows whose documents still point a `data.*` node at this table. */
async function flowsUsing(
  flows: FlowStore,
  ownerId: string,
  tableId: string,
): Promise<DataTableUsage[]> {
  const used: DataTableUsage[] = [];
  for (const summary of await flows.list(ownerId)) {
    const record = await flows.find(ownerId, summary.id);
    const nodes = record?.flow.nodes ?? [];
    if (nodes.some((node) => node.type.startsWith("data.") && node.config.tableId === tableId))
      used.push({ id: summary.id, name: summary.name });
  }
  return used;
}

export function createDataRoutes({
  dataTables,
  dataRecords,
  flows,
  identity,
  callsPerMinute = defaultRateLimits.data,
  now = Date.now,
}: DataDependencies) {
  /* Writes are budgeted per owner; reads stay unlimited, as in the flow and secret sections. */
  const limiter = createRateLimiter(callsPerMinute, now);

  return new Elysia({ name: "data" })
    .use(createAuthGuard(identity))
    .get(
      listDataTablesContract.path,
      async ({ claims }) => ({ tables: await dataTables.list(claims.id) }),
      { response: listDataTablesContract.response },
    )
    .post(
      createDataTableContract.path,
      async ({ claims, body, status }) => {
        // Checked here rather than by the route schema so a fixable table answers 422, not 400.
        if (!isDataTableInput(body)) return status(422, { error: "invalid_table" });
        try {
          return status(201, await dataTables.create(claims.id, body));
        } catch (error) {
          const failure = failureFor(error, "table");
          return status(failure.status, { error: failure.error });
        }
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        body: Type.Unknown(),
        response: createDataTableContract.response,
      },
    )
    .get(
      getDataTableContract.path,
      async ({ claims, params, status }) => {
        const table = await dataTables.get(claims.id, params.id);
        return table ?? status(404, { error: "not_found" });
      },
      { params: getDataTableContract.params, response: getDataTableContract.response },
    )
    .patch(
      updateDataTableContract.path,
      async ({ claims, params, body, status }) => {
        if (!isDataTableInput(body)) return status(422, { error: "invalid_table" });
        try {
          const table = await dataTables.update(claims.id, params.id, body);
          return table ?? status(404, { error: "not_found" });
        } catch (error) {
          const failure = failureFor(error, "table");
          return status(failure.status, { error: failure.error });
        }
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: updateDataTableContract.params,
        body: Type.Unknown(),
        response: updateDataTableContract.response,
      },
    )
    .delete(
      deleteDataTableContract.path,
      async ({ claims, params, query, status }) => {
        if (!(await dataTables.get(claims.id, params.id)))
          return status(404, { error: "not_found" });
        const usedBy = await flowsUsing(flows, claims.id, params.id);
        // A table flows still read from is only deleted when the caller confirms it knows.
        if (usedBy.length > 0 && !query.confirm) return { deleted: false, usedBy };
        const deleted = await dataTables.remove(claims.id, params.id);
        return deleted ? { deleted, usedBy } : status(404, { error: "not_found" });
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: deleteDataTableContract.params,
        query: deleteDataTableContract.query,
        response: deleteDataTableContract.response,
      },
    )
    .get(
      listDataRecordsContract.path,
      async ({ claims, params, query, status }) => {
        if (!(await dataTables.get(claims.id, params.id)))
          return status(404, { error: "not_found" });
        const limit = parseDataRecordListLimit(query.limit);
        if (limit === null) return status(400, { error: "invalid_request" });
        try {
          return await dataRecords.list(claims.id, params.id, {
            ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
            ...(limit === undefined ? {} : { limit }),
          });
        } catch (error) {
          const failure = failureFor(error, "record");
          return status(failure.status, { error: failure.error });
        }
      },
      {
        params: listDataRecordsContract.params,
        query: listDataRecordsContract.query,
        response: listDataRecordsContract.response,
      },
    )
    .post(
      createDataRecordContract.path,
      async ({ claims, params, body, status }) => {
        const table = await dataTables.get(claims.id, params.id);
        if (!table) return status(404, { error: "not_found" });
        const values = readValues(table, body);
        if (!values) return status(422, { error: "invalid_record" });
        try {
          const record = await dataRecords.create(claims.id, params.id, values);
          return record ? status(201, record) : status(404, { error: "not_found" });
        } catch (error) {
          const failure = failureFor(error, "record");
          return status(failure.status, { error: failure.error });
        }
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: createDataRecordContract.params,
        body: Type.Unknown(),
        response: createDataRecordContract.response,
      },
    )
    .patch(
      updateDataRecordContract.path,
      async ({ claims, params, body, status }) => {
        const table = await dataTables.get(claims.id, params.id);
        if (!table) return status(404, { error: "not_found" });
        const values = readValues(table, body);
        if (!values) return status(422, { error: "invalid_record" });
        try {
          const record = await dataRecords.update(claims.id, params.id, params.recordId, values);
          return record ?? status(404, { error: "not_found" });
        } catch (error) {
          const failure = failureFor(error, "record");
          return status(failure.status, { error: failure.error });
        }
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: updateDataRecordContract.params,
        body: Type.Unknown(),
        response: updateDataRecordContract.response,
      },
    )
    .delete(
      deleteDataRecordContract.path,
      async ({ claims, params, status }) => {
        if (!(await dataTables.get(claims.id, params.id)))
          return status(404, { error: "not_found" });
        const record = await dataRecords.remove(claims.id, params.id, params.recordId);
        return record ? { id: record.id } : status(404, { error: "not_found" });
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: deleteDataRecordContract.params,
        response: deleteDataRecordContract.response,
      },
    );
}

/**
 * The values to store for a record body, or `null` when the body is not a record input or breaks
 * the table's current columns — a value for a column the table does not have included.
 */
function readValues(table: DataTable, body: unknown): Record<string, unknown> | null {
  if (!isDataRecordInput(body)) return null;
  if (validateRecordValues(table.columns, body.values).length > 0) return null;
  return normalizeRecordValues(table.columns, body.values);
}
