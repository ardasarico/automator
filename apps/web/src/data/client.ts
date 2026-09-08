import {
  createDataRecordContract,
  createDataTableContract,
  deleteDataRecordContract,
  deleteDataTableContract,
  listDataRecordsContract,
  listDataTablesContract,
  parseResponse,
  updateDataRecordContract,
  updateDataTableContract,
  type DataRecord,
  type DataRecordInput,
  type DataRecordList,
  type DataRecordPatch,
  type DataTable,
  type DataTableInput,
  type DeleteDataTableResponse,
} from "@automator/contracts";

export class DataRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DataRequestError";
  }
}

const tablesPath = "/api/data/tables";
const tablePath = (id: string) => `${tablesPath}/${encodeURIComponent(id)}`;
const recordsPath = (tableId: string) => `${tablePath(tableId)}/records`;
const recordPath = (tableId: string, recordId: string) =>
  `${recordsPath(tableId)}/${encodeURIComponent(recordId)}`;

function withQuery(path: string, query: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) search.set(key, value);
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

/** One proxy call: the status and the parsed body, left for the caller's contract to check. */
async function call(
  path: string,
  method: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  if (!token) throw new DataRequestError("unauthorized");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  try {
    return { status: response.status, data: await response.json() };
  } catch {
    // A proxy or framework error page is not JSON; report it like any other outage.
    throw new DataRequestError("unavailable");
  }
}

export async function listDataTablesRequest(token: string | null): Promise<readonly DataTable[]> {
  const { status, data } = await call(tablesPath, listDataTablesContract.method, token);
  const result = parseResponse(listDataTablesContract, status, data);
  if (result.status !== 200) throw new DataRequestError(result.data.error);
  return result.data.tables;
}

export async function createDataTableRequest(
  token: string | null,
  input: DataTableInput,
): Promise<DataTable> {
  const { status, data } = await call(tablesPath, createDataTableContract.method, token, input);
  const result = parseResponse(createDataTableContract, status, data);
  if (result.status !== 201) throw new DataRequestError(result.data.error);
  return result.data;
}

export async function updateDataTableRequest(
  id: string,
  token: string | null,
  input: DataTableInput,
): Promise<DataTable> {
  const { status, data } = await call(tablePath(id), updateDataTableContract.method, token, input);
  const result = parseResponse(updateDataTableContract, status, data);
  if (result.status !== 200) throw new DataRequestError(result.data.error);
  return result.data;
}

/**
 * Without `confirm` the API refuses a table that flows still reference and answers
 * `{deleted: false, usedBy}`; repeat the call with `confirm` to delete it anyway.
 */
export async function deleteDataTableRequest(
  id: string,
  token: string | null,
  options: { confirm?: boolean } = {},
): Promise<DeleteDataTableResponse> {
  const path = withQuery(tablePath(id), { confirm: options.confirm ? "1" : undefined });
  const { status, data } = await call(path, deleteDataTableContract.method, token);
  const result = parseResponse(deleteDataTableContract, status, data);
  if (result.status !== 200) throw new DataRequestError(result.data.error);
  return result.data;
}

export async function listDataRecordsRequest(
  tableId: string,
  token: string | null,
  options: { cursor?: string; limit?: number } = {},
): Promise<DataRecordList> {
  const path = withQuery(recordsPath(tableId), {
    cursor: options.cursor,
    limit: options.limit === undefined ? undefined : String(options.limit),
  });
  const { status, data } = await call(path, listDataRecordsContract.method, token);
  const result = parseResponse(listDataRecordsContract, status, data);
  if (result.status !== 200) throw new DataRequestError(result.data.error);
  return result.data;
}

export async function createDataRecordRequest(
  tableId: string,
  token: string | null,
  input: DataRecordInput,
): Promise<DataRecord> {
  const { status, data } = await call(
    recordsPath(tableId),
    createDataRecordContract.method,
    token,
    input,
  );
  const result = parseResponse(createDataRecordContract, status, data);
  if (result.status !== 201) throw new DataRequestError(result.data.error);
  return result.data;
}

/** `merge` changes only the named columns; without it the values replace the whole record. */
export async function updateDataRecordRequest(
  tableId: string,
  recordId: string,
  token: string | null,
  input: DataRecordPatch,
): Promise<DataRecord> {
  const { status, data } = await call(
    recordPath(tableId, recordId),
    updateDataRecordContract.method,
    token,
    input,
  );
  const result = parseResponse(updateDataRecordContract, status, data);
  if (result.status !== 200) throw new DataRequestError(result.data.error);
  return result.data;
}

export async function deleteDataRecordRequest(
  tableId: string,
  recordId: string,
  token: string | null,
): Promise<{ id: string }> {
  const { status, data } = await call(
    recordPath(tableId, recordId),
    deleteDataRecordContract.method,
    token,
  );
  const result = parseResponse(deleteDataRecordContract, status, data);
  if (result.status !== 200) throw new DataRequestError(result.data.error);
  return result.data;
}
