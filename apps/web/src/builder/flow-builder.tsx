"use client";

import "@xyflow/react/dist/style.css";

import type { FlowDocument } from "@automator/contracts";
import { ReactFlowProvider } from "@xyflow/react";
import { CanvasHeader } from "./canvas-header";
import { FlowCanvas } from "./flow-canvas";
import { LeftPanel } from "./left-panel";
import { RightPanels } from "./right-panels";
import { BuilderStoreProvider } from "./store-provider";

/** The whole builder for one flow: left panel, a header over the canvas, right panels. */
export function FlowBuilder({ document }: { document: FlowDocument }) {
  return (
    <BuilderStoreProvider document={document}>
      <ReactFlowProvider>
        <div className="flex min-h-0 flex-1">
          <LeftPanel />
          <div className="flex min-w-0 flex-1 flex-col">
            <CanvasHeader />
            <FlowCanvas />
          </div>
          <RightPanels />
        </div>
      </ReactFlowProvider>
    </BuilderStoreProvider>
  );
}
