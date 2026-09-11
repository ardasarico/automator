"use client";

import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { RiCloseLine } from "@remixicon/react";
import { useShallow } from "zustand/react/shallow";
import { isFlowNode } from "../document";
import { selectSelectedNodes } from "../store";
import { useBuilderStore } from "../store-provider";
import { useFlowProblems } from "../use-flow-problems";
import { useChatStore } from "./chat-store-provider";
import styles from "./panel.module.css";
import { useAskAi } from "./use-ask-ai";

const runStatusLabels: Record<string, string> = {
  succeeded: "succeeded",
  failed: "failed",
  running: "running",
  waiting_on_screen: "waiting on a screen",
};

/**
 * What the next message is about. The canvas's own selection counts, so picking a node is enough
 * context for "rename this" to mean something.
 */
export function ContextStrip({ onSend }: { onSend(text: string): void }) {
  const name = useBuilderStore((state) => state.meta.name);
  const hasNodes = useBuilderStore((state) => state.nodes.some(isFlowNode));
  const canvasSelection = useBuilderStore(
    useShallow((state) =>
      selectSelectedNodes(state)
        .filter(isFlowNode)
        .map((node) => node.id),
    ),
  );
  const context = useChatStore((state) => state.context);
  const setContext = useChatStore((state) => state.setContext);
  const problems = useFlowProblems();
  const { askToFix } = useAskAi();

  const selection = context.selection.length > 0 ? context.selection : canvasSelection;
  const run = context.run;

  return (
    <div className={styles.strip}>
      <div className={styles.chips}>
        <Badge variant="outline" className={styles.chip}>
          <span className={styles.chipLabel}>{name || "Untitled flow"}</span>
        </Badge>
        {selection.length > 0 && (
          <Badge variant="outline" className={styles.chip}>
            <span className={styles.chipLabel}>
              {selection.length} {selection.length === 1 ? "node" : "nodes"} selected
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove the selection from the context"
              onClick={() => setContext({ selection: [] })}
            >
              <RiCloseLine aria-hidden="true" />
            </Button>
          </Badge>
        )}
        {problems.length > 0 && (
          <Badge variant="error" className={styles.chip}>
            <span className={styles.chipLabel}>
              {problems.length} {problems.length === 1 ? "problem" : "problems"}
            </span>
          </Badge>
        )}
        {run && (
          <Badge variant="outline" className={styles.chip}>
            <span className={styles.chipLabel}>
              Run: {runStatusLabels[run.status] ?? run.status}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove the run from the context"
              onClick={() => setContext({ run: undefined })}
            >
              <RiCloseLine aria-hidden="true" />
            </Button>
          </Badge>
        )}
      </div>
      {(problems.length > 0 || hasNodes) && (
        <div className={styles.quickActions}>
          {problems.length > 0 && (
            <Button type="button" variant="outline" size="xs" onClick={() => askToFix(problems)}>
              Fix problems
            </Button>
          )}
          {hasNodes && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onSend("What does this flow do?")}
            >
              Explain this flow
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
