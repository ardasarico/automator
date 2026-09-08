import { findFlowExample } from "../../../builder/examples";
import { UnavailablePanel } from "../../../components/unavailable-panel";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";
import { FlowActionButton } from "../../../flows/action-button";
import { createFlowAction } from "../../../flows/actions";
import { RiAddLine } from "@remixicon/react";

/**
 * Keeps old creation links usable without writing during GET rendering or prefetching.
 * The submitted action creates the flow and opens its canvas.
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string | string[]; ai?: string | string[] }>;
}) {
  const { example: requested, ai } = await searchParams;
  const slug = Array.isArray(requested) ? requested[0] : requested;
  const example = findFlowExample(slug);
  const focusAi = (Array.isArray(ai) ? ai[0] : ai) === "1";
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Create a flow" />
      <UnavailablePanel
        icon={<RiAddLine />}
        title={example ? `Create a copy of ${example.name}` : "Create a flow"}
        description={
          example
            ? "Add this example to your flows, then make it yours on the canvas."
            : focusAi
              ? "Open a new canvas and describe your flow to the AI assistant."
              : "Open an empty canvas and add your first trigger."
        }
        action={
          <FlowActionButton action={createFlowAction.bind(null, { example: slug, ai: focusAi })}>
            Create flow
          </FlowActionButton>
        }
      />
    </WorkspacePage>
  );
}
