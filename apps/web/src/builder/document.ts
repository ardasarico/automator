import type {
  FlowDocument,
  FlowEdge,
  FlowGroup,
  FlowNode,
  FlowNodeType,
} from "@automator/contracts";
import type { Edge, Node } from "@xyflow/react";

export type FlowNodeData = {
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
};

export type GroupNodeData = { label: string };

export type FlowBuilderNode = Node<FlowNodeData, "flow">;
/** A group frame on the canvas. Its `width` and `height` are the frame's size, not a measurement. */
export type GroupBuilderNode = Node<GroupNodeData, "group">;
export type BuilderNode = FlowBuilderNode | GroupBuilderNode;
export type BuilderEdge = Edge;

export type FlowMeta = Pick<FlowDocument, "id" | "name" | "description" | "chainId">;

/** The frame a group gets before anyone resizes it. */
export const defaultGroupSize = { width: 400, height: 240 };

export function isGroupNode(node: BuilderNode): node is GroupBuilderNode {
  return node.type === "group";
}

export function isFlowNode(node: BuilderNode): node is FlowBuilderNode {
  return node.type === "flow";
}

export function createEmptyFlow(id: string): FlowDocument {
  return { version: 1, id, name: "Untitled flow", description: "", nodes: [], edges: [] };
}

/**
 * React Flow places a child relative to its parent; the document keeps every node absolute so
 * nothing outside the builder has to know about groups. Serialising adds the parent's offset
 * back, hydrating takes it away.
 */
function serializeNode(
  node: FlowBuilderNode,
  groups: ReadonlyMap<string, GroupBuilderNode>,
): FlowNode {
  const parent = node.parentId ? groups.get(node.parentId) : undefined;
  const serialized: FlowNode = {
    id: node.id,
    type: node.data.type,
    position: {
      x: node.position.x + (parent?.position.x ?? 0),
      y: node.position.y + (parent?.position.y ?? 0),
    },
    label: node.data.label,
    config: node.data.config,
  };
  if (parent) serialized.parentId = parent.id;
  return serialized;
}

function serializeGroup(node: GroupBuilderNode): FlowGroup {
  return {
    id: node.id,
    label: node.data.label,
    position: { x: node.position.x, y: node.position.y },
    width: node.width ?? node.measured?.width ?? defaultGroupSize.width,
    height: node.height ?? node.measured?.height ?? defaultGroupSize.height,
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
  const groupNodes = nodes.filter(isGroupNode);
  const groups = new Map(groupNodes.map((node) => [node.id, node]));
  return {
    version: 1,
    id: meta.id,
    name: meta.name,
    description: meta.description,
    ...(meta.chainId === undefined ? {} : { chainId: meta.chainId }),
    nodes: nodes.filter(isFlowNode).map((node) => serializeNode(node, groups)),
    edges: edges.map(serializeEdge),
    // Only written when there is one, so a flow that never had groups serialises as before.
    ...(groupNodes.length === 0 ? {} : { groups: groupNodes.map(serializeGroup) }),
  };
}

function hydrateGroup(group: FlowGroup): GroupBuilderNode {
  return {
    id: group.id,
    type: "group",
    position: { x: group.position.x, y: group.position.y },
    width: group.width,
    height: group.height,
    data: { label: group.label },
  };
}

function hydrateNode(
  node: FlowNode,
  groups: ReadonlyMap<string, GroupBuilderNode>,
): FlowBuilderNode {
  // A parent that is not in the document is dropped rather than failing the whole flow.
  const parent = node.parentId ? groups.get(node.parentId) : undefined;
  const hydrated: FlowBuilderNode = {
    id: node.id,
    type: "flow",
    position: {
      x: node.position.x - (parent?.position.x ?? 0),
      y: node.position.y - (parent?.position.y ?? 0),
    },
    data: { type: node.type, label: node.label, config: node.config },
  };
  if (parent) hydrated.parentId = parent.id;
  return hydrated;
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
  const groupNodes = (document.groups ?? []).map(hydrateGroup);
  const groups = new Map(groupNodes.map((node) => [node.id, node]));
  return {
    meta: {
      id: document.id,
      name: document.name,
      description: document.description,
      ...(document.chainId === undefined ? {} : { chainId: document.chainId }),
    },
    // React Flow needs a parent before its children in the list.
    nodes: [...groupNodes, ...document.nodes.map((node) => hydrateNode(node, groups))],
    edges: document.edges.map(hydrateEdge),
  };
}
