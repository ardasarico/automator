import {
  chainIdSchema,
  chainIds,
  flowNodeConfigSchemas,
  flowNodePorts,
  layoutFlowPositions,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
  type FlowDocumentInput,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { generatableNodeTypes, type Draft, type DraftEdge, type DraftNode } from "./draft";

/** A tool call the working copy refuses. Its message is the tool result the model reads. */
export class ToolCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolCallError";
  }
}

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

const maxNodes = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(args: Record<string, unknown>, key: string, required = true): string | undefined {
  const value = args[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim()))
    throw new ToolCallError(`"${key}" must be a non-empty string`);
  return value.trim();
}

function record(args: unknown): Record<string, unknown> {
  if (!isRecord(args)) throw new ToolCallError("Arguments must be an object");
  return args;
}

function edgeKey(edge: DraftEdge): string {
  return `${edge.source}.${edge.sourceHandle}→${edge.target}.${edge.targetHandle}`;
}

export class WorkingCopy {
  private name: string;
  private description: string;
  private chainId: FlowDocumentInput["chainId"];
  private nodes: DraftNode[];
  private edges: DraftEdge[];
  private mutations = 0;

  constructor(current?: FlowDocumentInput) {
    this.name = current?.name ?? "Untitled flow";
    this.description = current?.description ?? "";
    this.chainId = current?.chainId;
    this.nodes = (current?.nodes ?? []).map(({ id, type, label, config }) => ({
      id,
      type,
      label,
      config: { ...config },
    }));
    this.edges = (current?.edges ?? []).map((edge) => ({
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? "",
      target: edge.target,
      targetHandle: edge.targetHandle ?? "",
    }));
  }

  get changed(): boolean {
    return this.mutations > 0;
  }

  private node(id: string): DraftNode {
    const node = this.nodes.find((entry) => entry.id === id);
    if (!node) {
      const known = this.nodes.map((entry) => entry.id).join(", ") || "none yet";
      throw new ToolCallError(`No node "${id}" exists; current node ids are: ${known}`);
    }
    return node;
  }

