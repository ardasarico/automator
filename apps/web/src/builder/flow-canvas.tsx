"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStoreApi,
  useViewport,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type XYPosition,
} from "@xyflow/react";
import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { flowNodePorts, layoutFlowPositions, type FlowNodeType } from "@automator/contracts";
import {
  RiAddLine,
  RiFlashlightLine,
  RiFocus3Line,
  RiLayoutMasonryLine,
  RiSubtractLine,
} from "@remixicon/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { CanvasMenu, type CanvasMenuState } from "./canvas-menu";
import { isFlowNodeType, type CatalogEntry } from "./catalog";
import { nodeHalfSize, nodeTypes } from "./flow-node";
import { snapGrid, snapPosition } from "./grid";
import styles from "./flow-builder.module.css";
import { GettingStartedPanel } from "./getting-started-panel";
import { NodePicker } from "./node-picker";
import { useNodePresets } from "./presets-context";
import { RunPanel } from "./run-panel";
import { SelectionToolbar } from "./selection-toolbar";
import { edgeRunStatus } from "./run-selectors";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";
import { selectFlowNodes, type NodeTemplate, type SourcePort } from "./store";
import { groupProblemsByNode, NodeProblemsContext, useFlowProblems } from "./use-flow-problems";

export const nodeTypeMime = "application/x-automator-node-type";
export const nodePresetMime = "application/x-automator-node-preset";

/**
 * The node picker, open at a point on the canvas: from a connection dropped on empty canvas
 * (wired to `from` once picked), a double-click, or the canvas menu.
 */
type PendingPick = {
  from?: SourcePort;
  at: { x: number; y: number };
  flowPosition: XYPosition;
};

/** Matches `.nodePicker` in the stylesheet; the drop point is clamped against it. */
const pickerSize = { width: 280, height: 320 };
const pickerMargin = 8;

function clamp(at: number, available: number, size: number): number {
  return Math.max(pickerMargin, Math.min(at, available - size - pickerMargin));
}

/** Only a node with an input can receive the dropped connection; triggers have none. */
const acceptsConnection = (entry: CatalogEntry) => flowNodePorts[entry.type].inputs.length > 0;

type Box = { x: number; y: number; width: number; height: number };

/** Clear space kept around a placed node, so neighbouring cards never hide each other's ports. */
const nodeGap = { x: 40, y: 24 };
/** A node is only measured once it mounts; until then its card's own dimensions stand in. */
const defaultNodeSize = { width: nodeHalfSize.x * 2, height: nodeHalfSize.y * 2 };
/** The gap that reads as "the step after this one" rather than "somewhere near it". */
const nextStepGap = 60;
/** Candidates per column, and columns, tried before the search gives up on finding free space. */
const searchRows = 6;
const searchColumns = 10;
/** How far inside the viewport a placed node has to sit before it counts as visible. */
const revealMargin = 24;

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width + nodeGap.x &&
    b.x < a.x + a.width + nodeGap.x &&
    a.y < b.y + b.height + nodeGap.y &&
    b.y < a.y + a.height + nodeGap.y
  );
}

/**
 * Where a node added without a drop point lands. Clicking the palette used to drop every node on
 * the middle of the view, so each one buried the last; this puts it in the nearest free space —
 * next to the selected node when there is one, since that is the step being built on — and pans
 * to it when that space falls outside the view.
 */
