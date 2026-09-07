"use client";

import { Button } from "@automator/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@automator/ui/tabs";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiContractRightLine, RiRobot2Line, RiSmartphoneLine } from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { useState } from "react";
import styles from "./flow-builder.module.css";

type PanelId = "ai" | "preview";

const panels: readonly { id: PanelId; label: string; icon: RemixiconComponentType }[] = [
  { id: "ai", label: "AI agent", icon: RiRobot2Line },
  { id: "preview", label: "Screen preview", icon: RiSmartphoneLine },
];

function isPanelId(value: unknown): value is PanelId {
  return panels.some((panel) => panel.id === value);
}

/**
 * The right side of the builder: one panel open at a time. Open, the title row holds a
 * minimize control and the tabs that switch between panels; the bodies are empty shells while
 * the design is worked out. Minimized, only a rail with one toggle per panel remains. The
 * choice is not persisted.
 */
export function RightPanels() {
  const [active, setActive] = useState<PanelId | null>("ai");

  if (active === null) {
    return (
      <nav className={styles.rail} data-side="right" aria-label="Panels">
        {panels.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={label}
                  aria-expanded={false}
                  onClick={() => setActive(id)}
                />
              }
            >
              <Icon aria-hidden="true" />
            </TooltipTrigger>
            {/* The rail hugs the window edge, so tooltips open inward instead of over the next toggle. */}
            <TooltipPopup side="left">{label}</TooltipPopup>
          </Tooltip>
        ))}
      </nav>
    );
  }

  return (
    <aside className={styles.sidePanel} aria-label="Panels">
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
                  onClick={() => setActive(null)}
                />
              }
            >
              <RiContractRightLine aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Minimize</TooltipPopup>
          </Tooltip>
          {/* 24 px tabs in a 2 px frame, so the list is as tall as the 28 px buttons beside it. */}
          <TabsList size="sm" aria-label="Panels" className="ml-auto">
            {panels.map(({ id, label, icon: Icon }) => (
              <TabsTab key={id} value={id} className="h-6 sm:h-6">
                <Icon aria-hidden="true" />
                {label}
              </TabsTab>
            ))}
          </TabsList>
        </div>
        {panels.map(({ id }) => (
          <TabsPanel key={id} value={id} className="min-h-0" />
        ))}
      </Tabs>
    </aside>
  );
}
