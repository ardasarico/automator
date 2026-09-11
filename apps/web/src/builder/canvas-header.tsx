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
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import {
  Menu,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@automator/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiArrowDownSLine,
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiFlowChart,
  RiPlayLine,
  RiRestartLine,
  RiStopLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { useState } from "react";
import { useShortcut } from "../lib/shortcuts";
import { useBuilderDialogs } from "./builder-dialogs";
import { getCatalogEntry } from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import styles from "./flow-builder.module.css";
import { useFlowActivation } from "./flow-activation";
import { FlowProblemsButton } from "./flow-problems-button";
import { PublishButton } from "./publish-button";
import { useResponsivePanels } from "./responsive-panels";
import { RunModeControl } from "./run-mode-control";
import { useRunStore } from "./run-store-provider";
import { SaveButton, useSaveFlowController } from "./save-button";
import { useBuilderStore } from "./store-provider";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useFlowRun, useSimulationTriggers, type SimulationTrigger } from "./use-flow-run";
import { useSelectNode } from "./use-select-node";

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

/** A trigger reads by the name on its card, falling back to what the catalog calls it. */
function triggerName(trigger: SimulationTrigger): string {
  return trigger.label || getCatalogEntry(trigger.type).label;
}

/**
 * Which trigger the next run starts from. A flow with one starting trigger needs no control at
 * all, so this appears only once there is a genuine choice; picking selects the node on the
 * canvas, which is what the run reads, so the two can never disagree.
 */
function TriggerPicker({ disabled }: { disabled: boolean }) {
  const { triggers, activeId } = useSimulationTriggers();
  const selectNode = useSelectNode();
  if (triggers.length < 2) return null;
  const active = triggers.find((trigger) => trigger.id === activeId);
  const name = active ? triggerName(active) : "No trigger";
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={styles.triggerPicker}
            disabled={disabled}
            aria-label={`Starting trigger: ${name}`}
          />
        }
      >
        {active && <CatalogIconMark icon={getCatalogEntry(active.type).icon} />}
        <span className={styles.triggerPickerName}>{name}</span>
        <RiArrowDownSLine aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="start" className="max-w-80">
        <MenuRadioGroup value={activeId ?? ""} onValueChange={(next) => selectNode(String(next))}>
          {/* The label names the group, so it has to sit inside it: Base UI throws otherwise. */}
          <MenuGroupLabel>Start the run from</MenuGroupLabel>
          {triggers.map((trigger) => {
            const kind = getCatalogEntry(trigger.type).label;
            const name = triggerName(trigger);
            return (
              <MenuRadioItem key={trigger.id} value={trigger.id}>
                <span className={styles.triggerPickerItem}>
                  <span className={styles.triggerPickerItemName}>{name}</span>
                  {/* Only a renamed node needs its kind spelled out under the name it was given. */}
                  {name !== kind && <span className={styles.triggerPickerItemType}>{kind}</span>}
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/**
 * The saved flow is starting runs on its own right now. This is about the flow, not about the run
 * the header is set up to make, which is what the Simulate/Live control beside it decides.
 */
function ActiveFlowBadge() {
  const { enabled } = useFlowActivation();
  const dialogs = useBuilderDialogs();
  if (!enabled) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="success"
            render={
              <button
                type="button"
                aria-label="Active flow: open Flow settings"
                onClick={() => dialogs.open("settings")}
              />
            }
          />
        }
      >
        <span className={styles.activeDot} aria-hidden="true" />
        Active
      </TooltipTrigger>
      <TooltipPopup side="bottom" className="max-w-72">
        This flow is active: its saved version starts its own runs from the webhook, schedule,
        onchain-event, price and balance triggers it has. Open Flow settings to turn it off.
      </TooltipPopup>
    </Tooltip>
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

/**
 * The flow's name, shown only in focus mode: the left panel that normally carries it is hidden
 * there, and a conversation about a flow must say which flow. Renaming stays with the panel.
 */
function FocusFlowName() {
  const name = useBuilderStore((state) => state.meta.name);
  return (
    <span className={styles.focusFlowName}>
      <RiFlowChart aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{name || "Untitled flow"}</span>
    </span>
  );
}

export function CanvasHeader() {
  const { aiFocus } = useResponsivePanels();
  const { running, error, run, stop: stopSimulation } = useFlowRun();
  // The header hands the run the trigger it is showing, so the two can never name different ones.
  const { activeId } = useSimulationTriggers();
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
    void run(activeId ?? undefined);
  }

  useCanvasHotkeys({ save: () => void saving.save(), run: startRun });

  return (
    <header className={styles.canvasHeader}>
      {aiFocus && <FocusFlowName />}
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
      <TriggerPicker disabled={running} />
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
        <ActiveFlowBadge />
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
            void run(activeId ?? undefined);
          }}
        />
      )}
    </header>
  );
}
