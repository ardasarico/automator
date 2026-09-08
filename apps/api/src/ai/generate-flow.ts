import {
  aiFlowTestSchema,
  findFlowDocumentProblem,
  findFlowConfigProblems,
  flowDocumentInputSchema,
  flowNodeConfigSchemas,
  flowNodePorts,
  flowNodeTypes,
  layoutFlowPositions,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
  Type,
  type AiHistoryTurn,
  type FlowDocumentInput,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
  type GenerateFlowResponse,
  type TObject,
} from "@automator/contracts";
import {
  defaultExecutors,
  LanguageModelError,
  parseJsonAnswer,
  type ChatMessage,
  type LanguageModel,
} from "@automator/flow-engine";

import { verifyFlow } from "./verify-flow";

export const generatableNodeTypes = flowNodeTypes.filter(
  (type) => type === "logic.for-each" || defaultExecutors[type] !== undefined,
);

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

export class FlowGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowGenerationError";
  }
}

interface DraftNode {
  id: string;
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
}
interface DraftEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}
interface Draft {
  name: string;
  description: string;
  summary: string;
  nodes: DraftNode[];
  edges: DraftEdge[];
}

export function describeNodeTypes(): string {
  return generatableNodeTypes
    .map((type) => {
      const { inputs, outputs } = flowNodePorts[type];
      const schema = configSchemas[type];
      return `- ${type}: inputs [${inputs.join(", ")}], outputs [${outputs.join(", ")}], config ${JSON.stringify(schema ?? {})}`;
    })
    .join("\n");
}

export const systemPrompt =
  () => `You design automation flows for Automator, a visual canvas for onchain workflows.
A flow is a directed acyclic graph. It starts at a trigger node (a type whose inputs list is empty); every other node must have at least one incoming edge. Edges connect a source node's output handle to a target node's input handle, and each input handle takes at most one edge. Screens are pages the visitor sees in a mini-app; a run pauses there until the visitor acts.
logic.for-each repeats the steps after its Item output for each element of its items list (a JSON string or a template resolving to a list, maxItems at most 100). Its Done output carries {items, results, count} after all iterations. Put screens after Done, never inside the Item body. Do not draw a cycle to express a loop.
Config strings may reference upstream values with templates: {{input.<input handle>}} is the value delivered to that handle, {{vars.<name>}} a variable set earlier, {{trigger.<path>}} the trigger payload. The handle in {{input.<input handle>}} is always the receiving node's OWN input handle, never the upstream node's output handle: a notify.discord node reads what arrived on its "message" input as {{input.message}} (not {{input.result}} or {{input.text}}), a logic.condition reads {{input.value}}. A trigger hands its whole payload (an object, e.g. a webhook body) to its output handle, so a field of it is addressed as {{input.<input handle>.<field>}} on the next node, or {{trigger.<field>}} anywhere.

Execution rules and examples:
- screen.form fields are objects with id, label, type, required and sample. Set a unique nonempty id such as "ticketCount", type "number", required true, sample "2". Submitted form values are strings keyed by field id.
- A form wired to a condition's value input is read with {{input.value.ticketCount}}. Conditions forward the original value unchanged on true/false. A page wired to their output displays {{input.data.ticketCount}} in its body.
- A form wired to a run-code node's input is read inside JavaScript as input.ticketCount (the function receives the value of that single handle, not all handles). Example: return {totalCost: Number(input.ticketCount) * 25};. A page after it displays Total: {{input.data.totalCost}}.
- run-code requires the server sandbox and cannot run in browser preview. External service, identity and onchain nodes are not exercised by automatic checks. Do not describe those checks as proof of real delivery/payment.
- Prefer native conditions and data nodes when they suffice. Supply representative samplePayload JSON on triggers, using the actual payload shape. Missing field ids, wrong port references and failing behavior tests are rejected.

Node types you may use, with their handles and full config schemas:
${describeNodeTypes()}

Earlier turns of the conversation may come before the request; assistant turns there are the summaries the user saw, and the flow JSON in the request is always the current state of the canvas.

Answer with one JSON object and nothing else. To propose a flow:
{"name": string, "description": string, "summary": string, "nodes": [{"id": string, "type": string, "label": string, "config": object}], "edges": [{"source": string, "sourceHandle": string, "target": string, "targetHandle": string}]}
Include a "tests" array in flow answers. A mini-app with a form MUST include at least one test (at least two when it branches), with concrete answers and expected result screens or output values derived from the user's request. Include boundary cases such as 0, 4 and 5 for a 1-to-4 limit. These are test-only inputs, never changes to the saved form sample. Each test follows this schema:
${JSON.stringify(aiFlowTestSchema)}
Example: {"name":"Two tickets cost 50","answers":{"form":{"port":"submitted","data":{"ticketCount":"2"}}},"expect":[{"nodeId":"calculate","output":"output","path":"totalCost","equals":50},{"nodeId":"result","screenBody":"Total: 50"}]}.
A nodeId-only expectation asserts that the node was reached. Use output/path/equals to check a calculation, screenBody to check rendered text. Use actual node ids from the proposal. For non-mini-app triggers also provide triggerNodeId and payload.
Use short unique ids such as "n1", "n2". Labels are short and human. Only set config fields listed above; leave secrets such as webhook URLs empty for the user to fill in. "summary" is one or two sentences for the user about what the flow does or what you changed.
When the request is a question, asks for an explanation, or needs one clarification before you can build anything, answer {"message": string} instead, in plain prose; never propose a flow for a message that does not ask to build or change one. The user decides what lands on the canvas.`;

