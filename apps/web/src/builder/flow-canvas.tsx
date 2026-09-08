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
  type XYPosition,
} from "@xyflow/react";
import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { layoutFlowPositions, type FlowNodeType } from "@automator/contracts";
import {
  RiAddLine,
  RiFlashlightLine,
  RiFocus3Line,
  RiLayoutMasonryLine,
  RiSubtractLine,
} from "@remixicon/react";
import { useCallback, useMemo, type DragEvent } from "react";
import { isFlowNodeType } from "./catalog";
import { nodeHalfSize, nodeTypes } from "./flow-node";
import styles from "./flow-builder.module.css";
import { GettingStartedPanel } from "./getting-started-panel";
import { RunPanel } from "./run-panel";
import { edgeRunStatus } from "./run-selectors";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";
import { groupProblemsByNode, NodeProblemsContext, useFlowProblems } from "./use-flow-problems";

export const nodeTypeMime = "application/x-automator-node-type";

export function useAddNodeAtCenter(): (type: FlowNodeType) => void {
  const { getViewport } = useReactFlow();
  const reactFlowStore = useStoreApi();
  const addNode = useBuilderStore((state) => state.addNode);
  const count = useBuilderStore((state) => state.nodes.length);

  return useCallback(
    (type) => {
      const { x, y, zoom } = getViewport();
      const { width, height } = reactFlowStore.getState();
      const nudge = (count % 6) * 24;
      const position: XYPosition = {
        x: (width / 2 - x) / zoom - nodeHalfSize.x + nudge,
        y: (height / 2 - y) / zoom - nodeHalfSize.y + nudge,
      };
      addNode(type, position);
    },
    [addNode, count, getViewport, reactFlowStore],
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
  const run = useRunStore((state) => state.run);
  const problems = useFlowProblems();
  const problemsByNode = useMemo(() => groupProblemsByNode(problems), [problems]);
  const { screenToFlowPosition } = useReactFlow();

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
    if (!event.dataTransfer.types.includes(nodeTypeMime)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const type = event.dataTransfer.getData(nodeTypeMime);
      if (!isFlowNodeType(type)) return;
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type, { x: position.x - nodeHalfSize.x, y: position.y - nodeHalfSize.y });
    },
    [addNode, screenToFlowPosition],
  );

  return (
    <div className={styles.canvas}>
      <NodeProblemsContext.Provider value={problemsByNode}>
        <div className={styles.canvasViewport}>
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
        </div>
      </NodeProblemsContext.Provider>
      <RunPanel />
    </div>
  );
}
