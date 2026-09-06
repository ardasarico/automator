import { RiAddLine } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../../../components/unavailable-panel";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";
import { flowExamples } from "../marketplace/examples";

export const metadata: Metadata = { title: "New flow · Automator" };

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string | string[] }>;
}) {
  const requested = (await searchParams).example;
  const slug = Array.isArray(requested) ? requested[0] : requested;
  const example = slug ? flowExamples.find((item) => item.id === slug) : undefined;

  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs parents={[{ label: "Flows", href: "/flows" }]} current="New flow" />
      <UnavailablePanel
        icon={<RiAddLine />}
        title={example ? `Forking ${example.name} will be available soon` : "New flows are coming"}
        description="The canvas that builds and edits a flow is still in progress."
      />
    </WorkspacePage>
  );
}
