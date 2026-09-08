import type { FlowDocument, FlowEdge, FlowNode, FlowNodeType } from "@automator/contracts";
import type { Edge, Node } from "@xyflow/react";

export type FlowNodeData = {
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
};

export type BuilderNode = Node<FlowNodeData, "flow">;
export type BuilderEdge = Edge;

export type FlowMeta = Pick<FlowDocument, "id" | "name" | "description" | "chainId">;

export function createEmptyFlow(id: string): FlowDocument {
  return { version: 1, id, name: "Untitled flow", description: "", nodes: [], edges: [] };
}

function serializeNode(node: BuilderNode): FlowNode {
  return {
    id: node.id,
    type: node.data.type,
    position: { x: node.position.x, y: node.position.y },
    label: node.data.label,
    config: node.data.config,
  };
}

function serializeEdge(edge: BuilderEdge): FlowEdge {
  const serialized: FlowEdge = { id: edge.id, source: edge.source, target: edge.target };
  if (edge.sourceHandle) serialized.sourceHandle = edge.sourceHandle;
  if (edge.targetHandle) serialized.targetHandle = edge.targetHandle;
  return serialized;
}

export function serializeFlow(
  meta: FlowMeta,
  nodes: readonly BuilderNode[],
  edges: readonly BuilderEdge[],
): FlowDocument {
  return {
    version: 1,
    id: meta.id,
    name: meta.name,
    description: meta.description,
    ...(meta.chainId === undefined ? {} : { chainId: meta.chainId }),
    nodes: nodes.map(serializeNode),
    edges: edges.map(serializeEdge),
  };
}

function hydrateNode(node: FlowNode): BuilderNode {
  return {
    id: node.id,
    type: "flow",
    position: { x: node.position.x, y: node.position.y },
    data: { type: node.type, label: node.label, config: node.config },
  };
}

function hydrateEdge(edge: FlowEdge): BuilderEdge {
  const hydrated: BuilderEdge = { id: edge.id, source: edge.source, target: edge.target };
  if (edge.sourceHandle !== undefined) hydrated.sourceHandle = edge.sourceHandle;
  if (edge.targetHandle !== undefined) hydrated.targetHandle = edge.targetHandle;
  return hydrated;
}

export function hydrateFlow(document: FlowDocument): {
  meta: FlowMeta;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
} {
  return {
    meta: {
      id: document.id,
      name: document.name,
      description: document.description,
      ...(document.chainId === undefined ? {} : { chainId: document.chainId }),
    },
    nodes: document.nodes.map(hydrateNode),
    edges: document.edges.map(hydrateEdge),
  };
}
