"use client";

import type { AiToolPart } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Spinner } from "@automator/ui/spinner";
import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiEditLine,
  RiLinkM,
  RiLinkUnlinkM,
  RiSettings3Line,
  RiTestTubeLine,
  RiToolsLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import { useState } from "react";
import styles from "./panel.module.css";

const icons: Record<string, RemixiconComponentType> = {
  add_node: RiAddLine,
  update_node: RiEditLine,
  remove_node: RiDeleteBinLine,
  connect: RiLinkM,
  disconnect: RiLinkUnlinkM,
  set_flow: RiSettings3Line,
  add_test: RiTestTubeLine,
};

const names: Record<string, string> = {
  add_node: "Add node",
  update_node: "Update node",
  remove_node: "Remove node",
  connect: "Connect",
  disconnect: "Disconnect",
  set_flow: "Flow settings",
  add_test: "Add test",
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** What one call did, in the vocabulary of the canvas rather than of the tool that ran. */
function label({ name, args }: AiToolPart): string {
  const action = names[name] ?? name;
  if (name === "connect" || name === "disconnect") {
    const from = text(args.source) ?? text(args.from);
    const to = text(args.target) ?? text(args.to);
    return from && to ? `${action} · ${from} → ${to}` : action;
  }
  const subject = text(args.label) ?? text(args.name) ?? text(args.id) ?? text(args.nodeId);
  return subject ? `${action} · ${subject}` : action;
}

function Step({ step }: { step: AiToolPart }) {
  const Icon = icons[step.name] ?? RiToolsLine;
  return (
    <li className={styles.step}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className={styles.stepLabel}>{label(step)}</span>
      {step.ok === undefined ? (
        <Spinner className="size-3.5 shrink-0" />
      ) : step.ok ? (
        <RiCheckLine aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <span className={styles.stepDetail}>{step.detail ?? "Rejected"}</span>
      )}
    </li>
  );
}

/**
 * The turn's tool calls. They are the interesting part while the agent works and clutter once it
 * has finished, so the list folds into its own summary the moment the turn ends.
 */
export function Steps({
  steps,
  streaming,
  id,
}: {
  steps: AiToolPart[];
  streaming: boolean;
  id: string;
}) {
  const [open, setOpen] = useState(streaming);
  const [wasStreaming, setWasStreaming] = useState(streaming);
  if (wasStreaming !== streaming) {
    setWasStreaming(streaming);
    setOpen(streaming);
  }
  const rejected = steps.filter((step) => step.ok === false).length;
  const summary = `${steps.length} ${steps.length === 1 ? "step" : "steps"}${
    rejected > 0 ? ` · ${rejected} rejected` : ""
  }`;
  return (
    <div>
      {!streaming && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {summary}
        </Button>
      )}
      <ul id={id} className={styles.steps} hidden={!open}>
        {steps.map((step) => (
          <Step key={step.id} step={step} />
        ))}
      </ul>
    </div>
  );
}
