import { flowNodePorts } from "@automator/contracts";
import type { FlowDocument, FlowDocumentInput, FlowNodeType } from "@automator/contracts";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodePositionChange,
  type XYPosition,
} from "@xyflow/react";
import { createStore, type StoreApi } from "zustand";
import { previewKinds, type DraftKinds } from "./ai/diff";
import { getCatalogEntry } from "./catalog";
import {
  hydrateFlow,
  isFlowNode,
  isGroupNode,
  serializeFlow,
  type BuilderEdge,
  type BuilderNode,
  type FlowBuilderNode,
  type FlowMeta,
  type GroupBuilderNode,
} from "./document";
import { snapPosition } from "./grid";

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

/**
 * An AI draft drawn over the canvas: its own nodes and edges, plus what each of them does to
 * the flow. The document itself is untouched until the draft is applied.
 */
export type FlowPreview = {
  document: FlowDocumentInput;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  kinds: DraftKinds;
};

export type AlignEdge = "left" | "top" | "centerX" | "centerY";

/** A node's size before React Flow has measured it, so alignment never divides by nothing. */
export const unmeasuredNodeSize = { width: 248, height: 72 };

export type BuilderState = {
  meta: FlowMeta;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  dirty: boolean;
  saveCount: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  dragging: boolean;
  /** The node whose label is being edited on its card; transient, never in history. */
  renaming: string | null;
  /** The draft on show, or null when the canvas is the document; never in history. */
  preview: FlowPreview | null;
  lastEdit: EditKey;
  lastEditAt: number;
  undo(): void;
  redo(): void;
  duplicateNodes(ids: readonly string[]): string[];
  /** Drops several nodes and their edges as one history entry. */
  removeNodes(ids: readonly string[]): void;
  /** Lines the nodes up on one edge or axis; a single node has nothing to align to. */
  alignNodes(ids: readonly string[], edge: AlignEdge): void;
  selectAll(): void;
  /** Draws a frame around the nodes and puts them in it; returns the frame's id, or null for nothing to group. */
  groupNodes(ids: readonly string[]): string | null;
  /** Removes the frame and leaves its nodes where they are. */
  ungroup(id: string): void;
  setNodePositions(positions: ReadonlyMap<string, XYPosition>): void;
  onNodesChange(changes: NodeChange<BuilderNode>[]): void;
  onEdgesChange(changes: EdgeChange<BuilderEdge>[]): void;
  onConnect(connection: Connection): void;
  canConnect(connection: Connection | BuilderEdge, ignoring?: string): boolean;
  /** Moves one end of an edge to another port; refused under the same rules as a new edge. */
  reconnectEdge(edge: BuilderEdge, connection: Connection): boolean;
  removeEdge(id: string): void;
  addNode(type: FlowNodeType, position: XYPosition, from?: SourcePort): string;
  insertNode(input: NodeTemplate, position: XYPosition, from?: SourcePort): string;
  renameNode(id: string, label: string): void;
  setRenaming(id: string | null): void;
  setNodeConfig(id: string, patch: Record<string, unknown>): void;
  removeNode(id: string): void;
  clearSelection(): void;
  setMeta(patch: Partial<Omit<FlowMeta, "id">>): void;
  /**
   * Draws a draft over the canvas, or clears it with `null`; the document stays as it is.
   * `keepGroups` carries the frames over the way `applyDocument` does, so a drawn AI edit and
   * the applied one hold the same frames.
   */
  setPreview(document: FlowDocumentInput | null, options?: { keepGroups?: boolean }): void;
  /** Selection and measurement on the drawn draft; nothing else may touch it. */
  onPreviewNodesChange(changes: NodeChange<BuilderNode>[]): void;
  hydrate(document: FlowDocument): void;
  /**
   * Replaces the document. A document that says nothing about frames (`groups` absent) drops
   * them, unless `keepGroups` asks for the frames whose nodes survive to be carried over and
   * refitted, which is what an AI edit wants: the model never sees frames.
   */
  applyDocument(input: FlowDocumentInput, options?: { keepGroups?: boolean }): void;
  markSaved(document?: FlowDocument): boolean;
};

const cosmeticNodeChanges = new Set<NodeChange["type"]>(["select", "dimensions"]);
const cosmeticEdgeChanges = new Set<EdgeChange["type"]>(["select"]);

export const historyLimit = 50;

const duplicateOffset = 40;

