import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { WorkspacePage } from "../../../../components/workspace-page";
import { DataApiError, getDataTable, listDataRecords } from "../../../../data/server";
import { RecordBrowser } from "./record-browser";

const loadTable = cache((id: string) => getDataTable(id));

const pageSize = 25;

type Props = {
  params: Promise<{ tableId: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single || undefined;
}

function recordsHref(tableId: string, cursor: string | undefined): string {
  const path = `/data/${encodeURIComponent(tableId)}`;
  return cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const table = await loadTable((await params).tableId);
  return { title: table ? `${table.name} · Data · Automator` : "Data · Automator" };
}

export default async function DataTablePage({ params, searchParams }: Props) {
  const { tableId } = await params;
  const cursor = first((await searchParams).cursor);
  const table = await loadTable(tableId);
  if (!table) notFound();
  const page = await listDataRecords(tableId, { cursor, limit: pageSize }).catch(
    (error: unknown) => {
      // A cursor the API no longer accepts sends the reader back to the first page.
      if (cursor && error instanceof DataApiError && (error.status === 400 || error.status === 422))
        redirect(recordsHref(tableId, undefined));
      throw error;
    },
  );
  return (
    <WorkspacePage>
      <RecordBrowser
        table={table}
        records={page === null ? null : page.records}
        nextHref={page?.nextCursor ? recordsHref(tableId, page.nextCursor) : undefined}
        latestHref={cursor ? recordsHref(tableId, undefined) : undefined}
        retryHref={recordsHref(tableId, undefined)}
        retryCursor={cursor}
      />
    </WorkspacePage>
  );
}
