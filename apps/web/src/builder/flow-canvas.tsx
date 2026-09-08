"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  useStoreApi,
  type FinalConnectionState,
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
import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { isFlowNodeType, type CatalogEntry } from "./catalog";
import { nodeHalfSize, nodeTypes } from "./flow-node";
import styles from "./flow-builder.module.css";
import { GettingStartedPanel } from "./getting-started-panel";
import { NodePicker } from "./node-picker";
import { useNodePresets } from "./presets-context";
import { RunPanel } from "./run-panel";
import { edgeRunStatus } from "./run-selectors";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";
import type { NodeTemplate, SourcePort } from "./store";
import { groupProblemsByNode, NodeProblemsContext, useFlowProblems } from "./use-flow-problems";

export const nodeTypeMime = "application/x-automator-node-type";
export const nodePresetMime = "application/x-automator-node-preset";

/** A connection dropped on empty canvas, waiting for the node the picker returns. */
type PendingConnection = {
  from: SourcePort;
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

/** Where the next node lands when it is added without a drop point. */
function useCenterPosition(): () => XYPosition {
  const { getViewport } = useReactFlow();
  const reactFlowStore = useStoreApi();
  const count = useBuilderStore((state) => state.nodes.length);
  return useCallback(() => {
    const { x, y, zoom } = getViewport();
    const { width, height } = reactFlowStore.getState();
    const nudge = (count % 6) * 24;
    return {
      x: (width / 2 - x) / zoom - nodeHalfSize.x + nudge,
      y: (height / 2 - y) / zoom - nodeHalfSize.y + nudge,
    };
  }, [count, getViewport, reactFlowStore]);
}

export function useAddNodeAtCenter(): (type: FlowNodeType) => void {
  const center = useCenterPosition();
  const addNode = useBuilderStore((state) => state.addNode);
  return useCallback(
    (type) => {
      addNode(type, center());
    },
    [addNode, center],
  );
}

/** Inserts a configured node, such as a saved one, in the middle of the canvas. */
export function useInsertNodeAtCenter(): (input: NodeTemplate) => void {
  const center = useCenterPosition();
  const insertNode = useBuilderStore((state) => state.insertNode);
  return useCallback(
    (input) => {
      insertNode(input, center());
    },
    [center, insertNode],
  );
}

function useTidyUp() {
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const setNodePositions = useBuilderStore((state) => state.setNodePositions);
  const { fitView } = useReactFlow();
  return useCallback(() => {
    setNodePositions(layoutFlowPositions(nodes, edges));
    window.requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 200 }));
  }, [edges, fitView, nodes, setNodePositions]);
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
        <TooltipPopup side="top">Tidy up: arrange left to right</TooltipPopup>
      </Tooltip>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomIn()}>
        <RiAddLine />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => zoomOut()}>
        <RiSubtractLine />
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
  const viewport = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingConnection | null>(null);

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
      const position = { x: point.x - nodeHalfSize.x, y: point.y - nodeHalfSize.y };
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
      const bounds = viewport.current?.getBoundingClientRect();
      if (!bounds) return;
      setPending({
        from: { source, sourceHandle: connectionState.fromHandle.id },
        // Anchored at the drop point, then kept inside the canvas so no row falls off an edge.
        at: {
          x: clamp(point.clientX - bounds.left, bounds.width, pickerSize.width),
          y: clamp(point.clientY - bounds.top, bounds.height, pickerSize.height),
        },
        flowPosition: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
      });
    },
    [screenToFlowPosition],
  );

  return (
    <div className={styles.canvas}>
      <NodeProblemsContext.Provider value={problemsByNode}>
        <div className={styles.canvasViewport} ref={viewport}>
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
            fitView={nodes.length > 0}
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={["Backspace", "Delete"]}
            minZoom={0.25}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
            <ZoomPanel />
            {gettingStarted && <GettingStartedPanel />}
            {nodes.length > 0 && (
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                ariaLabel="Flow overview"
                className={styles.miniMap}
              />
            )}
            {nodes.length === 0 && <EmptyCanvas />}
          </ReactFlow>
          {pending && (
            <NodePicker
              label="Add a connected node"
              position={pending.at}
              accepts={acceptsConnection}
              onClose={() => setPending(null)}
              onPick={(type) => {
                addNode(
                  type,
                  {
                    x: pending.flowPosition.x - nodeHalfSize.x,
                    y: pending.flowPosition.y - nodeHalfSize.y,
                  },
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
