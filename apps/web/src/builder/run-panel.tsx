"use client";

import {
  chainName,
  defaultChainId,
  explorerTransactionUrl,
  type FlowRunNodeResult,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCloseLine,
  RiExternalLinkLine,
  RiSparklingLine,
} from "@remixicon/react";
import { useState } from "react";
import { getCatalogEntry } from "./catalog";
import { EnableSigningButton } from "./enable-signing-button";
import styles from "./flow-builder.module.css";
import {
  elapsedMs,
  formatElapsed,
  isInsufficientFundsError,
  nodeStatusLabel,
  outputHandles,
  simulatedAnswer,
  transactionHashes,
} from "./run-selectors";
import { useRunStore } from "./run-store-provider";
import { useExplainRun } from "./use-explain-run";
import { useSelectNode } from "./use-select-node";
import { selectFlowNodes } from "./store";
import { useBuilderStore } from "./store-provider";
import { noFundsMessage } from "./wallet-funds-check";

const runStatusLabels = {
  succeeded: "Succeeded",
  failed: "Failed",
  waiting: "Waiting for a visitor",
  running: "Running…",
  idle: "",
} as const;

function ExplorerLinks({ output, chainId }: { output: unknown; chainId: number }) {
  const hashes = transactionHashes(output);
  if (hashes.length === 0) return null;
  return (
    <p className="mb-1 flex flex-wrap gap-2 text-caption">
      {hashes.map((hash) => {
        const url = explorerTransactionUrl(chainId, hash);
        if (!url) return null;
        return (
          <a
            key={hash}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-link underline-offset-2 hover:underline"
          >
            View on {chainName(chainId)}
            <RiExternalLinkLine aria-hidden="true" className="size-3" />
          </a>
        );
      })}
    </p>
  );
}

function ExplainButton({ nodeId }: { nodeId?: string }) {
  const { explain, pending } = useExplainRun();
  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={() => void explain(nodeId)}>
      <RiSparklingLine aria-hidden="true" />
      Explain with AI
    </Button>
  );
}

/* A skipped node did not necessarily lack an edge: the run may have stopped elsewhere first. */
function skippedMessage(result: FlowRunNodeResult): string {
  switch (result.skipReason) {
    case "no-input":
      return "No incoming edge fired, so this node did not run.";
    case "run-stopped":
      return (
        "The run stopped at an earlier node, so this one did not run. A failure stops the " +
        "whole run, including branches that do not pass through the node that failed."
      );
    default:
      return "This node did not run.";
  }
}

function Outputs({ result, chainId }: { result: FlowRunNodeResult; chainId: number }) {
  const outputs = result.outputs ?? {};
  const handles = outputHandles(result);
  const answer = simulatedAnswer(result);
  if (result.error)
    return (
      <>
        <p className={styles.runDetailError} role="alert">
          {result.error}
        </p>
        {isInsufficientFundsError(result.error) && (
          <p className="mt-2 text-caption text-warning-foreground">{noFundsMessage(chainId)}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {result.error.includes("Server signing is not enabled") && <EnableSigningButton />}
          <ExplainButton nodeId={result.nodeId} />
        </div>
      </>
    );
  if (result.status === "skipped")
    return <p className={styles.runDetailMuted}>{skippedMessage(result)}</p>;
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
              <ExplorerLinks output={outputs[handle]} chainId={chainId} />
              <pre>{JSON.stringify(outputs[handle], null, 2) ?? "undefined"}</pre>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function RunPanel() {
  const status = useRunStore((state) => state.status);
  const run = useRunStore((state) => state.run);
  const runDocument = useRunStore((state) => state.document);
  const reset = useRunStore((state) => state.reset);
  const nodes = useBuilderStore(selectFlowNodes);
  const canvasChainId = useBuilderStore((state) => state.meta.chainId ?? defaultChainId);
  const chainId = runDocument ? (runDocument.chainId ?? defaultChainId) : canvasChainId;
  const selectedId = useBuilderStore((state) => {
    const selected = state.nodes.filter((node) => node.selected);
    return selected.length === 1 ? selected[0]!.id : null;
  });
  const selectNode = useSelectNode();
  const [collapsed, setCollapsed] = useState(false);
  const [inspected, setInspected] = useState<{ runId: string; nodeId: string } | null>(null);

  if (status === "idle" || (status === "failed" && !run)) return null;

  const results = run?.nodes ?? [];
  const failed = results.find((result) => result.status === "failed");
  const current =
    results.find((result) => result.nodeId === selectedId) ??
    (inspected?.runId === run?.id
      ? results.find((result) => result.nodeId === inspected?.nodeId)
      : undefined) ??
    failed ??
    results.find(Boolean);
  const labelOf = (id: string) => {
    if (runDocument) {
      const node = runDocument.nodes.find((item) => item.id === id);
      return node ? node.label || getCatalogEntry(node.type).label : "Removed node";
    }
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
          {run?.status === "failed" && <ExplainButton nodeId={failed?.nodeId} />}
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear run"
            disabled={status === "running"}
            onClick={reset}
          >
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
                    onClick={() => {
                      setInspected({ runId: run.id, nodeId: result.nodeId });
                      selectNode(result.nodeId);
                    }}
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
                <Outputs result={current} chainId={chainId} />
              </>
            ) : (
              <p className={styles.runDetailMuted}>No node ran.</p>
            )}
            {run.output && (
              /* What a Return node handed back. Only a flow published as an API reaches one. */
              <>
                <p className={styles.runDetailTitle}>Answered the caller</p>
                <dl className={styles.runOutputs}>
                  {Object.entries(run.output).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>
                        <pre>{JSON.stringify(value, null, 2) ?? "undefined"}</pre>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
