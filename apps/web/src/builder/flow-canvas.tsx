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
import type { FlowNodeType } from "@automator/contracts";
import { RiFocus3Line, RiSubtractLine, RiAddLine } from "@remixicon/react";
import { useCallback, type DragEvent } from "react";
import { isFlowNodeType } from "./catalog";
import { nodeHalfSize, nodeTypes } from "./flow-node";
import styles from "./flow-builder.module.css";
import { useBuilderStore } from "./store-provider";

/** The drag payload MIME type the palette writes and the canvas reads. */
export const nodeTypeMime = "application/x-automator-node-type";

/**
 * Where a click-added node lands: the viewport centre in flow coordinates, nudged by the
 * node count so repeated clicks stack visibly instead of piling on one spot.
 */
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

function ZoomPanel() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <Panel position="bottom-left" className={styles.zoomPanel}>
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

export function FlowCanvas() {
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const onNodesChange = useBuilderStore((state) => state.onNodesChange);
  const onEdgesChange = useBuilderStore((state) => state.onEdgesChange);
  const onConnect = useBuilderStore((state) => state.onConnect);
  const canConnect = useBuilderStore((state) => state.canConnect);
  const addNode = useBuilderStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();

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
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
        <MiniMap pannable zoomable className={styles.minimap} />
        <ZoomPanel />
      </ReactFlow>
      {nodes.length === 0 && <p className={styles.emptyHint}>Add a node from the palette</p>}
    </div>
  );
}
