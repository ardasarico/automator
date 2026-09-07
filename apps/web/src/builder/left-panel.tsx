"use client";

import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { RiArrowLeftLine, RiDeleteBinLine } from "@remixicon/react";
import { useShallow } from "zustand/react/shallow";
import { categoryLabels, getCatalogEntry, type CatalogPort } from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import type { BuilderNode } from "./document";
import styles from "./flow-builder.module.css";
import { FlowSettingsDialog } from "./flow-settings-dialog";
import { NodePalette } from "./node-palette";
import { selectSelectedNodes } from "./store";
import { useBuilderStore } from "./store-provider";

function PortList({ title, ports }: { title: string; ports: readonly CatalogPort[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-caption text-muted-foreground">{title}</p>
      {ports.length === 0 ? (
        <p className="text-caption text-muted-foreground">None</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {ports.map((port) => (
            <Badge key={port.id} variant="outline">
              {port.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Everything editable about one node: its type, its label, its ports, and removing it. */
function NodeSettings({ node }: { node: BuilderNode }) {
  const renameNode = useBuilderStore((state) => state.renameNode);
  const removeNode = useBuilderStore((state) => state.removeNode);
  const entry = getCatalogEntry(node.data.type);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className={styles.nodeIcon} data-category={entry.category}>
          <CatalogIconMark icon={entry.icon} />
        </span>
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">{categoryLabels[entry.category]}</p>
          <p className="text-label">{entry.label}</p>
          <p className="mt-1 text-caption text-muted-foreground">{entry.description}</p>
        </div>
      </div>
      <Field>
        <FieldLabel>Label</FieldLabel>
        <Input
          value={node.data.label}
          onChange={(event) => renameNode(node.id, event.target.value)}
          aria-label="Node label"
        />
      </Field>
      <section aria-labelledby="node-ports-heading" className="flex flex-col gap-3">
        <h3 id="node-ports-heading" className="text-label">
          Ports
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <PortList title="Inputs" ports={entry.inputs} />
          <PortList title="Outputs" ports={entry.outputs} />
        </div>
      </section>
      <Button variant="destructive-outline" onClick={() => removeNode(node.id)}>
        <RiDeleteBinLine aria-hidden="true" />
        Remove node
      </Button>
    </div>
  );
}

function NodeState({ node }: { node: BuilderNode }) {
  const clearSelection = useBuilderStore((state) => state.clearSelection);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={styles.stateHeader}>
        <Button variant="ghost" size="xs" aria-label="Back to nodes" onClick={clearSelection}>
          <RiArrowLeftLine aria-hidden="true" />
          Nodes
        </Button>
        <p className="text-caption text-muted-foreground">Node</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <NodeSettings node={node} />
      </div>
    </div>
  );
}

function PaletteState({ selectedCount }: { selectedCount: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedCount > 1 && (
        <p className="px-3 pt-3 text-caption text-muted-foreground">
          {selectedCount} nodes selected.
        </p>
      )}
      <NodePalette />
    </div>
  );
}

/**
 * The docked left column: a flow header that never changes, and a body that follows the
 * selection — the node palette, or the settings of the one selected node.
 */
export function LeftPanel() {
  const name = useBuilderStore((state) => state.meta.name);
  const description = useBuilderStore((state) => state.meta.description);
  const selected = useBuilderStore(useShallow(selectSelectedNodes));
  const node = selected.length === 1 ? selected[0] : undefined;

  return (
    <aside className={styles.leftPanel} aria-label="Builder panel">
      <div className={styles.panelHeader}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-label">{name}</p>
          {description && (
            <p className="mt-0.5 line-clamp-2 text-caption text-muted-foreground">{description}</p>
          )}
        </div>
        <FlowSettingsDialog />
      </div>
      {node ? <NodeState node={node} /> : <PaletteState selectedCount={selected.length} />}
    </aside>
  );
}
