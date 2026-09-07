"use client";

import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiContractRightLine, RiRobot2Line, RiSmartphoneLine } from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { useState } from "react";
import { AiPanel } from "./ai-panel";
import styles from "./flow-builder.module.css";
import { ScreenPreview } from "./screen-preview";

type PanelId = "ai" | "preview";

const panels: readonly { id: PanelId; label: string; icon: RemixiconComponentType }[] = [
  { id: "ai", label: "AI agent", icon: RiRobot2Line },
  { id: "preview", label: "Screen preview", icon: RiSmartphoneLine },
];

function RailToggle({
  label,
  icon: Icon,
  active,
  onToggle,
}: {
  label: string;
  icon: RemixiconComponentType;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={
              active ? `${styles.railButton} ${styles.railButtonActive}` : styles.railButton
            }
            aria-label={label}
            aria-pressed={active}
            onClick={onToggle}
          />
        }
      >
        <Icon aria-hidden="true" className="size-4" />
      </TooltipTrigger>
      {/* The rail hugs the window edge, so the tooltip opens inward instead of over the other toggle. */}
      <TooltipPopup side="left">{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The right side of the builder: one open panel at a time, plus the rail that switches
 * between them. Clicking the open panel's toggle collapses it; the choice is not persisted.
 */
export function RightPanels() {
  const [active, setActive] = useState<PanelId | null>("ai");
  const open = panels.find((panel) => panel.id === active);

  return (
    <>
      {open && (
        <aside className={styles.sidePanel} aria-label={open.label}>
          <div className={styles.panelHeader}>
            <p className="min-w-0 truncate text-label">{open.label}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse panel"
              onClick={() => setActive(null)}
            >
              <RiContractRightLine aria-hidden="true" />
            </Button>
          </div>
          {open.id === "ai" ? <AiPanel /> : <ScreenPreview />}
        </aside>
      )}
      <nav className={styles.rail} aria-label="Panels">
        {panels.map(({ id, label, icon }) => (
          <RailToggle
            key={id}
            label={label}
            icon={icon}
            active={active === id}
            onToggle={() => setActive((current) => (current === id ? null : id))}
          />
        ))}
      </nav>
    </>
  );
}
