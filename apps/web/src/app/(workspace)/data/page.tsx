import type { Metadata } from "next";
import { WorkspacePage } from "../../../components/workspace-page";
import { listDataTables } from "../../../data/server";
import { DataBrowser } from "./data-browser";

export const metadata: Metadata = { title: "Data · Automator" };

export default async function DataPage() {
  const tables = await listDataTables();
  return (
    <WorkspacePage>
      <DataBrowser tables={tables} />
    </WorkspacePage>
  );
}
