import type { ConditionOperator, DataColumn } from "@automator/contracts";

/**
 * The grid's filter, sort and search live in the URL, so the server renders what the reader sees,
 * a narrowed view can be linked, and Back undoes a filter. This module is the only place that
 * knows how they are spelled.
 */
export type RecordFilter = { column: string; operator: ConditionOperator; value: string };
type RecordSort = { column: string; direction: "asc" | "desc" };
export type RecordQuery = {
  cursor?: string;
  filters: readonly RecordFilter[];
  sort?: RecordSort;
  search?: string;
};

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single || undefined;
}

/**
 * Reads the query a URL carries. Anything unreadable is dropped rather than refused: a stale link
 * should still open the table, showing everything, instead of an error page.
 */
export function parseRecordQuery(
  params: SearchParams,
  columns: readonly DataColumn[],
): RecordQuery {
  const known = new Set(columns.map((column) => column.id));
  const filters: RecordFilter[] = [];
  const raw = first(params.filters);
  if (raw)
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed))
        for (const entry of parsed) {
          if (entry === null || typeof entry !== "object") continue;
          const { column, operator, value } = entry as Record<string, unknown>;
          if (typeof column !== "string" || typeof operator !== "string") continue;
          if (!known.has(column)) continue;
          filters.push({
            column,
            operator: operator as ConditionOperator,
            value: typeof value === "string" ? value : "",
          });
        }
    } catch {
      /* A malformed filter is no filter. */
    }

  let sort: RecordSort | undefined;
  const rawSort = first(params.sort);
  if (rawSort) {
    const separator = rawSort.lastIndexOf(":");
    const column = separator > 0 ? rawSort.slice(0, separator) : "";
    const direction = separator > 0 ? rawSort.slice(separator + 1) : "";
    if (known.has(column) && (direction === "asc" || direction === "desc"))
      sort = { column, direction };
  }

  const search = first(params.q)?.trim();
  return {
    ...(first(params.cursor) === undefined ? {} : { cursor: first(params.cursor) }),
    filters,
    ...(sort ? { sort } : {}),
    ...(search ? { search } : {}),
  };
}

/** True when the list is narrowed, which is what decides between cursor paging and one page. */
export function isNarrowed(query: RecordQuery): boolean {
  return query.filters.length > 0 || query.sort !== undefined || query.search !== undefined;
}

/** The URL for a table under a query. Empty parts are left out, so a plain table has a plain URL. */
export function recordsHref(tableId: string, query: Partial<RecordQuery> = {}): string {
  const path = `/data/${encodeURIComponent(tableId)}`;
  const params = new URLSearchParams();
  if (query.filters && query.filters.length > 0)
    params.set("filters", JSON.stringify(query.filters));
  if (query.sort) params.set("sort", `${query.sort.column}:${query.sort.direction}`);
  if (query.search) params.set("q", query.search);
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** The URL for one record, which is the same query with the record open beside it. */
export function recordHref(tableId: string, recordId: string, query: Partial<RecordQuery>): string {
  const base = recordsHref(tableId, query);
  const [path, search] = base.split("?");
  const opened = `${path}/${encodeURIComponent(recordId)}`;
  return search ? `${opened}?${search}` : opened;
}
