"use client";

import { Button } from "@automator/ui/button";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@automator/ui/segmented-control";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { useFlowActivation } from "./flow-activation";

/**
 * Which mode the next run uses. It was only ever readable from the run button's own word, and a
 * mode that spends real funds has to be visible whether or not you are looking at that button.
 */
export function RunModeControl() {
  const { liveMode, setLiveMode } = useFlowActivation();
  return (
    <div
      role="group"
      aria-label="Run mode"
      className={segmentedControlRootClassName}
      data-live={liveMode ? "" : undefined}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className={segmentedControlItemVariants({ size: "sm", state: "pressed" })}
              data-pressed={liveMode ? undefined : ""}
              aria-pressed={!liveMode}
              onClick={() => setLiveMode(false)}
            />
          }
        >
          Simulate
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          No transaction is signed. Messages and AI calls still go out.
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className={segmentedControlItemVariants({ size: "sm", state: "pressed" })}
              data-pressed={liveMode ? "" : undefined}
              aria-pressed={liveMode}
              onClick={() => setLiveMode(true)}
            />
          }
        >
          Live
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          Runs for real: transactions are signed with your wallet and messages are sent.
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}
