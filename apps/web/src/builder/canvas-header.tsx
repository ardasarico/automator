"use client";

import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiPlayLine, RiRestartLine, RiSaveLine, RiStopLine } from "@remixicon/react";
import styles from "./flow-builder.module.css";
import { useBuilderStore } from "./store-provider";

/**
 * The row above the canvas, between the two panels: Simulate on the left, joined by Stop and
 * Restart while a simulation is running, and Save on the right. The simulation controls only
 * drive the store's status until the runner lands; Save waits for the flows API.
 */
export function CanvasHeader() {
  const running = useBuilderStore((state) => state.simulation === "running");
  const startSimulation = useBuilderStore((state) => state.startSimulation);
  const stopSimulation = useBuilderStore((state) => state.stopSimulation);

  return (
    <header className={styles.canvasHeader}>
      <Button variant="outline" size="sm" disabled={running} onClick={startSimulation}>
        <RiPlayLine aria-hidden="true" />
        Simulate
      </Button>
      {running && (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Stop" onClick={stopSimulation} />
              }
            >
              <RiStopLine aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Stop</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Restart"
                  onClick={startSimulation}
                />
              }
            >
              <RiRestartLine aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Restart</TooltipPopup>
          </Tooltip>
        </>
      )}
      <Button variant="secondary" size="sm" className="ml-auto">
        <RiSaveLine aria-hidden="true" />
        Save
      </Button>
    </header>
  );
}
