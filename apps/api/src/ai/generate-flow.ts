import {
  findFlowDocumentProblem,
  flowDocumentInputSchema,
  flowNodeConfigSchemas,
  flowNodePorts,
  flowNodeTypes,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
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

/** The model may only use types the engine or the mini-app can run today. */
export const generatableNodeTypes = flowNodeTypes.filter(
  (type) => defaultExecutors[type] !== undefined,
);

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

/** The model produced something that is not a usable flow; the message says why. */
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

function describeSchema(schema: TObject): string {
  const fields = Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(
    ([name, property]) => {
      const type = Array.isArray(property.anyOf)
        ? (property.anyOf as { const?: unknown }[])
            .map((option) => JSON.stringify(option.const))
            .join("|")
        : String(property.type ?? "unknown");
      return `${name}: ${type}${property.default === undefined ? "" : ` (default ${JSON.stringify(property.default)})`}`;
    },
  );
  return fields.length > 0 ? `{ ${fields.join(", ")} }` : "{}";
}

/** What the model is told about each node type: id, handles, and the config fields it can set. */
export function describeNodeTypes(): string {
  return generatableNodeTypes
    .map((type) => {
      const { inputs, outputs } = flowNodePorts[type];
      const schema = configSchemas[type];
      return `- ${type}: inputs [${inputs.join(", ")}], outputs [${outputs.join(", ")}], config ${schema ? describeSchema(schema) : "{}"}`;
    })
    .join("\n");
}

export const systemPrompt =
  () => `You design automation flows for Automator, a visual canvas for onchain workflows.
A flow is a directed acyclic graph. It starts at a trigger node (a type whose inputs list is empty); every other node must have at least one incoming edge. Edges connect a source node's output handle to a target node's input handle, and each input handle takes at most one edge. Screens are pages the visitor sees in a mini-app; a run pauses there until the visitor acts.
Config strings may reference upstream values with templates: {{input.<input handle>}} is the value delivered to that handle, {{vars.<name>}} a variable set earlier, {{trigger.<path>}} the trigger payload. The handle in {{input.<input handle>}} is always the receiving node's OWN input handle, never the upstream node's output handle: a notify.discord node reads what arrived on its "message" input as {{input.message}} (not {{input.result}} or {{input.text}}), a logic.condition reads {{input.value}}. A trigger hands its whole payload (an object, e.g. a webhook body) to its output handle, so a field of it is addressed as {{input.<input handle>.<field>}} on the next node, or {{trigger.<field>}} anywhere.

Node types you may use, with their handles and config fields:
${describeNodeTypes()}

Earlier turns of the conversation may come before the request; assistant turns there are the summaries the user saw, and the flow JSON in the request is always the current state of the canvas.

Answer with one JSON object and nothing else. To propose a flow:
{"name": string, "description": string, "summary": string, "nodes": [{"id": string, "type": string, "label": string, "config": object}], "edges": [{"source": string, "sourceHandle": string, "target": string, "targetHandle": string}]}
Use short unique ids such as "n1", "n2". Labels are short and human. Only set config fields listed above; leave secrets such as webhook URLs empty for the user to fill in. "summary" is one or two sentences for the user about what the flow does or what you changed.
When the request is a question, asks for an explanation, or needs one clarification before you can build anything, answer {"message": string} instead, in plain prose; never propose a flow for a message that does not ask to build or change one. The user decides what lands on the canvas.`;

/** The document as the model sees it: no positions or edge ids, which it neither reads nor sets. */
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

/** A `{"message": ...}` answer: the model chose prose over a flow. */
function readMessage(answer: unknown): string | undefined {
  if (!isRecord(answer) || "nodes" in answer || "edges" in answer) return undefined;
  return typeof answer.message === "string" && answer.message.trim()
    ? answer.message.trim()
    : undefined;
}

const columnGap = 300;
const rowGap = 140;
const startX = 80;
const startY = 120;

/** Columns by longest path from a trigger, rows in answer order within a column. */
function layout(nodes: DraftNode[], edges: DraftEdge[]): Map<string, { x: number; y: number }> {
  const depth = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  // Relax edges |nodes| times; the graph is checked to be acyclic before this runs.
  for (let round = 0; round < nodes.length; round += 1) {
    for (const edge of edges) {
      const candidate = depth.get(edge.source)! + 1;
      if (candidate > depth.get(edge.target)!) depth.set(edge.target, candidate);
    }
  }
  const rows = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const column = depth.get(node.id)!;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    positions.set(node.id, { x: startX + column * columnGap, y: startY + row * rowGap });
  }
  return positions;
}