function useNodePlacement(): (insert: (position: XYPosition) => void) => void {
  const { getViewport, setCenter } = useReactFlow();
  const reactFlowStore = useStoreApi();
  return useCallback(
    (insert) => {
      const { nodeLookup, width, height } = reactFlowStore.getState();
      const taken: Box[] = [];
      let selected: Box | undefined;
      for (const node of nodeLookup.values()) {
        const box = {
          x: node.internals.positionAbsolute.x,
          y: node.internals.positionAbsolute.y,
          width: node.measured.width ?? defaultNodeSize.width,
          height: node.measured.height ?? defaultNodeSize.height,
        };
        taken.push(box);
        if (node.selected && !selected) selected = box;
      }

      const { x, y, zoom } = getViewport();
      const view = { x: -x / zoom, y: -y / zoom, width: width / zoom, height: height / zoom };
      const origin = selected
        ? { x: selected.x + selected.width + nextStepGap, y: selected.y }
        : {
            x: view.x + view.width / 2 - defaultNodeSize.width / 2,
            y: view.y + view.height / 2 - defaultNodeSize.height / 2,
          };
      const step = {
        x: defaultNodeSize.width + nodeGap.x,
        y: defaultNodeSize.height + nodeGap.y,
      };

      let position = snapPosition(origin);
      for (let attempt = 0; attempt < searchRows * searchColumns; attempt += 1) {
        position = snapPosition({
          x: origin.x + Math.floor(attempt / searchRows) * step.x,
          y: origin.y + (attempt % searchRows) * step.y,
        });
        if (!taken.some((box) => overlaps({ ...position, ...defaultNodeSize }, box))) break;
      }

      insert(position);
      const inside =
        position.x >= view.x + revealMargin &&
        position.y >= view.y + revealMargin &&
        position.x + defaultNodeSize.width <= view.x + view.width - revealMargin &&
        position.y + defaultNodeSize.height <= view.y + view.height - revealMargin;
      if (!inside)
        void setCenter(
          position.x + defaultNodeSize.width / 2,
          position.y + defaultNodeSize.height / 2,
          { zoom, duration: 200 },
        );
    },
    [getViewport, reactFlowStore, setCenter],
  );
}

export function useAddNodeAtCenter(): (type: FlowNodeType) => void {
  const place = useNodePlacement();
  const addNode = useBuilderStore((state) => state.addNode);
  return useCallback(
    (type) => {
      place((position) => addNode(type, position));
    },
    [addNode, place],
  );
}

/** Inserts a configured node, such as a saved one, in the first free space on the canvas. */
export function useInsertNodeAtCenter(): (input: NodeTemplate) => void {
  const place = useNodePlacement();
  const insertNode = useBuilderStore((state) => state.insertNode);
  return useCallback(
    (input) => {
      place((position) => insertNode(input, position));
    },
    [insertNode, place],
  );
}

/**
 * Rearranges the graph and then brings the result back into view. The fit has to wait for the
 * commit that carries the new positions, or it frames where the nodes used to be.
 */
function useTidyUp() {
  // Frames are not laid out; they are refitted around their nodes once those have moved.
  const nodes = useBuilderStore(selectFlowNodes);
  const edges = useBuilderStore((state) => state.edges);
  const setNodePositions = useBuilderStore((state) => state.setNodePositions);
  const { fitView } = useReactFlow();
  const [tidied, setTidied] = useState(0);
  useEffect(() => {
    if (tidied === 0) return;
    const frame = window.requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 200 }));
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, tidied]);
  return useCallback(() => {
    setNodePositions(layoutFlowPositions(nodes, edges));
    setTidied((count) => count + 1);
  }, [edges, nodes, setNodePositions]);
}

/** The current zoom, and the way back to 100 %. */
function ZoomReadout() {
  const { zoom } = useViewport();
  const { zoomTo } = useReactFlow();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={styles.zoomReadout}
      aria-label="Reset zoom to 100%"
      onClick={() => void zoomTo(1, { duration: 200 })}
    >
      {Math.round(zoom * 100)}%
    </Button>
  );
}

function ZoomPanel() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const tidyUp = useTidyUp();
  const empty = useBuilderStore((state) => state.nodes.length === 0);
  return (
    <Panel position="bottom-left" className={styles.zoomPanel}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Tidy up"
              disabled={empty}
              onClick={tidyUp}
            />
          }
        >
          <RiLayoutMasonryLine aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup side="top" className="max-w-72">
          Tidy up: lay connected nodes out left to right, stack the unconnected ones, and fit the
          flow in view.
        </TooltipPopup>
      </Tooltip>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => zoomOut()}>
        <RiSubtractLine />
      </Button>
      <ZoomReadout />
      <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomIn()}>
        <RiAddLine />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Fit view"
        onClick={() => fitView({ padding: 0.2, duration: 200 })}
      >
        <RiFocus3Line />
      </Button>
    </Panel>
  );
}

function EmptyCanvas() {
  const addAtCenter = useAddNodeAtCenter();
  return (
    <div className={styles.canvasEmpty} role="note">
      <RiFlashlightLine aria-hidden="true" className={styles.canvasEmptyIcon} />
      <p className={styles.canvasEmptyTitle}>Every flow starts with a trigger</p>
      <p className={styles.canvasEmptyBody}>
        Pick one under Nodes › Triggers and drag it here, or start with the mini-app trigger and add
        screens after it.
      </p>
      <Button variant="outline" size="sm" onClick={() => addAtCenter("trigger.miniapp-open")}>
        <RiAddLine aria-hidden="true" />
        Add a mini-app trigger
      </Button>
    </div>
  );
}

