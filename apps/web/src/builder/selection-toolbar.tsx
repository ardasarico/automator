"use client";

import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { NodeToolbar, Position } from "@xyflow/react";
import {
  RiAlignItemLeftLine,
  RiAlignItemTopLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiShapesLine,
} from "@remixicon/react";
import { useShortcut } from "../lib/shortcuts";
import styles from "./flow-builder.module.css";
import { useBuilderStore } from "./store-provider";

/** Two or more selected nodes: the toolbar hangs above the selection's bounding box. */
export function selectionToolbarVisible(selectedCount: number, dragging: boolean): boolean {
  return selectedCount >= 2 && !dragging;
}

function ToolbarButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">
        {label}
        {shortcut ? <kbd className={styles.toolbarKbd}>{shortcut}</kbd> : null}
      </TooltipPopup>
    </Tooltip>
  );
}

export function SelectionToolbar() {
  const selectedIds = useBuilderStore((state) =>
    state.nodes
      .filter((node) => node.selected)
      .map((node) => node.id)
      .join(","),
  );
  const dragging = useBuilderStore((state) => state.dragging);
  const alignNodes = useBuilderStore((state) => state.alignNodes);
  const duplicateNodes = useBuilderStore((state) => state.duplicateNodes);
  const removeNodes = useBuilderStore((state) => state.removeNodes);
  const groupNodes = useBuilderStore((state) => state.groupNodes);
  const duplicateKeys = useShortcut("mod+d");
  const groupKeys = useShortcut("mod+g");
  const ids = selectedIds === "" ? [] : selectedIds.split(",");
  if (!selectionToolbarVisible(ids.length, dragging)) return null;
  return (
    <NodeToolbar nodeId={ids} isVisible position={Position.Top} offset={12} className="nopan">
      <div className={styles.selectionToolbar} role="toolbar" aria-label="Selected nodes">
        <ToolbarButton label="Align left" onClick={() => alignNodes(ids, "left")}>
          <RiAlignItemLeftLine aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Align top" onClick={() => alignNodes(ids, "top")}>
          <RiAlignItemTopLine aria-hidden="true" />
        </ToolbarButton>
        <span className={styles.toolbarDivider} aria-hidden="true" />
        <ToolbarButton
          label="Duplicate"
          shortcut={duplicateKeys}
          onClick={() => duplicateNodes(ids)}
        >
          <RiFileCopyLine aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Group" shortcut={groupKeys} onClick={() => groupNodes(ids)}>
          <RiShapesLine aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Delete" shortcut="⌫" onClick={() => removeNodes(ids)}>
          <RiDeleteBinLine aria-hidden="true" />
        </ToolbarButton>
      </div>
    </NodeToolbar>
  );
}
