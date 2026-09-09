import "server-only";
import { ApiRequestError, request } from "@automator/api-client/server";
import {
  getDataRecordContract,
  getDataTableContract,
  listDataRecordsContract,
  listDataTablesContract,
  type DataRecordList,
  type DataTable,
} from "@automator/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "../auth/server";

export class DataApiError extends Error {
  constructor(public readonly status: number) {
    super(`Data request failed with ${status}`);
    this.name = "DataApiError";
  }
}

async function sessionToken() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  return token;
}

function unavailable(error: unknown): never {
  throw error instanceof ApiRequestError ? new DataApiError(503) : error;
}

export async function listDataTables(): Promise<readonly DataTable[]> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, listDataTablesContract, { token }).catch(
    unavailable,
  );
  if (result.status === 401) redirect("/login");
  if (result.status !== 200) throw new DataApiError(result.status);
  return result.data.tables;
}

/** `null` when the table is gone, so the page can call `notFound()`. */
export async function getDataTable(id: string): Promise<DataTable | null> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, getDataTableContract, {
    token,
    params: { id },
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  if (result.status === 404) return null;
  if (result.status !== 200) throw new DataApiError(result.status);
  return result.data;
}

/**
 * `null` when the API is unreachable or unavailable, so the page can render its retry panel next
 * to the table it already loaded. Every other failure throws, and so does a broken response body.
 */
/** `null` when the record is gone, so the panel can say so instead of failing the page. */
export async function getDataRecord(tableId: string, recordId: string) {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, getDataRecordContract, {
    token,
    params: { id: tableId, recordId },
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  if (result.status === 404) return null;
  if (result.status !== 200) throw new DataApiError(result.status);
  return result.data;
}

export type DataRecordQueryOptions = {
  cursor?: string;
  limit?: number;
  /** The filters as the API spells them: a JSON array of column, operator and value. */
  filters?: readonly { column: string; operator: string; value: string }[];
  sort?: { column: string; direction: "asc" | "desc" };
  search?: string;
};

export async function listDataRecords(
  tableId: string,
  options: DataRecordQueryOptions = {},
): Promise<DataRecordList | null> {
  const token = await sessionToken();
  let result;
  try {
    result = await request(process.env.API_URL, listDataRecordsContract, {
      token,
      params: { id: tableId },
      query: {
        cursor: options.cursor,
        limit: options.limit === undefined ? undefined : String(options.limit),
        filters:
          options.filters && options.filters.length > 0
            ? JSON.stringify(options.filters)
            : undefined,
        sort: options.sort ? `${options.sort.column}:${options.sort.direction}` : undefined,
        q: options.search,
      },
      timeoutMs: 15_000,
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return null;
    throw error;
  }
  if (result.status === 401) redirect("/login");
  if (result.status === 503) return null;
  if (result.status !== 200) throw new DataApiError(result.status);
  return result.data;
}
