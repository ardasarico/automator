import { RiFlowChart } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../../../../../components/unavailable-panel";
import { WorkspaceBreadcrumbs } from "../../../../../components/workspace-breadcrumbs";

export const metadata: Metadata = { title: "Flow · Automator" };

/** The canonical flow URL. The builder canvas will replace this panel in place. */
export default function FlowPage() {
  return (
    <>
      <div className="flex-none px-4 pt-2">
        <WorkspaceBreadcrumbs parents={[{ label: "Flows", href: "/flows" }]} current="Flow" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <UnavailablePanel
          icon={<RiFlowChart />}
          title="The flow builder is not ready yet"
          description="Building, simulating and running a flow on the canvas is still in progress."
        />
      </div>
    </>
  );
}
