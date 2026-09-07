"use client";

import type { FlowRunNodeResult } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { RiArrowDownSLine, RiArrowUpSLine, RiCloseLine } from "@remixicon/react";
import { useState } from "react";
import { getCatalogEntry } from "./catalog";
import { EnableSigningButton } from "./enable-signing-button";
import styles from "./flow-builder.module.css";
import {
  elapsedMs,
  formatElapsed,
  nodeStatusLabel,
  outputHandles,
  simulatedAnswer,
} from "./run-selectors";
import { useRunStore } from "./run-store-provider";
import { useSelectNode } from "./use-select-node";
import { useBuilderStore } from "./store-provider";

const runStatusLabels = {
  succeeded: "Succeeded",
  failed: "Failed",
  waiting: "Waiting for a visitor",
  running: "Running…",
  idle: "",
} as const;

function Outputs({ result }: { result: FlowRunNodeResult }) {
  const outputs = result.outputs ?? {};
  const handles = outputHandles(result);
  const answer = simulatedAnswer(result);
  if (result.error)
    return (
      <>
        <p className={styles.runDetailError} role="alert">
          {result.error}
        </p>
        {result.error.includes("Server signing is not enabled") && (
          <div className="mt-2">
            <EnableSigningButton />
          </div>
        )}
      </>
    );
  if (result.status === "skipped")
    return (
      <p className={styles.runDetailMuted}>No incoming edge fired, so this node did not run.</p>
    );
  if (result.status === "waiting")
    return <p className={styles.runDetailMuted}>The run stopped here until a visitor acts.</p>;
  if (handles.length === 0)
    return <p className={styles.runDetailMuted}>This node produced no outputs.</p>;
  return (
    <>
      {answer && (
        <p className={styles.runDetailMuted}>
          Simulate answered this screen for the visitor and continued on “{answer.port}”.
        </p>
      )}
      <dl className={styles.runOutputs}>
        {handles.map((handle) => (
          <div key={handle}>
            <dt>{handle}</dt>
            <dd>
              <pre>{JSON.stringify(outputs[handle], null, 2) ?? "undefined"}</pre>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/**
 * The last run, docked at the bottom of the canvas: its outcome and any run-wide error in the
 * title row, then every node in execution order with its status and elapsed time. Choosing a
 * row selects the node on the canvas and shows its outputs or error; the panel opens on the
 * failed node when there is one.
 */
export function RunPanel() {
  const status = useRunStore((state) => state.status);
  const run = useRunStore((state) => state.run);
  const reset = useRunStore((state) => state.reset);
  const nodes = useBuilderStore((state) => state.nodes);
  const selectedId = useBuilderStore((state) => {
    const selected = state.nodes.filter((node) => node.selected);
    return selected.length === 1 ? selected[0]!.id : null;
  });
  const selectNode = useSelectNode();
  const [collapsed, setCollapsed] = useState(false);

  if (status === "idle" || (status === "failed" && !run)) return null;

  const results = run?.nodes ?? [];
  const failed = results.find((result) => result.status === "failed");
  const current =
    results.find((result) => result.nodeId === selectedId) ?? failed ?? results.find(Boolean);
  // A result can outlive its node when the canvas changes after the run.
  const labelOf = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    return node ? node.data.label || getCatalogEntry(node.data.type).label : "Removed node";
  };
  const total = run ? elapsedMs(run) : undefined;

  return (
    <section
      className={styles.runPanel}
      aria-label="Last run"
      data-collapsed={collapsed ? "" : undefined}
    >
      <div className={styles.runPanelHeader}>
        <span className={styles.runPanelStatus} data-status={status}>
          {runStatusLabels[status]}
        </span>
        {total !== undefined && <span className={styles.runPanelMeta}>{formatElapsed(total)}</span>}
        {run?.trigger.nodeId && (
          <span className={styles.runPanelMeta}>Started by {labelOf(run.trigger.nodeId)}</span>
        )}
        {run?.error && (
          <span className={styles.runPanelError} role="alert">
            {run.error}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? "Expand run panel" : "Collapse run panel"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <RiArrowUpSLine aria-hidden="true" />
            ) : (
              <RiArrowDownSLine aria-hidden="true" />
            )}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Clear run" onClick={reset}>
            <RiCloseLine aria-hidden="true" />
          </Button>
        </span>
      </div>
      {!collapsed && run && (
        <div className={styles.runPanelBody}>
          <ol className={styles.runList} aria-label="Nodes in this run">
            {results.map((result) => {
              const elapsed = elapsedMs(result);
              const answer = simulatedAnswer(result);
              const statusText = answer
                ? `Answered by Simulate · ${answer.port}`
                : nodeStatusLabel(result);
              return (
                <li key={result.nodeId}>
                  <button
                    type="button"
                    className={styles.runRow}
                    aria-current={current?.nodeId === result.nodeId ? "true" : undefined}
                    data-status={result.status}
                    onClick={() => selectNode(result.nodeId)}
                  >
                    <span className={styles.runRowStatus} />
                    <span className={styles.runRowLabel}>{labelOf(result.nodeId)}</span>
                    <span className={styles.runRowMeta}>
                      {statusText}
                      {elapsed !== undefined ? ` · ${formatElapsed(elapsed)}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className={styles.runDetail}>
            {current ? (
              <>
                <p className={styles.runDetailTitle}>{labelOf(current.nodeId)}</p>
                <Outputs result={current} />
              </>
            ) : (
              <p className={styles.runDetailMuted}>No node ran.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