  private clean(type: FlowNodeType, config: unknown): Record<string, unknown> {
    const schema = configSchemas[type];
    if (!schema) return isRecord(config) ? config : {};
    try {
      return parseNodeConfig(schema, isRecord(config) ? config : {}) as Record<string, unknown>;
    } catch (error) {
      throw new ToolCallError(
        `Config for ${type} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  addNode(raw: unknown): string {
    const args = record(raw);
    const id = text(args, "id")!;
    const type = text(args, "type")!;
    if (!(generatableNodeTypes as readonly string[]).includes(type))
      throw new ToolCallError(
        `Unknown node type "${type}". Use one of: ${generatableNodeTypes.join(", ")}`,
      );
    if (this.nodes.some((node) => node.id === id))
      throw new ToolCallError(`Node "${id}" already exists; use update_node or another id`);
    if (this.nodes.length >= maxNodes)
      throw new ToolCallError(`A flow is limited to ${maxNodes} nodes`);
    const label = text(args, "label", false) || type;
    const node: DraftNode = {
      id,
      type: type as FlowNodeType,
      label,
      config: this.clean(type as FlowNodeType, args.config),
    };
    this.nodes.push(node);
    this.mutations += 1;
    return `Added "${label}" (${type}) as ${id}`;
  }

  updateNode(raw: unknown): string {
    const args = record(raw);
    const node = this.node(text(args, "id")!);
    // Validate everything before assigning anything: a rejected call must leave the node
    // untouched, so the label and the cleaned config are both computed before either is written.
    const label = text(args, "label", false);
    const config =
      args.config === undefined
        ? undefined
        : this.clean(node.type, { ...node.config, ...record(args.config) });
    if (label !== undefined) node.label = label || node.type;
    if (config !== undefined) node.config = config;
    this.mutations += 1;
    return `Updated "${node.label}"`;
  }

  removeNode(raw: unknown): string {
    const args = record(raw);
    const node = this.node(text(args, "id")!);
    const before = this.edges.length;
    this.edges = this.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
    this.nodes = this.nodes.filter((entry) => entry.id !== node.id);
    this.mutations += 1;
    return `Removed "${node.label}" and ${before - this.edges.length} edges`;
  }

  private edgeArgs(raw: unknown): DraftEdge {
    const args = record(raw);
    return {
      source: text(args, "source")!,
      sourceHandle: text(args, "sourceHandle")!,
      target: text(args, "target")!,
      targetHandle: text(args, "targetHandle")!,
    };
  }

  private reaches(from: string, to: string, seen = new Set<string>()): boolean {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return this.edges
      .filter((edge) => edge.source === from)
      .some((edge) => this.reaches(edge.target, to, seen));
  }

  connect(raw: unknown): string {
    const edge = this.edgeArgs(raw);
    const source = this.node(edge.source);
    const target = this.node(edge.target);
    if (source.id === target.id) throw new ToolCallError("A node cannot connect to itself");
    const { outputs } = flowNodePorts[source.type];
    const { inputs } = flowNodePorts[target.type];
    if (!outputs.includes(edge.sourceHandle))
      throw new ToolCallError(
        `"${edge.sourceHandle}" is not an output of ${source.type}; outputs are [${outputs.join(", ")}]`,
      );
    if (inputs.length === 0)
      throw new ToolCallError(`${target.type} is a trigger and has no input`);
    if (!inputs.includes(edge.targetHandle))
      throw new ToolCallError(
        `"${edge.targetHandle}" is not an input of ${target.type}; inputs are [${inputs.join(", ")}]`,
      );
    if (this.edges.some((e) => e.target === edge.target && e.targetHandle === edge.targetHandle))
      throw new ToolCallError(
        `${edge.target}.${edge.targetHandle} already has an edge; each input takes one. Use logic.merge to combine branches`,
      );
    if (this.reaches(edge.target, edge.source))
      throw new ToolCallError("That edge would create a cycle; flows are acyclic");
    this.edges.push(edge);
    this.mutations += 1;
    return `Connected ${edge.source}.${edge.sourceHandle} → ${edge.target}.${edge.targetHandle}`;
  }

  disconnect(raw: unknown): string {
    const edge = this.edgeArgs(raw);
    const key = edgeKey(edge);
    const before = this.edges.length;
    this.edges = this.edges.filter((entry) => edgeKey(entry) !== key);
    if (this.edges.length === before) throw new ToolCallError(`No edge ${key} exists`);
    this.mutations += 1;
    return `Disconnected ${key}`;
  }

  setFlow(raw: unknown): string {
    const args = record(raw);
    // Validate every field before assigning any of them, so a rejected call (an invalid
    // chainId, say) never leaves a partial rename or description behind.
    const name = text(args, "name", false);
    if (name === "") throw new ToolCallError(`"name" must be a non-empty string`);
    const description = text(args, "description", false);
    let chainId: FlowDocumentInput["chainId"];
    if (args.chainId !== undefined) {
      if (!Value.Check(chainIdSchema, args.chainId))
        throw new ToolCallError(
          `chainId ${String(args.chainId)} is not a supported chain; use one of ${chainIds.join(", ")}`,
        );
      chainId = args.chainId;
    }
    if (name === undefined && description === undefined && chainId === undefined)
      throw new ToolCallError("set_flow needs name, description or chainId");
    const changes: string[] = [];
    if (name !== undefined) {
      this.name = name.slice(0, 120);
      changes.push(`Renamed the flow to "${this.name}"`);
    }
    if (description !== undefined) {
      this.description = description.slice(0, 1000);
      changes.push("Set the description");
    }
    if (chainId !== undefined) {
      this.chainId = chainId;
      changes.push(`Set the chain to ${chainId}`);
    }
    this.mutations += 1;
    return changes.join("; ");
  }

  toDraft(): Draft {
    return {
      name: this.name,
      description: this.description,
      summary: "",
      chainId: this.chainId,
      nodes: this.nodes.map((node) => ({ ...node, config: { ...node.config } })),
      edges: [...this.edges],
    };
  }

  /** The canvas preview: laid out and shaped as a document, but not put through the document checks. */
  toPreview(): FlowDocumentInput {
    const positions = layoutFlowPositions(this.nodes, this.edges);
    return {
      version: 1,
      name: this.name || "Untitled flow",
      description: this.description,
      ...(this.chainId === undefined ? {} : { chainId: this.chainId }),
      nodes: this.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? { x: 0, y: 0 },
      })),
      edges: this.edges.map((edge) => ({ id: `e-${edgeKey(edge)}`, ...edge })),
    };
  }
}
