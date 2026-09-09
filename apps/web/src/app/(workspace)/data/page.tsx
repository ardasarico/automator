import type { Metadata } from "next";
import { DataBrowser } from "./data-browser";
import { loadTables } from "./load-tables";

export const metadata: Metadata = { title: "Data · Automator" };

export default async function DataPage() {
  return <DataBrowser tables={await loadTables()} />;
}
