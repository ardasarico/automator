"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useRef, type KeyboardEvent } from "react";
import type { GroupBuilderNode } from "./document";
import styles from "./flow-builder.module.css";
import { useBuilderStoreIfAny } from "./store-provider";

/** The smallest a frame can be dragged to; anything less hides its own label. */
const minGroupSize = { width: 160, height: 96 };

/** The frame's label; double-click or Rename in the menu edits it in place, like a node's. */
function GroupLabel({ id, label }: { id: string; label: string }) {
  const renameNode = useBuilderStoreIfAny((state) => state.renameNode);
  const setRenaming = useBuilderStoreIfAny((state) => state.setRenaming);
  const editing = useBuilderStoreIfAny((state) => state.renaming === id);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  if (!editing)
    return (
      <span
        className={styles.groupLabel}
        data-slot="group-label"
        onDoubleClick={(event) => {
          event.stopPropagation();
          setRenaming(id);
        }}
      >
        {label}
      </span>
    );
  const commit = (value: string) => {
    const next = value.trim();
    if (next !== "" && next !== label) renameNode(id, next);
    setRenaming(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit(event.currentTarget.value);
    else if (event.key === "Escape") setRenaming(null);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <input
      className={`${styles.groupLabelInput} nodrag nopan`}
      aria-label="Group label"
      ref={input}
      defaultValue={label}
      onKeyDown={onKeyDown}
      onBlur={(event) => commit(event.currentTarget.value)}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}

function GroupNodeComponent({ id, data, selected }: NodeProps<GroupBuilderNode>) {
  return (
    <div className={`${styles.group} ${selected ? styles.groupSelected : ""}`.trim()}>
      <NodeResizer
        isVisible={selected}
        minWidth={minGroupSize.width}
        minHeight={minGroupSize.height}
        lineClassName={styles.groupResizeLine}
        handleClassName={styles.groupResizeHandle}
      />
      <div className={styles.groupBar}>
        <GroupLabel id={id} label={data.label} />
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);
