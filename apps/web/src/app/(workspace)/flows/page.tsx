import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FlowBrowser } from "./flow-browser";

export const metadata: Metadata = { title: "Flows · Automator" };

export default async function FlowsPage() {
  const view = (await cookies()).get("flows_view")?.value;
  return <FlowBrowser flows={[]} initialView={view === "table" ? "table" : "grid"} />;
}
