/**
 * The first-flow checklist shown over the canvas until the user dismisses it. Each step is
 * derived from builder state rather than recorded, so reloading the page keeps it honest.
 */
export type GettingStartedSignals = {
  /** At least one edge exists: a trigger is connected to a node. */
  built: boolean;
  /** The canvas has edits not yet saved. */
  dirty: boolean;
  /** A run has been shown on the canvas, from Simulate or the run history. */
  simulated: boolean;
  /** The flow's triggers are active or it is published to the marketplace. */
  live: boolean;
};

export type GettingStartedStep = {
  id: "build" | "save" | "simulate" | "live";
  label: string;
  hint: string;
  done: boolean;
};

export function gettingStartedSteps(signals: GettingStartedSignals): GettingStartedStep[] {
  return [
    {
      id: "build",
      label: "Connect a trigger to a node",
      hint: "Drag nodes in from the left panel and link their handles.",
      done: signals.built,
    },
    {
      id: "save",
      label: "Save the flow",
      hint: "Ctrl+S or the Save button keeps your edits.",
      done: signals.built && !signals.dirty,
    },
    {
      id: "simulate",
      label: "Simulate it",
      hint: "Runs the flow with a sample payload; onchain steps stay a dry run.",
      done: signals.simulated,
    },
    {
      id: "live",
      label: "Activate or publish",
      hint: "Turn the triggers on in Flow settings, or publish it to the marketplace.",
      done: signals.live,
    },
  ];
}

export function completedSteps(steps: readonly GettingStartedStep[]): number {
  return steps.filter((step) => step.done).length;
}
