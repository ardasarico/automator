import type { FlowDocument, FlowNodeType } from "@automator/contracts";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { createStore, type StoreApi } from "zustand";
import { getCatalogEntry } from "./catalog";
import { hydrateFlow, type BuilderEdge, type BuilderNode, type FlowMeta } from "./document";

export type BuilderState = {
  meta: FlowMeta;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  /** True once the graph or meta differs from the last hydrated document. */
  dirty: boolean;
  onNodesChange(changes: NodeChange<BuilderNode>[]): void;
  onEdgesChange(changes: EdgeChange<BuilderEdge>[]): void;
  onConnect(connection: Connection): void;
  /**
   * Rejects self-loops, a second edge between the same handles, a second edge into an
   * already-occupied input, and a connection that would create a cycle.
   */
  canConnect(connection: Connection | BuilderEdge): boolean;
  /** Adds a node with the catalog label, selects it, and returns its id. */
  addNode(type: FlowNodeType, position: XYPosition): string;
  renameNode(id: string, label: string): void;
  removeNode(id: string): void;
  /** Deselects every node and edge. Selection is canvas state, so this never marks the store dirty. */
  clearSelection(): void;
  setMeta(patch: Partial<Omit<FlowMeta, "id">>): void;
  hydrate(document: FlowDocument): void;
};

/** Node changes that only affect how the canvas looks, not the document. */
const cosmeticNodeChanges = new Set<NodeChange["type"]>(["select", "dimensions"]);
const cosmeticEdgeChanges = new Set<EdgeChange["type"]>(["select"]);

function sameConnection(edge: BuilderEdge, connection: Connection | BuilderEdge): boolean {
  return (
    edge.source === connection.source &&
    edge.target === connection.target &&
    (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
    (edge.targetHandle ?? null) === (connection.targetHandle ?? null)
  );
}

function sameTargetHandle(edge: BuilderEdge, connection: Connection | BuilderEdge): boolean {
  return (
    edge.target === connection.target &&
    (edge.targetHandle ?? null) === (connection.targetHandle ?? null)
  );
}

/** Iterative DFS: can `from` reach `to` by following edges' source -> target direction? */
function canReach(edges: BuilderEdge[], from: string, to: string): boolean {
  const stack = [from];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target);
    }
  }
  return false;
}

export function createBuilderStore(document: FlowDocument): StoreApi<BuilderState> {
  return createStore<BuilderState>((set, get) => ({
    ...hydrateFlow(document),
    dirty: false,

    onNodesChange(changes) {
      const documentChanged = changes.some((change) => !cosmeticNodeChanges.has(change.type));
      set((state) => ({
        nodes: applyNodeChanges(changes, state.nodes),
        dirty: state.dirty || documentChanged,
      }));
    },

    onEdgesChange(changes) {
      const documentChanged = changes.some((change) => !cosmeticEdgeChanges.has(change.type));
      set((state) => ({
        edges: applyEdgeChanges(changes, state.edges),
        dirty: state.dirty || documentChanged,
      }));
    },

    canConnect(connection) {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const edges = get().edges;
      if (edges.some((edge) => sameConnection(edge, connection))) return false;
      if (edges.some((edge) => sameTargetHandle(edge, connection))) return false;
      if (canReach(edges, connection.target, connection.source)) return false;
      return true;
    },

    onConnect(connection) {
      if (!get().canConnect(connection)) return;
      set((state) => ({
        edges: addEdge({ ...connection, id: crypto.randomUUID() }, state.edges),
        dirty: true,
      }));
    },

    addNode(type, position) {
      const id = crypto.randomUUID();
      const node: BuilderNode = {
        id,
        type: "flow",
        position,
        data: { type, label: getCatalogEntry(type).label, config: {} },
        selected: true,
      };
      set((state) => ({
        nodes: [...state.nodes.map((item) => ({ ...item, selected: false })), node],
        dirty: true,
      }));
      return id;
    },

    renameNode(id, label) {
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, label } } : node,
        ),
        dirty: true,
      }));
    },

    removeNode(id) {
      set((state) => ({
        nodes: state.nodes.filter((node) => node.id !== id),
        edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
        dirty: true,
      }));
    },

    clearSelection() {
      set((state) => ({
        nodes: state.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
        edges: state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
      }));
    },

    setMeta(patch) {
      set((state) => ({ meta: { ...state.meta, ...patch }, dirty: true }));
    },

    hydrate(document) {
      set({ ...hydrateFlow(document), dirty: false });
    },
  }));
}

export function selectSelectedNodes(state: BuilderState): BuilderNode[] {
  return state.nodes.filter((node) => node.selected);
}