/** Clear space between a frame's edge and the nodes in it, and the band its label sits in. */
export const groupPadding = 24;
export const groupTitleBand = 32;

type Box = { x: number; y: number; width: number; height: number };

function nodeSize(node: BuilderNode): { width: number; height: number } {
  if (isGroupNode(node))
    return {
      width: node.width ?? node.measured?.width ?? unmeasuredNodeSize.width,
      height: node.height ?? node.measured?.height ?? unmeasuredNodeSize.height,
    };
  return {
    width: node.measured?.width ?? unmeasuredNodeSize.width,
    height: node.measured?.height ?? unmeasuredNodeSize.height,
  };
}

/** Where a node is on the canvas, whatever frame it sits in. */
function absoluteBox(node: BuilderNode, byId: ReadonlyMap<string, BuilderNode>): Box {
  const parent = node.parentId ? byId.get(node.parentId) : undefined;
  return {
    x: node.position.x + (parent?.position.x ?? 0),
    y: node.position.y + (parent?.position.y ?? 0),
    ...nodeSize(node),
  };
}

function contains(frame: Box, box: Box): boolean {
  return (
    box.x >= frame.x &&
    box.y >= frame.y &&
    box.x + box.width <= frame.x + frame.width &&
    box.y + box.height <= frame.y + frame.height
  );
}

function apart(frame: Box, box: Box): boolean {
  return (
    box.x + box.width <= frame.x ||
    box.x >= frame.x + frame.width ||
    box.y + box.height <= frame.y ||
    box.y >= frame.y + frame.height
  );
}

/** The frame that fits around some boxes, with the padding and the label band. */
function frameAround(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x)) - groupPadding;
  const top = Math.min(...boxes.map((box) => box.y)) - groupPadding - groupTitleBand;
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + groupPadding;
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + groupPadding;
  const position = snapPosition({ x: left, y: top });
  return {
    ...position,
    width: Math.ceil((right - position.x) / 20) * 20,
    height: Math.ceil((bottom - position.y) / 20) * 20,
  };
}

/** Takes a node out of its frame, keeping its place on the canvas. */
function release(node: FlowBuilderNode, byId: ReadonlyMap<string, BuilderNode>): FlowBuilderNode {
  const { parentId: _parent, ...rest } = node;
  const box = absoluteBox(node, byId);
  return { ...rest, position: { x: box.x, y: box.y } };
}

/** Puts a node into a frame, keeping its place on the canvas. */
function adopt(
  node: FlowBuilderNode,
  group: GroupBuilderNode,
  byId: ReadonlyMap<string, BuilderNode>,
): FlowBuilderNode {
  const box = absoluteBox(node, byId);
  return {
    ...node,
    parentId: group.id,
    position: { x: box.x - group.position.x, y: box.y - group.position.y },
  };
}

/**
 * After a drag: a node let go fully inside a frame joins it, one dragged fully out leaves it.
 * Anything in between stays as it was, so a node half over a frame's edge never flips.
 */
function settleMembership(
  nodes: readonly BuilderNode[],
  movedIds: ReadonlySet<string>,
): BuilderNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groups = nodes.filter(isGroupNode);
  if (groups.length === 0) return [...nodes];
  return nodes.map((node) => {
    if (!isFlowNode(node) || !movedIds.has(node.id)) return node;
    const box = absoluteBox(node, byId);
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      return parent && apart(absoluteBox(parent, byId), box) ? release(node, byId) : node;
    }
    const home = groups.find((group) => contains(absoluteBox(group, byId), box));
    return home ? adopt(node, home, byId) : node;
  });
}

/** Grows or shrinks each frame to fit the nodes in it; an empty frame keeps its size. */
function fitGroups(nodes: readonly BuilderNode[]): BuilderNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes
    .map((node) => {
      if (!isGroupNode(node)) return node;
      const children = nodes.filter((item) => isFlowNode(item) && item.parentId === node.id);
      if (children.length === 0) return node;
      const frame = frameAround(children.map((child) => absoluteBox(child, byId)));
      return {
        ...node,
        position: { x: frame.x, y: frame.y },
        width: frame.width,
        height: frame.height,
      };
    })
    .map((node, _index, fitted) => {
      // Children keep their canvas place while the frame under them moved.
      if (!isFlowNode(node) || !node.parentId) return node;
      const before = byId.get(node.parentId);
      const after = fitted.find((item) => item.id === node.parentId);
      if (!before || !after) return node;
      return {
        ...node,
        position: {
          x: node.position.x + before.position.x - after.position.x,
          y: node.position.y + before.position.y - after.position.y,
        },
      };
    });
}

