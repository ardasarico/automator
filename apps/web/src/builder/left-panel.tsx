"use client";

import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiArrowLeftLine,
  RiCloseLine,
  RiBracesLine,
  RiFlowChart,
  RiHistoryLine,
  RiListUnordered,
  RiSettings3Line,
  RiStackLine,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePanelEscape, useResponsivePanels } from "./responsive-panels";
import styles from "./flow-builder.module.css";
import { NodePalette } from "./node-palette";
import { VariablesPanel } from "./variables-panel";
import { FlowHistory } from "./flow-history";
import { FlowOutline } from "./flow-outline";
import { useBuilderDialogs } from "./builder-dialogs";
import { useLeaveGuard } from "./leave-guard";
import { NodeSettings } from "./node-settings";
import { useBuilderStore, useBuilderStoreApi } from "./store-provider";

type SectionId = "nodes" | "variables" | "outline" | "history";

const sections: readonly { id: SectionId; label: string; icon: RemixiconComponentType }[] = [
  { id: "nodes", label: "Nodes", icon: RiStackLine },
  { id: "variables", label: "Variables", icon: RiBracesLine },
  { id: "outline", label: "Outline", icon: RiListUnordered },
  { id: "history", label: "History", icon: RiHistoryLine },
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
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
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

export function LeftPanel() {
  const { compact, panel, setPanel } = useResponsivePanels();
  const panelOpen = !compact || panel === "left";
  const lastTrigger = useRef<HTMLElement | null>(null);
  const closePanel = () => {
    setPanel(null);
    lastTrigger.current?.focus();
  };
  usePanelEscape(compact && panel === "left", closePanel);
  const [section, setSection] = useState<SectionId>("nodes");
  const dialogs = useBuilderDialogs();
  const name = useBuilderStore((state) => state.meta.name);
  const selectedNode = useBuilderStore((state) => {
    const selected = state.nodes.filter((node) => node.selected);
    return selected.length === 1 ? selected[0] : undefined;
  });
  const store = useBuilderStoreApi();
  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const selected = state.nodes.filter((node) => node.selected);
        const previousSelected = previous.nodes.filter((node) => node.selected);
        if (compact && selected.length === 1 && selected[0]?.id !== previousSelected[0]?.id) {
          lastTrigger.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setSection("nodes");
          setPanel("left");
        }
      }),
    [compact, store, setPanel],
  );
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
              aria-pressed={panelOpen && section === id}
              aria-expanded={panelOpen && section === id}
              aria-controls="builder-left-panel"
              onClick={() => {
                lastTrigger.current = document.activeElement as HTMLElement;
                setSection(id);
                if (compact) setPanel(panelOpen && section === id ? null : "left");
              }}
            />
          ))}
          <SidebarButton
            label="Flow settings"
            icon={RiSettings3Line}
            className="mt-auto"
            onClick={() => dialogs.open("settings")}
          />
        </div>
      </nav>
      <aside
        id="builder-left-panel"
        className={styles.leftPanel}
        data-open={panelOpen || undefined}
        aria-label={`${open.label} panel`}
        role={compact ? "dialog" : undefined}
      >
        <div className={styles.panelHeader}>
          <h1 className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-caption font-medium">
            <RiFlowChart
              aria-hidden="true"
              className="size-3.5 flex-none text-muted-foreground opacity-56"
            />
            <span className="truncate">{name}</span>
          </h1>
          <Button
            className={styles.compactControl}
            variant="ghost"
            size="icon-sm"
            aria-label="Close left panel"
            onClick={closePanel}
          >
            <RiCloseLine aria-hidden="true" />
          </Button>
        </div>
        {section === "nodes" &&
          (selectedNode ? (
            <NodeSettings key={selectedNode.id} node={selectedNode} onBack={clearSelection} />
          ) : (
            <NodePalette />
          ))}
        {section === "variables" && <VariablesPanel />}
        {section === "outline" && <FlowOutline />}
        {section === "history" && <FlowHistory />}
      </aside>
    </>
  );
}
