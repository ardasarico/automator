"use client";

import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@automator/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiArrowLeftLine,
  RiBookmarkLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiMoreLine,
  RiPencilLine,
} from "@remixicon/react";
import { useEffect, useId, useRef, useState } from "react";
import { categoryLabels, getCatalogEntry } from "./catalog";
import type { BuilderNode } from "./document";
import styles from "./node-settings.module.css";

/** Matches the limit the flow title enforces; a label is a name, not a description. */
const labelLimit = 120;

/**
 * The name of the node, renamed where it is read: click, the text is selected, Enter or blur
 * commits, Escape restores. The old panel had a separate Label field at the top of every form,
 * which cost a row on every node for a value that rarely changes.
 */
function NodeName({ label, onRename }: { label: string; onRename(label: string): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const hint = useId();
  const editing = draft !== null;
  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);

  function commit() {
    const trimmed = (draft ?? "").trim();
    if (trimmed && trimmed !== label) onRename(trimmed);
    setDraft(null);
  }

  if (editing)
    return (
      <Input
        ref={field}
        size="sm"
        aria-label="Node name"
        className="min-w-0"
        maxLength={labelLimit}
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
    );
  return (
    <>
      <button
        type="button"
        className={styles.name}
        aria-describedby={hint}
        onClick={() => setDraft(label)}
      >
        <span className="truncate">{label}</span>
        <RiPencilLine aria-hidden="true" className={styles.pencil} />
      </button>
      <span id={hint} className="sr-only">
        Rename node
      </span>
    </>
  );
}

export function NodeHeader({
  node,
  issues,
  actions,
  readOnly = false,
  onBack,
  onRename,
  onDuplicate,
  onSavePreset,
  onDelete,
}: {
  node: BuilderNode;
  /** How many problems block this node from running; hidden at zero. */
  issues: number;
  /** Extra controls between the badge and the menu, such as an "Ask AI" button. */
  actions?: React.ReactNode;
  /** Names the node without offering to change it, for a document the reader cannot edit. */
  readOnly?: boolean;
  onBack(): void;
  onRename(label: string): void;
  onDuplicate(): void;
  onSavePreset(): void;
  onDelete(): void;
}) {
  const entry = getCatalogEntry(node.data.type);
  return (
    <div className={styles.header}>
      <Button variant="ghost" size="icon-sm" aria-label="Back to nodes" onClick={onBack}>
        <RiArrowLeftLine aria-hidden="true" />
      </Button>
      <div className={styles.title}>
        <span className={styles.category}>
          {categoryLabels[entry.category]} · {entry.label}
        </span>
        {readOnly ? (
          <span className={styles.nameStatic}>{node.data.label}</span>
        ) : (
          <NodeName label={node.data.label} onRename={onRename} />
        )}
      </div>
      {issues > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={<Badge variant="warning" size="sm" className={styles.badge} tabIndex={0} />}
          >
            {issues === 1 ? "1 issue" : `${issues} issues`}
          </TooltipTrigger>
          <TooltipPopup side="bottom">Fix these before the flow can run</TooltipPopup>
        </Tooltip>
      )}
      {actions}
      {!readOnly && (
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Node actions" />}>
            <RiMoreLine aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={onDuplicate}>
              <RiFileCopyLine aria-hidden="true" />
              Duplicate
            </MenuItem>
            {/* Named apart from the header Save, which is what stores the flow itself. */}
            <MenuItem onClick={onSavePreset}>
              <RiBookmarkLine aria-hidden="true" />
              Save as reusable node
            </MenuItem>
            <MenuSeparator />
            <MenuItem className="text-destructive-text" onClick={onDelete}>
              <RiDeleteBinLine aria-hidden="true" />
              Delete
            </MenuItem>
          </MenuPopup>
        </Menu>
      )}
    </div>
  );
}
