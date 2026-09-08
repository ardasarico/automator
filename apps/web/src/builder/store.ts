import { flowNodePorts } from "@automator/contracts";
import type { FlowDocument, FlowDocumentInput, FlowNodeType } from "@automator/contracts";
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
import {
  hydrateFlow,
  serializeFlow,
  type BuilderEdge,
  type BuilderNode,
  type FlowMeta,
} from "./document";

export type HistoryEntry = { meta: FlowMeta; nodes: BuilderNode[]; edges: BuilderEdge[] };

type EditKey = string | null;

/** The output a dropped connection came from, used to wire a node added on the spot. */
export type SourcePort = { source: string; sourceHandle?: string | null };

/** Everything a new node needs beyond its place: a catalog entry or a saved node supplies it. */
export type NodeTemplate = {
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
};

export type BuilderState = {
  meta: FlowMeta;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  dirty: boolean;
  saveCount: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  dragging: boolean;
  lastEdit: EditKey;
  lastEditAt: number;
  undo(): void;
  redo(): void;
  duplicateNodes(ids: readonly string[]): string[];
  setNodePositions(positions: ReadonlyMap<string, XYPosition>): void;
  onNodesChange(changes: NodeChange<BuilderNode>[]): void;
  onEdgesChange(changes: EdgeChange<BuilderEdge>[]): void;
  onConnect(connection: Connection): void;
  canConnect(connection: Connection | BuilderEdge): boolean;
  addNode(type: FlowNodeType, position: XYPosition, from?: SourcePort): string;
  insertNode(input: NodeTemplate, position: XYPosition, from?: SourcePort): string;
  renameNode(id: string, label: string): void;
  setNodeConfig(id: string, patch: Record<string, unknown>): void;
  removeNode(id: string): void;
  clearSelection(): void;
  setMeta(patch: Partial<Omit<FlowMeta, "id">>): void;
  hydrate(document: FlowDocument): void;
  applyDocument(input: FlowDocumentInput): void;
  markSaved(document?: FlowDocument): boolean;
};

const cosmeticNodeChanges = new Set<NodeChange["type"]>(["select", "dimensions"]);
const cosmeticEdgeChanges = new Set<EdgeChange["type"]>(["select"]);

export const historyLimit = 50;

const duplicateOffset = 40;

type HistoryFields = Pick<BuilderState, "past" | "future" | "lastEdit" | "lastEditAt">;

/**
 * React Flow reports one deletion as separate node and edge change batches in the same
 * tick; anything within this window joins the open "remove" entry so one undo restores both.
 */
const removalWindowMs = 100;

function snapshot(state: BuilderState): HistoryEntry {
  return { meta: state.meta, nodes: state.nodes, edges: state.edges };
}

