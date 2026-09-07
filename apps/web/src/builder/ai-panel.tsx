"use client";

import { Button } from "@automator/ui/button";
import { Textarea } from "@automator/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiRobot2Line, RiSendPlaneLine } from "@remixicon/react";
import styles from "./flow-builder.module.css";

/**
 * The right side's AI panel: an empty conversation and a composer that cannot send yet. It
 * holds no state and talks to nothing; the agent arrives with the AI endpoint.
 */
export function AiPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <span className={styles.nodeIcon} data-category="ai">
            <RiRobot2Line aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-label">Ask the agent</p>
            <p className="mt-1 text-caption text-muted-foreground">
              Describe a change and the agent will edit this flow once the AI endpoint exists.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-none flex-col gap-2 border-t px-3 pt-3 pb-3">
        <Textarea
          rows={3}
          placeholder="Add a USDC payment after the wallet step…"
          aria-label="Message to the agent"
        />
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-disabled="true"
                  className="opacity-64"
                  onClick={(event) => event.preventDefault()}
                />
              }
            >
              <RiSendPlaneLine aria-hidden="true" />
              Send
            </TooltipTrigger>
            <TooltipPopup>AI editing arrives with the API</TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
