"use client";

import { Button } from "@automator/ui/button";
import { Progress, ProgressIndicator, ProgressTrack } from "@automator/ui/progress";
import { RiCheckboxCircleFill, RiCheckboxBlankCircleLine, RiCloseLine } from "@remixicon/react";
import { Panel } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useAccessToken } from "../auth/access-token";
import { BUILDER_CHECKLIST_COOKIE, setPreferenceCookie } from "../lib/preferences";
import { getFlowListingRequest } from "../marketplace/client";
import styles from "./flow-builder.module.css";
import { useFlowActivation } from "./flow-activation";
import { completedSteps, gettingStartedSteps } from "./getting-started";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";

function usePublished(flowId: string): boolean {
  const getAccessToken = useAccessToken();
  const [published, setPublished] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const listing = await getFlowListingRequest(await getAccessToken(), flowId);
        if (!cancelled) setPublished(listing !== null);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [flowId, getAccessToken]);
  return published;
}

export function GettingStartedPanel() {
  const flowId = useBuilderStore((state) => state.meta.id);
  const built = useBuilderStore((state) => state.edges.length > 0);
  const dirty = useBuilderStore((state) => state.dirty);
  const simulated = useRunStore((state) => state.run !== null);
  const { enabled } = useFlowActivation();
  const published = usePublished(flowId);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const steps = gettingStartedSteps({ built, dirty, simulated, live: enabled || published });
  const done = completedSteps(steps);
  const complete = done === steps.length;

  function dismiss() {
    setDismissed(true);
    setPreferenceCookie(BUILDER_CHECKLIST_COOKIE, "dismissed");
  }

  return (
    <Panel position="top-right" className={styles.gettingStarted}>
      <section aria-labelledby="getting-started-title">
        <header className={styles.gettingStartedHeader}>
          <h2 id="getting-started-title" className="text-label">
            {complete ? "You're all set" : "Getting started"}
          </h2>
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss checklist" onClick={dismiss}>
            <RiCloseLine aria-hidden="true" />
          </Button>
        </header>
        <Progress
          value={done}
          max={steps.length}
          aria-label="Getting started progress"
          className="mb-3 gap-1"
        >
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
        <ol className={styles.gettingStartedSteps}>
          {steps.map((step) => (
            <li key={step.id} data-done={step.done ? "" : undefined}>
              {step.done ? (
                <RiCheckboxCircleFill aria-hidden="true" />
              ) : (
                <RiCheckboxBlankCircleLine aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p>
                  <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
                  {step.label}
                </p>
                {!step.done && <p className={styles.gettingStartedHint}>{step.hint}</p>}
              </div>
            </li>
          ))}
        </ol>
        {complete && (
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={dismiss}>
            Done
          </Button>
        )}
      </section>
    </Panel>
  );
}
