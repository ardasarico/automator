"use client";

import "@xyflow/react/dist/style.css";

import type { FlowDocument } from "@automator/contracts";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";
import { hydrateFlow } from "../builder/document";
import styles from "../builder/flow-builder.module.css";
import { nodeTypes } from "../builder/flow-node";
import { RunStoreProvider } from "../builder/run-store-provider";
import previewStyles from "./flow-preview.module.css";

/**
 * A read-only rendering of a flow's graph with the builder's node cards: pan and zoom only,
 * no selection, dragging or connecting. The node cards read a run store, so an empty one is
 * mounted for them.
 */
export function FlowPreview({ document, label }: { document: FlowDocument; label: string }) {
  const { nodes, edges } = useMemo(() => hydrateFlow(document), [document]);
  return (
    <div className={previewStyles.frame} role="img" aria-label={label}>
      <RunStoreProvider>
        <ReactFlowProvider>
          <div className={styles.canvas}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={{ type: "smoothstep" }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
            </ReactFlow>
          </div>
        </ReactFlowProvider>
      </RunStoreProvider>
    </div>
  );
}
