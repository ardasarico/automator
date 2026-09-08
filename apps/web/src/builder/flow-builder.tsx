"use client";

import "@xyflow/react/dist/style.css";

import type { FlowDocument, FlowRun } from "@automator/contracts";
import { ReactFlowProvider } from "@xyflow/react";
import { DataTablesProvider } from "../data/tables-context";
import { AiStoreProvider } from "./ai-store-provider";
import { CanvasHeader } from "./canvas-header";
import { FlowActivationProvider } from "./flow-activation";
import { FlowCanvas } from "./flow-canvas";
import { LeaveGuardProvider } from "./leave-guard";
import { LeftPanel } from "./left-panel";
import styles from "./flow-builder.module.css";
import { ResponsivePanelsProvider } from "./responsive-panels";
import { RightPanels } from "./right-panels";
import { RunStoreProvider } from "./run-store-provider";
import { SaveFlowProvider } from "./save-button";
import { BuilderStoreProvider } from "./store-provider";

export function FlowBuilder({
  document,
  initialRun = null,
  initialRunDocument = null,
  enabled = false,
  webhookToken = null,
  gettingStarted = false,
  focusAi = false,
}: {
  document: FlowDocument;
  initialRun?: FlowRun | null;
  initialRunDocument?: FlowDocument | null;
  enabled?: boolean;
  webhookToken?: string | null;
  gettingStarted?: boolean;
  focusAi?: boolean;
}) {
  return (
    <BuilderStoreProvider document={document}>
      <FlowActivationProvider enabled={enabled} webhookToken={webhookToken}>
        <RunStoreProvider initialRun={initialRun} initialDocument={initialRunDocument}>
          <SaveFlowProvider>
            <LeaveGuardProvider>
              <AiStoreProvider focusOnMount={focusAi}>
                <ReactFlowProvider>
                  <ResponsivePanelsProvider>
                    {/* Every table picker and the canvas problem badges read the same list. */}
                    <DataTablesProvider>
                      <div className={styles.builder}>
                        <LeftPanel />
                        <div className={styles.canvasColumn}>
                          <CanvasHeader />
                          <FlowCanvas gettingStarted={gettingStarted} />
                        </div>
                        <RightPanels />
                      </div>
                    </DataTablesProvider>
                  </ResponsivePanelsProvider>
                </ReactFlowProvider>
              </AiStoreProvider>
            </LeaveGuardProvider>
          </SaveFlowProvider>
        </RunStoreProvider>
      </FlowActivationProvider>
    </BuilderStoreProvider>
  );
}
