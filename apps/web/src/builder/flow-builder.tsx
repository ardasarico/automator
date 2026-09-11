"use client";

import "@xyflow/react/dist/style.css";

import type { FlowDocument, FlowRun } from "@automator/contracts";
import { ReactFlowProvider } from "@xyflow/react";
import { DataTablesProvider } from "../data/tables-context";
import { ChatStoreProvider } from "./ai/chat-store-provider";
import { BuilderDialogsProvider } from "./builder-dialogs";
import { CanvasHeader } from "./canvas-header";
import { FlowActivationProvider } from "./flow-activation";
import { FlowCanvas } from "./flow-canvas";
import { LeaveGuardProvider } from "./leave-guard";
import { LeftPanel } from "./left-panel";
import { NodePresetsProvider } from "./presets-context";
import styles from "./flow-builder.module.css";
import { ResponsivePanelsProvider, useResponsivePanels } from "./responsive-panels";
import { RightPanels } from "./right-panels";
import { RunStoreProvider } from "./run-store-provider";
import { SaveFlowProvider } from "./save-button";
import { BuilderStoreProvider } from "./store-provider";

/**
 * The three columns. Focus mode is a flag on this element rather than a different tree: the AI
 * panel keeps its place in the DOM and only changes order and width, so the canvas beside it is
 * never remounted and its viewport, selection and history survive the switch.
 */
function BuilderLayout({ gettingStarted }: { gettingStarted: boolean }) {
  const { aiFocus } = useResponsivePanels();
  return (
    <div className={styles.builder} data-ai-focus={aiFocus || undefined}>
      <LeftPanel />
      <div className={styles.canvasColumn}>
        <CanvasHeader />
        <FlowCanvas gettingStarted={gettingStarted} />
      </div>
      <RightPanels />
    </div>
  );
}

export function FlowBuilder({
  document,
  initialRun = null,
  initialRunDocument = null,
  enabled = false,
  appPublished = false,
  webhookToken = null,
  gettingStarted = false,
  focusAi = false,
}: {
  document: FlowDocument;
  initialRun?: FlowRun | null;
  initialRunDocument?: FlowDocument | null;
  enabled?: boolean;
  appPublished?: boolean;
  webhookToken?: string | null;
  gettingStarted?: boolean;
  focusAi?: boolean;
}) {
  return (
    <BuilderStoreProvider document={document}>
      <FlowActivationProvider
        enabled={enabled}
        appPublished={appPublished}
        webhookToken={webhookToken}
      >
        <RunStoreProvider initialRun={initialRun} initialDocument={initialRunDocument}>
          <SaveFlowProvider>
            <LeaveGuardProvider>
              <ChatStoreProvider focusOnMount={focusAi}>
                <ReactFlowProvider>
                  <ResponsivePanelsProvider>
                    {/* Every table picker and the canvas problem badges read the same list. */}
                    <DataTablesProvider>
                      <NodePresetsProvider>
                        <BuilderDialogsProvider>
                          <BuilderLayout gettingStarted={gettingStarted} />
                        </BuilderDialogsProvider>
                      </NodePresetsProvider>
                    </DataTablesProvider>
                  </ResponsivePanelsProvider>
                </ReactFlowProvider>
              </ChatStoreProvider>
            </LeaveGuardProvider>
          </SaveFlowProvider>
        </RunStoreProvider>
      </FlowActivationProvider>
    </BuilderStoreProvider>
  );
}
