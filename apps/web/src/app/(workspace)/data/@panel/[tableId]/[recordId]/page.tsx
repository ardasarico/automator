import { getDataRecord } from "../../../../../../data/server";
import { parseRecordQuery, recordsHref, type SearchParams } from "../../../[tableId]/record-query";
import { loadTable } from "../../../[tableId]/records-view";
import { RecordPanel } from "../../../record-panel";

type Props = {
  params: Promise<{ tableId: string; recordId: string }>;
  searchParams: Promise<SearchParams>;
};

/**
 * One record beside the grid. `new` is the create state rather than a record id, so adding and
 * editing are the same surface. A record that is already gone renders nothing: the grid behind is
 * still correct, and the reader is not sent to an error page for a stale link.
 */
export default async function RecordPanelPage({ params, searchParams }: Props) {
  const { tableId, recordId } = await params;
  const table = await loadTable(tableId);
  if (!table) return null;
  const closeHref = recordsHref(tableId, parseRecordQuery(await searchParams, table.columns));
  if (recordId === "new") return <RecordPanel table={table} closeHref={closeHref} />;
  const record = await getDataRecord(tableId, recordId);
  if (!record) return null;
  return <RecordPanel table={table} record={record} closeHref={closeHref} />;
}
