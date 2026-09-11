"use client";

import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiArrowLeftLine,
  RiCloseLine,
  RiBracesLine,
  RiFlowChart,
  RiHistoryLine,
  RiListUnordered,
  RiPencilLine,
  RiSettings3Line,
  RiStackLine,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePanelEscape, useResponsivePanels } from "./responsive-panels";
import styles from "./flow-builder.module.css";
import { NodePalette } from "./node-palette";
import { VariablesPanel } from "./variables-panel";
import { FlowHistory } from "./flow-history";
import { FlowOutline } from "./flow-outline";
import { useBuilderDialogs } from "./builder-dialogs";
import { useLeaveGuard } from "./leave-guard";
import { isFlowNode } from "./document";
import { GroupSettings } from "./group-settings";
import { NodeSettings } from "./node-settings";
import { useBuilderStore, useBuilderStoreApi } from "./store-provider";
import { AskAiButton } from "./ai/ask-ai-button";

type SectionId = "nodes" | "variables" | "outline" | "history";

const sections: readonly { id: SectionId; label: string; icon: RemixiconComponentType }[] = [
  { id: "nodes", label: "Nodes", icon: RiStackLine },
  { id: "variables", label: "Variables", icon: RiBracesLine },
  { id: "outline", label: "Outline", icon: RiListUnordered },
  { id: "history", label: "History", icon: RiHistoryLine },
];

/** Matches the limit the settings dialog enforces on the same field. */
const nameLimit = 120;

/**
 * The flow name, renamed where it is read. Renaming used to live at the bottom of the icon rail,
 * behind Flow settings, while the name itself looked like a label and did nothing when clicked.
 * The edit goes through `setMeta`, so Save picks it up like any other change.
 */
function FlowTitle() {
  const name = useBuilderStore((state) => state.meta.name);
  const setMeta = useBuilderStore((state) => state.setMeta);
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const label = useId();
  const hint = useId();
  const editing = draft !== null;
  // Opening the field selects the name, so the common case of replacing it takes one keystroke.
  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);

  function commit() {
    const trimmed = (draft ?? "").trim();
    if (trimmed && trimmed !== name) setMeta({ name: trimmed });
    setDraft(null);
  }

  /* The button's name is the flow's name, so the h1 is too; what pressing it does lives in a
   * description outside the heading, where it cannot join the heading's name. */
  return (
    <>
      <h1 className={styles.flowTitleHeading}>
        {!editing ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className={styles.flowTitle}
                  aria-labelledby={label}
                  aria-describedby={hint}
                  onClick={() => setDraft(name)}
                />
              }
            >
              <RiFlowChart aria-hidden="true" className={styles.flowTitleIcon} />
              <span id={label} className="truncate">
                {name}
              </span>
              <RiPencilLine aria-hidden="true" className={styles.flowTitlePencil} />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Rename flow</TooltipPopup>
          </Tooltip>
        ) : (
          <Input
            ref={field}
            size="sm"
            aria-label="Flow name"
            className="min-w-0 flex-1"
            maxLength={nameLimit}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDraft(null);
              }
            }}
          />
        )}
      </h1>
      <span id={hint} className="sr-only">
        Rename flow
      </span>
    </>
  );
}

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
  const preview = useBuilderStore((state) => state.preview);
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
          <FlowTitle />
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
            isFlowNode(selectedNode) ? (
              <NodeSettings
                key={selectedNode.id}
                node={selectedNode}
                onBack={clearSelection}
                actions={<AskAiButton nodeId={selectedNode.id} />}
                readOnly={preview !== null}
              />
            ) : (
              <GroupSettings key={selectedNode.id} node={selectedNode} onBack={clearSelection} />
            )
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
