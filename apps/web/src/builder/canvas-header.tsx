"use client";

import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiPlayLine, RiRestartLine, RiStopLine } from "@remixicon/react";
import { useState } from "react";
import styles from "./flow-builder.module.css";
import { PublishButton } from "./publish-button";
import { useRunStore } from "./run-store-provider";
import { SaveButton, useSaveFlow } from "./save-button";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useFlowProblems } from "./use-flow-problems";
import { useFlowRun } from "./use-flow-run";
import { countErrors } from "./validation";

/**
 * The row above the canvas, between the two panels: Simulate on the left, joined by Stop and
 * Restart while a simulation is running, and Save and Publish on the right. Simulate runs the
 * canvas document through the API; the node cards and the run panel show the results. With
 * validation errors on the canvas, the first click warns and the second runs anyway.
 */
export function CanvasHeader() {
  const { running, error, run, stop: stopSimulation } = useFlowRun();
  const runError = useRunStore((state) => state.run?.error ?? null);
  const saving = useSaveFlow();
  const problems = useFlowProblems();
  const errors = countErrors(problems);
  const [warned, setWarned] = useState(false);

  function startSimulation() {
    if (errors > 0 && !warned) {
      setWarned(true);
      return;
    }
    setWarned(false);
    void run();
  }

  useCanvasHotkeys({ save: saving.save, run: startSimulation });

  const warning =
    warned && errors > 0
      ? `${errors === 1 ? "1 problem" : `${errors} problems`} may fail this run: ${
          problems.find((problem) => problem.severity === "error")?.message ?? ""
        } Click Simulate again to run anyway.`
      : null;

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
      {warning ? (
        <p role="status" className={styles.headerNote} data-tone="warning">
          {warning}
        </p>
      ) : error || runError ? (
        <p role="alert" className={styles.headerNote} data-tone="error">
          {error ?? runError}
        </p>
      ) : null}
      <SaveButton controller={saving} />
      <PublishButton />
    </header>
  );
}
