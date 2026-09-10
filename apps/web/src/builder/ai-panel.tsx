"use client";

import {
  chainName,
  flowChainId,
  redactFlowSecrets,
  restoreFlowSecrets,
  type AiVerification,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Checkbox } from "@automator/ui/checkbox";
import { Field, FieldLabel } from "@automator/ui/field";
import { Textarea } from "@automator/ui/textarea";
import { RiCloseLine, RiRestartLine, RiSendPlaneLine } from "@remixicon/react";
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { describeAiFailure, formatElapsed, generateFlowRequest, takeAiAnswer } from "./ai-client";
import { historyOf, type AiProposal, type AiTurn } from "./ai-store";
import { useAiStore } from "./ai-store-provider";
import { takePendingPrompt } from "../home/pending-prompt";
import styles from "./ai-panel.module.css";
import { serializeFlow } from "./document";
import { useBuilderStore } from "./store-provider";
import { useAccessToken } from "../auth/access-token";

type ChangeKind = "added" | "removed" | "changed" | "kept";
type Change = { kind: ChangeKind; id: string; label: string; type: string };

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

/** Edge ids are bookkeeping; a connection changes when an endpoint or handle changes. */
export function diffConnections(current: readonly FlowEdge[], next: readonly FlowEdge[]) {
  const key = (edge: FlowEdge) =>
    JSON.stringify([edge.source, edge.sourceHandle, edge.target, edge.targetHandle]);
  const remaining = [...current];
  const changes: { kind: "added" | "removed"; edge: FlowEdge }[] = [];
  for (const edge of next) {
    const index = remaining.findIndex((previous) => key(previous) === key(edge));
    if (index === -1) changes.push({ kind: "added", edge });
    else remaining.splice(index, 1);
  }
  return [...changes, ...remaining.map((edge) => ({ kind: "removed" as const, edge }))];
}

function proposalDocument(proposal: AiProposal, current: FlowDocument) {
  // Only edits refer to the canvas's nodes. A new flow can reuse their ids by coincidence.
  return proposal.replaces ? proposal.document : restoreFlowSecrets(proposal.document, current);
}

const changeLabels: Record<ChangeKind, string> = {
  added: "Add",
  removed: "Remove",
  changed: "Change",
  kept: "Keep",
};

const proposalStates: Record<Exclude<AiProposal["state"], "pending">, string> = {
  applied: "Applied",
  discarded: "Discarded",
  stale: "Superseded by a later change",
};

/**
 * A report where every scenario was skipped proves nothing, and a flow presented as checked on
 * the strength of it reads as verified when it is not.
 */
function verificationHeading(verification: AiVerification): string {
  /* Loudest first: a draft that failed its checks is still on offer, and must not read as one
     that passed them. */
  if (verification.checks.some((check) => check.status === "failed"))
    return "This flow did not pass its checks";
  if (verification.checks.length === 0) return "Automatic checks did not run";
  if (verification.checks.every((check) => check.status === "skipped"))
    return "Automatic checks could not exercise this flow";
  return "Automatic checks · no external actions";
}

const checkLabels: Record<AiVerification["checks"][number]["status"], string> = {
  passed: "Passed",
  failed: "Failed",
  skipped: "Not tested",
};

