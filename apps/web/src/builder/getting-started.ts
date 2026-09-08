export type GettingStartedSignals = {
  built: boolean;
  dirty: boolean;
  simulated: boolean;
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
