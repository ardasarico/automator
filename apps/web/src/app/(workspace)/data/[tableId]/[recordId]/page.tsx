import type { Metadata } from "next";
import { RecordsView, loadTable } from "../records-view";
import type { SearchParams } from "../record-query";

type Props = {
  params: Promise<{ tableId: string; recordId: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const table = await loadTable((await params).tableId);
  return { title: table ? `${table.name} · Data · Automator` : "Data · Automator" };
}

/** The same grid, with the record open beside it in the `panel` slot. */
export default async function DataRecordPage({ params, searchParams }: Props) {
  return <RecordsView tableId={(await params).tableId} searchParams={searchParams} />;
}
