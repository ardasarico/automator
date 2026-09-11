import {
  redactRunOutputs,
  type AiContext,
  type AiRunContext,
  type FlowDocumentInput,
} from "@automator/contracts";
import { describeDataTables, describeNodeTypes, withoutPositions, type AiDataTable } from "./draft";

const graphRules = `A flow is a directed acyclic graph. It starts at a trigger node (a type whose inputs list is empty); every other node must have at least one incoming edge. Edges connect a source node's output handle to a target node's input handle, and each input handle takes at most one edge. Screens are pages the visitor sees in a mini-app; a run pauses there until the visitor acts.
logic.for-each repeats the steps after its Item output for each element of its items list (a JSON string or a template resolving to a list, maxItems at most 100). Its Done output carries {items, results, count} after all iterations. Put screens after Done, never inside the Item body. Do not draw a cycle to express a loop.`;

const templateRules = `Config strings may reference upstream values with templates: {{input.<input handle>}} is the value delivered to that handle, {{vars.<name>}} a variable set earlier, {{trigger.<path>}} the trigger payload. The handle in {{input.<input handle>}} is always the receiving node's OWN input handle, never the upstream node's output handle: a notify.discord node reads what arrived on its "message" input as {{input.message}} (not {{input.result}} or {{input.text}}), a logic.condition reads {{input.value}}. A trigger hands its whole payload (an object, e.g. a webhook body) to its output handle, so a field of it is addressed as {{input.<input handle>.<field>}} on the next node, or {{trigger.<field>}} anywhere.`;

const executionRules = `Execution rules and examples:
- screen.form fields are objects with id, label, type, required and sample. Set a unique nonempty id such as "ticketCount", type "number", required true, sample "2". Submitted form values are strings keyed by field id.
- A form wired to a condition's value input is read with {{input.value.ticketCount}}. Conditions forward the original value unchanged on true/false. A page wired to their output displays {{input.data.ticketCount}} in its body.
- A form wired to a run-code node's input is read inside JavaScript as input.ticketCount (the function receives the value of that single handle, not all handles). Example: return {totalCost: Number(input.ticketCount) * 25};. A page after it displays Total: {{input.data.totalCost}}.
- run-code requires the server sandbox and cannot run in browser preview. External service, identity and onchain nodes are not exercised by automatic checks. Do not describe those checks as proof of real delivery/payment.
- graph.query-subgraph sends a GraphQL query to a subgraph on The Graph Network and outputs the response's data object on its data handle, so the next node reads a field as {{input.<its input handle>.<entity>.<field>}}. Put variable values in the variables JSON, not in the query text. ai.agent may be given the query_subgraph tool, which reads only the subgraph named in its config.
- Prefer native conditions and data nodes when they suffice. Supply representative samplePayload JSON on triggers, using the actual payload shape. Missing field ids, wrong port references and failing behavior tests are rejected.`;

export const systemPrompt = (
  tables?: readonly AiDataTable[],
) => `You design automation flows for Automator, a visual canvas for onchain workflows.
${graphRules}
${templateRules}

${executionRules}

Node types you may use, with their handles and full config schemas:
${describeNodeTypes()}

The data tables of the account making this request:
${describeDataTables(tables ?? [])}

You work on the flow with tools. Build or change it with add_node, update_node, remove_node, connect, disconnect and set_flow; each call is checked as you make it and a rejected call tells you why, so fix that one thing and continue. The flow is complete when it has a trigger (a type whose inputs list is empty), every other node has an incoming edge, and there is no cycle. Use short unique ids such as "n1". Only set config fields listed above; leave secrets such as webhook URLs empty for the user to fill in.
A mini-app with a form MUST get at least one add_test scenario (two when it branches) with concrete answers and expected screens or values from the user's request; include boundary cases. A non-mini-app flow may get a test with triggerNodeId and payload. Use actual node ids.
When the request is a question or asks for an explanation, answer in prose and call no tool. When you need one clarification before you can build anything, call ask_user and stop. After a turn that changed the flow, call suggest_next once with up to three follow-ups.
Write your answer for the user in short Markdown: what you did or found, and anything they must fill in. Never paste JSON of the flow. The user decides what lands on the canvas.`;

const outputLength = 600;

function excerpt(value: unknown): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > outputLength ? `${text.slice(0, outputLength)}…` : text;
}

/**
 * A run the user asked about, as the model sees it: every node's result in execution order and
 * the one thing to explain. Node ids rather than labels, because the flow JSON in the same turn
 * already carries the labels.
 */
export function describeRun(context: AiRunContext): string {
  const run = redactRunOutputs(context);
  const subject =
    run.nodes.find((node) => node.nodeId === context.nodeId) ??
    run.nodes.find((node) => node.status === "failed");
  const results = run.nodes
    .map((node) => {
      const parts = [`- ${node.nodeId}: ${node.status}`];
      if (node.error) parts.push(`error: ${node.error}`);
      if (node.outputs && Object.keys(node.outputs).length > 0)
        parts.push(`outputs: ${excerpt(node.outputs)}`);
      return parts.join("; ");
    })
    .join("\n");
  return [
    `The run ${run.status}${run.error ? ` with the error: ${run.error}` : ""}. It was started by ${
      run.trigger.nodeId ?? "no trigger node"
    }${run.trigger.payload === undefined ? "" : ` with the payload ${excerpt(run.trigger.payload)}`}. Secrets and webhook URLs are redacted in what you see; that redaction is not the problem.`,
    `Node results in execution order:\n${results || "(no node ran)"}`,
    subject
      ? subject.status === "failed"
        ? `Explain node ${subject.nodeId}: why it failed and how to fix it.`
        : `Explain what happened at node ${subject.nodeId}.`
      : run.error
        ? "Explain why the run failed as a whole and how to fix it."
        : "Explain what this run did and whether anything should change.",
    "If the fix is a config or wiring change, make it with the tools; otherwise explain the cause and one concrete fix.",
  ].join("\n\n");
}

export function userTurn(
  text: string,
  current: FlowDocumentInput | undefined,
  context: AiContext | undefined,
): string {
  const sections: string[] = [];
  if (current)
    sections.push(
      `Current flow as JSON:\n${JSON.stringify(withoutPositions(current))}\nChange it with the tools, keeping everything else (ids included) unless the request requires otherwise.`,
    );
  else sections.push("The canvas is empty: design a new flow with the tools.");
  if (context?.selection?.length) sections.push(`Selected nodes: ${context.selection.join(", ")}`);
  if (context?.problems?.length)
    sections.push(
      `The builder reports these problems:\n${context.problems
        .map(
          (problem) =>
            `- [${problem.severity}] ${problem.nodeId ? `${problem.nodeId}: ` : ""}${problem.message}`,
        )
        .join("\n")}`,
    );
  if (context?.run) sections.push(describeRun(context.run));
  sections.push(`Request: ${text}`);
  return sections.join("\n\n");
}
