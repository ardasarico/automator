"use client";

import { useState } from "react";
import { useAccessToken } from "../auth/access-token";
import { FlowRequestError, setFlowEnabledRequest } from "../flows/client";
import { useFlowActivation } from "./flow-activation";
import { useBuilderStore } from "./store-provider";
import { useFlowProblems } from "./use-flow-problems";
import type { FlowProblem } from "./validation";

const activationFailures: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow no longer exists.",
};

export interface FlowEnabledToggle {
  enabled: boolean;
  toggling: boolean;
  /** A refusal the reader can act on, or null. */
  error: string | null;
  /**
   * Why the API would not turn the flow on. `null` until it refuses; an empty list means it
   * refused over problems neither it nor the canvas could name, which reads differently.
   */
  blockers: readonly FlowProblem[] | null;
  toggle(enabled: boolean): Promise<void>;
}

/**
 * Turning the saved flow on and off. Two dialogs offer this — Flow settings and Use as API — and
 * both have to explain a refusal the same way, so the request, the failure copy and the blockers
 * the API sends back live here rather than in whichever dialog asked first.
 */
export function useFlowEnabled(): FlowEnabledToggle {
  const getAccessToken = useAccessToken();
  const activation = useFlowActivation();
  const flowId = useBuilderStore((state) => state.meta.id);
  const problems = useFlowProblems();
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<readonly FlowProblem[] | null>(null);

  async function toggle(enabled: boolean) {
    setToggling(true);
    setError(null);
    setBlockers(null);
    try {
      const record = await setFlowEnabledRequest(flowId, await getAccessToken(), enabled);
      activation.setEnabled(record.enabled ?? enabled);
    } catch (caught) {
      const code = caught instanceof FlowRequestError ? caught.code : "unavailable";
      // The API refuses to run a flow it can see is broken. It checked the saved flow, so name
      // the problems it sent, or failing that the errors the canvas found, rather than
      // repeating a code the reader cannot act on.
      if (enabled && code === "invalid_flow")
        setBlockers(
          caught instanceof FlowRequestError && caught.problems.length > 0
            ? [...caught.problems]
            : problems.filter((problem) => problem.severity === "error"),
        );
      else setError(activationFailures[code] ?? "The change could not be saved. Please try again.");
    } finally {
      setToggling(false);
    }
  }

  return { enabled: activation.enabled, toggling, error, blockers, toggle };
}