/** One source of truth for the minimap's box: the svg React Flow draws and the frame around it. */
const miniMapSize = { width: 160, height: 100 };

export function FlowCanvas({ gettingStarted = false }: { gettingStarted?: boolean }) {
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const onNodesChange = useBuilderStore((state) => state.onNodesChange);
  const onEdgesChange = useBuilderStore((state) => state.onEdgesChange);
  const onConnect = useBuilderStore((state) => state.onConnect);
  const canConnect = useBuilderStore((state) => state.canConnect);
  const addNode = useBuilderStore((state) => state.addNode);
  const insertNode = useBuilderStore((state) => state.insertNode);
  const { presets } = useNodePresets();
  const run = useRunStore((state) => state.run);
  const problems = useFlowProblems();
  const problemsByNode = useMemo(() => groupProblemsByNode(problems), [problems]);
  const { screenToFlowPosition } = useReactFlow();
  const reconnectEdge = useBuilderStore((state) => state.reconnectEdge);
  const removeEdge = useBuilderStore((state) => state.removeEdge);
  const tidyUp = useTidyUp();
  const { fitView } = useReactFlow();
  const viewport = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingPick | null>(null);
  const [menu, setMenu] = useState<CanvasMenuState | null>(null);

  /** Opens the picker at a screen point, kept inside the canvas so no row falls off an edge. */
  const openPicker = useCallback(
    (point: { clientX: number; clientY: number }, from?: SourcePort) => {
      const bounds = viewport.current?.getBoundingClientRect();
      if (!bounds) return;
      setPending({
        ...(from ? { from } : {}),
        at: {
          x: clamp(point.clientX - bounds.left, bounds.width, pickerSize.width),
          y: clamp(point.clientY - bounds.top, bounds.height, pickerSize.height),
        },
        flowPosition: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
      });
    },
    [screenToFlowPosition],
  );

  const shownEdges = useMemo(
    () =>
      run
        ? edges.map((edge) => {
            const status = edgeRunStatus(run, edge);
            return status ? { ...edge, className: styles[`edge-${status}`] } : edge;
          })
        : edges,
    [edges, run],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;
    if (!types.includes(nodeTypeMime) && !types.includes(nodePresetMime)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const presetId = event.dataTransfer.getData(nodePresetMime);
      const type = event.dataTransfer.getData(nodeTypeMime);
      const preset = presetId ? presets.find((entry) => entry.id === presetId) : undefined;
      if (!preset && !isFlowNodeType(type)) return;
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const position = snapPosition({ x: point.x - nodeHalfSize.x, y: point.y - nodeHalfSize.y });
      if (preset)
        insertNode({ type: preset.type, label: preset.label, config: preset.config }, position);
      else if (isFlowNodeType(type)) addNode(type, position);
    },
    [addNode, insertNode, presets, screenToFlowPosition],
  );

  // Dropping a connection on empty canvas offers the nodes that can accept it, then wires
  // the picked one to the port the drag started from.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid || connectionState.fromHandle?.type !== "source") return;
      const source = connectionState.fromNode?.id;
      if (!source) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) return;
      openPicker(point, { source, sourceHandle: connectionState.fromHandle.id });
    },
    [openPicker],
  );

  // Double-clicking empty canvas offers a node at that spot. Nodes handle their own double
  // click (label editing), and React Flow's double-click zoom is off.
  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.classList.contains("react-flow__pane")) return;
      openPicker(event);
    },
    [openPicker],
  );

  // One menu for everything under the pointer. A right-click on a node that is part of the
  // current selection acts on the whole selection, the way it does in a file manager.
  const openMenu = useCallback(
    (
      event: { clientX: number; clientY: number; preventDefault(): void },
      target: CanvasMenuState["target"],
    ) => {
      event.preventDefault();
      setMenu({ target, at: { x: event.clientX, y: event.clientY } });
    },
    [],
  );
  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: Node) => {
      const selected = nodes.filter((item) => item.selected).map((item) => item.id);
      const target: CanvasMenuState["target"] =
        node.selected && selected.length > 1
          ? { kind: "selection", ids: selected }
          : { kind: "node", id: node.id };
      openMenu(event, target);
    },
    [nodes, openMenu],
  );
  const onSelectionContextMenu = useCallback(
    (event: ReactMouseEvent, selected: Node[]) =>
      openMenu(event, { kind: "selection", ids: selected.map((node) => node.id) }),
    [openMenu],
  );
  const onEdgeContextMenu = useCallback(
    (event: ReactMouseEvent, edge: Edge) => openMenu(event, { kind: "edge", id: edge.id }),
    [openMenu],
  );
  // Taken on the wrapper, not through `onPaneContextMenu`: React Flow only forwards a pane
  // right-click when the event's target is the pane itself, which a real pointer does not
  // always satisfy. The wrapper sees every right-click that no node, edge or selection took.
  const onWrapperContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      if (!event.target.closest(".react-flow__pane")) return;
      if (event.target.closest(".react-flow__node, .react-flow__edge, .react-flow__nodesselection"))
        return;
      openMenu(event, { kind: "pane" });
    },
    [openMenu],
  );

  // Dragging an edge end onto another port moves it; letting go on empty canvas removes it.
  const reconnected = useRef(false);
  const onReconnectStart = useCallback(() => {
    reconnected.current = false;
  }, []);
  const onReconnect = useCallback(
    (edge: Edge, connection: Connection) => {
      reconnected.current = reconnectEdge(edge, connection);
    },
    [reconnectEdge],
  );
  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnected.current) removeEdge(edge.id);
      reconnected.current = false;
    },
    [removeEdge],
  );

  return (
    <div className={styles.canvas}>
      <NodeProblemsContext.Provider value={problemsByNode}>
        <div
          className={styles.canvasViewport}
          ref={viewport}
          onDoubleClick={onPaneDoubleClick}
          onContextMenu={onWrapperContextMenu}
        >
          <ReactFlow
            nodes={nodes}
            edges={shownEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={canConnect}
            defaultEdgeOptions={{ type: "smoothstep" }}
            connectionLineType={ConnectionLineType.SmoothStep}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onConnectEnd={onConnectEnd}
            edgesReconnectable
            onReconnectStart={onReconnectStart}
            onReconnect={onReconnect}
            onReconnectEnd={onReconnectEnd}
            onNodeContextMenu={onNodeContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            fitView={nodes.length > 0}
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={["Backspace", "Delete"]}
            minZoom={0.25}
            maxZoom={1.25}
            snapToGrid
            snapGrid={snapGrid}
            // Design-tool pointer model: dragging empty canvas selects; Space or the middle
            // button drags the view and a two-finger scroll pans it; pinch and Cmd+scroll zoom.
            // The right button is left alone: React Flow swallows the pane's context menu when
            // it pans, and the menu matters more.
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1]}
            panOnScroll
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
            <SelectionToolbar />
            <ZoomPanel />
            {gettingStarted && <GettingStartedPanel />}
            {nodes.length > 0 && (
              /* The size goes in `style`, which is where MiniMap reads it from
               * (`elementWidth = style?.width ?? defaultWidth`) to draw the svg and compute its
               * viewBox. Sized in CSS alone it drew at its own default 200x100 and the smaller
               * frame clipped the result: the rightmost node lost to the border, the flow
               * pushed against the bottom edge, and the viewport rectangle disagreeing with
               * what the canvas showed. */
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                style={miniMapSize}
                ariaLabel="Flow overview"
                className={styles.miniMap}
              />
            )}
            {nodes.length === 0 && <EmptyCanvas />}
          </ReactFlow>
          <CanvasMenu
            menu={menu}
            onClose={() => setMenu(null)}
            onAddNodeAt={(at) => openPicker({ clientX: at.x, clientY: at.y })}
            onTidyUp={tidyUp}
            onFitView={() => void fitView({ padding: 0.2, duration: 200 })}
          />
          {pending && (
            <NodePicker
              label={pending.from ? "Add a connected node" : "Add a node"}
              position={pending.at}
              accepts={pending.from ? acceptsConnection : undefined}
              onClose={() => setPending(null)}
              onPick={(type) => {
                addNode(
                  type,
                  snapPosition({
                    x: pending.flowPosition.x - nodeHalfSize.x,
                    y: pending.flowPosition.y - nodeHalfSize.y,
                  }),
                  pending.from,
                );
                setPending(null);
              }}
            />
          )}
        </div>
      </NodeProblemsContext.Provider>
      <RunPanel />
    </div>
  );
}
