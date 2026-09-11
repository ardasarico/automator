"use client";

import {
  chainName,
  flowChainId,
  restoreFlowSecrets,
  type AiProposalPart,
  type AiProposalState,
  type AiVerification,
  type FlowDocument,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { RiErrorWarningLine } from "@remixicon/react";
import { useState } from "react";
import { serializeFlow } from "../document";
import { useBuilderStore } from "../store-provider";
import { diffConnections, diffNodes, type DraftKind } from "./diff";
import styles from "./panel.module.css";

const changeLabels: Record<DraftKind, string> = {
  added: "Add",
  removed: "Remove",
  changed: "Change",
  kept: "Keep",
};

const proposalStates: Record<Exclude<AiProposalState, "pending">, string> = {
  applied: "Applied",
  discarded: "Discarded",
  stale: "Superseded by a later change",
};

/**
 * The one sentence the card leads with. A report where every scenario was skipped proves nothing,
 * and a flow presented as checked on the strength of it reads as verified when it is not.
 */
function verificationSentence(verification: AiVerification): string {
  if (verification.checks.length === 0) return "Automatic checks did not run.";
  if (verification.checks.every((check) => check.status === "skipped"))
    return "Automatic checks could not exercise this flow.";
  return "Checks passed, no external actions were taken.";
}

const checkLabels: Record<AiVerification["checks"][number]["status"], string> = {
  passed: "Passed",
  failed: "Failed",
  skipped: "Not tested",
};

function endpoint(document: Pick<FlowDocument, "nodes">, id: string, handle?: string) {
  const label = document.nodes.find((node) => node.id === id)?.label || id;
  return handle ? `${label} · ${handle}` : label;
}

export function ProposalCard({
  messageId,
  proposal,
  onApply,
  onDiscard,
}: {
  messageId: string;
  proposal: AiProposalPart;
  onApply(): void;
  onDiscard(): void;
}) {
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const meta = useBuilderStore((state) => state.meta);
  const failedCheck =
    proposal.state === "pending" &&
    proposal.verification.checks.some((check) => check.status === "failed");
  /* A draft that failed its checks is not a draft to skim: its detail opens with the card. */
  const [open, setOpen] = useState(failedCheck);
  const hasNodes = nodes.length > 0;
  if (proposal.state !== "pending")
    return <p className={styles.proposalState}>{proposalStates[proposal.state]}</p>;
  const current = serializeFlow(meta, nodes, edges);
  // Only edits refer to the canvas's nodes. A new flow can reuse their ids by coincidence.
  const next = proposal.replaces
    ? proposal.document
    : restoreFlowSecrets(proposal.document, current);
  const changes = diffNodes(current.nodes, next.nodes);
  const connections = diffConnections(current.edges, next.edges);
  const settings = [
    { name: "Name", before: current.name, after: next.name },
    { name: "Description", before: current.description, after: next.description },
    { name: "Chain", before: chainName(flowChainId(current)), after: chainName(flowChainId(next)) },
  ].filter((setting) => setting.before !== setting.after);
  const changed = changes.filter((change) => change.kind !== "kept").length + connections.length;
  const details = `${messageId}-details`;
  return (
    <div className={styles.preview} role="region" aria-label="Proposed flow">
      <p className={styles.previewTitle} data-failed={failedCheck ? "" : undefined}>
        {failedCheck && <RiErrorWarningLine aria-hidden="true" className="size-4 shrink-0" />}
        {failedCheck
          ? "This draft did not pass its checks"
          : `Draft ready · ${changed} ${changed === 1 ? "change" : "changes"}`}
      </p>
      <p className={styles.previewSummary}>
        {failedCheck
          ? "You can still apply it and fix the rest on the canvas."
          : verificationSentence(proposal.verification)}
      </p>
      <div id={details} hidden={!open} className={styles.previewDetails}>
        <ul className="space-y-1 text-caption wrap-anywhere" aria-label="Automatic checks">
          {proposal.verification.checks.map((check, index) => (
            <li key={index} data-failed={check.status === "failed" ? "" : undefined}>
              {checkLabels[check.status]}: {check.name} — {check.detail}
            </li>
          ))}
        </ul>
        {/* Warnings are about the report, not about one check, so they stand apart from the list. */}
        {proposal.verification.warnings.map((warning, index) => (
          <p key={index} className={styles.previewSummary}>
            {warning}
          </p>
        ))}
        {settings.length > 0 && (
          <ul className="space-y-1 text-caption wrap-anywhere" aria-label="Flow settings changes">
            {settings.map((setting) => (
              <li key={setting.name}>
                {setting.name}: {setting.before || "(empty)"} → {setting.after || "(empty)"}
              </li>
            ))}
          </ul>
        )}
        <ul className={styles.changes}>
          {changes.map((change) => (
            <li
              key={`${messageId}:${change.kind}:${change.id}`}
              className={styles.change}
              data-kind={change.kind}
            >
              <span className={styles.changeKind}>{changeLabels[change.kind]}</span>
              <span className={styles.changeLabel}>{change.label}</span>
              <span className={styles.changeType}>{change.type}</span>
            </li>
          ))}
        </ul>
        {connections.length > 0 && (
          <ul className={styles.changes} aria-label="Connection changes">
            {connections.map(({ kind, edge }) => {
              const document = kind === "removed" ? current : next;
              return (
                <li key={`${kind}:${edge.id}`} className={styles.change} data-kind={kind}>
                  <span className={styles.changeKind}>{changeLabels[kind]}</span>
                  <span className="min-w-0 wrap-anywhere">
                    {endpoint(document, edge.source, edge.sourceHandle)} →{" "}
                    {endpoint(document, edge.target, edge.targetHandle)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={details}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide details" : "Details"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onDiscard}>
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          variant={failedCheck ? "outline" : undefined}
          onClick={onApply}
        >
          {proposal.replaces && hasNodes ? "Replace canvas" : "Apply changes"}
        </Button>
      </div>
    </div>
  );
}
