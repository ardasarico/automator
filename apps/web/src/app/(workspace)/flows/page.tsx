import type { Metadata } from "next";
import { listFlows } from "../../../flows/server";
import { FLOWS_VIEW_COOKIE } from "../../../lib/preferences";
import { readPreferenceCookie } from "../../../lib/preferences.server";
import { FlowBrowser } from "./flow-browser";
import { FlowExamples } from "./flow-examples";

export const metadata: Metadata = { title: "Flows · Automator" };

export default async function FlowsPage() {
  const [flows, view] = await Promise.all([listFlows(), readPreferenceCookie(FLOWS_VIEW_COOKIE)]);
  return (
    <FlowBrowser
      flows={flows}
      initialView={view === "table" ? "table" : "grid"}
      examples={<FlowExamples />}
    />
  );
}
