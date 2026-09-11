"use client";

import { Button } from "@automator/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@automator/ui/tabs";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiCollapseDiagonalLine,
  RiContractRightLine,
  RiExpandDiagonalLine,
  RiRobot2Line,
  RiSmartphoneLine,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useHotkey } from "../lib/hotkeys";
import { useShortcut } from "../lib/shortcuts";
import { useChatStore } from "./ai/chat-store-provider";
import { AiPanel } from "./ai/panel";
import styles from "./flow-builder.module.css";
import { usePanelEscape, useResponsivePanels } from "./responsive-panels";
import { ScreenPreview } from "./screen-preview";
import { useBuilderStore } from "./store-provider";

type PanelId = "ai" | "preview";

const panels: readonly { id: PanelId; label: string; icon: RemixiconComponentType }[] = [
  { id: "ai", label: "AI agent", icon: RiRobot2Line },
  { id: "preview", label: "Screen preview", icon: RiSmartphoneLine },
];

function isPanelId(value: unknown): value is PanelId {
  return panels.some((panel) => panel.id === value);
}

export function RightPanels() {
  const { compact, panel, setPanel, aiFocus, setAiFocus } = useResponsivePanels();
  const [active, setActive] = useState<PanelId | null>("ai");
  const lastTrigger = useRef<HTMLElement | null>(null);
  const closePanel = () => {
    setAiFocus(false);
    if (compact) {
      setPanel(null);
      lastTrigger.current?.focus();
    } else setActive(null);
  };
  usePanelEscape(compact && panel === "right", closePanel);
  /*
   * Escape unwinds one level at a time: the canvas's own Escape clears a selection, so focus mode
   * is only left once there is no selection left to clear. Otherwise one key would do both.
   */
  const hasSelection = useBuilderStore((state) => state.nodes.some((node) => node.selected));
  usePanelEscape(aiFocus && !hasSelection, () => setAiFocus(false));
  const focusShortcut = useShortcut("mod+shift+a");
  /* Allowed inside the composer: the key that widens the conversation is most wanted while
   * writing into it. */
  useHotkey(
    "mod+shift+a",
    (event) => {
      event.preventDefault();
      if (compact) return;
      setActive("ai");
      setAiFocus(!aiFocus);
    },
    { scope: "canvas", allowInEditable: true },
  );
  const focusRequests = useChatStore((state) => state.focusRequests);
  useEffect(() => {
    if (compact && focusRequests > 0) setPanel("right");
  }, [compact, focusRequests, setPanel]);
  const [seenFocusRequests, setSeenFocusRequests] = useState(focusRequests);
  if (focusRequests !== seenFocusRequests) {
    setSeenFocusRequests(focusRequests);
    setActive("ai");
  }

  return (
    <>
      {(active === null || compact) && (
        <nav className={styles.rail} data-side="right" aria-label="Panels">
          {panels.map(({ id, label, icon: Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={label}
                    aria-expanded={compact && panel === "right" && active === id}
                    aria-controls="builder-right-panel"
                    onClick={() => {
                      lastTrigger.current = document.activeElement as HTMLElement;
                      setActive(id);
                      if (compact) setPanel(panel === "right" && active === id ? null : "right");
                    }}
                  />
                }
              >
                <Icon aria-hidden="true" />
              </TooltipTrigger>
              {}
              <TooltipPopup side="left">{label}</TooltipPopup>
            </Tooltip>
          ))}
        </nav>
      )}
      {active !== null && (
        <aside
          id="builder-right-panel"
          className={styles.sidePanel}
          data-open={!compact || panel === "right" || undefined}
          aria-label="Panels"
          role={compact ? "dialog" : undefined}
        >
          <Tabs
            value={aiFocus ? "ai" : active}
            onValueChange={(value) => {
              if (isPanelId(value)) setActive(value);
            }}
            className="min-h-0 flex-1 gap-0"
          >
            <div className={styles.panelHeader}>
              {!aiFocus && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Minimize panel"
                        aria-expanded
                        onClick={closePanel}
                      />
                    }
                  >
                    <RiContractRightLine aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipPopup side="bottom">Minimize</TooltipPopup>
                </Tooltip>
              )}
              {/* Focus mode is offered where the conversation is, and only where there is room
                  for two columns: a compact window already gives the panel the whole width. */}
              {!compact && (active === "ai" || aiFocus) && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={aiFocus ? "Leave focus mode" : "Focus mode"}
                        aria-pressed={aiFocus}
                        onClick={() => setAiFocus(!aiFocus)}
                      />
                    }
                  >
                    {aiFocus ? (
                      <RiCollapseDiagonalLine aria-hidden="true" />
                    ) : (
                      <RiExpandDiagonalLine aria-hidden="true" />
                    )}
                  </TooltipTrigger>
                  <TooltipPopup side="bottom">
                    {aiFocus ? "Leave focus mode" : "Focus mode"} {focusShortcut}
                  </TooltipPopup>
                </Tooltip>
              )}
              {/* The screen preview belongs to the narrow stage; focus mode is the chat alone. */}
              {aiFocus ? (
                <span className={styles.panelTitle}>
                  <RiRobot2Line aria-hidden="true" className="size-3.5" />
                  AI agent
                </span>
              ) : (
                <TabsList size="sm" aria-label="Panels" className="ml-auto">
                  {panels.map(({ id, label, icon: Icon }) => (
                    <TabsTab key={id} value={id} className="h-6 sm:h-6">
                      <Icon aria-hidden="true" />
                      {label}
                    </TabsTab>
                  ))}
                </TabsList>
              )}
            </div>
            <TabsPanel value="ai" className="flex min-h-0 flex-1 flex-col">
              <AiPanel />
            </TabsPanel>
            <TabsPanel value="preview" className="flex min-h-0 flex-1 flex-col">
              <ScreenPreview />
            </TabsPanel>
          </Tabs>
        </aside>
      )}
    </>
  );
}
