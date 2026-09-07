"use client";

import { useShallow } from "zustand/react/shallow";
import styles from "./flow-builder.module.css";
import { selectSelectedNodes } from "./store";
import { useBuilderStore } from "./store-provider";

/**
 * A static phone frame for the selected screen node. It renders the node's label and a
 * placeholder body; designing a screen comes later, so nothing here is interactive.
 */
export function ScreenPreview() {
  const selected = useBuilderStore(useShallow(selectSelectedNodes));
  const screen = selected.length === 1 ? selected[0] : undefined;
  const label = screen?.data.type === "screen.page" ? screen.data.label : undefined;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
      <div className={styles.phoneFrame}>
        <div className={styles.phoneBar} aria-hidden="true" />
        {label === undefined ? (
          <p className={styles.phoneHint}>Select a Screen node to preview it.</p>
        ) : (
          <div className={styles.phoneBody}>
            <p className="text-label">{label}</p>
            <p className="mt-1 text-caption text-muted-foreground">
              This screen will be designed later.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
