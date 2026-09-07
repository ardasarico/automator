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
import { hydrateFlow, type BuilderEdge, type BuilderNode, type FlowMeta } from "./document";

/** What undo restores: the document-bearing part of the state, selection flags included. */
export type HistoryEntry = { meta: FlowMeta; nodes: BuilderNode[]; edges: BuilderEdge[] };

/**
 * Consecutive edits to the same field coalesce into one history entry, so typing a label or a
 * config value undoes as one step rather than one per keystroke.
 */
type EditKey = string | null;

export type BuilderState = {
  meta: FlowMeta;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  /** True once the graph or meta differs from the last hydrated document. */
  dirty: boolean;
  /** How many saves this builder has confirmed; the History panel refetches when it grows. */
  saveCount: number;
  /** Undo stack, oldest first, capped at `historyLimit`; `future` holds what redo restores. */
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** True while a node drag is in progress; one history entry covers the whole drag. */
  dragging: boolean;
  /** Which field the latest history entry was opened for, so repeats coalesce. */
  lastEdit: EditKey;
  /** When that entry was opened (ms since epoch), for edits that only coalesce briefly. */
  lastEditAt: number;
  undo(): void;
  redo(): void;
  /**
   * Copies the given nodes (and the edges between them) with fresh ids, offset a little,
   * selects the copies, and returns their ids in the same order.
   */
  duplicateNodes(ids: readonly string[]): string[];
  /** Moves the listed nodes at once (auto-layout), as one history entry; unknown ids are ignored. */
  setNodePositions(positions: ReadonlyMap<string, XYPosition>): void;
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
  /** Merges `patch` into the node's config; a settings form writes one field at a time. */
  setNodeConfig(id: string, patch: Record<string, unknown>): void;
  removeNode(id: string): void;
  /** Deselects every node and edge. Selection is canvas state, so this never marks the store dirty. */
  clearSelection(): void;
  setMeta(patch: Partial<Omit<FlowMeta, "id">>): void;
  hydrate(document: FlowDocument): void;
  /** Replaces the whole graph and meta with a generated document, keeping the flow id; dirty. */
  applyDocument(input: FlowDocumentInput): void;
  /** Marks the current graph and meta as persisted, without touching the canvas. */
  markSaved(): void;
};

/** Node changes that only affect how the canvas looks, not the document. */
const cosmeticNodeChanges = new Set<NodeChange["type"]>(["select", "dimensions"]);
const cosmeticEdgeChanges = new Set<EdgeChange["type"]>(["select"]);

export const historyLimit = 50;

/** How far a duplicate lands from its original, so the copy is visibly a new card. */
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

/**
 * Opens a history entry for an edit: the current document goes on the undo stack and redo
 * is cleared. With an `editKey`, a repeat of the same key extends the open entry instead.
 */
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
    saveCount: 0,
    past: [],
    future: [],
    dragging: false,
    lastEdit: null,
    lastEditAt: 0,

    onNodesChange(changes) {
      const documentChanged = changes.some((change) => !cosmeticNodeChanges.has(change.type));
      set((state) => {
        // A drag reports a position on every pointer move; only its first move opens an entry.
        const positions = changes.filter((change) => change.type === "position");
        const dragStarted = !state.dragging && positions.some((change) => change.dragging);
        const dragEnded = positions.length > 0 && positions.every((change) => !change.dragging);
        const remove = changes.some((change) => change.type === "remove");
        const history = dragStarted
          ? remember(state)
          : remove
            ? remember(state, "remove", removalWindowMs)
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
        ...remember(state),
        nodes: [...state.nodes.map((item) => ({ ...item, selected: false })), node],
        dirty: true,
      }));
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
      // A freshly loaded document has nothing to undo back to.
      set({
        ...hydrateFlow(document),
        dirty: false,
        past: [],
        future: [],
        lastEdit: null,
        lastEditAt: 0,
      });
    },

    applyDocument(input) {
      set((state) => ({
        ...remember(state),
        ...hydrateFlow({ ...input, id: state.meta.id }),
        dirty: true,
      }));
    },

    markSaved() {
      set((state) => ({ dirty: false, saveCount: state.saveCount + 1 }));
    },
  }));
}

export function selectSelectedNodes(state: BuilderState): BuilderNode[] {
  return state.nodes.filter((node) => node.selected);
}

export const selectCanUndo = (state: BuilderState): boolean => state.past.length > 0;
export const selectCanRedo = (state: BuilderState): boolean => state.future.length > 0;