/**
 * Carries the frames of one node list over to another that has none: a frame survives when at
 * least one of its nodes is still there, its survivors go back in, and it is refitted around
 * wherever they are now.
 */
function carryGroups(before: readonly BuilderNode[], after: readonly BuilderNode[]): BuilderNode[] {
  const parentOf = new Map(
    before.flatMap((node) => (isFlowNode(node) && node.parentId ? [[node.id, node.parentId]] : [])),
  );
  const kept = before.filter(
    (node): node is GroupBuilderNode =>
      isGroupNode(node) &&
      after.some((item) => isFlowNode(item) && parentOf.get(item.id) === node.id),
  );
  if (kept.length === 0) return [...after];
  const byId = new Map<string, BuilderNode>(kept.map((group) => [group.id, group]));
  // The new nodes are unmeasured until they mount; a survivor keeps its size so the fit holds.
  const measuredOf = new Map(before.map((node) => [node.id, node.measured]));
  const members = after.map((node) => {
    if (!isFlowNode(node)) return node;
    const group = byId.get(parentOf.get(node.id) ?? "");
    if (!group || !isGroupNode(group)) return node;
    const measured = measuredOf.get(node.id);
    return adopt(measured ? { ...node, measured } : node, group, byId);
  });
  return fitGroups([...kept.map((group) => ({ ...group, selected: false })), ...members]);
}

/**
 * The nodes a document becomes on the canvas: one that says nothing about frames (`groups`
 * absent) drops them, unless `keepGroups` asks for the ones whose nodes survive to be carried
 * over. Drawing a draft and applying it read this the same way.
 */
function nodesOf(
  before: readonly BuilderNode[],
  hydrated: BuilderNode[],
  input: FlowDocumentInput,
  options: { keepGroups?: boolean },
): BuilderNode[] {
  return options.keepGroups && input.groups === undefined
    ? carryGroups(before, hydrated)
    : hydrated;
}

/** Removing a frame frees the nodes in it unless they were picked for removal themselves. */
function removeWithFrames(
  nodes: readonly BuilderNode[],
  gone: ReadonlySet<string>,
  explicit: ReadonlySet<string>,
): BuilderNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.flatMap((node): BuilderNode[] => {
    if (isGroupNode(node)) return gone.has(node.id) ? [] : [node];
    if (explicit.has(node.id)) return [];
    if (node.parentId && gone.has(node.parentId)) return [release(node, byId)];
    return gone.has(node.id) ? [] : [node];
  });
}

type HistoryFields = Pick<BuilderState, "past" | "future" | "lastEdit" | "lastEditAt">;

/**
 * React Flow reports one deletion as separate node and edge change batches in the same
 * tick; anything within this window joins the open "remove" entry so one undo restores both.
 */
const removalWindowMs = 100;

/**
 * A draft on the canvas freezes the document: every action that would edit it does nothing until
 * the draft is applied or discarded. The canvas is not the only way in — the header, the hotkeys,
 * the palette and the command menu all call the store directly — so the refusal belongs here
 * rather than at each control. Applying a draft goes through `applyDocument`, which is not frozen.
 */
function frozen(get: () => BuilderState): boolean {
  return get().preview !== null;
}

