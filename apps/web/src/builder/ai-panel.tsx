"use client";

import type { FlowDocumentInput, FlowNode } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Checkbox } from "@automator/ui/checkbox";
import { Field, FieldLabel } from "@automator/ui/field";
import { Textarea } from "@automator/ui/textarea";
import { RiSparklingLine } from "@remixicon/react";
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { AiRequestError, generateFlowRequest } from "./ai-client";
import styles from "./ai-panel.module.css";
import { serializeFlow } from "./document";
import { useBuilderStore } from "./store-provider";
import { useAccessToken } from "../auth/access-token";

type ChangeKind = "added" | "removed" | "changed" | "kept";
type Change = { kind: ChangeKind; id: string; label: string; type: string };

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  unavailable: "AI is not available right now. Check that the API has an OpenRouter key.",
  invalid_flow: "The model could not produce a valid flow for that. Try rephrasing.",
  invalid_request: "The request was rejected. Shorten the prompt and try again.",
};

/** What applying `next` would do to the canvas, node by node, in the order the canvas will show. */
export function diffNodes(current: readonly FlowNode[], next: readonly FlowNode[]): Change[] {
  const before = new Map(current.map((node) => [node.id, node]));
  const changes: Change[] = next.map((node) => {
    const previous = before.get(node.id);
    if (!previous) return { kind: "added", id: node.id, label: node.label, type: node.type };
    const same =
      previous.type === node.type &&
      previous.label === node.label &&
      JSON.stringify(previous.config) === JSON.stringify(node.config);
    return { kind: same ? "kept" : "changed", id: node.id, label: node.label, type: node.type };
  });
  const after = new Set(next.map((node) => node.id));
  for (const node of current) {
    if (!after.has(node.id))
      changes.push({ kind: "removed", id: node.id, label: node.label, type: node.type });
  }
  return changes;
}

const changeLabels: Record<ChangeKind, string> = {
  added: "Add",
  removed: "Remove",
  changed: "Change",
  kept: "Keep",
};

/**
 * The AI panel: a prompt that designs a new flow or, when the canvas has nodes and the box is
 * ticked, edits the current one. The answer is previewed as a node-by-node list of changes
 * and only lands on the canvas when applied.
 */
export function AiPanel() {
  const getAccessToken = useAccessToken();
  const { fitView } = useReactFlow();
  const meta = useBuilderStore((state) => state.meta);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const applyDocument = useBuilderStore((state) => state.applyDocument);
  const hasNodes = nodes.length > 0;
  const [prompt, setPrompt] = useState("");
  const [edit, setEdit] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ document: FlowDocumentInput; summary: string } | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const editing = hasNodes && edit;

  async function generate() {
    const text = prompt.trim();
    if (!text || pending) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const { id: _id, ...document } = serializeFlow(meta, nodes, edges);
      const answer = await generateFlowRequest(
        await getAccessToken(),
        editing ? { prompt: text, document } : { prompt: text },
        current.signal,
      );
      if (controller.current === current) setResult(answer);
    } catch (caught) {
      if (controller.current !== current) return;
      const code = caught instanceof AiRequestError ? caught.code : "unavailable";
      setError(failureMessages[code] ?? "The flow could not be generated. Please try again.");
    } finally {
      if (controller.current === current) setPending(false);
    }
  }

  function apply() {
    if (!result) return;
    applyDocument(result.document);
    setResult(null);
    setPrompt("");
    // Nodes are new to React Flow on this render; fit once they have been measured.
    setTimeout(() => void fitView({ padding: 0.2, duration: 300 }), 80);
  }

  const changes = result
    ? diffNodes(
        nodes.map((node) => ({ ...node.data, id: node.id, position: node.position })),
        result.document.nodes,
      )
    : [];

  return (
    <div className={styles.panel}>
      <Field>
        <FieldLabel htmlFor="ai-prompt">
          {editing ? "What should change?" : "What should this flow do?"}
        </FieldLabel>
        <Textarea
          id="ai-prompt"
          className={styles.prompt}
          placeholder={
            editing
              ? "Add a condition before the Discord message that checks the amount"
              : "When a webhook fires, post the payload to Discord if the amount is over 10"
          }
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void generate();
          }}
        />
      </Field>
      <div className={styles.row}>
        <Field className="flex-row items-center gap-2">
          <Checkbox
            id="ai-edit"
            checked={editing}
            disabled={!hasNodes}
            onCheckedChange={(checked) => setEdit(checked === true)}
          />
          <FieldLabel htmlFor="ai-edit" className="text-caption">
            Edit the current flow
          </FieldLabel>
        </Field>
        <Button size="sm" loading={pending} disabled={!prompt.trim()} onClick={generate}>
          <RiSparklingLine aria-hidden="true" />
          Generate
        </Button>
      </div>
      {!hasNodes && (
        <p className={styles.hint}>The canvas is empty, so the answer becomes a new flow.</p>
      )}
      {error && (
        <p role="alert" className="text-caption text-destructive-text">
          {error}
        </p>
      )}
      {result && (
        <div className={styles.preview} role="region" aria-label="Proposed flow">
          <p className={styles.summary}>
            {result.summary || result.document.description || result.document.name}
          </p>
          <ul className={styles.changes}>
            {changes.map((change) => (
              <li
                key={`${change.kind}:${change.id}`}
                className={styles.change}
                data-kind={change.kind}
              >
                <span className={styles.changeKind}>{changeLabels[change.kind]}</span>
                <span className={styles.changeLabel}>{change.label}</span>
                <span className={styles.changeType}>{change.type}</span>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              Discard
            </Button>
            <Button size="sm" onClick={apply}>
              {editing ? "Apply changes" : "Replace canvas"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
