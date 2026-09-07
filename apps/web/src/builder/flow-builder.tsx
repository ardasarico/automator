"use client";

import "@xyflow/react/dist/style.css";

import type { FlowDocument, FlowRun } from "@automator/contracts";
import { ReactFlowProvider } from "@xyflow/react";
import { CanvasHeader } from "./canvas-header";
import { FlowActivationProvider } from "./flow-activation";
import { FlowCanvas } from "./flow-canvas";
import { LeaveGuardProvider } from "./leave-guard";
import { LeftPanel } from "./left-panel";
import { RightPanels } from "./right-panels";
import { RunStoreProvider } from "./run-store-provider";
import { SaveFlowProvider } from "./save-button";
import { BuilderStoreProvider } from "./store-provider";

/** The whole builder for one flow: left panel, a header over the canvas, right panels. */
export function FlowBuilder({
  document,
  initialRun = null,
  enabled = false,
  webhookToken = null,
}: {
  document: FlowDocument;
  /** A stored run to show on the canvas from the start, for links out of the run history. */
  initialRun?: FlowRun | null;
  /** Whether the flow's triggers are live, and its webhook token, from the stored record. */
  enabled?: boolean;
  webhookToken?: string | null;
}) {
  return (
    <BuilderStoreProvider document={document}>
      <FlowActivationProvider enabled={enabled} webhookToken={webhookToken}>
        <RunStoreProvider initialRun={initialRun}>
          <SaveFlowProvider>
            <LeaveGuardProvider>
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
            </LeaveGuardProvider>
          </SaveFlowProvider>
        </RunStoreProvider>
      </FlowActivationProvider>
    </BuilderStoreProvider>
  );
}
