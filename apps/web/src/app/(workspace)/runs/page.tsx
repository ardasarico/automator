import type { Metadata } from "next";
import { RunsList } from "./runs-list";
import type { RunsSearchParams } from "./run-links";

export const metadata: Metadata = { title: "Runs · Automator" };

export default function RunsPage({ searchParams }: { searchParams: Promise<RunsSearchParams> }) {
  return <RunsList searchParams={searchParams} />;
}