/** Mounted only while a request is in flight, so each wait starts its own count at zero. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    // Measured against the clock, not counted in ticks: a throttled tab must not undercount.
    const started = Date.now();
    const timer = setInterval(() => setSeconds((Date.now() - started) / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className={styles.elapsed}>{formatElapsed(seconds)}</span>;
}

function ProposalCard({
  turn,
  proposal,
  onApply,
  onDiscard,
}: {
  turn: AiTurn;
  proposal: AiProposal;
  onApply(): void;
  onDiscard(): void;
}) {
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const meta = useBuilderStore((state) => state.meta);
  const hasNodes = nodes.length > 0;
  if (proposal.state !== "pending")
    return <p className={styles.proposalState}>{proposalStates[proposal.state]}</p>;
  const failedCheck = proposal.verification?.checks.some((check) => check.status === "failed");
  const current = serializeFlow(meta, nodes, edges);
  const next = proposalDocument(proposal, current);
  const changes = diffNodes(current.nodes, next.nodes);
  const connections = diffConnections(current.edges, next.edges);
  const settings = [
    { name: "Name", before: current.name, after: next.name },
    { name: "Description", before: current.description, after: next.description },
    { name: "Chain", before: chainName(flowChainId(current)), after: chainName(flowChainId(next)) },
  ].filter((setting) => setting.before !== setting.after);
  function endpoint(document: Pick<FlowDocument, "nodes">, id: string, handle?: string) {
    const label = document.nodes.find((node) => node.id === id)?.label || id;
    return handle ? `${label} · ${handle}` : label;
  }
  return (
    <div className={styles.preview} role="region" aria-label="Proposed flow">
      {proposal.verification && (
        <div className="space-y-2 text-caption wrap-anywhere" aria-label="Automatic checks">
          {/* Nothing was exercised, or something failed: saying "checked" here would be the lie
              the panel used to tell. */}
          <p data-failed={failedCheck ? "" : undefined}>
            {verificationHeading(proposal.verification)}
          </p>
          <ul>
            {proposal.verification.checks.map((check, index) => (
              <li key={index}>
                {checkLabels[check.status]}: {check.name} — {check.detail}
              </li>
            ))}
          </ul>
          {proposal.verification.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      )}
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
            key={`${turn.id}:${change.kind}:${change.id}`}
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
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" variant={failedCheck ? "outline" : undefined} onClick={onApply}>
          {proposal.replaces && hasNodes ? "Replace canvas" : "Apply changes"}
        </Button>
      </div>
    </div>
  );
}

/* Openers that show the range of what the agent handles, so the panel is not a blank column. */
const startSuggestions = [
  "Every hour, check my USDC balance and post it to Discord",
  "A mini-app that collects an email and saves it to a table",
  "When a webhook arrives, classify it with AI and route each kind",
];

const editSuggestions = [
  "Add a condition before the last step",
  "Send a Discord message when this fails",
  "What does this flow do?",
];

