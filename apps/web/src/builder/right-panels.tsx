"use client";

import { Button } from "@automator/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@automator/ui/tabs";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiContractRightLine, RiRobot2Line, RiSmartphoneLine } from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "./ai/chat-store-provider";
import { AiPanel } from "./ai/panel";
import styles from "./flow-builder.module.css";
import { usePanelEscape, useResponsivePanels } from "./responsive-panels";
import { ScreenPreview } from "./screen-preview";

type PanelId = "ai" | "preview";

const panels: readonly { id: PanelId; label: string; icon: RemixiconComponentType }[] = [
  { id: "ai", label: "AI agent", icon: RiRobot2Line },
  { id: "preview", label: "Screen preview", icon: RiSmartphoneLine },
];

function isPanelId(value: unknown): value is PanelId {
  return panels.some((panel) => panel.id === value);
}

export function RightPanels() {
  const { compact, panel, setPanel } = useResponsivePanels();
  const [active, setActive] = useState<PanelId | null>("ai");
  const lastTrigger = useRef<HTMLElement | null>(null);
  const closePanel = () => {
    if (compact) {
      setPanel(null);
      lastTrigger.current?.focus();
    } else setActive(null);
  };
  usePanelEscape(compact && panel === "right", closePanel);
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
            value={active}
            onValueChange={(value) => {
              if (isPanelId(value)) setActive(value);
            }}
            className="min-h-0 flex-1 gap-0"
          >
            <div className={styles.panelHeader}>
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
              {}
              <TabsList size="sm" aria-label="Panels" className="ml-auto">
                {panels.map(({ id, label, icon: Icon }) => (
                  <TabsTab key={id} value={id} className="h-6 sm:h-6">
                    <Icon aria-hidden="true" />
                    {label}
                  </TabsTab>
                ))}
              </TabsList>
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
