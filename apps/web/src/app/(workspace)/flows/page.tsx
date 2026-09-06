import type { FlowSummary } from "@automator/contracts";
import type { Metadata } from "next";
import { FLOWS_VIEW_COOKIE } from "../../../lib/preferences";
import { readPreferenceCookie } from "../../../lib/preferences.server";
import { FlowBrowser } from "./flow-browser";
import { FlowExamples } from "./flow-examples";

export const metadata: Metadata = { title: "Flows · Automator" };

// Flow persistence and its API are not implemented, so the workspace has no flows to list.
const flows: readonly FlowSummary[] = [];

export default async function FlowsPage() {
  const view = await readPreferenceCookie(FLOWS_VIEW_COOKIE);
  return (
    <FlowBrowser
      flows={flows}
      initialView={view === "table" ? "table" : "grid"}
      examples={<FlowExamples />}
    />
  );
}