export function withoutPositions(document: FlowDocumentInput) {
  return {
    name: document.name,
    description: document.description,
    nodes: document.nodes.map(({ id, type, label, config }) => ({ id, type, label, config })),
    edges: document.edges.map(({ source, sourceHandle, target, targetHandle }) => ({
      source,
      sourceHandle,
      target,
      targetHandle,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDraft(answer: unknown): Draft {
  if (!isRecord(answer)) throw new FlowGenerationError("The answer is not a JSON object");
  if (!Array.isArray(answer.nodes) || !Array.isArray(answer.edges))
    throw new FlowGenerationError("The answer needs nodes and edges arrays");
  if (answer.nodes.length > 80)
    throw new FlowGenerationError("AI proposals are limited to 80 nodes.");
  const nodes: DraftNode[] = answer.nodes.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.type !== "string")
      throw new FlowGenerationError(`Node ${index + 1} needs an id and a type`);
    if (!(generatableNodeTypes as readonly string[]).includes(raw.type))
      throw new FlowGenerationError(`Node type "${raw.type}" is not available`);
    return {
      id: raw.id,
      type: raw.type as FlowNodeType,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : raw.type,
      config: isRecord(raw.config) ? raw.config : {},
    };
  });
  const edges: DraftEdge[] = answer.edges.map((raw, index) => {
    if (
      !isRecord(raw) ||
      typeof raw.source !== "string" ||
      typeof raw.target !== "string" ||
      typeof raw.sourceHandle !== "string" ||
      typeof raw.targetHandle !== "string"
    )
      throw new FlowGenerationError(
        `Edge ${index + 1} needs source, sourceHandle, target and targetHandle`,
      );
    return {
      source: raw.source,
      sourceHandle: raw.sourceHandle,
      target: raw.target,
      targetHandle: raw.targetHandle,
    };
  });
  return {
    name:
      typeof answer.name === "string" && answer.name.trim()
        ? answer.name.trim().slice(0, 120)
        : "Untitled flow",
    description: typeof answer.description === "string" ? answer.description.slice(0, 1000) : "",
    summary:
      typeof answer.summary === "string"
        ? answer.summary
        : typeof answer.message === "string"
          ? answer.message
          : "",
    nodes,
    edges,
  };
}

function readMessage(answer: unknown): string | undefined {
  if (!isRecord(answer) || "nodes" in answer || "edges" in answer) return undefined;
  return typeof answer.message === "string" && answer.message.trim()
    ? answer.message.trim()
    : undefined;
}

function hasCycle(nodes: DraftNode[], edges: DraftEdge[]): boolean {
  const pending = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    pending.set(edge.target, pending.get(edge.target)! + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const ready = nodes.filter((node) => pending.get(node.id) === 0).map((node) => node.id);
  let seen = 0;
  while (ready.length > 0) {
    const id = ready.pop()!;
    seen += 1;
    for (const target of outgoing.get(id)!) {
      const left = pending.get(target)! - 1;
      pending.set(target, left);
      if (left === 0) ready.push(target);
    }
  }
  return seen < nodes.length;
}

export function materialize(draft: Draft): FlowDocumentInput {
  if (draft.nodes.length === 0) throw new FlowGenerationError("The flow has no nodes");
  const nodesById = new Map<string, DraftNode>();
  for (const node of draft.nodes) {
    if (nodesById.has(node.id)) throw new FlowGenerationError(`Duplicate node id "${node.id}"`);
    nodesById.set(node.id, node);
  }
  const incoming = new Set<string>();
  const targets = new Set<string>();
  for (const edge of draft.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source) throw new FlowGenerationError(`Edge starts at unknown node "${edge.source}"`);
    if (!target) throw new FlowGenerationError(`Edge ends at unknown node "${edge.target}"`);
    if (!flowNodePorts[source.type].outputs.includes(edge.sourceHandle))
      throw new FlowGenerationError(`"${source.type}" has no output handle "${edge.sourceHandle}"`);
    if (!flowNodePorts[target.type].inputs.includes(edge.targetHandle))
      throw new FlowGenerationError(`"${target.type}" has no input handle "${edge.targetHandle}"`);
    const slot = `${edge.target}:${edge.targetHandle}`;
    if (incoming.has(slot))
      throw new FlowGenerationError(
        `Input "${edge.targetHandle}" of "${edge.target}" has two edges`,
      );
    incoming.add(slot);
    targets.add(edge.target);
  }
  if (!draft.nodes.some((node) => flowNodePorts[node.type].inputs.length === 0))
    throw new FlowGenerationError("The flow needs a trigger node");
  for (const node of draft.nodes) {
    const isTrigger = flowNodePorts[node.type].inputs.length === 0;
    if (!isTrigger && !targets.has(node.id))
      throw new FlowGenerationError(`Node "${node.id}" has no incoming edge`);
  }
  if (hasCycle(draft.nodes, draft.edges))
    throw new FlowGenerationError("The flow contains a cycle");

  const positions = layoutFlowPositions(draft.nodes, draft.edges);
  const nodes: FlowNode[] = draft.nodes.map((node) => {
    const schema = configSchemas[node.type];
    let config = node.config;
    if (schema) {
      try {
        config = parseNodeConfig(schema, node.config) as Record<string, unknown>;
      } catch {
        throw new FlowGenerationError(`Config of "${node.id}" does not fit "${node.type}"`);
      }
    }
    return {
      id: node.id,
      type: node.type,
      position: positions.get(node.id)!,
      label: node.label,
      config,
    };
  });
  const edges: FlowEdge[] = draft.edges.map((edge, index) => ({ id: `e${index + 1}`, ...edge }));
  const document: FlowDocumentInput = {
    version: 1,
    name: draft.name,
    description: draft.description,
    nodes,
    edges,
  };
  if (!Value.Check(flowDocumentInputSchema, document))
    throw new FlowGenerationError("The flow does not fit the document schema");
  const problem = findFlowDocumentProblem(document);
  if (problem) throw new FlowGenerationError(problem);
  const configProblems = findFlowConfigProblems(document);
  for (const node of document.nodes) {
    if (
      node.type === "screen.form" &&
      (!Array.isArray(node.config.fields) || node.config.fields.length === 0)
    )
      configProblems.push({
        nodeId: node.id,
        path: "config.fields",
        message: "A generated form needs at least one field.",
      });
    if (node.type === "logic.set-variable" && !String(node.config.name ?? "").trim())
      configProblems.push({
        nodeId: node.id,
        path: "config.name",
        message: "Set variable needs a name.",
      });
  }
  if (configProblems.length)
    throw new FlowGenerationError(
      configProblems
        .slice(0, 8)
        .map((p) => `${p.nodeId}.${p.path}: ${p.message}`)
        .join("\n"),
    );
  return document;
}

const modelHistoryLimit = 12;
const modelHistoryTurnLength = 1500;

export function historyMessages(history: readonly AiHistoryTurn[] = []): ChatMessage[] {
  return history
    .slice(-modelHistoryLimit)
    .filter((turn) => turn.text.trim() !== "")
    .map((turn) => ({ role: turn.role, content: turn.text.slice(0, modelHistoryTurnLength) }));
}

export async function askForFlow(
  model: LanguageModel,
  messages: ChatMessage[],
): Promise<GenerateFlowResponse> {
  let lastProblem: string | undefined;
  let pinnedTests: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const answer = await model({
      messages,
      responseFormat: { type: "json_object" },
      temperature: 0.2,
    });
    try {
      const parsed = parseJsonAnswer(answer.content);
      const message = readMessage(parsed);
      if (message !== undefined) return { kind: "message", text: message };
      const tests = pinnedTests ?? (isRecord(parsed) ? parsed.tests : undefined);
      if (
        Array.isArray(tests) &&
        tests.length &&
        Value.Check(Type.Array(aiFlowTestSchema, { maxItems: 6 }), tests)
      )
        pinnedTests = structuredClone(tests);
      const draft = readDraft(parsed);
      const document = materialize(draft);
      if (
        document.nodes.some((n) => n.type === "trigger.miniapp-open") &&
        document.nodes.some((n) => n.type === "screen.form")
      ) {
        const minimum = document.nodes.some((n) => n.type === "logic.condition") ? 2 : 1;
        if (!Array.isArray(tests) || tests.length < minimum)
          throw new FlowGenerationError(
            `This mini-app needs at least ${minimum} behavioral test scenarios with form answers and expected results.`,
          );
      }
      let verification;
      try {
        verification = await verifyFlow(document, tests);
      } catch (error) {
        throw new FlowGenerationError(
          error instanceof Error ? error.message : "Automatic checks failed",
        );
      }
      return { kind: "flow", document, summary: draft.summary, verification };
    } catch (error) {
      if (!(error instanceof FlowGenerationError) && !(error instanceof LanguageModelError))
        throw error;
      lastProblem = error.message;
      messages.push({ role: "assistant", content: answer.content ?? "" });
      messages.push({
        role: "user",
        content: `That answer is not a valid flow: ${lastProblem}. Correct the flow to satisfy the original request, preserving node ids and the original test expectations; do not weaken an expectation to match broken behavior. Answer with the corrected JSON object only.`,
      });
    }
  }
  throw new FlowGenerationError(lastProblem ?? "The model did not produce a valid flow");
}

export async function generateFlow(
  model: LanguageModel,
  prompt: string,
  current?: FlowDocumentInput,
  history?: readonly AiHistoryTurn[],
): Promise<GenerateFlowResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    ...historyMessages(history),
  ];
  if (current) {
    messages.push({
      role: "user",
      content: `Here is the current flow as JSON:\n${JSON.stringify(withoutPositions(current))}\n\nChange it as follows, keeping everything else (ids included) unless the change requires otherwise: ${prompt}`,
    });
  } else {
    messages.push({ role: "user", content: `Design a flow for this request: ${prompt}` });
  }
  return askForFlow(model, messages);
}
