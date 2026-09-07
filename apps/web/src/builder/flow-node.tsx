"use client";

import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { memo } from "react";
import { categoryLabels, getCatalogEntry, type CatalogPort } from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import type { BuilderNode } from "./document";
import styles from "./flow-builder.module.css";
import { elapsedMs, formatElapsed, nodeStatusLabel } from "./run-selectors";
import { selectNodeResult } from "./run-store";
import { useRunStore } from "./run-store-provider";
import { useNodeProblems } from "./use-flow-problems";

/**
 * Half of a typical card, used to centre a click-added node on the drop point. The card is
 * 240 px wide; seven of the nine types render a single port row, so the typical height is
 * 55 px of header (32 px icon square in 10 px padding) plus one 24 px row and 8 px of bottom
 * padding, about 87 px. The two-row types land 12 px high, which is not worth a measurement.
 */
export const nodeHalfSize = { x: 120, y: 44 };

function PortRow({ port, side }: { port: CatalogPort; side: "input" | "output" }) {
  return (
    <div className={styles.nodePortRow}>
      <Handle
        type={side === "input" ? "target" : "source"}
        position={side === "input" ? Position.Left : Position.Right}
        id={port.id}
        className={styles.handle}
      />
      <span className={styles.nodePortLabel}>{port.label}</span>
    </div>
  );
}

function FlowNodeComponent({ id, data, selected }: NodeProps<BuilderNode>) {
  const entry = getCatalogEntry(data.type);
  const result = useRunStore(selectNodeResult(id));
  const problems = useNodeProblems(id);
  const worst = problems.some((problem) => problem.severity === "error")
    ? "error"
    : problems.length > 0
      ? "warning"
      : undefined;
  const elapsed = result ? elapsedMs(result) : undefined;
  return (
    <div
      className={`${styles.node} ${selected ? styles.nodeSelected : ""}`.trim()}
      data-category={entry.category}
      data-run-status={result?.status}
      data-problem={worst}
    >
      <div className={styles.nodeHeader}>
        <span className={styles.nodeIcon}>
          <CatalogIconMark icon={entry.icon} />
        </span>
        <span className={styles.nodeText}>
          <span className={styles.nodeEyebrow}>{categoryLabels[entry.category]}</span>
          <span className={styles.nodeLabel}>{data.label}</span>
        </span>
        {result ? (
          <span className={styles.nodeRunStatus} title={result.error}>
            {nodeStatusLabel(result)}
            {elapsed !== undefined ? ` · ${formatElapsed(elapsed)}` : ""}
          </span>
        ) : worst ? (
          <span
            className={styles.nodeProblem}
            role="img"
            aria-label={worst === "error" ? "Has a problem" : "Has a warning"}
            title={problems.map((problem) => problem.message).join("\n")}
          >
            !
          </span>
        ) : null}
      </div>
      <div className={styles.nodePorts}>
        {entry.inputs.length > 0 && (
          <div className={styles.nodePortColumn}>
            {entry.inputs.map((port) => (
              <PortRow key={port.id} port={port} side="input" />
            ))}
          </div>
        )}
        <div className={`${styles.nodePortColumn} ${styles.nodePortColumnOutputs}`}>
          {entry.outputs.map((port) => (
            <PortRow key={port.id} port={port} side="output" />
          ))}
        </div>
      </div>
      {result?.error && <p className={styles.nodeRunError}>{result.error}</p>}
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);

export const nodeTypes = { flow: FlowNode } satisfies NodeTypes;
