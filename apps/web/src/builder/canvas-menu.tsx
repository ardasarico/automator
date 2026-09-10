"use client";

import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut } from "@automator/ui/menu";
import { useState, type ReactNode } from "react";
import { useShortcut } from "../lib/shortcuts";
import { isFlowNode, isGroupNode, type FlowBuilderNode } from "./document";
import { SavePresetDialog } from "./save-preset-dialog";
import { useBuilderStore } from "./store-provider";
import type { AlignEdge } from "./store";

/** What was under the pointer when the menu opened. */
export type CanvasMenuTarget =
  | { kind: "node"; id: string }
  | { kind: "selection"; ids: string[] }
  | { kind: "edge"; id: string }
  | { kind: "pane" };

export type CanvasMenuState = { target: CanvasMenuTarget; at: { x: number; y: number } };

/** A point on screen, in the shape Base UI positions a popup against. */
function pointAnchor(at: { x: number; y: number }) {
  return {
    getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0),
  };
}

export function CanvasMenu({
  menu,
  onClose,
  onAddNodeAt,
  onTidyUp,
  onFitView,
}: {
  menu: CanvasMenuState | null;
  onClose: () => void;
  /** Opens the node picker at the point the menu was opened from. */
  onAddNodeAt: (at: { x: number; y: number }) => void;
  onTidyUp: () => void;
  onFitView: () => void;
}) {
  const nodes = useBuilderStore((state) => state.nodes);
  const setRenaming = useBuilderStore((state) => state.setRenaming);
  const duplicateNodes = useBuilderStore((state) => state.duplicateNodes);
  const removeNodes = useBuilderStore((state) => state.removeNodes);
  const removeEdge = useBuilderStore((state) => state.removeEdge);
  const alignNodes = useBuilderStore((state) => state.alignNodes);
  const selectAll = useBuilderStore((state) => state.selectAll);
  const groupNodes = useBuilderStore((state) => state.groupNodes);
  const ungroup = useBuilderStore((state) => state.ungroup);
  const [saving, setSaving] = useState<FlowBuilderNode | null>(null);
  const duplicateKeys = useShortcut("mod+d");
  const selectAllKeys = useShortcut("mod+a");

  const target = menu?.target ?? null;
  const ids =
    target?.kind === "node" ? [target.id] : target?.kind === "selection" ? target.ids : [];
  const align = (edge: AlignEdge) => alignNodes(ids, edge);

  let items: ReactNode = null;
  if (target?.kind === "node" || target?.kind === "selection") {
    const only = ids.length === 1 ? nodes.find((node) => node.id === ids[0]) : undefined;
    const single = only && isFlowNode(only) ? only : undefined;
    const frame = only && isGroupNode(only) ? only : undefined;
    items = frame ? (
      <>
        <MenuItem onClick={() => setRenaming(frame.id)}>Rename</MenuItem>
        <MenuItem onClick={() => ungroup(frame.id)}>Ungroup</MenuItem>
        <MenuSeparator />
        <MenuItem variant="destructive" onClick={() => removeNodes(ids)}>
          Delete frame
          <MenuShortcut>⌫</MenuShortcut>
        </MenuItem>
      </>
    ) : (
      <>
        {single && <MenuItem onClick={() => setRenaming(single.id)}>Rename</MenuItem>}
        <MenuItem onClick={() => duplicateNodes(ids)}>
          Duplicate
          <MenuShortcut>{duplicateKeys}</MenuShortcut>
        </MenuItem>
        {single && <MenuItem onClick={() => setSaving(single)}>Save as node</MenuItem>}
        {ids.length > 1 && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => align("left")}>Align left</MenuItem>
            <MenuItem onClick={() => align("top")}>Align top</MenuItem>
            <MenuItem onClick={() => align("centerX")}>Center horizontally</MenuItem>
            <MenuItem onClick={() => align("centerY")}>Center vertically</MenuItem>
          </>
        )}
        {ids.length > 1 && <MenuItem onClick={() => groupNodes(ids)}>Group</MenuItem>}
        <MenuSeparator />
        <MenuItem variant="destructive" onClick={() => removeNodes(ids)}>
          Delete
          <MenuShortcut>⌫</MenuShortcut>
        </MenuItem>
      </>
    );
  } else if (target?.kind === "edge") {
    const id = target.id;
    items = (
      <MenuItem variant="destructive" onClick={() => removeEdge(id)}>
        Delete connection
        <MenuShortcut>⌫</MenuShortcut>
      </MenuItem>
    );
  } else if (target?.kind === "pane" && menu) {
    const at = menu.at;
    items = (
      <>
        <MenuItem onClick={() => onAddNodeAt(at)}>Add node here</MenuItem>
        <MenuItem onClick={selectAll} disabled={nodes.length === 0}>
          Select all
          <MenuShortcut>{selectAllKeys}</MenuShortcut>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={onTidyUp} disabled={nodes.length === 0}>
          Tidy up
        </MenuItem>
        <MenuItem onClick={onFitView}>Fit view</MenuItem>
      </>
    );
  }

  return (
    <>
      <Menu
        open={menu !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        {menu && (
          <MenuPopup
            anchor={pointAnchor(menu.at)}
            side="bottom"
            align="start"
            sideOffset={2}
            className="min-w-44"
            aria-label="Canvas actions"
          >
            {items}
          </MenuPopup>
        )}
      </Menu>
      {saving && <SavePresetDialog node={saving} onClose={() => setSaving(null)} />}
    </>
  );
}