function hasCycle(nodes: DraftNode[], edges: DraftEdge[]): boolean {
  const pending = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) pending.set(edge.target, pending.get(edge.target)! + 1);
  const ready = nodes.filter((node) => pending.get(node.id) === 0).map((node) => node.id);
  let seen = 0;
  while (ready.length > 0) {
    const id = ready.pop()!;
    seen += 1;
    for (const edge of edges) {
      if (edge.source !== id) continue;
      const left = pending.get(edge.target)! - 1;
      pending.set(edge.target, left);
      if (left === 0) ready.push(edge.target);
    }
  }
  return seen < nodes.length;
}

/** Turns a draft into a valid document input or throws the first problem found. */
export function materialize(draft: Draft): FlowDocumentInput {
  if (draft.nodes.length === 0) throw new FlowGenerationError("The flow has no nodes");
  const ids = new Set<string>();
  for (const node of draft.nodes) {
    if (ids.has(node.id)) throw new FlowGenerationError(`Duplicate node id "${node.id}"`);
    ids.add(node.id);
  }
  const incoming = new Set<string>();
  for (const edge of draft.edges) {
    const source = draft.nodes.find((node) => node.id === edge.source);
    const target = draft.nodes.find((node) => node.id === edge.target);
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
  }
  if (!draft.nodes.some((node) => flowNodePorts[node.type].inputs.length === 0))
    throw new FlowGenerationError("The flow needs a trigger node");
  for (const node of draft.nodes) {
    const isTrigger = flowNodePorts[node.type].inputs.length === 0;
    if (!isTrigger && !draft.edges.some((edge) => edge.target === node.id))
      throw new FlowGenerationError(`Node "${node.id}" has no incoming edge`);
  }
  if (hasCycle(draft.nodes, draft.edges))
    throw new FlowGenerationError("The flow contains a cycle");

  const positions = layout(draft.nodes, draft.edges);
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
  return document;
}

/** Prior turns the model actually sees: the most recent ones, each cut to a readable length. */
const modelHistoryLimit = 12;
const modelHistoryTurnLength = 1500;

export function historyMessages(history: readonly AiHistoryTurn[] = []): ChatMessage[] {
  return history
    .slice(-modelHistoryLimit)
    .filter((turn) => turn.text.trim() !== "")
    .map((turn) => ({ role: turn.role, content: turn.text.slice(0, modelHistoryTurnLength) }));
}

/**
 * Sends the conversation and validates the answer: a flow is materialized, a message is
 * passed through. An invalid first answer is sent back once with the problem; a second
 * invalid answer throws `FlowGenerationError`. Model failures throw `LanguageModelError`.
 */
export async function askForFlow(
  model: LanguageModel,
  messages: ChatMessage[],
): Promise<GenerateFlowResponse> {
  let lastProblem: string | undefined;
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
      const draft = readDraft(parsed);
      return { kind: "flow", document: materialize(draft), summary: draft.summary };
    } catch (error) {
      if (!(error instanceof FlowGenerationError) && !(error instanceof LanguageModelError))
        throw error;
      lastProblem = error.message;
      messages.push({ role: "assistant", content: answer.content ?? "" });
      messages.push({
        role: "user",
        content: `That answer is not a valid flow: ${lastProblem}. Answer again with the corrected JSON object only.`,
      });
    }
  }
  throw new FlowGenerationError(lastProblem ?? "The model did not produce a valid flow");
}

/**
 * Asks the model for a new flow, or for a changed version of `current`, after the earlier
 * turns in `history`. The model may answer with a message instead when the prompt asks a
 * question rather than for a change.
 */
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
