"use client";

import type { FlowRunNodeResult } from "@automator/contracts";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { memo, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useDataTables } from "../data/tables-context";
import { getCatalogEntry, type CatalogEntry, type CatalogPort } from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import type { FlowBuilderNode } from "./document";
import styles from "./flow-builder.module.css";
import { GroupNode } from "./group-node";
import { nodeFamily, nodeSummary, screenItems } from "./node-summary";
import { elapsedMs, formatElapsed, nodeStatusLabel } from "./run-selectors";
import { selectNodeResult } from "./run-store";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";
import { useNodeProblems } from "./use-flow-problems";
import type { FlowProblem } from "./validation";

/* Approximate half-card dimensions keep click-added nodes centered without measuring a mounted node. */
export const nodeHalfSize = { x: 124, y: 36 };

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

/** The port dots of a node with at most one port per side, placed on the row that holds them. */
function SingleHandles({ entry }: { entry: CatalogEntry }) {
  return (
    <>
      {entry.inputs[0] && (
        <Handle
          type="target"
          position={Position.Left}
          id={entry.inputs[0].id}
          className={styles.handle}
          aria-label={entry.inputs[0].label}
        />
      )}
      {entry.outputs[0] && (
        <Handle
          type="source"
          position={Position.Right}
          id={entry.outputs[0].id}
          className={styles.handle}
          aria-label={entry.outputs[0].label}
        />
      )}
    </>
  );
}

function PortGrid({ entry }: { entry: CatalogEntry }) {
  return (
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
  );
}

/**
 * Double-click, or Rename in the node's menu, turns the title into a field; Enter or leaving
 * commits, Escape backs out. The store says which card is editing so a menu can start it too.
 */
function NodeLabel({ id, label }: { id: string; label: string }) {
  const renameNode = useBuilderStore((state) => state.renameNode);
  const setRenaming = useBuilderStore((state) => state.setRenaming);
  const editing = useBuilderStore((state) => state.renaming === id);
  const input = useRef<HTMLInputElement>(null);
  // The field only exists because the user asked to rename, so it takes focus with its text selected.
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  if (!editing)
    return (
      <span
        className={styles.nodeLabel}
        data-slot="node-label"
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
      className={`${styles.nodeLabelInput} nodrag nopan`}
      aria-label="Node label"
      ref={input}
      defaultValue={label}
      onKeyDown={onKeyDown}
      onBlur={(event) => commit(event.currentTarget.value)}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}

/** The run status pill after a run, else the problem badge when validation has something to say. */
function NodeStatus({
  result,
  problems,
}: {
  result: FlowRunNodeResult | undefined;
  problems: readonly FlowProblem[];
}) {
  if (result) {
    const elapsed = elapsedMs(result);
    return (
      <span className={styles.nodeRunStatus} title={result.error}>
        {nodeStatusLabel(result)}
        {elapsed !== undefined ? ` · ${formatElapsed(elapsed)}` : ""}
      </span>
    );
  }
  if (problems.length === 0) return null;
  /* A native title would say this too late, only on hover, and never on a keyboard. */
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={styles.nodeProblem}
            aria-label={`${problems.length === 1 ? "1 problem" : `${problems.length} problems`} on this node`}
          />
        }
      >
        !
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-72">
        <span className={styles.nodeProblemList}>
          {problems.map((problem) => (
            <span key={problem.message}>{problem.message}</span>
          ))}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
}

/** The tint of a branch's answer: yes-like outputs green, no-like red, the rest quiet. */
function branchTone(portId: string): "yes" | "no" | undefined {
  if (portId === "true" || portId === "kept" || portId === "match") return "yes";
  if (portId === "false" || portId === "dropped") return "no";
  return undefined;
}

function FlowNodeComponent({ id, data, selected }: NodeProps<FlowBuilderNode>) {
  const entry = getCatalogEntry(data.type);
  const { tables } = useDataTables();
  const result = useRunStore(selectNodeResult(id));
  const problems = useNodeProblems(id);
  const worst = problems.some((problem) => problem.severity === "error")
    ? "error"
    : problems.length > 0
      ? "warning"
      : undefined;
  const family = nodeFamily(data.type);
  const summary = nodeSummary({ id, type: data.type, config: data.config }, tables);
  const status = <NodeStatus result={result} problems={problems} />;
  // One port per side at most: the dots sit on the summary row and the card skips the port list.
  const simple = entry.inputs.length <= 1 && entry.outputs.length <= 1;
  const icon = (
    <span className={styles.nodeBarIcon}>
      <CatalogIconMark icon={entry.icon} />
    </span>
  );

  let body: ReactNode;
  if (family === "trigger") {
    body = (
      <>
        <div className={styles.nodeTriggerHead}>
          {icon}
          <span className={styles.nodeTriggerTag}>Trigger</span>
          {status}
        </div>
        <div className={styles.nodeTriggerBody}>
          <NodeLabel id={id} label={data.label} />
          <span className={styles.nodeSummary} title={summary}>
            {summary}
          </span>
          {simple ? <SingleHandles entry={entry} /> : null}
        </div>
        {!simple && <PortGrid entry={entry} />}
      </>
    );
  } else if (family === "screen") {
    const items = screenItems({ id, type: data.type, config: data.config });
    body = (
      <>
        <div className={styles.nodeBar}>
          {icon}
          <NodeLabel id={id} label={data.label} />
          {status}
        </div>
        <div className={styles.nodeScreenList}>
          {items.map((item) => (
            <span key={item}>
              <span>{item}</span>
            </span>
          ))}
        </div>
        <PortGrid entry={entry} />
      </>
    );
  } else if (family === "branch") {
    body = (
      <>
        <div className={styles.nodeBranchMain}>
          {entry.inputs[0] && (
            <Handle
              type="target"
              position={Position.Left}
              id={entry.inputs[0].id}
              className={styles.handle}
              aria-label={entry.inputs[0].label}
            />
          )}
          <span className={styles.nodeBranchTitle}>
            {icon}
            <NodeLabel id={id} label={data.label} />
            {status}
          </span>
          <span className={styles.nodeSummary} title={summary}>
            {summary}
          </span>
        </div>
        <div className={styles.nodeBranchTabs}>
          {entry.outputs.map((port) => (
            <span key={port.id} className={styles.nodeBranchTab} data-tone={branchTone(port.id)}>
              {port.label}
              <Handle
                type="source"
                position={Position.Right}
                id={port.id}
                className={styles.handle}
                aria-label={port.label}
              />
            </span>
          ))}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className={styles.nodeBar}>
          {icon}
          <NodeLabel id={id} label={data.label} />
          {status}
        </div>
        <div className={styles.nodeBody}>
          <span className={styles.nodeSummary} title={summary}>
            {summary}
          </span>
          {simple ? <SingleHandles entry={entry} /> : null}
        </div>
        {!simple && <PortGrid entry={entry} />}
      </>
    );
  }

  const familyClass =
    family === "trigger"
      ? styles.nodeTrigger
      : family === "screen"
        ? styles.nodeScreen
        : family === "branch"
          ? styles.nodeBranch
          : "";
  return (
    <div
      className={`${styles.node} ${familyClass} ${selected ? styles.nodeSelected : ""}`.trim()}
      data-category={entry.category}
      data-family={family}
      data-run-status={result?.status}
      data-problem={worst}
    >
      {body}
      {result?.error && <p className={styles.nodeRunError}>{result.error}</p>}
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);

export const nodeTypes = { flow: FlowNode, group: GroupNode } satisfies NodeTypes;