function remember(state: BuilderState, editKey: EditKey = null, windowMs?: number): HistoryFields {
  const now = Date.now();
  const open = editKey !== null && state.lastEdit === editKey;
  const withinWindow = windowMs === undefined || now - state.lastEditAt <= windowMs;
  if (open && withinWindow)
    return { past: state.past, future: [], lastEdit: editKey, lastEditAt: state.lastEditAt };
  return {
    past: [...state.past.slice(-(historyLimit - 1)), snapshot(state)],
    future: [],
    lastEdit: editKey,
    lastEditAt: now,
  };
}

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
    saveCount: 0,
    past: [],
    future: [],
    dragging: false,
    lastEdit: null,
    lastEditAt: 0,

    onNodesChange(changes) {
      const documentChanged = changes.some((change) => !cosmeticNodeChanges.has(change.type));
      set((state) => {
        const positions = changes.filter((change) => change.type === "position");
        const dragStarted = !state.dragging && positions.some((change) => change.dragging);
        const dragEnded = positions.length > 0 && positions.every((change) => !change.dragging);
        const remove = changes.some((change) => change.type === "remove");
        const history = dragStarted
          ? remember(state)
          : remove
            ? remember(state, "remove", removalWindowMs)
            : documentChanged && !state.dragging
              ? remember(state)
              : {};
        return {
          ...history,
          nodes: applyNodeChanges(changes, state.nodes),
          dirty: state.dirty || documentChanged,
          dragging: dragStarted ? true : dragEnded ? false : state.dragging,
        };
      });
    },

    onEdgesChange(changes) {
      const documentChanged = changes.some((change) => !cosmeticEdgeChanges.has(change.type));
      const remove = changes.some((change) => change.type === "remove");
      set((state) => ({
        ...(documentChanged ? remember(state, remove ? "remove" : null, removalWindowMs) : {}),
        edges: applyEdgeChanges(changes, state.edges),
        dirty: state.dirty || documentChanged,
      }));
    },

    undo() {
      set((state) => {
        const previous = state.past.at(-1);
        if (!previous) return {};
        return {
          ...previous,
          past: state.past.slice(0, -1),
          future: [...state.future, snapshot(state)],
          lastEdit: null,
          lastEditAt: 0,
          dragging: false,
          dirty: true,
        };
      });
    },

    redo() {
      set((state) => {
        const next = state.future.at(-1);
        if (!next) return {};
        return {
          ...next,
          past: [...state.past, snapshot(state)],
          future: state.future.slice(0, -1),
          lastEdit: null,
          lastEditAt: 0,
          dragging: false,
          dirty: true,
        };
      });
    },

    setNodePositions(positions) {
      set((state) => {
        const moved = state.nodes.some((node) => {
          const target = positions.get(node.id);
          return target && (target.x !== node.position.x || target.y !== node.position.y);
        });
        if (!moved) return {};
        return {
          ...remember(state),
          nodes: state.nodes.map((node) => {
            const target = positions.get(node.id);
            return target ? { ...node, position: { x: target.x, y: target.y } } : node;
          }),
          dirty: true,
        };
      });
    },

    duplicateNodes(ids) {
      const originals = get().nodes.filter((node) => ids.includes(node.id));
      if (originals.length === 0) return [];
      const copyIds = new Map(originals.map((node) => [node.id, crypto.randomUUID()]));
      const copies: BuilderNode[] = originals.map((node) => ({
        id: copyIds.get(node.id)!,
        type: "flow",
        position: { x: node.position.x + duplicateOffset, y: node.position.y + duplicateOffset },
        data: { ...node.data, config: structuredClone(node.data.config) },
        selected: true,
      }));
      set((state) => ({
        ...remember(state),
        nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), ...copies],
        edges: [
          ...state.edges.map((edge) => ({ ...edge, selected: false })),
          ...state.edges
            .filter((edge) => copyIds.has(edge.source) && copyIds.has(edge.target))
            .map((edge) => ({
              ...edge,
              id: crypto.randomUUID(),
              source: copyIds.get(edge.source)!,
              target: copyIds.get(edge.target)!,
              selected: false,
            })),
        ],
        dirty: true,
      }));
      return copies.map((node) => node.id);
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
        ...remember(state),
        edges: addEdge({ ...connection, id: crypto.randomUUID() }, state.edges),
        dirty: true,
      }));
    },

    addNode(type, position, from) {
      return get().insertNode(
        { type, label: getCatalogEntry(type).label, config: {} },
        position,
        from,
      );
    },

    insertNode(input, position, from) {
      const { type } = input;
      const id = crypto.randomUUID();
      const node: BuilderNode = {
        id,
        type: "flow",
        position,
        // A preset inserts an independent copy: later edits to either never reach the other.
        data: { type, label: input.label, config: structuredClone(input.config) },
        selected: true,
      };
      // The node and its edge land in one history entry, so one undo removes both.
      const connection: Connection | null = from
        ? {
            source: from.source,
            sourceHandle: from.sourceHandle ?? null,
            target: id,
            targetHandle: flowNodePorts[type].inputs[0] ?? null,
          }
        : null;
      set((state) => {
        const edges = state.edges.map((edge) =>
          edge.selected ? { ...edge, selected: false } : edge,
        );
        const wire =
          connection &&
          state.nodes.some((item) => item.id === connection.source) &&
          get().canConnect(connection)
            ? connection
            : null;
        return {
          ...remember(state),
          nodes: [...state.nodes.map((item) => ({ ...item, selected: false })), node],
          edges: wire ? addEdge({ ...wire, id: crypto.randomUUID() }, edges) : edges,
          dirty: true,
        };
      });
      return id;
    },

    renameNode(id, label) {
      set((state) => ({
        ...remember(state, `rename:${id}`),
        nodes: state.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, label } } : node,
        ),
        dirty: true,
      }));
    },

    setNodeConfig(id, patch) {
      set((state) => ({
        ...remember(state, `config:${id}:${Object.keys(patch).sort().join(",")}`),
        nodes: state.nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, config: { ...node.data.config, ...patch } } }
            : node,
        ),
        dirty: true,
      }));
    },

    removeNode(id) {
      set((state) => ({
        ...remember(state),
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
      set((state) => ({
        ...remember(state, `meta:${Object.keys(patch).sort().join(",")}`),
        meta: { ...state.meta, ...patch },
        dirty: true,
      }));
    },

    hydrate(document) {
      set({
        ...hydrateFlow(document),
        dirty: false,
        past: [],
        future: [],
        dragging: false,
        lastEdit: null,
        lastEditAt: 0,
      });
    },

    applyDocument(input) {
      set((state) => ({
        ...remember(state),
        ...hydrateFlow({ ...input, id: state.meta.id }),
        dragging: false,
        dirty: true,
      }));
    },

    markSaved(document) {
      const state = get();
      const unchanged =
        document === undefined ||
        JSON.stringify(serializeFlow(state.meta, state.nodes, state.edges)) ===
          JSON.stringify(document);
      set({ dirty: !unchanged, saveCount: state.saveCount + 1, lastEdit: null, lastEditAt: 0 });
      return unchanged;
    },
  }));
}

export function selectSelectedNodes(state: BuilderState): BuilderNode[] {
  return state.nodes.filter((node) => node.selected);
}

export const selectCanUndo = (state: BuilderState): boolean => state.past.length > 0;
export const selectCanRedo = (state: BuilderState): boolean => state.future.length > 0;
