"use client";

import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { RiArrowLeftLine } from "@remixicon/react";
import type { GroupBuilderNode } from "./document";
import styles from "./node-settings.module.css";
import { useBuilderStore } from "./store-provider";

/** The left panel for a selected frame: its label, and the way out of it. */
export function GroupSettings({ node, onBack }: { node: GroupBuilderNode; onBack(): void }) {
  const renameNode = useBuilderStore((state) => state.renameNode);
  const ungroup = useBuilderStore((state) => state.ungroup);
  const members = useBuilderStore(
    (state) => state.nodes.filter((item) => item.parentId === node.id).length,
  );
  return (
    <div className={styles.panel}>
      {/* The same header a node gets, so the panel reads the same whatever is selected. */}
      <div className={styles.header}>
        <Button variant="ghost" size="icon-sm" aria-label="Back to nodes" onClick={onBack}>
          <RiArrowLeftLine aria-hidden="true" />
        </Button>
        <div className={styles.title}>
          <span className={styles.category}>Group</span>
          <span className={styles.nameStatic}>{node.data.label}</span>
        </div>
      </div>
      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <Field>
          <FieldLabel htmlFor={`${node.id}-label`}>Label</FieldLabel>
          <Input
            id={`${node.id}-label`}
            value={node.data.label}
            onChange={(event) => renameNode(node.id, event.target.value)}
          />
        </Field>
        <p className="text-caption text-muted-foreground">
          {members === 1 ? "1 node" : `${members} nodes`} in this frame. Drag a node in to add it,
          or out to take it away.
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={() => ungroup(node.id)}>
            Ungroup
          </Button>
        </div>
      </form>
    </div>
  );
}
