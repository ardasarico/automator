import "server-only";
import { ApiRequestError, request } from "@automator/api-client/server";
import {
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
export async function listDataRecords(
  tableId: string,
  options: { cursor?: string; limit?: number } = {},
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
