"use client";

import { chainName, flowChainId } from "@automator/contracts";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@automator/ui/alert-dialog";
import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiPlayLine,
  RiRestartLine,
  RiStopLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { useState } from "react";
import { useShortcut } from "../lib/shortcuts";
import { useBuilderDialogs } from "./builder-dialogs";
import styles from "./flow-builder.module.css";
import { useFlowActivation } from "./flow-activation";
import { FlowProblemsButton } from "./flow-problems-button";
import { PublishButton } from "./publish-button";
import { RunModeControl } from "./run-mode-control";
import { useRunStore } from "./run-store-provider";
import { SaveButton, useSaveFlowController } from "./save-button";
import { useBuilderStore } from "./store-provider";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useFlowRun } from "./use-flow-run";

/** A control whose tooltip names both what it does and the key that does it. */
function HeaderAction({
  label,
  combo,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  combo: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick(): void;
}) {
  const shortcut = useShortcut(combo);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${label} (${shortcut})`}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {label} <span className={styles.shortcutHint}>{shortcut}</span>
      </TooltipPopup>
    </Tooltip>
  );
}

function UndoRedo() {
  const undo = useBuilderStore((state) => state.undo);
  const redo = useBuilderStore((state) => state.redo);
  const canUndo = useBuilderStore((state) => state.past.length > 0);
  const canRedo = useBuilderStore((state) => state.future.length > 0);
  return (
    <>
      <HeaderAction
        label="Undo"
        combo="mod+z"
        disabled={!canUndo}
        icon={<RiArrowGoBackLine aria-hidden="true" />}
        onClick={undo}
      />
      <HeaderAction
        label="Redo"
        combo="mod+shift+z"
        disabled={!canRedo}
        icon={<RiArrowGoForwardLine aria-hidden="true" />}
        onClick={redo}
      />
    </>
  );
}

/** Named once per session before the first run that signs anything. */
function LiveRunConfirmation({ onConfirm, onClose }: { onConfirm(): void; onClose(): void }) {
  const meta = useBuilderStore((state) => state.meta);
  const chain = chainName(flowChainId(meta));
  return (
    <AlertDialog open onOpenChange={(next) => !next && onClose()}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Run this flow for real?</AlertDialogTitle>
          <AlertDialogDescription>
            A live run signs transactions with your embedded wallet on {chain} and sends every
            message the flow contains. Switch to Simulate to try it without spending anything.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Run live
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function CanvasHeader() {
  const { running, error, run, stop: stopSimulation } = useFlowRun();
  const { liveMode } = useFlowActivation();
  const runLabel = liveMode ? "Run live" : "Run";
  const runError = useRunStore((state) => state.run?.error ?? null);
  const saving = useSaveFlowController();
  const dialogs = useBuilderDialogs();
  const runShortcut = useShortcut("mod+enter");
  const commandShortcut = useShortcut("mod+k");
  /* Confirmed once per session, not once per run: repeating it teaches people to click through. */
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function startRun() {
    if (liveMode && !liveConfirmed) {
      setConfirming(true);
      return;
    }
    void run();
  }

  useCanvasHotkeys({ save: () => void saving.save(), run: startRun });

  return (
    <header className={styles.canvasHeader}>
      <RunModeControl />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={liveMode ? "default" : "outline"}
              size="sm"
              disabled={running}
              onClick={startRun}
            />
          }
        >
          <RiPlayLine aria-hidden="true" />
          {runLabel}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          {runLabel} <span className={styles.shortcutHint}>{runShortcut}</span>
        </TooltipPopup>
      </Tooltip>
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
                <Button variant="ghost" size="icon-sm" aria-label="Restart" onClick={startRun} />
              }
            >
              <RiRestartLine aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Restart</TooltipPopup>
          </Tooltip>
        </>
      )}
      <span className={styles.headerDivider} aria-hidden="true" />
      <UndoRedo />
      <FlowProblemsButton />
      {(error || runError) && (
        <p role="alert" className={styles.headerNote} data-tone="error">
          {error ?? runError}
        </p>
      )}
      <div className={styles.headerEnd}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Commands (${commandShortcut})`}
                onClick={() => dialogs.open("commands")}
              />
            }
          >
            <RiTerminalBoxLine aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            Commands <span className={styles.shortcutHint}>{commandShortcut}</span>
          </TooltipPopup>
        </Tooltip>
        <SaveButton controller={saving} />
        <PublishButton />
      </div>
      {confirming && (
        <LiveRunConfirmation
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setLiveConfirmed(true);
            void run();
          }}
        />
      )}
    </header>
  );
}
