import {
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
  type ChainId,
  type FlowDocumentInput,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { defaultExecutors } from "@automator/flow-engine";

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

export interface DraftNode {
  id: string;
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
}
export interface DraftEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}
export interface Draft {
  name: string;
  description: string;
  summary: string;
  chainId?: ChainId;
  nodes: DraftNode[];
  edges: DraftEdge[];
}

/** The account's tables as the prompt and the validation see them. `DataTable` fits this shape. */
export interface AiDataTable {
  id: string;
  name: string;
  columns: readonly { id: string; name: string; type: string }[];
}

/** The table section of the prompt: the only table ids a `data.*` node may carry. */
export function describeDataTables(tables: readonly AiDataTable[]): string {
  if (tables.length === 0)
    return "This account has no data tables, so you must not use any data.* node.";
  const lines = tables
    .map(
      (table) =>
        `- id "${table.id}" named "${table.name}": columns ${
          table.columns.map((column) => `${column.id} (${column.type})`).join(", ") || "none"
        }`,
    )
    .join("\n");
  return `A data.* node's tableId must be one of these table ids exactly, and its column references must be column ids of that table. Never invent a table id, a column id or a table name:\n${lines}`;
}

/*
 * One line per node type: handles first, then the config schema.
 *
 * Measured, do not "improve" this without measuring again. Wrong-handle failures are the most
 * common way a generated flow is rejected, and they are never invented names — always a real
 * token from an adjacent namespace: the node's own output (an edge into trigger.balance's
 * "balance"), or one of its config keys (an edge into notify.email's "text"). The obvious fix,
 * listing the config keys beside the handles as forbidden, was tried on 2026-09-10 and made
 * things worse: enumerating the wrong answers put them in front of the model in the same breath
 * as forbidding them, and the failures moved onto the newly listed tokens. gpt-4.1-mini went
 * 5/5 -> 2/5 on a webhook prompt. (The salience story is unproven: the baseline prompt reaches
 * for config keys too, so listing them did not create that substitution.) Length is not free
 * either — that variant was 11% longer, and gpt-oss-120b, already answering in 33-104s against a
 * 130s ceiling, went from one timeout in five to three. Separating any of this from prominence
 * needs a real evaluation, not another guess.
 *
 * The same shape shows up a second time, so restating rules is not the lever: the prompt already
 * says "each input handle takes at most one edge", and the commonest failure on any branching
 * request is still two edges into one input. logic.merge exists for exactly that fan-in and the
 * model reaches past it. Whether merge is discoverable enough — here and on the canvas, for human
 * authors too — is a product question, not a prompt one.
 */
export function describeNodeTypes(): string {
  return generatableNodeTypes
    .map((type) => {
      const { inputs, outputs } = flowNodePorts[type];
      const schema = configSchemas[type];
      return `- ${type}: inputs [${inputs.join(", ")}], outputs [${outputs.join(", ")}], config ${JSON.stringify(schema ?? {})}`;
    })
    .join("\n");
}

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

/** `tables` is the owner's table list; a data node naming anything else is rejected as invalid wiring. */
export function materialize(draft: Draft, tables: readonly AiDataTable[] = []): FlowDocumentInput {
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
    ...(draft.chainId === undefined ? {} : { chainId: draft.chainId }),
    nodes,
    edges,
  };
  if (!Value.Check(flowDocumentInputSchema, document))
    throw new FlowGenerationError("The flow does not fit the document schema");
  const problem = findFlowDocumentProblem(document);
  if (problem) throw new FlowGenerationError(problem);
  const configProblems = findFlowConfigProblems(document, tables);
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