/** Drops the selection, keeping the array itself when there was nothing selected. */
function deselect<T extends { selected?: boolean }>(items: T[]): T[] {
  return items.some((item) => item.selected)
    ? items.map((item) => (item.selected ? { ...item, selected: false } : item))
    : items;
}

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
    renaming: null,
    preview: null,
    lastEdit: null,
    lastEditAt: 0,

    onNodesChange(changes) {
      if (frozen(get)) return;
      // A frame resize arrives as a dimensions change that sets the node's own width and height.
      const resize = changes.flatMap((change) =>
        change.type === "dimensions" && change.setAttributes === true ? [change.id] : [],
      )[0];
      const documentChanged =
        resize !== undefined || changes.some((change) => !cosmeticNodeChanges.has(change.type));
      set((state) => {
        const positions = changes.filter(
          (change): change is NodePositionChange => change.type === "position",
        );
        const dragStarted = !state.dragging && positions.some((change) => change.dragging);
        const dragEnded = positions.length > 0 && positions.every((change) => !change.dragging);
        const removed = new Set(
          changes.flatMap((change) => (change.type === "remove" ? [change.id] : [])),
        );
        const history = dragStarted
          ? remember(state)
          : removed.size > 0
            ? remember(state, "remove", removalWindowMs)
            : resize
              ? remember(state, `resize:${resize}`)
              : documentChanged && !state.dragging
                ? remember(state)
                : {};
        let nodes: BuilderNode[];
        if (removed.size > 0) {
          // React Flow lists a frame's children for removal along with the frame; only the ones
          // the user actually selected go, the rest are set free.
          const explicit = new Set(
            state.nodes.filter((node) => node.selected && removed.has(node.id)).map((n) => n.id),
          );
          const kept = removeWithFrames(state.nodes, removed, explicit);
          nodes = applyNodeChanges(
            changes.filter((change) => change.type !== "remove"),
            kept,
          );
        } else {
          nodes = applyNodeChanges(changes, state.nodes);
        }
        if (dragEnded) nodes = settleMembership(nodes, new Set(positions.map((c) => c.id)));
        return {
          ...history,
          nodes,
          dirty: state.dirty || documentChanged,
          dragging: dragStarted ? true : dragEnded ? false : state.dragging,
        };
      });
    },

    onEdgesChange(changes) {
      if (frozen(get)) return;
      const documentChanged = changes.some((change) => !cosmeticEdgeChanges.has(change.type));
      const remove = changes.some((change) => change.type === "remove");
      set((state) => ({
        ...(documentChanged ? remember(state, remove ? "remove" : null, removalWindowMs) : {}),
        edges: applyEdgeChanges(changes, state.edges),
        dirty: state.dirty || documentChanged,
      }));
    },

    undo() {
      if (frozen(get)) return;
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
      if (frozen(get)) return;
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
      if (frozen(get)) return;
      set((state) => {
        const byId = new Map(state.nodes.map((node) => [node.id, node]));
        // Targets are canvas positions; a node in a frame is stored relative to it.
        const placed = state.nodes.map((node) => {
          const target = positions.get(node.id);
          if (!target) return node;
          const parent = node.parentId ? byId.get(node.parentId) : undefined;
          const position = {
            x: target.x - (parent?.position.x ?? 0),
            y: target.y - (parent?.position.y ?? 0),
          };
          return position.x === node.position.x && position.y === node.position.y
            ? node
            : { ...node, position };
        });
        if (placed.every((node, index) => node === state.nodes[index])) return {};
        return {
          ...remember(state),
          nodes: fitGroups(placed),
          dirty: true,
        };
      });
    },

    duplicateNodes(ids) {
      if (frozen(get)) return [];
      // Frames are not copied; a copy of a node in a frame stays in that frame.
      const originals = get().nodes.filter(
        (node): node is FlowBuilderNode => isFlowNode(node) && ids.includes(node.id),
      );
      if (originals.length === 0) return [];
      const copyIds = new Map(originals.map((node) => [node.id, crypto.randomUUID()]));
      const copies: BuilderNode[] = originals.map((node) => ({
        ...(node.parentId ? { parentId: node.parentId } : {}),
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

    removeNodes(ids) {
      if (frozen(get)) return;
      const gone = new Set(ids);
      if (!get().nodes.some((node) => gone.has(node.id))) return;
      set((state) => {
        const nodes = removeWithFrames(state.nodes, gone, gone);
        const kept = new Set(nodes.map((node) => node.id));
        return {
          ...remember(state),
          nodes,
          edges: state.edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target)),
          dirty: true,
        };
      });
    },

    alignNodes(ids, edge) {
      if (frozen(get)) return;
      const all = get().nodes;
      const byId = new Map(all.map((node) => [node.id, node]));
      const chosen = all.filter((node) => isFlowNode(node) && ids.includes(node.id));
      if (chosen.length < 2) return;
      const boxes = chosen.map((node) => ({ id: node.id, ...absoluteBox(node, byId) }));
      const positions = new Map<string, XYPosition>();
      switch (edge) {
        case "left": {
          const x = Math.min(...boxes.map((box) => box.x));
          for (const box of boxes) positions.set(box.id, { x, y: box.y });
          break;
        }
        case "top": {
          const y = Math.min(...boxes.map((box) => box.y));
          for (const box of boxes) positions.set(box.id, { x: box.x, y });
          break;
        }
        case "centerX": {
          const centers = boxes.map((box) => box.x + box.width / 2);
          const center = (Math.min(...centers) + Math.max(...centers)) / 2;
          for (const box of boxes) positions.set(box.id, { x: center - box.width / 2, y: box.y });
          break;
        }
        case "centerY": {
          const centers = boxes.map((box) => box.y + box.height / 2);
          const center = (Math.min(...centers) + Math.max(...centers)) / 2;
          for (const box of boxes) positions.set(box.id, { x: box.x, y: center - box.height / 2 });
          break;
        }
      }
      get().setNodePositions(positions);
    },

    selectAll() {
      if (frozen(get)) return;
      set((state) => ({
        nodes: state.nodes.map((node) => (node.selected ? node : { ...node, selected: true })),
        edges: state.edges.map((edge) => (edge.selected ? edge : { ...edge, selected: true })),
      }));
    },

    groupNodes(ids) {
      if (frozen(get)) return null;
      const all = get().nodes;
      const byId = new Map(all.map((node) => [node.id, node]));
      const members = all.filter(
        (node): node is FlowBuilderNode => isFlowNode(node) && ids.includes(node.id),
      );
      if (members.length === 0) return null;
      const frame = frameAround(members.map((node) => absoluteBox(node, byId)));
      const group: GroupBuilderNode = {
        id: crypto.randomUUID(),
        type: "group",
        position: { x: frame.x, y: frame.y },
        width: frame.width,
        height: frame.height,
        data: { label: "Group" },
        selected: true,
      };
      const memberIds = new Set(members.map((node) => node.id));
      set((state) => ({
        ...remember(state),
        // The frame goes first: React Flow wants a parent ahead of its children.
        nodes: [
          group,
          ...state.nodes.map((node) => {
            if (isFlowNode(node) && memberIds.has(node.id))
              return { ...adopt(node, group, byId), selected: false };
            return node.selected ? { ...node, selected: false } : node;
          }),
        ],
        edges: state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        dirty: true,
      }));
      return group.id;
    },

    ungroup(id) {
      if (frozen(get)) return;
      if (!get().nodes.some((node) => isGroupNode(node) && node.id === id)) return;
      set((state) => {
        const byId = new Map(state.nodes.map((node) => [node.id, node]));
        return {
          ...remember(state),
          nodes: state.nodes.flatMap((node) => {
            if (node.id === id) return [];
            if (isFlowNode(node) && node.parentId === id)
              return [{ ...release(node, byId), selected: true }];
            return [node];
          }),
          dirty: true,
        };
      });
    },

    canConnect(connection, ignoring) {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const edges = get().edges.filter((edge) => edge.id !== ignoring);
      if (edges.some((edge) => sameConnection(edge, connection))) return false;
      if (edges.some((edge) => sameTargetHandle(edge, connection))) return false;
      if (canReach(edges, connection.target, connection.source)) return false;
      return true;
    },

    reconnectEdge(edge, connection) {
      if (frozen(get)) return false;
      if (!get().edges.some((item) => item.id === edge.id)) return false;
      if (!get().canConnect(connection, edge.id)) return false;
      set((state) => ({
        ...remember(state),
        edges: state.edges.map((item) =>
          item.id === edge.id
            ? {
                ...item,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
              }
            : item,
        ),
        dirty: true,
      }));
      return true;
    },

    removeEdge(id) {
      if (frozen(get)) return;
      if (!get().edges.some((edge) => edge.id === id)) return;
      set((state) => ({
        ...remember(state),
        edges: state.edges.filter((edge) => edge.id !== id),
        dirty: true,
      }));
    },

    onConnect(connection) {
      if (frozen(get)) return;
      if (!get().canConnect(connection)) return;
      set((state) => ({
        ...remember(state),
        edges: addEdge({ ...connection, id: crypto.randomUUID() }, state.edges),
        dirty: true,
      }));
    },

    addNode(type, position, from) {
      if (frozen(get)) return "";
      return get().insertNode(
        { type, label: getCatalogEntry(type).label, config: {} },
        position,
        from,
      );
    },

    insertNode(input, position, from) {
      if (frozen(get)) return "";
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
      if (frozen(get)) return;
      set((state) => ({
        ...remember(state, `rename:${id}`),
        nodes: state.nodes.map((node): BuilderNode => {
          if (node.id !== id) return node;
          return isGroupNode(node)
            ? { ...node, data: { ...node.data, label } }
            : { ...node, data: { ...node.data, label } };
        }),
        dirty: true,
      }));
    },

    setRenaming(id) {
      // The label field edits the document, so a draft never opens one; clearing still works.
      if (id !== null && frozen(get)) return;
      if (get().renaming !== id) set({ renaming: id });
    },

    setNodeConfig(id, patch) {
      if (frozen(get)) return;
      set((state) => ({
        ...remember(state, `config:${id}:${Object.keys(patch).sort().join(",")}`),
        nodes: state.nodes.map((node) =>
          node.id === id && isFlowNode(node)
            ? { ...node, data: { ...node.data, config: { ...node.data.config, ...patch } } }
            : node,
        ),
        dirty: true,
      }));
    },

    removeNode(id) {
      if (frozen(get)) return;
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
      if (frozen(get)) return;
      set((state) => ({
        ...remember(state, `meta:${Object.keys(patch).sort().join(",")}`),
        meta: { ...state.meta, ...patch },
        dirty: true,
      }));
    },

    setPreview(document, options = {}) {
      if (!document) {
        if (get().preview) set({ preview: null });
        return;
      }
      set((state) => {
        const current = serializeFlow(state.meta, state.nodes, state.edges);
        const kinds = previewKinds(current, document);
        // The draft keeps the flow's id so nothing downstream sees a different flow.
        const draft = hydrateFlow({ ...document, id: state.meta.id });
        const draftNodes = nodesOf(state.nodes, draft.nodes, document, options);
        const byId = new Map(state.nodes.map((node) => [node.id, node]));
        const drawn = new Set(draftNodes.map((node) => node.id));
        // What the draft drops is drawn too, faded, so a proposal's deletions are visible. A
        // removed node is freed from its frame first: the frame may be gone from the draft.
        const removedNodes = state.nodes.flatMap((node) =>
          isFlowNode(node) && !drawn.has(node.id) && kinds.nodes.get(node.id) === "removed"
            ? [{ ...release(node, byId), selected: false }]
            : [],
        );
        const drawnEdges = new Set(draft.edges.map((edge) => edge.id));
        const removedEdges = state.edges.flatMap((edge) =>
          !drawnEdges.has(edge.id) && kinds.edges.get(edge.id) === "removed"
            ? [{ ...edge, selected: false }]
            : [],
        );
        return {
          // The draft owns the selection while it is on show, so the panels follow it rather
          // than whatever was picked before. Discarding leaves nothing selected.
          nodes: deselect(state.nodes),
          edges: deselect(state.edges),
          preview: {
            document,
            nodes: [...draftNodes, ...removedNodes],
            edges: [...draft.edges, ...removedEdges],
            kinds,
          },
        };
      });
    },

    onPreviewNodesChange(changes) {
      const allowed = changes.filter((change) => cosmeticNodeChanges.has(change.type));
      if (allowed.length === 0) return;
      set((state) =>
        state.preview
          ? { preview: { ...state.preview, nodes: applyNodeChanges(allowed, state.preview.nodes) } }
          : {},
      );
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

    applyDocument(input, options = {}) {
      set((state) => {
        const hydrated = hydrateFlow({ ...input, id: state.meta.id });
        const nodes = nodesOf(state.nodes, hydrated.nodes, input, options);
        return { ...remember(state), ...hydrated, nodes, dragging: false, dirty: true };
      });
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

/** What the user has picked on the canvas, which is the draft's nodes while one is on show. */
export function selectSelectedNodes(state: BuilderState): BuilderNode[] {
  return (state.preview?.nodes ?? state.nodes).filter((node) => node.selected);
}

/* Cached on the nodes array, so a selector can hand the same list back until the graph changes. */
let flowNodesSource: readonly BuilderNode[] | undefined;
let flowNodesCache: FlowBuilderNode[] = [];

/** The nodes that run: everything on the canvas except group frames. */
export function selectFlowNodes(state: Pick<BuilderState, "nodes">): FlowBuilderNode[] {
  if (state.nodes !== flowNodesSource) {
    flowNodesSource = state.nodes;
    flowNodesCache = state.nodes.filter(isFlowNode);
  }
  return flowNodesCache;
}

/* History is frozen along with the document, so the header's buttons go quiet under a draft. */
export const selectCanUndo = (state: BuilderState): boolean =>
  state.preview === null && state.past.length > 0;
export const selectCanRedo = (state: BuilderState): boolean =>
  state.preview === null && state.future.length > 0;
