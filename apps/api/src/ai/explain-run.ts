import {
  redactFlowSecrets,
  redactRunOutputs,
  type ExplainRunRequest,
  type ExplainRunResponse,
} from "@automator/contracts";
import type { ChatMessage, LanguageModel } from "@automator/flow-engine";
import { askForFlow, systemPrompt, withoutPositions } from "./generate-flow";

/** How much of one node's outputs, or the trigger payload, the model gets to read. */
const outputLength = 600;

function excerpt(value: unknown): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > outputLength ? `${text.slice(0, outputLength)}…` : text;
}

const explainInstructions = `You are now helping the user understand a run of their flow that did not go as planned. You get the flow, every node's result in execution order, and the node to explain. Secrets and webhook URLs are redacted in what you see; that redaction is not the problem.
Answer {"message": string}: two to four plain sentences saying why the node failed and the one concrete thing the user should do to fix it (which node, which field, what value, or which edge). Name nodes by their labels.
Only when the fix is a change to node config or wiring you can make yourself, answer with the complete corrected flow instead (the flow JSON format, with "summary" holding the same explanation and fix); keep every id and every setting you do not need to change, and leave secret fields such as webhook URLs as they are for the user to fill in. A missing secret, a wallet without funds, an unreachable service or a model that is not configured are not fixes you can make: explain them in a message.`;

/**
 * Asks the model why a run failed and how to fix it. The answer is a message, or a proposed
 * document validated exactly like `generateFlow` answers when the fix is a config or wiring
 * change. The document's secret fields and the run's outputs are redacted again here, so the
 * model never sees a credential even when a client forgot to.
 */
export async function explainRun(
  model: LanguageModel,
  request: ExplainRunRequest,
): Promise<ExplainRunResponse> {
  const document = redactFlowSecrets(request.document);
  const run = redactRunOutputs(request.run);
  const failed =
    run.nodes.find((node) => node.nodeId === request.nodeId) ??
    run.nodes.find((node) => node.status === "failed");
  const labelOf = (id: string) => {
    const node = document.nodes.find((entry) => entry.id === id);
    return node ? `${node.label || node.type} (${id})` : `removed node (${id})`;
  };
  const results = run.nodes
    .map((node) => {
      const parts = [`- ${labelOf(node.nodeId)}: ${node.status}`];
      if (node.error) parts.push(`error: ${node.error}`);
      if (node.outputs && Object.keys(node.outputs).length > 0)
        parts.push(`outputs: ${excerpt(node.outputs)}`);
      return parts.join("; ");
    })
    .join("\n");
  const subject = failed
    ? `Explain why ${labelOf(failed.nodeId)} failed and how to fix it.`
    : run.error
      ? "Explain why the run failed as a whole and how to fix it."
      : "Explain what this run did and whether anything should change.";
  const content = [
    `Here is the flow as JSON:\n${JSON.stringify(withoutPositions(document))}`,
    `The run ${run.status}${run.error ? ` with the error: ${run.error}` : ""}. It was started by ${
      run.trigger.nodeId ? labelOf(run.trigger.nodeId) : "no trigger node"
    }${run.trigger.payload === undefined ? "" : ` with the payload ${excerpt(run.trigger.payload)}`}.`,
    `Node results in execution order:\n${results || "(no node ran)"}`,
    subject,
  ].join("\n\n");
  const messages: ChatMessage[] = [
    { role: "system", content: `${systemPrompt()}\n\n${explainInstructions}` },
    { role: "user", content },
  ];
  return askForFlow(model, messages);
}
