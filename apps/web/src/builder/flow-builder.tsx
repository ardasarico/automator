"use client";

import "@xyflow/react/dist/style.css";

import type { FlowDocument } from "@automator/contracts";
import { ReactFlowProvider } from "@xyflow/react";
import { useCollapseSidebarWhileMounted } from "../components/sidebar-context";
import { BuilderToolbar } from "./builder-toolbar";
import { FlowCanvas } from "./flow-canvas";
import { LeftPanel } from "./left-panel";
import { RightPanels } from "./right-panels";
import { BuilderStoreProvider } from "./store-provider";

/** The whole builder for one flow: state provider, toolbar, left panel, canvas, right panels. */
export function FlowBuilder({ document }: { document: FlowDocument }) {
  useCollapseSidebarWhileMounted();
  return (
    <BuilderStoreProvider document={document}>
      <ReactFlowProvider>
        <div className="flex min-h-0 flex-1 flex-col">
          <BuilderToolbar />
          <div className="flex min-h-0 flex-1">
            <LeftPanel />
            <FlowCanvas />
            <RightPanels />
          </div>
        </div>
      </ReactFlowProvider>
    </BuilderStoreProvider>
  );
}
