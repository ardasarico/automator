"use client";

import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiArrowLeftLine,
  RiBracesLine,
  RiFlowChart,
  RiListUnordered,
  RiSettings3Line,
  RiStackLine,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import Link from "next/link";
import { useState } from "react";
import styles from "./flow-builder.module.css";
import { NodePalette } from "./node-palette";
import { VariablesPanel } from "./variables-panel";
import { FlowOutline } from "./flow-outline";
import { FlowSettingsDialog } from "./flow-settings-dialog";
import { useLeaveGuard } from "./leave-guard";
import { NodeSettings } from "./node-settings";
import { useBuilderStore } from "./store-provider";

type SectionId = "nodes" | "variables" | "outline";

/**
 * The panel's sections, in sidebar order: the node catalog; the flow's inputs, constants and
 * secret references that node configs read; and a node list with search for large canvases.
 * Every body is empty until it is designed.
 */
const sections: readonly { id: SectionId; label: string; icon: RemixiconComponentType }[] = [
  { id: "nodes", label: "Nodes", icon: RiStackLine },
  { id: "variables", label: "Variables", icon: RiBracesLine },
  { id: "outline", label: "Outline", icon: RiListUnordered },
];

function SidebarButton({
  label,
  icon: Icon,
  ...props
}: {
  label: string;
  icon: RemixiconComponentType;
  className?: string;
  "aria-pressed"?: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            data-pressed={props["aria-pressed"] ? "" : undefined}
            {...props}
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The left side of the builder: a permanent sidebar on the window edge and a 260 px panel
 * beside it. The sidebar's header slot holds the leave link under the same line as every other
 * header; below it, one toggle per panel section, and at the bottom a settings control that
 * opens the flow settings dialog (name and description). The panel shows the flow name over the section's body: the node
 * palette for Nodes, replaced by the selected node's settings while exactly one node is
 * selected; Outline lists the flow's problems and its nodes; Variables holds the user's
 * secrets (names only) for `{{secrets.*}}` references.
 */
export function LeftPanel() {
  const [section, setSection] = useState<SectionId>("nodes");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const name = useBuilderStore((state) => state.meta.name);
  // Returns the node object itself, so an unchanged selection yields a stable snapshot.
  const selectedNode = useBuilderStore((state) => {
    const selected = state.nodes.filter((node) => node.selected);
    return selected.length === 1 ? selected[0] : undefined;
  });
  const clearSelection = useBuilderStore((state) => state.clearSelection);
  const guardLink = useLeaveGuard();
  const open = sections.find((entry) => entry.id === section) ?? sections[0]!;

  return (
    <>
      <nav className={styles.rail} data-side="left" aria-label="Sidebar">
        <div className={styles.railHeader}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Leave flow"
                  render={<Link href="/flows" onClick={guardLink("/flows")} />}
                />
              }
            >
              <RiArrowLeftLine aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup side="right">Leave flow</TooltipPopup>
          </Tooltip>
        </div>
        <div className={styles.railBody}>
          {sections.map(({ id, label, icon }) => (
            <SidebarButton
              key={id}
              label={label}
              icon={icon}
              aria-pressed={section === id}
              onClick={() => setSection(id)}
            />
          ))}
          <SidebarButton
            label="Flow settings"
            icon={RiSettings3Line}
            className="mt-auto"
            onClick={() => setSettingsOpen(true)}
          />
          {settingsOpen && <FlowSettingsDialog onClose={() => setSettingsOpen(false)} />}
        </div>
      </nav>
      <aside className={styles.leftPanel} aria-label={`${open.label} panel`}>
        <div className={styles.panelHeader}>
          <h1 className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-caption font-medium">
            <RiFlowChart
              aria-hidden="true"
              className="size-3.5 flex-none text-muted-foreground opacity-56"
            />
            <span className="truncate">{name}</span>
          </h1>
        </div>
        {section === "nodes" &&
          (selectedNode ? (
            <NodeSettings key={selectedNode.id} node={selectedNode} onBack={clearSelection} />
          ) : (
            <NodePalette />
          ))}
        {section === "variables" && <VariablesPanel />}
        {section === "outline" && <FlowOutline />}
      </aside>
    </>
  );
}
