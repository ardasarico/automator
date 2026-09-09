import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { DataApiError, getDataTable, listDataRecords } from "../../../../data/server";
import { RecordBrowser } from "./record-browser";
import { isNarrowed, parseRecordQuery, recordsHref, type SearchParams } from "./record-query";

export const loadTable = cache((id: string) => getDataTable(id));

/** A plain page; a narrowed view answers the store's whole cap at once instead of paging. */
const pageSize = 25;
const matchLimit = 100;

/**
 * The records of one table under the query its URL carries. Both `/data/<table>` and
 * `/data/<table>/<record>` render this — the second is the same view with the record open beside
 * it in the panel slot — so the grid does not reload when a record is opened or closed.
 */
export async function RecordsView({
  tableId,
  searchParams,
}: {
  tableId: string;
  searchParams: Promise<SearchParams>;
}) {
  const table = await loadTable(tableId);
  if (!table) notFound();
  const query = parseRecordQuery(await searchParams, table.columns);
  const narrowed = isNarrowed(query);
  const page = await listDataRecords(tableId, {
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: narrowed ? matchLimit : pageSize,
    ...(query.filters.length > 0 ? { filters: query.filters } : {}),
    ...(query.sort ? { sort: query.sort } : {}),
    ...(query.search === undefined ? {} : { search: query.search }),
  }).catch((error: unknown) => {
    // A cursor the API no longer accepts sends the reader back to the first page.
    if (
      query.cursor &&
      error instanceof DataApiError &&
      (error.status === 400 || error.status === 422)
    )
      redirect(recordsHref(tableId, { ...query, cursor: undefined }));
    throw error;
  });

  return (
    <RecordBrowser
      table={table}
      records={page === null ? null : page.records}
      query={query}
      truncated={page?.truncated}
      nextHref={
        page?.nextCursor ? recordsHref(tableId, { ...query, cursor: page.nextCursor }) : undefined
      }
      latestHref={query.cursor ? recordsHref(tableId, { ...query, cursor: undefined }) : undefined}
      retryHref={recordsHref(tableId)}
      retryCursor={query.cursor}
    />
  );
}