export function AiPanel() {
  const getAccessToken = useAccessToken();
  const { fitView } = useReactFlow();
  const meta = useBuilderStore((state) => state.meta);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const applyDocument = useBuilderStore((state) => state.applyDocument);
  const turns = useAiStore((state) => state.turns);
  const pending = useAiStore((state) => state.pending);
  const ask = useAiStore((state) => state.ask);
  const answer = useAiStore((state) => state.answer);
  const fail = useAiStore((state) => state.fail);
  const apply = useAiStore((state) => state.apply);
  const discard = useAiStore((state) => state.discard);
  const clear = useAiStore((state) => state.clear);
  const hasNodes = nodes.length > 0;
  const [prompt, setPrompt] = useState("");
  const [edit, setEdit] = useState(true);
  /* The wait runs into minutes, so the panel stays interruptible for as long as it lasts. */
  const request = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  const focusRequests = useAiStore((state) => state.focusRequests);

  const editing = hasNodes && edit;

  useEffect(() => {
    const element = thread.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns, pending]);

  useEffect(() => {
    if (focusRequests > 0) promptField.current?.focus();
  }, [focusRequests]);

  /*
   * Home asks the model before it creates anything, so a draft that fails never becomes a flow.
   * What arrives here is the question and its answer, replayed into the thread as if it had been
   * asked from this panel. Both are read once: reloading this page neither replays nor re-asks.
   * A handover that lost its answer still carries the prompt, and asks again from here.
   */
  const handedOver = useRef(false);
  const latestSend = useRef<(text: string) => Promise<void>>(async () => {});
  /* Declared first, so the handover below always calls the current render's send. */
  useEffect(() => {
    latestSend.current = send;
  });
  useEffect(() => {
    if (handedOver.current || focusRequests === 0) return;
    handedOver.current = true;
    const text = takePendingPrompt();
    if (text === null) return;
    const drafted = takeAiAnswer();
    if (drafted === null) void latestSend.current(text);
    else answer(ask(text), drafted, { replaces: true });
  }, [focusRequests, ask, answer]);

  async function send(handed?: string) {
    const text = (handed ?? prompt).trim();
    if (!text || pending) return;
    const askId = ask(text);
    if (handed === undefined) setPrompt("");
    const { id: _id, ...document } = serializeFlow(meta, nodes, edges);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await generateFlowRequest(
        await getAccessToken(),
        {
          prompt: text,
          ...(editing ? { document: redactFlowSecrets(document) } : {}),
          history: historyOf(turns),
        },
        controller.signal,
      );
      answer(askId, result, { replaces: !editing });
    } catch (error) {
      fail(
        askId,
        controller.signal.aborted ? "Stopped before the model answered." : describeAiFailure(error),
      );
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function applyProposal(turn: AiTurn, proposal: AiProposal) {
    applyDocument(proposalDocument(proposal, serializeFlow(meta, nodes, edges)));
    apply(turn.id);
    // Nodes are new to React Flow on this render; fit once they have been measured.
    setTimeout(() => void fitView({ padding: 0.2, duration: 300 }), 80);
  }

  return (
    <div className={styles.panel}>
      <div ref={thread} className={styles.thread} role="log" aria-label="AI conversation">
        {turns.length === 0 && (
          <div className={styles.empty}>
            <p>
              {hasNodes
                ? "Ask for a change to this flow, or a question about it. Nothing lands on the canvas until you apply it."
                : "Describe what the flow should do. The canvas is empty, so the first answer becomes a new flow."}
            </p>
            {/* The panel is a blank column until someone knows what to type into it. */}
            <ul className={styles.suggestions}>
              {(hasNodes ? editSuggestions : startSuggestions).map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => {
                      setPrompt(suggestion);
                      promptField.current?.focus();
                    }}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className={styles.userTurn}>
              {turn.text}
            </div>
          ) : (
            <div
              key={turn.id}
              className={styles.assistantTurn}
              data-error={turn.error ? "" : undefined}
            >
              <p className={styles.summary} role={turn.error ? "alert" : undefined}>
                {turn.text}
              </p>
              {turn.proposal && (
                <ProposalCard
                  turn={turn}
                  proposal={turn.proposal}
                  onApply={() => applyProposal(turn, turn.proposal!)}
                  onDiscard={() => discard(turn.id)}
                />
              )}
            </div>
          ),
        )}
        {pending && (
          <div className={styles.waiting} role="status">
            <p className={styles.thinking}>
              Drafting the flow… <Elapsed />
            </p>
            {/* One request: the panel names what the wait covers rather than inventing a
                progress bar it cannot measure. */}
            <p className={styles.thinking}>
              It drafts, checks the result, and repairs it once if the checks fail. A couple of
              minutes is normal.
            </p>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => request.current?.abort()}
              >
                <RiCloseLine aria-hidden="true" />
                Stop
              </Button>
            </div>
          </div>
        )}
      </div>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Field>
          <FieldLabel htmlFor="ai-prompt" className="sr-only">
            Message
          </FieldLabel>
          <Textarea
            ref={promptField}
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
              if (
                !event.nativeEvent.isComposing &&
                (event.metaKey || event.ctrlKey) &&
                event.key === "Enter"
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
        </Field>
        <div className={styles.row}>
          {hasNodes ? (
            <Field className="flex-row items-center gap-2">
              <Checkbox
                id="ai-edit"
                checked={editing}
                onCheckedChange={(checked) => setEdit(checked === true)}
              />
              <FieldLabel htmlFor="ai-edit" className="text-caption">
                Edit the current flow
              </FieldLabel>
            </Field>
          ) : (
            <span className={styles.hint}>New flow</span>
          )}
          <span className="ml-auto flex items-center gap-1">
            {turns.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clear();
                  setPrompt("");
                }}
              >
                <RiRestartLine aria-hidden="true" />
                Start over
              </Button>
            )}
            <Button type="submit" size="sm" loading={pending} disabled={!prompt.trim()}>
              <RiSendPlaneLine aria-hidden="true" />
              Send
            </Button>
          </span>
        </div>
      </form>
    </div>
  );
}
