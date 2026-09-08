import {
  chainName,
  explorerTransactionUrl,
  flowChainId,
  type FlowDocument,
  type FlowRunNodeResult,
  type FlowRunRecord,
} from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import {
  RiArrowDownSLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFlowChart,
} from "@remixicon/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCatalogEntry, type CatalogIcon } from "../../../../builder/catalog";
import { CatalogIconMark } from "../../../../builder/catalog-icon";
import {
  elapsedMs,
  formatElapsed,
  outputHandles,
  simulatedAnswer,
  transactionHashes,
} from "../../../../builder/run-selectors";
import { WorkspaceBreadcrumbs } from "../../../../components/workspace-breadcrumbs";
import { LocalTime } from "../local-time";
import { formatDuration, nodeStatusLabels, runSourceLabels, runStatusLabels } from "../run-labels";
import styles from "./run-detail.module.css";

type NodeFacts = { label: string; type?: string; icon?: CatalogIcon };

function nodeFacts(document: FlowDocument, nodeId: string): NodeFacts {
  const node = document.nodes.find((item) => item.id === nodeId);
  if (!node) return { label: "Removed node" };
  const entry = getCatalogEntry(node.type);
  return { label: node.label || entry.label, type: entry.label, icon: entry.icon };
}

function Json({ value }: { value: unknown }) {
  return (
    <div className={styles.json}>
      <pre>{JSON.stringify(value, null, 2) ?? "undefined"}</pre>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ExplorerLinks({ output, chainId }: { output: unknown; chainId: number }) {
  const hashes = transactionHashes(output);
  if (hashes.length === 0) return null;
  return (
    <p className={styles.explorer}>
      {hashes.map((hash) => {
        const url = explorerTransactionUrl(chainId, hash);
        if (!url) return null;
        return (
          <a key={hash} href={url} target="_blank" rel="noreferrer">
            {`View on ${chainName(chainId)}`}
            <RiExternalLinkLine aria-hidden="true" />
          </a>
        );
      })}
    </p>
  );
}

function StepBody({ result, chainId }: { result: FlowRunNodeResult; chainId: number }) {
  if (result.status === "failed")
    return <p className={styles.error}>{result.error ?? "This node failed."}</p>;
  if (result.status === "skipped")
    return <p className={styles.muted}>No incoming edge fired, so this node did not run.</p>;
  if (result.status === "waiting")
    return <p className={styles.muted}>The run stopped here until a visitor acts.</p>;
  const outputs = result.outputs ?? {};
  const handles = outputHandles(result);
  const answer = simulatedAnswer(result);
  return (
    <>
      {answer && (
        <p className={styles.muted}>
          {`Auto-answered: Simulate answered this screen for the visitor and continued on “${answer.port}”.`}
        </p>
      )}
      {handles.length === 0 ? (
        <p className={styles.muted}>This node produced no outputs.</p>
      ) : (
        <dl className={styles.outputs}>
          {handles.map((handle) => (
            <div key={handle}>
              <dt>{handle}</dt>
              <dd>
                <ExplorerLinks output={outputs[handle]} chainId={chainId} />
                <Json value={outputs[handle]} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

function Step({
  result,
  facts,
  chainId,
}: {
  result: FlowRunNodeResult;
  facts: NodeFacts;
  chainId: number;
}) {
  const status = nodeStatusLabels[result.status];
  const elapsed = elapsedMs(result);
  const open = result.status === "failed" || result.status === "waiting";
  return (
    <li>
      <details className={styles.step} open={open}>
        <summary>
          <span className={styles.stepIcon}>
            {facts.icon ? <CatalogIconMark icon={facts.icon} /> : null}
          </span>
          <span className={styles.stepLabel}>{facts.label}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
          {elapsed !== undefined && (
            <span className={styles.stepElapsed}>{formatElapsed(elapsed)}</span>
          )}
          <RiArrowDownSLine aria-hidden="true" className={`${styles.stepChevron} size-4`} />
        </summary>
        <div className={styles.stepBody}>
          {facts.type && facts.type !== facts.label && (
            <p className={styles.nodeType}>{facts.type}</p>
          )}
          <StepBody result={result} chainId={chainId} />
        </div>
      </details>
    </li>
  );
}

export function RunDetail({ record }: { record: FlowRunRecord }) {
  const { run, document, flowName, source } = record;
  const status = runStatusLabels[run.status];
  const chainId = flowChainId(document);
  const trigger = run.trigger.nodeId ? nodeFacts(document, run.trigger.nodeId) : null;
  const variables = Object.entries(run.variables);
  const canvasHref = `/flows/${run.flowId}?run=${encodeURIComponent(run.id)}`;
  return (
    <>
      <WorkspaceBreadcrumbs parents={[{ label: "Runs", href: "/runs" }]} current={flowName} />
      <div className={styles.header}>
        <p className={styles.meta}>
          <Badge variant={status.variant}>{status.label}</Badge>
          <span>{runSourceLabels[source]}</span>
          <span>
            Started <LocalTime value={run.startedAt} />
          </span>
          <span>{formatDuration(run.startedAt, run.finishedAt)}</span>
        </p>
        <Button variant="outline" render={<Link href={canvasHref} />}>
          <RiFlowChart aria-hidden="true" />
          Open on canvas
        </Button>
      </div>

      {run.error && (
        <p className={styles.callout}>
          <RiErrorWarningLine aria-hidden="true" />
          <span>{run.error}</span>
        </p>
      )}

      <Section title="Trigger" id="run-trigger">
        <div className={styles.card}>
          {trigger ? (
            <p className={styles.node}>
              {trigger.icon && <CatalogIconMark icon={trigger.icon} />}
              <span className={styles.nodeLabel}>{trigger.label}</span>
              {trigger.type && trigger.type !== trigger.label && (
                <span className={styles.nodeType}>{trigger.type}</span>
              )}
            </p>
          ) : (
            <p className={styles.muted}>No trigger node fired.</p>
          )}
          {run.trigger.payload === undefined ? (
            <p className={`${styles.muted} mt-2`}>No payload</p>
          ) : (
            <Json value={run.trigger.payload} />
          )}
        </div>
      </Section>

      <Section title="Steps" id="run-steps">
        {run.nodes.length === 0 ? (
          <p className={`${styles.card} ${styles.muted}`}>No node ran.</p>
        ) : (
          <ol className={styles.steps}>
            {run.nodes.map((result) => (
              <Step
                key={result.nodeId}
                result={result}
                facts={nodeFacts(document, result.nodeId)}
                chainId={chainId}
              />
            ))}
          </ol>
        )}
      </Section>

      {variables.length > 0 && (
        <Section title="Variables" id="run-variables">
          <div className={styles.card}>
            <dl className={styles.variables}>
              {variables.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt>{key}</dt>
                  <dd>
                    <Json value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      )}
    </>
  );
}
